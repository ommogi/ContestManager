// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/ — same arrangement as
// server/utils/storage-path.test.ts and server/utils/inscription-form-core.test.ts.
import { describe, it, expect } from 'vitest'
import {
  fitWithin,
  outputMimeType,
  extensionForMimeType,
  COVER_POLICY,
  LOGO_POLICY,
  AVATAR_POLICY,
} from '../../shared/image-resize'

describe('fitWithin', () => {
  it('scales the long edge down to the bound', () => {
    expect(fitWithin(2048, 2048, 512)).toEqual({ width: 512, height: 512, resized: true })
  })

  it('keeps the aspect ratio', () => {
    const { width, height } = fitWithin(2179, 1547, 1600)

    expect(width).toBe(1600)
    // 1547 / 2179 * 1600 = 1135.8…
    expect(height).toBe(1136)
    // Ratio preserved to within a rounded pixel.
    expect(Math.abs(width / height - 2179 / 1547)).toBeLessThan(0.002)
  })

  it('bounds the long edge whichever one it is', () => {
    expect(fitWithin(800, 3000, 512).height).toBe(512)
    expect(fitWithin(3000, 800, 512).width).toBe(512)
  })

  // The one that would cost bytes for nothing: the pixels are not there to
  // recover, so enlarging only inflates the upload.
  it('never enlarges an image that already fits', () => {
    expect(fitWithin(120, 80, 512)).toEqual({ width: 120, height: 80, resized: false })
  })

  it('leaves an image exactly on the bound alone', () => {
    expect(fitWithin(512, 300, 512)).toEqual({ width: 512, height: 300, resized: false })
  })

  // A panorama's short edge rounds to 0 without the clamp, and a zero-width
  // canvas throws.
  it('never rounds an edge down to zero', () => {
    const { width, height } = fitWithin(10000, 3, 512)

    expect(width).toBe(512)
    expect(height).toBe(1)
  })

  // A dimension of 0 or NaN means the image never decoded. Report "unchanged"
  // so the caller uploads the original instead of inventing a size.
  it('reports unchanged for dimensions that cannot be real', () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(fitWithin(bad, 100, 512).resized).toBe(false)
      expect(fitWithin(100, bad, 512).resized).toBe(false)
      expect(fitWithin(100, 100, bad).resized).toBe(false)
    }
  })
})

describe('outputMimeType', () => {
  // Not cosmetic: contest-assets and org_logos declare allowed_mime_types
  // (0060, 0059), so JPEG bytes labelled image/png are refused by the bucket.
  it('labels a flattened cover as jpeg whatever it came in as', () => {
    expect(outputMimeType('image/png', COVER_POLICY)).toBe('image/jpeg')
    expect(outputMimeType('image/webp', COVER_POLICY)).toBe('image/jpeg')
  })

  it('keeps a logo or avatar in a format that carries alpha', () => {
    expect(outputMimeType('image/png', LOGO_POLICY)).toBe('image/png')
    expect(outputMimeType('image/webp', AVATAR_POLICY)).toBe('image/webp')
  })

  it('passes jpeg through when no conversion is asked for', () => {
    expect(outputMimeType('image/jpeg', LOGO_POLICY)).toBe('image/jpeg')
  })

  // GIF and an empty type are the cases `toBlob` cannot re-encode; PNG is the
  // format it is always required to support.
  it('falls back to png for anything the canvas cannot re-encode', () => {
    expect(outputMimeType('image/gif', LOGO_POLICY)).toBe('image/png')
    expect(outputMimeType('', LOGO_POLICY)).toBe('image/png')
  })
})

describe('extensionForMimeType', () => {
  it('matches the extension to the bytes actually uploaded', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('jpg')
    expect(extensionForMimeType('image/webp')).toBe('webp')
    expect(extensionForMimeType('image/gif')).toBe('gif')
    expect(extensionForMimeType('image/png')).toBe('png')
  })

  it('defaults to png rather than guessing from an unknown type', () => {
    expect(extensionForMimeType('application/octet-stream')).toBe('png')
  })
})

describe('las políticas', () => {
  it('convierte a JPEG solo las portadas', () => {
    expect(COVER_POLICY.toJpeg).toBe(true)
    expect(LOGO_POLICY.toJpeg).toBe(false)
    expect(AVATAR_POLICY.toJpeg).toBe(false)
  })

  // A logo renders at 96 CSS px at most and an avatar under 100; 512 covers
  // both at 4x. A cover spans the content width, so it gets more.
  it('da más resolución a la portada que al logo o el avatar', () => {
    expect(COVER_POLICY.maxEdge).toBeGreaterThan(LOGO_POLICY.maxEdge)
    expect(AVATAR_POLICY.maxEdge).toBe(LOGO_POLICY.maxEdge)
  })
})
