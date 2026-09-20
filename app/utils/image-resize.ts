// app/utils/image-resize.ts
// The browser half of the upload shrink: decode, draw, re-encode.
//
// The arithmetic lives in `shared/image-resize.ts` with its tests. This file is
// deliberately thin and branch-poor, because it cannot be tested at all:
// `vitest.config.ts` runs `environment: 'node'`, collects only
// `server/**/*.test.ts`, and the project has no jsdom — there is no `document`
// and no canvas to exercise. Anything here that could be wrong in an
// interesting way belongs in the shared module instead.

import {
  fitWithin,
  outputMimeType,
  extensionForMimeType,
  type ResizePolicy,
} from '~~/shared/image-resize'

export { COVER_POLICY, LOGO_POLICY, AVATAR_POLICY } from '~~/shared/image-resize'
export type { ResizePolicy } from '~~/shared/image-resize'

export interface ResizedImage {
  /** The file to upload — the original itself when nothing was gained. */
  file: File
  /** What to pass as `contentType`, and what the object's extension must match. */
  mimeType: string
  extension: string
}

/**
 * Shrink `file` according to `policy`, or hand back the original.
 *
 * **Never throws.** A failure here is not a reason to stop an upload: the user
 * asked to upload a picture, not to optimise one. Blocking them over a
 * transcoding problem would punish them for something they did not ask for.
 * That is the opposite of the checkout's fail-closed rule (KAN-77), and
 * deliberately so — there the risk was wrong data written to the database, here
 * it is only bytes.
 */
export async function resizeImageFile(file: File, policy: ResizePolicy): Promise<ResizedImage> {
  const original = untouched(file)

  // A non-image, or a format with no canvas decoder, is not worth attempting.
  if (!file.type.startsWith('image/')) return original
  // An animated GIF would come back as a single frame. Losing the animation is
  // worse than carrying the bytes.
  if (file.type === 'image/gif') return original

  try {
    const bitmap = await createImageBitmap(file)
    const target = fitWithin(bitmap.width, bitmap.height, policy.maxEdge)
    const mimeType = outputMimeType(file.type, policy)

    // Already small enough and no conversion asked for: re-encoding would only
    // lose quality for nothing.
    if (!target.resized && mimeType === file.type) {
      bitmap.close()
      return original
    }

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return original
    }

    // JPEG has no alpha: without a painted background, transparent pixels turn
    // black. White matches every surface these images sit on.
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    context.drawImage(bitmap, 0, 0, target.width, target.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, policy.quality)
    })
    if (!blob) return original

    // Re-encoding can make a file bigger — a small flat PNG turned into JPEG is
    // the usual way. Keep whichever is smaller, whatever the format: the point
    // is fewer bytes, not having run the canvas. Falling back is safe because
    // the original's type already passed the picker and every bucket involved
    // accepts png, jpeg and webp alike (0059, 0060).
    if (blob.size >= file.size) return original

    const extension = extensionForMimeType(mimeType)
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + extension

    return { file: new File([blob], name, { type: mimeType }), mimeType, extension }
  } catch (error) {
    console.warn('[image-resize] uploading the original unchanged:', (error as Error)?.message)
    return original
  }
}

function untouched(file: File): ResizedImage {
  const mimeType = file.type || 'image/png'
  return { file, mimeType, extension: extensionForMimeType(mimeType) }
}
