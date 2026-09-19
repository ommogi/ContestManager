// shared/pdf-i18n.ts
// Texts of the generated PDFs in Spanish and Catalan (KAN-19).
//
// The language comes from `organizations.locale`. The app UI stays in Spanish;
// only the documents handed to participants, audience and jury are translated.

export const PDF_LOCALES = ['es', 'ca'] as const
export type PdfLocale = (typeof PDF_LOCALES)[number]

export const PDF_LOCALE_LABELS: Record<PdfLocale, string> = {
  es: 'Castellano',
  ca: 'Català',
}

const es = {
  page: 'Página',
  of: 'de',
  generatedOn: 'Generado el',
  round: 'Ronda',
  rehearsalsTitle: 'Cuadrante de ensayos',
  callTime: 'Convocatoria',
  rehearsalTime: 'Ensayo',
  participant: 'Participante',
  category: 'Categoría',
  room: 'Aula',
  accompanist: 'Acompañante',
  callOffsetNote: 'Convocatoria {minutes} min antes del ensayo',
  noCallOffset: 'Sin convocatoria configurada',
  noRows: 'No hay participantes en esta ronda.',
}

export type PdfStrings = typeof es

const ca: PdfStrings = {
  page: 'Pàgina',
  of: 'de',
  generatedOn: 'Generat el',
  round: 'Ronda',
  rehearsalsTitle: 'Quadrant d’assajos',
  callTime: 'Convocatòria',
  rehearsalTime: 'Assaig',
  participant: 'Participant',
  category: 'Categoria',
  room: 'Aula',
  accompanist: 'Acompanyant',
  callOffsetNote: 'Convocatòria {minutes} min abans de l’assaig',
  noCallOffset: 'Sense convocatòria configurada',
  noRows: 'No hi ha participants en aquesta ronda.',
}

export const PDF_STRINGS: Record<PdfLocale, PdfStrings> = { es, ca }

/** Anything that is not a supported locale falls back to Spanish. */
export function resolveLocale(value: unknown): PdfLocale {
  return (PDF_LOCALES as readonly unknown[]).includes(value) ? (value as PdfLocale) : 'es'
}

export function pdfStrings(locale: unknown): PdfStrings {
  return PDF_STRINGS[resolveLocale(locale)]
}

/** "{minutes}" style placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
}

/** Long date in the document's language, e.g. "12 d’octubre del 2026". */
export function formatPdfDate(date: Date, locale: unknown): string {
  return new Intl.DateTimeFormat(resolveLocale(locale) === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid',
  }).format(date)
}
