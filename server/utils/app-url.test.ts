import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appBaseUrl, DEFAULT_APP_BASE_URL, __resetAppUrlWarning } from './app-url'

describe('appBaseUrl', () => {
  const original = process.env.APP_BASE_URL

  beforeEach(() => {
    __resetAppUrlWarning()
    delete process.env.APP_BASE_URL
  })

  afterEach(() => {
    if (original === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = original
  })

  it('returns what is configured', () => {
    process.env.APP_BASE_URL = 'https://app.example.com'
    expect(appBaseUrl()).toBe('https://app.example.com')
  })

  // The five call sites this replaced each concatenated `/path` directly, so a
  // configured value with a trailing slash produced `//invite/...`.
  it('strips trailing slashes so callers can concatenate a path', () => {
    process.env.APP_BASE_URL = 'https://app.example.com/'
    expect(appBaseUrl()).toBe('https://app.example.com')
    process.env.APP_BASE_URL = 'https://app.example.com///'
    expect(appBaseUrl()).toBe('https://app.example.com')
  })

  it('ignores surrounding whitespace', () => {
    process.env.APP_BASE_URL = '  https://app.example.com  '
    expect(appBaseUrl()).toBe('https://app.example.com')
  })

  it('falls back when unset or blank', () => {
    expect(appBaseUrl()).toBe(DEFAULT_APP_BASE_URL)
    process.env.APP_BASE_URL = '   '
    expect(appBaseUrl()).toBe(DEFAULT_APP_BASE_URL)
  })

  describe('the warning', () => {
    let warn: ReturnType<typeof vi.spyOn>
    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
    afterEach(() => { warn.mockRestore() })

    // Every invitation link is built from this value, so an unset variable is
    // not a degradation: it mails people a link to the wrong host.
    it('says so when the variable is missing', () => {
      appBaseUrl()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).toContain('APP_BASE_URL')
    })

    // Once per process, not once per invitation sent.
    it('says it once, however many links are built', () => {
      appBaseUrl(); appBaseUrl(); appBaseUrl()
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('stays quiet when the variable is set', () => {
      process.env.APP_BASE_URL = 'https://app.example.com'
      appBaseUrl()
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
