import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import rateLimit, {
  getLimit,
  normalizeIp,
  parseTrustedProxyConfig,
  resolveClientIp,
  getVercelClientIp,
} from './rate-limit'

describe('getLimit', () => {
  it('stripe webhook returns 60', () => {
    expect(getLimit('/api/stripe/webhook')).toBe(60)
  })
  it('auth endpoints return 20', () => {
    expect(getLimit('/api/auth/welcome')).toBe(20)
  })
  it('public endpoints return 30', () => {
    expect(getLimit('/api/public/inscriptions/abc/enroll')).toBe(30)
  })
  it('money-moving billing endpoints return 10', () => {
    expect(getLimit('/api/billing/checkout')).toBe(10)
    expect(getLimit('/api/billing/checkout-tickets')).toBe(10)
    expect(getLimit('/api/billing/checkout-activations')).toBe(10)
    expect(getLimit('/api/billing/connect/onboard')).toBe(10)
  })
  it('read-only billing endpoints fall back to the general limit', () => {
    // polled by the app shell on every page load — must not 429 during normal use
    expect(getLimit('/api/billing/balance')).toBe(120)
    expect(getLimit('/api/billing/plans')).toBe(120)
    expect(getLimit('/api/billing/connect/status')).toBe(120)
  })
  it('refund/cancel endpoints return 10', () => {
    expect(getLimit('/api/participants/uuid-123/refund')).toBe(10)
    expect(getLimit('/api/participants/uuid-123/cancel')).toBe(10)
  })
  it('general API returns 120', () => {
    expect(getLimit('/api/contests')).toBe(120)
  })
})

describe('normalizeIp', () => {
  it('accepts plain IPv4', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7')
  })
  it('trims surrounding whitespace from chain entries', () => {
    expect(normalizeIp('  203.0.113.7 ')).toBe('203.0.113.7')
  })
  it('strips an appended port', () => {
    expect(normalizeIp('203.0.113.7:41237')).toBe('203.0.113.7')
    expect(normalizeIp('[2001:db8::1]:41237')).toBe('2001:db8:0:0:0:0:0:1')
  })
  it('collapses IPv4-mapped IPv6 so one client cannot hold two buckets', () => {
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })
  it('canonicalises IPv6 to a single deterministic form', () => {
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8:0:0:0:0:0:1')
    expect(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001'))
      .toBe(normalizeIp('2001:db8::1'))
  })
  it('drops the zone identifier', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0:0:0:0:0:0:1')
  })
  it('rejects anything that is not a real address', () => {
    expect(normalizeIp('unknown')).toBeNull()
    expect(normalizeIp('_hidden')).toBeNull()
    expect(normalizeIp('999.1.1.1')).toBeNull()
    expect(normalizeIp('203.0.113.007')).toBeNull() // ambiguous leading zeros
    expect(normalizeIp('1:2:3:4:5:6:7:8:9')).toBeNull()
    expect(normalizeIp('a'.repeat(200))).toBeNull()
    expect(normalizeIp('')).toBeNull()
    expect(normalizeIp(undefined)).toBeNull()
  })
})

describe('parseTrustedProxyConfig', () => {
  it('defaults to trusting nothing', () => {
    const config = parseTrustedProxyConfig(undefined, undefined)
    expect(config.ranges).toHaveLength(0)
    expect(config.hops).toBe(1)
  })
  it('parses a comma-separated list of IPs and CIDRs', () => {
    expect(parseTrustedProxyConfig('10.0.0.1, 172.16.0.0/12, 2001:db8::/32', '2').ranges)
      .toHaveLength(3)
  })
  it('discards malformed entries instead of trusting them', () => {
    expect(parseTrustedProxyConfig('not-an-ip, 10.0.0.1, 10.0.0.0/99', '1').ranges)
      .toHaveLength(1)
  })
  it('falls back to 1 hop for missing or nonsensical values, and caps the maximum', () => {
    expect(parseTrustedProxyConfig('10.0.0.1', '').hops).toBe(1)
    expect(parseTrustedProxyConfig('10.0.0.1', 'abc').hops).toBe(1)
    expect(parseTrustedProxyConfig('10.0.0.1', '0').hops).toBe(1)
    expect(parseTrustedProxyConfig('10.0.0.1', '-3').hops).toBe(1)
    expect(parseTrustedProxyConfig('10.0.0.1', '999').hops).toBe(8)
  })
})

describe('resolveClientIp', () => {
  const noProxies = parseTrustedProxyConfig('', '')
  const oneProxy = parseTrustedProxyConfig('10.0.0.1', '1')
  const twoProxies = parseTrustedProxyConfig('10.0.0.1, 172.16.0.0/12', '2')

  it('ignores X-Forwarded-For when no trusted proxy is configured', () => {
    expect(resolveClientIp('198.51.100.4', '1.2.3.4', noProxies)).toBe('198.51.100.4')
  })

  it('ignores a forged X-Forwarded-For when the peer is not a trusted proxy', () => {
    // Attacker connects directly and claims to be someone else.
    expect(resolveClientIp('198.51.100.4', '1.2.3.4, 5.6.7.8', oneProxy))
      .toBe('198.51.100.4')
  })

  it('takes the client IP from the chain when the peer is a trusted proxy', () => {
    expect(resolveClientIp('10.0.0.1', '203.0.113.7', oneProxy)).toBe('203.0.113.7')
  })

  it('counts hops from the right, never the first value blindly', () => {
    // Client prepended two fake entries; only the last hop is ours.
    expect(resolveClientIp('10.0.0.1', '1.2.3.4, 5.6.7.8, 203.0.113.7', oneProxy))
      .toBe('203.0.113.7')
  })

  it('walks back through several declared hops', () => {
    // client -> edge (172.16.9.9) -> nginx (10.0.0.1) -> app
    expect(resolveClientIp('10.0.0.1', '203.0.113.7, 172.16.9.9', twoProxies))
      .toBe('203.0.113.7')
  })

  it('stops at the first hop that is not itself a trusted proxy', () => {
    // Two hops declared but the middle entry is attacker-supplied, not our edge.
    expect(resolveClientIp('10.0.0.1', '203.0.113.7, 198.51.100.4', twoProxies))
      .toBe('198.51.100.4')
  })

  it('falls back to the socket address when the header is absent', () => {
    expect(resolveClientIp('10.0.0.1', undefined, oneProxy)).toBe('10.0.0.1')
    expect(resolveClientIp('198.51.100.4', undefined, noProxies)).toBe('198.51.100.4')
  })

  it('keeps the last valid hop when the chain entry is malformed', () => {
    expect(resolveClientIp('10.0.0.1', 'unknown', oneProxy)).toBe('10.0.0.1')
    expect(resolveClientIp('10.0.0.1', '"; DROP TABLE', oneProxy)).toBe('10.0.0.1')
  })

  it('fails closed into a single bucket when there is no usable peer address', () => {
    expect(resolveClientIp(undefined, '203.0.113.7', oneProxy)).toBe('unknown')
  })

  it('normalises the socket address so IPv4-mapped peers share one bucket', () => {
    expect(resolveClientIp('::ffff:198.51.100.4', undefined, noProxies))
      .toBe('198.51.100.4')
  })
})

/* -------------------------------------------------------------------------- */
/* Middleware behaviour                                                        */
/* -------------------------------------------------------------------------- */

interface MockEventOptions {
  path: string
  ip?: string
  xff?: string
  userId?: string
}

function makeEvent({ path, ip, xff, userId }: MockEventOptions): H3Event {
  return {
    path,
    context: userId ? { user: { id: userId } } : {},
    node: {
      req: {
        headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
        socket: { remoteAddress: ip },
      },
    },
  } as unknown as H3Event
}

const handler = rateLimit as unknown as (event: H3Event) => Promise<unknown>

/** Returns the number of requests accepted before the limiter answered 429. */
async function countAccepted(events: H3Event[]): Promise<number> {
  let accepted = 0
  for (const event of events) {
    try {
      await handler(event)
      accepted++
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(429)
      break
    }
  }
  return accepted
}

describe('rate limit middleware — X-Forwarded-For spoofing', () => {
  const originalList = process.env.RATE_LIMIT_TRUSTED_PROXIES
  const originalHops = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS

  beforeEach(() => {
    delete process.env.RATE_LIMIT_TRUSTED_PROXIES
    delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS
  })

  afterEach(() => {
    if (originalList === undefined) delete process.env.RATE_LIMIT_TRUSTED_PROXIES
    else process.env.RATE_LIMIT_TRUSTED_PROXIES = originalList
    if (originalHops === undefined) delete process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS
    else process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = originalHops
  })

  it('a rotating forged header does not create a new bucket per request', async () => {
    // No trusted proxies configured: all 31 requests share the attacker's socket bucket,
    // so the public limit of 30 still applies.
    const path = '/api/public/inscriptions/spoof-rotating/enroll'
    const events = Array.from({ length: 31 }, (_, i) => makeEvent({
      path,
      ip: '198.51.100.10',
      xff: `10.10.${Math.floor(i / 256)}.${i % 256}`,
    }))

    expect(await countAccepted(events)).toBe(30)
  })

  it('a forged header from a non-trusted peer is ignored even when proxies are configured', async () => {
    process.env.RATE_LIMIT_TRUSTED_PROXIES = '10.0.0.1'
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = '1'

    const path = '/api/public/inscriptions/spoof-untrusted/enroll'
    const events = Array.from({ length: 31 }, (_, i) => makeEvent({
      path,
      ip: '198.51.100.11', // not the configured proxy
      xff: `203.0.113.${i % 256}`,
    }))

    expect(await countAccepted(events)).toBe(30)
  })

  it('a legitimate chain from the trusted proxy still gives per-client buckets', async () => {
    process.env.RATE_LIMIT_TRUSTED_PROXIES = '10.0.0.1'
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = '1'

    const path = '/api/public/inscriptions/legit-proxy/enroll'
    const noisy = Array.from({ length: 31 }, () => makeEvent({
      path,
      ip: '10.0.0.1',
      xff: '203.0.113.7',
    }))

    // The noisy client burns its own bucket...
    expect(await countAccepted(noisy)).toBe(30)

    // ...while a different client behind the same proxy is unaffected.
    await expect(handler(makeEvent({ path, ip: '10.0.0.1', xff: '203.0.113.200' })))
      .resolves.toBeUndefined()
  })

  it('rate limits by socket address when no header is present', async () => {
    const path = '/api/public/inscriptions/no-header/enroll'
    const events = Array.from({ length: 31 }, () => makeEvent({
      path,
      ip: '198.51.100.12',
    }))

    expect(await countAccepted(events)).toBe(30)
  })

  it('authenticated requests are still keyed by user, not by IP', async () => {
    const path = '/api/public/inscriptions/authenticated/enroll'
    const events = Array.from({ length: 31 }, (_, i) => makeEvent({
      path,
      ip: `198.51.100.${i % 256}`, // a different IP each time
      userId: 'user-abc',
    }))

    expect(await countAccepted(events)).toBe(30)
  })

  it('leaves non-API paths alone', async () => {
    await expect(handler(makeEvent({ path: '/contests', ip: '198.51.100.13' })))
      .resolves.toBeUndefined()
  })
})

describe('getVercelClientIp', () => {
  const originalVercel = process.env.VERCEL

  function vercelEvent(headers: Record<string, string>): H3Event {
    return {
      path: '/api/public/inscriptions/abc/enroll',
      context: {},
      node: { req: { headers, socket: { remoteAddress: '10.0.0.7' } } },
    } as unknown as H3Event
  }

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  })

  it('returns null when not running on Vercel', () => {
    delete process.env.VERCEL
    expect(getVercelClientIp(vercelEvent({ 'x-forwarded-for': '203.0.113.9' }))).toBeNull()
  })

  it('trusts x-forwarded-for on Vercel: the edge overwrites it, so it is not spoofable', () => {
    process.env.VERCEL = '1'
    expect(getVercelClientIp(vercelEvent({ 'x-forwarded-for': '203.0.113.9' })))
      .toBe('203.0.113.9')
  })

  it('prefers x-vercel-forwarded-for, which survives a proxy layered on top of Vercel', () => {
    process.env.VERCEL = '1'
    const event = vercelEvent({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-forwarded-for': '198.51.100.4',
    })
    expect(getVercelClientIp(event)).toBe('203.0.113.9')
  })

  it('takes the first entry if the header ever carries a chain', () => {
    process.env.VERCEL = '1'
    expect(getVercelClientIp(vercelEvent({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })))
      .toBe('203.0.113.9')
  })

  it('canonicalises IPv4-mapped IPv6 so one client cannot hold two buckets', () => {
    process.env.VERCEL = '1'
    expect(getVercelClientIp(vercelEvent({ 'x-forwarded-for': '::ffff:203.0.113.9' })))
      .toBe('203.0.113.9')
  })

  it('falls back to the trusted-proxy path when the header is missing or junk', () => {
    process.env.VERCEL = '1'
    expect(getVercelClientIp(vercelEvent({}))).toBeNull()
    expect(getVercelClientIp(vercelEvent({ 'x-forwarded-for': 'unknown' }))).toBeNull()
  })
})
