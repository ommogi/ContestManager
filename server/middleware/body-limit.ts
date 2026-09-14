import { defineEventHandler, getRequestHeader, createError } from 'h3'

// Request body size ceiling (KAN-57).
//
// Why a middleware and not configuration: the issue assumed a `bodyLimit` route
// rule, and Nitro has none. `NitroRouteConfig` accepts only cache, headers,
// redirect, prerender, proxy, isr, cors, swr and static (nitropack 2.13.3), and
// h3 1.15.11 exposes no body ceiling either. So the check lives here, in front
// of every handler, next to the rate limiter it complements: this one caps the
// cost of a single request, that one caps how many arrive.
//
// What this stops: `readBody()` reads the whole payload into memory and parses
// it as JSON *before* Zod gets to reject it. `ImportBodySchema` caps rows at
// 1000, but a 50 MB array of 100.000 rows is fully read and parsed first. The
// server pays the memory; the caller only pays bandwidth.
//
// Known gap, deliberately not papered over: a request without `Content-Length`
// — chunked transfer encoding — cannot be judged before reading it, and is let
// through. Counting bytes mid-stream would mean taking over body reading from
// h3 for every route. The backstop is the platform: Vercel caps a serverless
// function's request body at 4.5 MB regardless of anything configured here, so
// that is the real ceiling above these numbers.

const KB = 1024
const MB = 1024 * KB

/** Generous for every real payload in this project; see getBodyLimit(). */
const GENERAL_LIMIT = 256 * KB

/**
 * Participant import.
 *
 * The CSV is not uploaded as a file: the client parses it and posts JSON. One
 * `ImportRowSchema` row at its theoretical maximum is roughly 730 bytes — UUID
 * 36, first and last name 100 each, country 100, email 254, plus birthdate, DNI,
 * phone and JSON punctuation — so the schema's own 1000-row cap lands near
 * 730 KB. 2 MB leaves room for wider rows without being an invitation.
 */
const IMPORT_LIMIT = 2 * MB

/**
 * Routes that must not be judged by `Content-Length` at all.
 *
 *   * The Stripe webhook needs its raw body to verify the signature, and a
 *     limit misapplied here breaks payments — the one regression in this change
 *     that costs real money.
 *   * The inscription upload endpoint is multipart with actual files. Its size
 *     is already enforced per field by `server/utils/inscription-uploads.ts`
 *     against the `maxSizeMB` declared in the published schema, which is a
 *     tighter and better-informed check than a blanket byte count.
 */
function isExempt(path: string): boolean {
  if (path.startsWith('/api/stripe/webhook')) return true
  if (path.startsWith('/api/public/inscriptions/') && path.endsWith('/upload')) return true
  return false
}

export function getBodyLimit(path: string): number | null {
  if (!path.startsWith('/api/')) return null
  if (isExempt(path)) return null
  if (path.startsWith('/api/contests/') && path.endsWith('/participants/import')) return IMPORT_LIMIT
  return GENERAL_LIMIT
}

/**
 * Parses `Content-Length` defensively: it is attacker-controlled, so anything
 * that is not a plain non-negative integer is treated as absent rather than
 * coerced. `Number('12abc')` is NaN and `Number('')` is 0, and neither should
 * be read as a size.
 */
export function parseContentLength(raw: string | undefined): number | null {
  if (!raw) return null
  if (!/^\d+$/.test(raw.trim())) return null
  const n = Number(raw.trim())
  return Number.isSafeInteger(n) ? n : null
}

export default defineEventHandler((event) => {
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const path = event.path?.split('?')[0] ?? ''
  const limit = getBodyLimit(path)
  if (limit === null) return

  const declared = parseContentLength(getRequestHeader(event, 'content-length'))
  if (declared === null) return

  if (declared > limit) {
    // 413 before a single byte of the body is read or parsed, which is the
    // whole point: a Zod 400 after the fact has already paid the cost.
    throw createError({
      statusCode: 413,
      statusMessage: 'payload_too_large',
      message: 'La petición es demasiado grande.',
    })
  }
})
