// server/utils/pdf/response.ts
// Answer a request with a generated PDF (KAN-19).
import { setResponseHeaders, type H3Event } from 'h3'

/**
 * A filename safe for Content-Disposition: accents folded, anything else that
 * is not a letter, digit, dot or dash collapsed to "-". Contest names come from
 * the organisation and could otherwise inject header syntax.
 */
export function pdfFilename(...parts: Array<string | null | undefined>): string {
  const base = parts
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80)
  return `${base || 'documento'}.pdf`
}

export function sendPdf(event: H3Event, buffer: Buffer, filename: string): Buffer {
  setResponseHeaders(event, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buffer.length),
    // Schedules change; a cached copy would hand out yesterday's times.
    'Cache-Control': 'no-store',
  })
  return buffer
}
