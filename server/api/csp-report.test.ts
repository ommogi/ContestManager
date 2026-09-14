import { describe, it, expect } from 'vitest'
import { truncateForLog } from './csp-report.post'

// A CSP report is unauthenticated input from any browser that can reach the
// endpoint, and every field of it lands in the log stream. The cap is the only
// thing standing between a crafted `blocked-uri` and megabytes of log per
// request, so it is worth a test even though the rest of the handler is not
// reachable from vitest.
describe('truncateForLog', () => {
  it('passes a normal value through', () => {
    expect(truncateForLog('script-src')).toBe('script-src')
    expect(truncateForLog('https://example.com/app.js')).toBe('https://example.com/app.js')
  })

  it('trims surrounding whitespace', () => {
    expect(truncateForLog('  img-src  ')).toBe('img-src')
  })

  it('rejects anything that is not a non-empty string', () => {
    expect(truncateForLog(undefined)).toBeNull()
    expect(truncateForLog(null)).toBeNull()
    expect(truncateForLog('')).toBeNull()
    expect(truncateForLog('   ')).toBeNull()
    expect(truncateForLog(42)).toBeNull()
    expect(truncateForLog({ nested: 'object' })).toBeNull()
    expect(truncateForLog(['a'])).toBeNull()
  })

  it('caps an oversized value and marks it as cut', () => {
    const out = truncateForLog('x'.repeat(5000))
    expect(out).toHaveLength(201) // 200 characters plus the ellipsis
    expect(out?.endsWith('…')).toBe(true)
  })

  it('honours a tighter cap for the directive field', () => {
    const out = truncateForLog('y'.repeat(500), 60)
    expect(out).toHaveLength(61)
  })

  it('leaves a value exactly at the limit untouched', () => {
    const exact = 'z'.repeat(200)
    expect(truncateForLog(exact)).toBe(exact)
  })
})
