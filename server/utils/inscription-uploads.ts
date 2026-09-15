// server/utils/inscription-uploads.ts
// File uploads for the `file` field type (KAN-59).
//
// Everything here is pure so it can be unit-tested without a database or a
// Storage bucket. The endpoint in
// `server/api/public/inscriptions/[token]/upload.post.ts` is the only caller.
//
// ── The threat this module exists for ───────────────────────────────────────
// `accept` on an `<input type="file">` is a file-picker filter, nothing more,
// and the `Content-Type` on a multipart part is whatever the client chose to
// write. Neither is evidence. Every decision below is taken from the bytes
// that actually arrived, and the type recorded in `responses_json` is the
// sniffed one — never the declared one.

import type { FormField, FormFieldFile, FormFileReference } from '../../shared/inscription-form'

/** Private bucket created in migration 0054. Never made public. */
export const INSCRIPTION_UPLOADS_BUCKET = 'inscription-uploads'

/**
 * Platform backstops, applied even when a schema asks for more.
 *
 * `FormSchemaBodySchema` lets an organization declare up to 100 MB and 20
 * files per field; that is the ceiling of what may be *configured*, not of
 * what will be *accepted*. A contest with 800 inscriptions and one PDF each
 * is the sizing case from KAN-59, and at 25 MB a file that is 20 GB for one
 * contest — hence the per-contest cap below as well.
 */
export const PLATFORM_MAX_FILE_SIZE_MB = 25
export const PLATFORM_MAX_FILES_PER_FIELD = 10
/** Conservative per-contest ceiling. Raise deliberately, per contest, not by accident. */
export const CONTEST_STORAGE_QUOTA_MB = 5_000

/**
 * How long an upload may sit unattached to a participant before it is
 * sweepable. Long enough for a slow Stripe Checkout and a retry, short enough
 * that an abandoned checkout does not linger for days.
 */
export const ORPHAN_UPLOAD_TTL_HOURS = 24

/** Lifetime of a download link handed to an organizer. Short on purpose. */
export const SIGNED_URL_TTL_SECONDS = 300

/** Retention after the contest ends, before uploads become purgeable. */
export const UPLOAD_RETENTION_DAYS = 365

// ─────────────────────────────────────────────────────────────────────────────
// Content sniffing
// ─────────────────────────────────────────────────────────────────────────────

export interface SniffResult {
  /** The type the bytes actually are, or null when unrecognised. */
  mime: string | null
  /**
   * Executable or script content. Rejected outright, whatever `accept` says —
   * an organization asking for "any file" must still not become a malware drop
   * box, and a served executable is a far worse outcome than a rejected upload.
   */
  dangerous: boolean
}

function startsWith(buf: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false
  return bytes.every((b, i) => buf[offset + i] === b)
}

function asciiAt(buf: Uint8Array, text: string, offset = 0): boolean {
  return startsWith(buf, [...text].map(c => c.charCodeAt(0)), offset)
}

/** Look for an ASCII marker anywhere in the first `limit` bytes. */
function containsAscii(buf: Uint8Array, text: string, limit: number): boolean {
  const needle = [...text].map(c => c.charCodeAt(0))
  const end = Math.min(buf.length, limit) - needle.length
  for (let i = 0; i <= end; i++) {
    if (needle.every((b, j) => buf[i + j] === b)) return true
  }
  return false
}

/** Executables, shared objects and scripts. Never accepted. */
function isDangerous(buf: Uint8Array): boolean {
  // PE / DOS (.exe, .dll) — this is the `.exe` renamed to `.pdf` from KAN-59.
  if (asciiAt(buf, 'MZ')) return true
  // ELF
  if (startsWith(buf, [0x7F, 0x45, 0x4C, 0x46])) return true
  // Mach-O, 32/64-bit, both endiannesses, and the fat/Java-class magic.
  if (startsWith(buf, [0xFE, 0xED, 0xFA, 0xCE])) return true
  if (startsWith(buf, [0xFE, 0xED, 0xFA, 0xCF])) return true
  if (startsWith(buf, [0xCE, 0xFA, 0xED, 0xFE])) return true
  if (startsWith(buf, [0xCF, 0xFA, 0xED, 0xFE])) return true
  if (startsWith(buf, [0xCA, 0xFE, 0xBA, 0xBE])) return true
  // Shebang scripts and PHP.
  if (asciiAt(buf, '#!')) return true
  if (asciiAt(buf, '<?php')) return true
  return false
}

/** True when the first bytes decode as text with no control characters. */
function looksLikeText(buf: Uint8Array): boolean {
  const slice = buf.subarray(0, Math.min(buf.length, 1024))
  if (slice.length === 0) return false
  for (const byte of slice) {
    // Allow tab, LF, CR and everything from space up. Anything else (NUL,
    // stray control bytes) means binary.
    if (byte === 0x09 || byte === 0x0A || byte === 0x0D) continue
    if (byte < 0x20) return false
  }
  return true
}

/**
 * Identify content from its magic bytes.
 *
 * Deliberately a short allow-list: the types an inscription realistically
 * asks for (scores as PDF, a scanned ID as an image, a spreadsheet). Anything
 * unrecognised returns `mime: null`, which `validateUpload` rejects whenever
 * the field declares an `accept`.
 */
export function sniffMimeType(buf: Uint8Array): SniffResult {
  if (isDangerous(buf)) return { mime: null, dangerous: true }

  if (asciiAt(buf, '%PDF-')) return { mime: 'application/pdf', dangerous: false }
  if (startsWith(buf, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return { mime: 'image/png', dangerous: false }
  }
  if (startsWith(buf, [0xFF, 0xD8, 0xFF])) return { mime: 'image/jpeg', dangerous: false }
  if (asciiAt(buf, 'GIF87a') || asciiAt(buf, 'GIF89a')) {
    return { mime: 'image/gif', dangerous: false }
  }
  if (asciiAt(buf, 'RIFF') && asciiAt(buf, 'WEBP', 8)) {
    return { mime: 'image/webp', dangerous: false }
  }
  if (startsWith(buf, [0x49, 0x49, 0x2A, 0x00]) || startsWith(buf, [0x4D, 0x4D, 0x00, 0x2A])) {
    return { mime: 'image/tiff', dangerous: false }
  }
  if (asciiAt(buf, 'ftyp', 4)) return { mime: 'video/mp4', dangerous: false }
  if (asciiAt(buf, 'ID3') || startsWith(buf, [0xFF, 0xFB])) {
    return { mime: 'audio/mpeg', dangerous: false }
  }

  // ZIP container. OOXML documents are ZIPs whose early entries name the part
  // directory, so the marker distinguishes them without unzipping. A plain ZIP
  // stays `application/zip` and is only accepted if the field asks for it.
  if (startsWith(buf, [0x50, 0x4B, 0x03, 0x04])) {
    if (containsAscii(buf, 'word/', 4096)) {
      return {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        dangerous: false,
      }
    }
    if (containsAscii(buf, 'xl/', 4096)) {
      return {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dangerous: false,
      }
    }
    if (containsAscii(buf, 'ppt/', 4096)) {
      return {
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        dangerous: false,
      }
    }
    return { mime: 'application/zip', dangerous: false }
  }

  if (looksLikeText(buf)) return { mime: 'text/plain', dangerous: false }

  return { mime: null, dangerous: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// `accept` matching
// ─────────────────────────────────────────────────────────────────────────────

/** Extensions we are willing to infer from a sniffed type, for `accept: ".pdf"`. */
const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'],
  'video/mp4': ['.mp4', '.m4v'],
  'audio/mpeg': ['.mp3'],
  'application/zip': ['.zip'],
  'text/plain': ['.txt', '.csv', '.md'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
}

/**
 * Does the sniffed type satisfy the field's `accept`?
 *
 * `accept` is the HTML attribute the organization typed, so it may hold MIME
 * types (`application/pdf`), wildcards (`image/*`) or extensions (`.pdf`) in
 * any mix. Extensions are matched against what the SNIFFED type may be called,
 * never against the uploaded filename — otherwise renaming `virus.exe` to
 * `score.pdf` would pass.
 */
export function matchesAccept(sniffedMime: string | null, accept: string | undefined): boolean {
  // No `accept` means the organization asked for any file; the dangerous-content
  // check in `validateUpload` still applies.
  if (!accept || accept.trim() === '') return true
  if (!sniffedMime) return false

  const tokens = accept.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
  if (tokens.length === 0) return true

  const mime = sniffedMime.toLowerCase()
  const knownExtensions = EXTENSIONS_BY_MIME[mime] ?? []

  return tokens.some((token) => {
    if (token === '*' || token === '*/*') return true
    if (token.startsWith('.')) return knownExtensions.includes(token)
    if (token.endsWith('/*')) return mime.startsWith(`${token.slice(0, -1)}`)
    return token === mime
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip a filename down to something safe to put in an object key.
 *
 * Traversal (`../`), separators and control characters go; the extension is
 * kept because it is what the organizer will see when downloading. The result
 * is never trusted for type decisions.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120)
  return cleaned.length > 0 ? cleaned : 'archivo'
}

export interface UploadPathParts {
  contestId: string
  /** The participant once enrolled; the uploading user while still pending. */
  ownerId: string
  fieldId: string
  fileName: string
}

/**
 * `{contest_id}/{owner_id}/{field_id}/{uuid}-{name}`, the convention from
 * KAN-59 — every segment is a prefix a storage policy can authorize against.
 *
 * `owner_id` is the uploading user's id, not the participant's: the file is
 * chosen before the participant row exists (the free path creates it at
 * enrolment, the paid path only after Stripe confirms). Keying by the user
 * means the RLS policy can compare segment 2 to `auth.uid()` directly, and
 * `inscription_uploads` records the participant id once there is one.
 */
export function buildUploadPath(parts: UploadPathParts, uuid: string): string {
  return [
    parts.contestId,
    parts.ownerId,
    sanitizeFileName(parts.fieldId),
    `${uuid}-${sanitizeFileName(parts.fileName)}`,
  ].join('/')
}

export function parseUploadPath(path: string): UploadPathParts | null {
  const segments = path.split('/')
  if (segments.length !== 4) return null
  const [contestId, ownerId, fieldId, fileName] = segments
  if (!contestId || !ownerId || !fieldId || !fileName) return null
  if (segments.some(s => s === '.' || s === '..')) return null
  return { contestId, ownerId, fieldId, fileName }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type UploadRejectionCode =
  | 'field_not_found'
  | 'field_not_file'
  | 'empty_file'
  | 'too_large'
  | 'too_many_files'
  | 'dangerous_content'
  | 'type_not_allowed'
  | 'contest_quota_exceeded'

export interface UploadRejection {
  code: UploadRejectionCode
  /** Spanish, ready to show the participant. */
  message: string
}

export interface UploadAcceptance {
  fileName: string
  /** The sniffed type, which is what gets stored. Never the declared one. */
  mimeType: string
  size: number
}

export type UploadValidation =
  | { ok: true; value: UploadAcceptance }
  | { ok: false; error: UploadRejection }

export interface UploadCandidate {
  fileName: string
  bytes: Uint8Array
}

export interface UploadContext {
  /** Files already stored for this field by this participant. */
  existingCount: number
  /** Bytes already stored across the whole contest. */
  contestBytesUsed: number
}

function isFileField(field: FormField): field is FormFieldFile {
  return field.type === 'file'
}

/** Effective limits: the schema's, clamped by the platform backstops. */
export function effectiveLimits(field: FormFieldFile): { maxBytes: number; maxFiles: number } {
  const declaredMB = typeof field.maxSizeMB === 'number' && field.maxSizeMB > 0
    ? field.maxSizeMB
    : PLATFORM_MAX_FILE_SIZE_MB
  const declaredFiles = typeof field.maxFiles === 'number' && field.maxFiles > 0
    ? field.maxFiles
    : 1
  return {
    maxBytes: Math.min(declaredMB, PLATFORM_MAX_FILE_SIZE_MB) * 1024 * 1024,
    maxFiles: Math.min(declaredFiles, PLATFORM_MAX_FILES_PER_FIELD),
  }
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1)
}

/**
 * Decide whether one uploaded file may be stored.
 *
 * Order matters: cheap checks first, and the dangerous-content check before
 * the `accept` check so that a disguised executable is reported as such rather
 * than as a type mismatch.
 */
export function validateUpload(
  field: FormField | undefined,
  candidate: UploadCandidate,
  context: UploadContext,
): UploadValidation {
  if (!field) {
    return {
      ok: false,
      error: { code: 'field_not_found', message: 'El campo indicado no existe en este formulario.' },
    }
  }
  if (!isFileField(field)) {
    return {
      ok: false,
      error: { code: 'field_not_file', message: `El campo «${field.label}» no admite archivos.` },
    }
  }

  const { maxBytes, maxFiles } = effectiveLimits(field)
  const size = candidate.bytes.byteLength

  if (size === 0) {
    return {
      ok: false,
      error: { code: 'empty_file', message: 'El archivo está vacío.' },
    }
  }

  if (size > maxBytes) {
    return {
      ok: false,
      error: {
        code: 'too_large',
        message: `El archivo supera el tamaño máximo de ${formatMB(maxBytes)} MB.`,
      },
    }
  }

  if (context.existingCount >= maxFiles) {
    return {
      ok: false,
      error: {
        code: 'too_many_files',
        message: maxFiles === 1
          ? `El campo «${field.label}» solo admite un archivo.`
          : `El campo «${field.label}» solo admite ${maxFiles} archivos.`,
      },
    }
  }

  if (context.contestBytesUsed + size > CONTEST_STORAGE_QUOTA_MB * 1024 * 1024) {
    return {
      ok: false,
      error: {
        code: 'contest_quota_exceeded',
        message: 'Este concurso ha alcanzado su límite de almacenamiento. '
          + 'Contacta con la organización.',
      },
    }
  }

  const sniffed = sniffMimeType(candidate.bytes)

  if (sniffed.dangerous) {
    return {
      ok: false,
      error: {
        code: 'dangerous_content',
        message: 'El archivo contiene contenido ejecutable y no se puede subir.',
      },
    }
  }

  if (!matchesAccept(sniffed.mime, field.accept)) {
    return {
      ok: false,
      error: {
        code: 'type_not_allowed',
        message: field.accept
          ? `El archivo no es del tipo admitido en «${field.label}» (${field.accept}).`
          : `El tipo de archivo no está admitido en «${field.label}».`,
      },
    }
  }

  return {
    ok: true,
    value: {
      fileName: sanitizeFileName(candidate.fileName),
      mimeType: sniffed.mime ?? 'application/octet-stream',
      size,
    },
  }
}

/** The reference stored in `responses_json` — never the file contents. */
export function toFileReference(
  path: string,
  accepted: UploadAcceptance,
  uploadedAt: string,
): FormFileReference {
  return {
    path,
    name: accepted.fileName,
    size: accepted.size,
    mimeType: accepted.mimeType,
    uploadedAt,
  }
}

// ── Resuming a half-filled form (KAN-67) ────────────────────────────────────
// Until now the only way a `FormFileReference` existed was as the return value
// of an upload, held in the page's memory. Reloading lost it, and the row it
// left behind kept counting against `maxFiles` — the field went dead with
// nothing on screen to explain why.
//
// `inscription_uploads_owner_field_idx` was created for this lookup; migration
// 0054 calls it "resuming a half-filled form, and the per-field maxFiles
// count". This is the first half finally being used.

/** The columns the reclaim query selects. Shaped like the table, not like a DTO. */
export interface PendingUploadRow {
  field_id: string
  path: string
  file_name: string
  size_bytes: number | string
  mime_type: string
  created_at: string
}

/**
 * Group a participant's pending uploads by field, dropping the ones no longer
 * uploadable: the published schema may have changed since, and a row for a
 * deleted, retyped or hidden field must not come back as an answer to a
 * question that no longer asks it. What is dropped here is left to the orphan
 * sweep, exactly as if the page had never been reopened.
 *
 * Deliberately NOT clamped to `effectiveLimits().maxFiles`. If the organizer
 * lowered the limit after the files were stored, the extra rows still count on
 * the server, so hiding them would recreate the very dead end this fixes:
 * a blocked field with nothing visible to remove. Showing all of them lets the
 * participant delete down to the new limit.
 */
export function pendingUploadsByField(
  rows: readonly PendingUploadRow[],
  fields: readonly FormField[],
): Record<string, FormFileReference[]> {
  const uploadable = new Set(
    fields.filter(f => isFileField(f) && f.hidden !== true).map(f => f.id),
  )

  const byField: Record<string, FormFileReference[]> = {}

  // Oldest first, so the order a participant sees after a reload is the order
  // they uploaded in.
  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (const row of ordered) {
    if (!uploadable.has(row.field_id)) continue
    const reference: FormFileReference = {
      path: row.path,
      name: row.file_name,
      // BIGINT comes back from PostgREST as a string often enough to matter.
      size: Number(row.size_bytes),
      mimeType: row.mime_type,
      uploadedAt: row.created_at,
    }
    ;(byField[row.field_id] ??= []).push(reference)
  }

  return byField
}
