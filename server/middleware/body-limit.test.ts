import { describe, it, expect } from 'vitest'
import type { H3Event } from 'h3'
import bodyLimit, { getBodyLimit, parseContentLength } from './body-limit'

const KB = 1024
const MB = 1024 * KB

/**
 * Minimal H3Event stand-in: the middleware reads only the method, the path and
 * one header.
 */
function eventWith(path: string, method = 'POST', contentLength?: string): H3Event {
  return {
    method,
    path,
    node: { req: { headers: contentLength === undefined ? {} : { 'content-length': contentLength } } },
  } as unknown as H3Event
}

function run(path: string, method = 'POST', contentLength?: string) {
  return () => (bodyLimit as unknown as (e: H3Event) => void)(eventWith(path, method, contentLength))
}

describe('getBodyLimit', () => {
  it('leaves non-API routes alone', () => {
    expect(getBodyLimit('/')).toBeNull()
    expect(getBodyLimit('/contests/foo/inscriptions')).toBeNull()
  })

  it('applies the general limit to an ordinary API route', () => {
    expect(getBodyLimit('/api/contests/abc/categories')).toBe(256 * KB)
    expect(getBodyLimit('/api/scores')).toBe(256 * KB)
  })

  it('gives the participant import its own, wider limit', () => {
    // ~730 B per row at the schema maximum × 1000 rows ≈ 730 KB.
    expect(getBodyLimit('/api/contests/abc/participants/import')).toBe(2 * MB)
  })

  // The regression that would cost real money: the webhook needs its raw body
  // to verify the Stripe signature.
  it('exempts the Stripe webhook', () => {
    expect(getBodyLimit('/api/stripe/webhook')).toBeNull()
  })

  // Multipart with real files, already bounded per field by
  // server/utils/inscription-uploads.ts against the published maxSizeMB.
  it('exempts the inscription upload endpoint', () => {
    expect(getBodyLimit('/api/public/inscriptions/tok123/upload')).toBeNull()
  })

  it('does not exempt the rest of the public inscription routes', () => {
    expect(getBodyLimit('/api/public/inscriptions/tok123/enroll')).toBe(256 * KB)
    expect(getBodyLimit('/api/public/inscriptions/tok123/checkout')).toBe(256 * KB)
  })
})

describe('parseContentLength', () => {
  it('reads a plain integer', () => {
    expect(parseContentLength('1024')).toBe(1024)
    expect(parseContentLength(' 2048 ')).toBe(2048)
    expect(parseContentLength('0')).toBe(0)
  })

  // The header is attacker-controlled: anything that is not a plain integer is
  // treated as absent rather than coerced, because Number('12abc') is NaN and
  // Number('') is 0 and neither is a size.
  it('treats anything that is not a plain integer as absent', () => {
    expect(parseContentLength(undefined)).toBeNull()
    expect(parseContentLength('')).toBeNull()
    expect(parseContentLength('12abc')).toBeNull()
    expect(parseContentLength('-1')).toBeNull()
    expect(parseContentLength('1.5')).toBeNull()
    expect(parseContentLength('1e9')).toBeNull()
    expect(parseContentLength('99999999999999999999')).toBeNull()
  })
})

describe('body-limit middleware', () => {
  it('rejects a payload over the limit with 413', () => {
    expect(run('/api/contests/abc/categories', 'POST', String(300 * KB)))
      .toThrowError(expect.objectContaining({ statusCode: 413, statusMessage: 'payload_too_large' }))
  })

  it('lets a payload just under the limit through', () => {
    expect(run('/api/contests/abc/categories', 'POST', String(256 * KB - 1))).not.toThrow()
  })

  it('treats the limit itself as acceptable', () => {
    expect(run('/api/contests/abc/categories', 'POST', String(256 * KB))).not.toThrow()
  })

  it('accepts a full 1000-row import that the general limit would reject', () => {
    const thousandRows = 730 * KB
    expect(getBodyLimit('/api/contests/abc/participants/import')).toBeGreaterThan(thousandRows)
    expect(run('/api/contests/abc/participants/import', 'POST', String(thousandRows))).not.toThrow()
    // Same body on an ordinary route would not pass, which is the point of the
    // per-route limit.
    expect(run('/api/contests/abc/categories', 'POST', String(thousandRows))).toThrow()
  })

  it('never blocks an exempt route, however large', () => {
    expect(run('/api/stripe/webhook', 'POST', String(50 * MB))).not.toThrow()
    expect(run('/api/public/inscriptions/tok/upload', 'POST', String(50 * MB))).not.toThrow()
  })

  // Documented gap: chunked requests carry no Content-Length and cannot be
  // judged before reading. Vercel's own 4.5 MB cap is the backstop.
  it('lets a request with no Content-Length through', () => {
    expect(run('/api/contests/abc/categories', 'POST', undefined)).not.toThrow()
  })

  it('ignores an unparseable Content-Length rather than coercing it', () => {
    expect(run('/api/contests/abc/categories', 'POST', 'not-a-number')).not.toThrow()
  })

  it('skips methods that carry no body', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(run('/api/contests/abc/categories', method, String(50 * MB)), method).not.toThrow()
    }
  })

  it('ignores the query string when matching a route', () => {
    expect(run('/api/stripe/webhook?foo=1', 'POST', String(50 * MB))).not.toThrow()
    expect(run('/api/contests/abc/categories?x=1', 'POST', String(300 * KB))).toThrow()
  })

  it('leaves non-API routes alone', () => {
    expect(run('/contests/foo', 'POST', String(50 * MB))).not.toThrow()
  })
})
