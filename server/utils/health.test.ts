import { describe, it, expect, vi } from 'vitest'
import {
  checkStripe,
  checkSupabase,
  summarize,
  withTimeout,
  type DependencyResult,
  type HealthStripeClient,
  type HealthSupabaseClient,
} from './health'

/** supabase-js resolves with `{ data, error }` and never rejects. */
function supabaseStub(result: { error: unknown } | (() => Promise<{ error: unknown }>)): HealthSupabaseClient {
  return {
    from: () => ({
      select: () => (typeof result === 'function' ? result() : Promise.resolve(result)),
    }),
  }
}

function stripeStub(impl: () => Promise<unknown>): HealthStripeClient {
  return { balance: { retrieve: impl } }
}

const up = { status: 'up' } as Partial<DependencyResult>

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 50)).resolves.toBe('done')
  })

  it('rejects once the budget is spent', async () => {
    const never = new Promise(() => {})
    await expect(withTimeout(never as Promise<unknown>, 10)).rejects.toThrow('timeout')
  })

  // A pending timer keeps the event loop alive and, in a serverless runtime,
  // delays the very response the caller is waiting for.
  it('clears its timer on the happy path', async () => {
    const clear = vi.spyOn(global, 'clearTimeout')
    await withTimeout(Promise.resolve(1), 1000)
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})

describe('checkSupabase', () => {
  it('reports up when the query answers without error', async () => {
    const res = await checkSupabase(() => supabaseStub({ error: null }))
    expect(res).toMatchObject(up)
    expect(res.durationMs).toBeGreaterThanOrEqual(0)
    expect(res.reason).toBeUndefined()
  })

  // The failure this endpoint exists to catch: supabase-js resolves with an
  // error instead of throwing, so a bare `await` inside a try/catch reports a
  // dead database as healthy. Same shape as KAN-60 and KAN-63.
  it('reports down when the client resolves with an error', async () => {
    const res = await checkSupabase(() => supabaseStub({ error: { message: 'relation does not exist' } }))
    expect(res.status).toBe('down')
    expect(res.reason).toBe('unavailable')
  })

  it('never echoes the database message', async () => {
    const res = await checkSupabase(() => supabaseStub({ error: { message: 'permission denied for table organizations' } }))
    expect(JSON.stringify(res)).not.toContain('permission denied')
    expect(JSON.stringify(res)).not.toContain('organizations')
  })

  // serverSupabaseAdmin() throws when the service key is unset (KAN-55). That
  // is a misconfiguration, and saying so is the point: such a deployment used
  // to answer `ok` until someone tried to use it.
  it('distinguishes a missing key from an outage', async () => {
    const res = await checkSupabase(() => { throw new Error('SUPABASE_SERVICE_KEY is not set') })
    expect(res.status).toBe('down')
    expect(res.reason).toBe('not_configured')
  })

  it('gives up on a hanging dependency', async () => {
    const res = await checkSupabase(() => supabaseStub(() => new Promise(() => {})), 20)
    expect(res.status).toBe('down')
    expect(res.reason).toBe('timeout')
  })
})

describe('checkStripe', () => {
  it('reports up when the balance call succeeds', async () => {
    const res = await checkStripe(() => stripeStub(() => Promise.resolve({ object: 'balance' })))
    expect(res).toMatchObject(up)
  })

  // Unlike supabase-js, the Stripe SDK does reject.
  it('reports down on an invalid key', async () => {
    const res = await checkStripe(() => stripeStub(() => Promise.reject(new Error('Invalid API Key provided: sk_live_***'))))
    expect(res.status).toBe('down')
    expect(res.reason).toBe('unavailable')
    expect(JSON.stringify(res)).not.toContain('sk_live')
  })

  it('distinguishes a missing key from an outage', async () => {
    const res = await checkStripe(() => { throw new Error('STRIPE_SECRET_KEY is not set') })
    expect(res.reason).toBe('not_configured')
  })

  it('gives up on a hanging dependency', async () => {
    const res = await checkStripe(() => stripeStub(() => new Promise(() => {})), 20)
    expect(res.reason).toBe('timeout')
  })
})

describe('summarize', () => {
  const ok: DependencyResult = { status: 'up', durationMs: 5 }
  const down: DependencyResult = { status: 'down', durationMs: 5, reason: 'unavailable' }

  it('answers 200 when every dependency is up', () => {
    const { report, statusCode } = summarize({ supabase: ok, stripe: ok })
    expect(statusCode).toBe(200)
    expect(report.status).toBe('ok')
  })

  // A balancer must be able to decide from the status line alone, without
  // parsing a body.
  it('answers 503 when any dependency is down', () => {
    expect(summarize({ supabase: down, stripe: ok }).statusCode).toBe(503)
    expect(summarize({ supabase: ok, stripe: down }).statusCode).toBe(503)
    expect(summarize({ supabase: down, stripe: down }).report.status).toBe('degraded')
  })

  it('keeps every dependency in the report, up or down', () => {
    const { report } = summarize({ supabase: ok, stripe: down })
    expect(Object.keys(report.dependencies)).toEqual(['supabase', 'stripe'])
    expect(report.dependencies.stripe?.reason).toBe('unavailable')
  })
})
