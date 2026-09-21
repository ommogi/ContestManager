// shared/image-resize.ts
// Deciding how big an uploaded image should become, before it is uploaded.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Nothing in this app ever shrank an image. Every `<img>` and CSS background
// serves the original at full resolution and scales it with CSS, so a 2048×2048
// logo is downloaded in full to be painted at 48px. KAN-80 fixed the two brand
// assets by hand; this is the entry point, so it does not happen again with
// every contest cover and avatar.
//
// ── Why only the arithmetic lives here ──────────────────────────────────────
// The actual resize needs a canvas, which needs a DOM. `vitest.config.ts` runs
// `environment: 'node'` and collects only `server/**/*.test.ts`, and the project
// has no jsdom — so canvas code cannot be tested here at all. What CAN go wrong
// silently is the maths: an aspect ratio drifting, or an image being *enlarged*
// because nobody checked. That part is pure, and it is the part that is tested.

/** The dimensions an image should be drawn at. */
export interface TargetSize {
  width: number
  height: number
  /** False when the source already fits, so the caller can skip the canvas. */
  resized: boolean
}

/**
 * Fit `width`×`height` inside a square of `maxEdge`, preserving the ratio.
 *
 * Never enlarges: an image already within the bound comes back unchanged with
 * `resized: false`. Upscaling would cost bytes and add nothing — the pixels are
 * not there to recover.
 *
 * Returns whole pixels, and never zero for a non-empty source: a very wide
 * panorama scaled down would otherwise round its short edge to 0 and produce a
 * canvas that throws.
 */
export function fitWithin(width: number, height: number, maxEdge: number): TargetSize {
  // A non-finite or non-positive dimension means the image never decoded
  // properly. Say "unchanged" and let the caller upload the original rather
  // than invent a size.
  if (!isUsable(width) || !isUsable(height) || !isUsable(maxEdge)) {
    return { width, height, resized: false }
  }

  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height, resized: false }

  const scale = maxEdge / longest

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  }
}

function isUsable(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/**
 * What each upload site asks for.
 *
 * `toJpeg` only where transparency cannot mean anything. A contest cover is a
 * full-bleed image, and flattening it is what turned 4,7 MB into 311 kB in
 * KAN-80 — a PNG at the same 1600px still weighed 2,7 MB. A logo or an avatar
 * keeps its format, because there the alpha channel is usually load-bearing.
 */
export interface ResizePolicy {
  maxEdge: number
  toJpeg: boolean
  /** Only consulted when `toJpeg` is true. */
  quality: number
}

export const COVER_POLICY: ResizePolicy = { maxEdge: 1600, toJpeg: true, quality: 0.82 }
export const LOGO_POLICY: ResizePolicy = { maxEdge: 512, toJpeg: false, quality: 0.9 }
export const AVATAR_POLICY: ResizePolicy = { maxEdge: 512, toJpeg: false, quality: 0.9 }

/**
 * The MIME type the resized file should be uploaded as.
 *
 * This is not cosmetic. `contest-assets` and `org_logos` declare
 * `allowed_mime_types` (0059, 0060), so uploading JPEG bytes labelled
 * `image/png` is rejected by the bucket. The label has to follow the bytes.
 */
export function outputMimeType(sourceType: string, policy: ResizePolicy): string {
  if (policy.toJpeg) return 'image/jpeg'
  // A format the canvas cannot re-encode (or an empty type) falls back to PNG,
  // which `toBlob` always supports.
  return sourceType === 'image/jpeg' || sourceType === 'image/webp' ? sourceType : 'image/png'
}

/** The extension for a stored object, derived from the type actually uploaded. */
export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return 'png'
  }
}
