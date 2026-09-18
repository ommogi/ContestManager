// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/ — same arrangement as
// server/utils/inscription-form-core.test.ts.
import { describe, it, expect } from 'vitest'
import { objectPathFromPublicUrl } from '../../shared/storage-path'

const BASE = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public'

describe('objectPathFromPublicUrl', () => {
  it('pulls the path out of a public URL', () => {
    expect(objectPathFromPublicUrl(`${BASE}/org_logos/abc-123/logo.png`, 'org_logos'))
      .toBe('abc-123/logo.png')
  })

  it('decodes what the URL encoded', () => {
    expect(objectPathFromPublicUrl(`${BASE}/org_logos/abc/mi%20logo%20final.png`, 'org_logos'))
      .toBe('abc/mi logo final.png')
  })

  it('ignores a URL for a different bucket', () => {
    expect(objectPathFromPublicUrl(`${BASE}/avatars/abc/face.png`, 'org_logos')).toBeNull()
  })

  // Deleting is destructive, so anything unrecognised has to mean "do nothing".
  it('returns null for shapes it does not recognise', () => {
    for (const value of [
      null,
      undefined,
      '',
      'blob:http://localhost:3000/9b1d-uuid',
      'https://example.com/logo.png',
      `${BASE}/org_logos/`,
      'not a url at all',
    ]) {
      expect(objectPathFromPublicUrl(value as string | null, 'org_logos')).toBeNull()
    }
  })

  it('returns null when no bucket is given', () => {
    expect(objectPathFromPublicUrl(`${BASE}/org_logos/a/b.png`, '')).toBeNull()
  })

  it('keeps a path with more than two segments whole', () => {
    expect(objectPathFromPublicUrl(`${BASE}/org_logos/uid/2026/logo.png`, 'org_logos'))
      .toBe('uid/2026/logo.png')
  })
})
