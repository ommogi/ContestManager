// server/api/csp-report.post.ts
//
// Collector for the Content-Security-Policy-Report-Only header (KAN-39).
//
// The policy is served in Report-Only mode because Nuxt's renderer emits an
// inline bootstrap script and offers no nonce hook. Without a destination those
// reports only reach each visitor's own console, where nobody can review them —
// and "review the real violations before enforcing" is the acceptance criterion
// this endpoint exists to make possible.
//
// Deliberately unauthenticated: the browser posts these with no session, and
// the report body carries nothing secret. It is still an endpoint anyone can
// POST to, so it does the least possible work: parse, log a handful of fields,
// answer 204. No database, no notification, no fan-out.

import { defineEventHandler, readBody, setResponseStatus } from 'h3'

/** The subset of the CSP Level 2 report we act on. Everything else is noise. */
interface CspReportBody {
  'csp-report'?: {
    'document-uri'?: unknown
    'violated-directive'?: unknown
    'effective-directive'?: unknown
    'blocked-uri'?: unknown
    'original-policy'?: unknown
  }
}

/**
 * Trims and caps an attacker-controllable string before it reaches the logs.
 * A report is unauthenticated input: without a ceiling, a crafted `blocked-uri`
 * could push megabytes into the log stream on every request.
 */
export function truncateForLog(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export default defineEventHandler(async (event) => {
  let body: CspReportBody | null = null
  try {
    // Browsers send `application/csp-report`, which h3 does not parse as JSON
    // on its own in every runtime; a malformed body is not worth a 400 here.
    body = await readBody<CspReportBody>(event)
  } catch {
    body = null
  }

  const report = body?.['csp-report']
  if (report) {
    const directive = truncateForLog(report['effective-directive'] ?? report['violated-directive'], 60)
    const blocked = truncateForLog(report['blocked-uri'])
    const document = truncateForLog(report['document-uri'])

    // `original-policy` is deliberately dropped: it is the entire header on
    // every single report, and it is already in the source.
    console.warn('[csp] violation', { directive, blocked, document })
  }

  // Always 204. A report that cannot be parsed is not the reporter's problem,
  // and an error status would make browsers retry a purely informational post.
  setResponseStatus(event, 204)
  return null
})
