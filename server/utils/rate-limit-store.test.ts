import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_BUCKETS,
  MemoryRateLimitStore,
  PostgresRateLimitStore,
  resolveStoreMode,
  usesSharedStore,
  type RateLimitRpcClient,
} from './rate-limit-store'

const WINDOW = 60_000

describe('MemoryRateLimitStore', () => {
  it('counts a first hit as one', async () => {
    const store = new MemoryRateLimitStore()
    const hit = await store.hit('k', WINDOW, 1000)
    expect(hit.count).toBe(1)
    expect(hit.resetAt).toBe(1000 + WINDOW)
  })

  it('increments within the window and keeps the same reset', async () => {
    const store = new MemoryRateLimitStore()
    await store.hit('k', WINDOW, 1000)
    const second = await store.hit('k', WINDOW, 1500)
    expect(second.count).toBe(2)
    expect(second.resetAt).toBe(1000 + WINDOW)
  })

  // Breaking this is how a limit silently becomes permanent: a bucket that
  // never rolls over locks a legitimate caller out forever.
  it('starts a fresh window once the old one closed', async () => {
    const store = new MemoryRateLimitStore()
    await store.hit('k', WINDOW, 1000)
    const later = await store.hit('k', WINDOW, 1000 + WINDOW + 1)
    expect(later.count).toBe(1)
    expect(later.resetAt).toBe(1000 + WINDOW + 1 + WINDOW)
  })

  it('keys buckets independently', async () => {
    const store = new MemoryRateLimitStore()
    await store.hit('a', WINDOW, 1000)
    await store.hit('a', WINDOW, 1000)
    expect((await store.hit('b', WINDOW, 1000)).count).toBe(1)
  })

  it('drops closed windows when it sweeps', async () => {
    const store = new MemoryRateLimitStore()
    await store.hit('old', WINDOW, 1000)
    store.cleanup(1000 + WINDOW + 1)
    expect(store.size).toBe(0)
  })

  // Pre-existing behaviour, kept: under a distributed attack an instance
  // protects its own memory before it protects the experience of a new key.
  it('refuses new keys once the map is full', async () => {
    const store = new MemoryRateLimitStore()
    for (let i = 0; i < MAX_BUCKETS; i++) await store.hit(`k${i}`, WINDOW, 1000)
    const overflow = await store.hit('brand-new', WINDOW, 1000)
    expect(overflow.count).toBe(Number.MAX_SAFE_INTEGER)
    // A key already present is still counted normally.
    expect((await store.hit('k0', WINDOW, 1000)).count).toBe(2)
  })
})

describe('PostgresRateLimitStore', () => {
  function client(impl: () => Promise<{ data: unknown; error: { message: string } | null }>): RateLimitRpcClient {
    return { rpc: vi.fn(impl) }
  }

  it('returns the count the database computed', async () => {
    const store = new PostgresRateLimitStore(() =>
      client(() => Promise.resolve({ data: [{ count: 7, reset_at: '2026-09-14T10:00:00Z' }], error: null })))
    const hit = await store.hit('k', WINDOW, 1000)
    expect(hit.count).toBe(7)
    expect(hit.resetAt).toBe(Date.parse('2026-09-14T10:00:00Z'))
  })

  it('accepts a single row returned unwrapped', async () => {
    const store = new PostgresRateLimitStore(() =>
      client(() => Promise.resolve({ data: { count: 3, reset_at: '2026-09-14T10:00:00Z' }, error: null })))
    expect((await store.hit('k', WINDOW, 1000)).count).toBe(3)
  })

  it('sends the key and window to the RPC', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [{ count: 1, reset_at: '2026-09-14T10:00:00Z' }], error: null }))
    const store = new PostgresRateLimitStore(() => ({ rpc }) as unknown as RateLimitRpcClient)
    await store.hit('ip:1.2.3.4:/api/auth/login', WINDOW, 1000)
    expect(rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'ip:1.2.3.4:/api/auth/login',
      p_window_ms: WINDOW,
    })
  })

  describe('when the database cannot answer', () => {
    let warn: ReturnType<typeof vi.spyOn>
    beforeEach(() => { warn = vi.spyOn(console, 'error').mockImplementation(() => {}) })
    afterEach(() => { warn.mockRestore() })

    // supabase-js resolves with `error` instead of rejecting; a store that
    // ignored it would return a malformed row and count nothing. KAN-60 again.
    it('falls back to memory on a resolved error', async () => {
      const store = new PostgresRateLimitStore(() =>
        client(() => Promise.resolve({ data: null, error: { message: 'relation does not exist' } })))
      expect((await store.hit('k', WINDOW, 1000)).count).toBe(1)
      expect((await store.hit('k', WINDOW, 1000)).count).toBe(2)
    })

    it('falls back on a rejection too', async () => {
      const store = new PostgresRateLimitStore(() => client(() => Promise.reject(new Error('timeout'))))
      expect((await store.hit('k', WINDOW, 1000)).count).toBe(1)
    })

    it('falls back when the row is malformed', async () => {
      const store = new PostgresRateLimitStore(() =>
        client(() => Promise.resolve({ data: [{ nonsense: true }], error: null })))
      expect((await store.hit('k', WINDOW, 1000)).count).toBe(1)
    })

    // A limiter that cannot reach its store must not become an outage — but it
    // must not go quiet either.
    it('logs the degradation once, not once per request', async () => {
      const store = new PostgresRateLimitStore(() => client(() => Promise.reject(new Error('down'))))
      await store.hit('k', WINDOW, 1000)
      await store.hit('k', WINDOW, 1000)
      await store.hit('k', WINDOW, 1000)
      expect(warn).toHaveBeenCalledTimes(1)
    })
  })
})

describe('usesSharedStore', () => {
  it('covers the buckets that exist to stop abuse', () => {
    expect(usesSharedStore('/api/auth/welcome')).toBe(true)
    expect(usesSharedStore('/api/public/inscriptions/tok/enroll')).toBe(true)
    expect(usesSharedStore('/api/billing/checkout')).toBe(true)
    expect(usesSharedStore('/api/billing/connect/onboard')).toBe(true)
    expect(usesSharedStore('/api/participants/abc/refund')).toBe(true)
    expect(usesSharedStore('/api/participants/abc/cancel')).toBe(true)
  })

  // Polled by the app shell on every page load: a database write here would be
  // paid on each navigation for a limit of 120/min.
  it('leaves the general and read-only buckets in memory', () => {
    expect(usesSharedStore('/api/billing/balance')).toBe(false)
    expect(usesSharedStore('/api/billing/plans')).toBe(false)
    expect(usesSharedStore('/api/billing/connect/status')).toBe(false)
    expect(usesSharedStore('/api/contests/abc/categories')).toBe(false)
    expect(usesSharedStore('/api/health')).toBe(false)
    expect(usesSharedStore('/api/stripe/webhook')).toBe(false)
  })
})

describe('resolveStoreMode', () => {
  it('defaults to memory', () => {
    expect(resolveStoreMode({} as NodeJS.ProcessEnv)).toBe('memory')
    expect(resolveStoreMode({ RATE_LIMIT_STORE: '' } as NodeJS.ProcessEnv)).toBe('memory')
    expect(resolveStoreMode({ RATE_LIMIT_STORE: 'redis' } as NodeJS.ProcessEnv)).toBe('memory')
  })

  it('selects postgres when asked and configured', () => {
    expect(resolveStoreMode({
      RATE_LIMIT_STORE: 'postgres',
      SUPABASE_SERVICE_KEY: 'k',
    } as NodeJS.ProcessEnv)).toBe('postgres')
    expect(resolveStoreMode({
      RATE_LIMIT_STORE: ' POSTGRES ',
      SUPABASE_SERVICE_KEY: 'k',
    } as NodeJS.ProcessEnv)).toBe('postgres')
  })

  // Failing open on configuration is how a limiter quietly stops existing.
  it('falls back to memory, loudly, when the service key is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveStoreMode({ RATE_LIMIT_STORE: 'postgres' } as NodeJS.ProcessEnv)).toBe('memory')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
