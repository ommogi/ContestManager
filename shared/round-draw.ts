// shared/round-draw.ts
// Draw number and performance length per participant and round (KAN-11).
//
// Pure functions shared by the round page and the server: whether a round's
// draw is complete enough for the schedule generator (KAN-13) to run, and how
// an imported CSV row is matched to a participant of the round.

/** Upper bound for a single performance, mirrored by the DB CHECK in 0066. */
export const MAX_PERFORMANCE_MINUTES = 240

export interface DrawEntry {
  /** round_participants.id */
  id: string
  draw_number: number | null
  performance_minutes: number | null
  /**
   * KAN-18: true = the minutes were typed and are kept; false = they follow the
   * repertoire. Omitted = leave the stored flag as it is.
   */
  performance_minutes_manual?: boolean
}

export interface DrawReadiness {
  /** True only when every participant has a draw number and none repeat. */
  ready: boolean
  /** round_participants ids without a draw number. */
  missing: string[]
  /** Draw numbers used more than once. */
  duplicates: number[]
}

/**
 * The gate for the schedule generator: it cannot place anyone in a slot
 * without a draw, and an empty round has nothing to schedule.
 */
export function drawReadiness(entries: readonly DrawEntry[]): DrawReadiness {
  const missing: string[] = []
  const seen = new Map<number, number>()

  for (const entry of entries) {
    if (entry.draw_number == null) missing.push(entry.id)
    else seen.set(entry.draw_number, (seen.get(entry.draw_number) ?? 0) + 1)
  }

  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([n]) => n)
    .sort((a, b) => a - b)

  return {
    ready: entries.length > 0 && missing.length === 0 && duplicates.length === 0,
    missing,
    duplicates,
  }
}

export interface PromotedParticipant {
  participant_id: string
  /** The number they had in the round they are leaving; null if never drawn. */
  draw_number: number | null
}

/**
 * The draw number travels with the participant (KAN-27): the client does not
 * draw again between rounds. Numbers are compacted keeping their relative
 * order — promote 3, 7 and 12 and they become 1, 2 and 3 — because a round of
 * six starting at number 12 reads like a mistake.
 *
 * `startAt` is 1 for a fresh round, and one past the highest number already
 * there when a second batch is promoted into the same round: the unique index
 * on (round_id, draw_number) does not forgive a collision.
 *
 * Participants with no number stay last, in the order they arrived, and keep
 * having none: inventing one would hide that nobody drew them.
 */
export function carryDrawNumbers(
  promoted: readonly PromotedParticipant[],
  options: { startAt?: number } = {},
): Map<string, number | null> {
  const startAt = options.startAt ?? 1
  const drawn = promoted
    .filter(p => p.draw_number != null)
    .sort((a, b) => a.draw_number! - b.draw_number!)

  const result = new Map<string, number | null>()
  drawn.forEach((p, index) => result.set(p.participant_id, startAt + index))
  for (const p of promoted) {
    if (!result.has(p.participant_id)) result.set(p.participant_id, null)
  }
  return result
}

/** A draw of 1..N in random order, for the "Sortear al azar" button. */
export function randomDraw(
  ids: readonly string[],
  random: () => number = Math.random,
): Map<string, number> {
  const numbers = ids.map((_, i) => i + 1)
  // Fisher–Yates: every permutation equally likely, unlike sort(() => r - 0.5).
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[numbers[i], numbers[j]] = [numbers[j]!, numbers[i]!]
  }
  return new Map(ids.map((id, i) => [id, numbers[i]!]))
}

// ─── CSV import ──────────────────────────────────────────────────────────────

export interface DrawImportRow {
  /** 1-based line in the file, header excluded, for error messages. */
  line: number
  dni: string | null
  email: string | null
  draw_number: number | null
  performance_minutes: number | null
}

export interface DrawCandidate {
  /** round_participants.id */
  id: string
  dni: string | null
  email: string | null
}

export interface DrawImportResult {
  matched: DrawEntry[]
  /** Lines with no participant of this round behind them. */
  unmatched: number[]
  /** Lines naming a participant an earlier line already named. */
  repeated: number[]
}

/** Documents are compared without spaces, dashes or case: "12345678-z" = "12345678Z". */
export function normalizeDni(value: string | null | undefined): string | null {
  const v = (value ?? '').replace(/[\s-]/g, '').toUpperCase()
  return v || null
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim().toLowerCase()
  return v || null
}

/**
 * Match imported rows to the round's participants, by DNI first and e-mail
 * second. The first line that names a participant wins; later ones are
 * reported rather than silently overwriting it.
 */
export function matchDrawImport(
  rows: readonly DrawImportRow[],
  candidates: readonly DrawCandidate[],
): DrawImportResult {
  const byDni = new Map<string, string>()
  const byEmail = new Map<string, string>()
  for (const c of candidates) {
    const dni = normalizeDni(c.dni)
    const email = normalizeEmail(c.email)
    if (dni && !byDni.has(dni)) byDni.set(dni, c.id)
    if (email && !byEmail.has(email)) byEmail.set(email, c.id)
  }

  const result: DrawImportResult = { matched: [], unmatched: [], repeated: [] }
  const taken = new Set<string>()

  for (const row of rows) {
    const dni = normalizeDni(row.dni)
    const email = normalizeEmail(row.email)
    const id = (dni && byDni.get(dni)) || (email && byEmail.get(email)) || null

    if (!id) { result.unmatched.push(row.line); continue }
    if (taken.has(id)) { result.repeated.push(row.line); continue }

    taken.add(id)
    result.matched.push({
      id,
      draw_number: row.draw_number,
      performance_minutes: row.performance_minutes,
    })
  }

  return result
}

const HEADER_ALIASES: Record<string, keyof Omit<DrawImportRow, 'line'>> = {
  dni: 'dni', documento: 'dni', nie: 'dni', pasaporte: 'dni',
  email: 'email', correo: 'email', 'e-mail': 'email',
  sorteo: 'draw_number', 'nº sorteo': 'draw_number', 'n sorteo': 'draw_number',
  orden: 'draw_number', draw_number: 'draw_number',
  minutos: 'performance_minutes', duracion: 'performance_minutes',
  'duración': 'performance_minutes', performance_minutes: 'performance_minutes',
}

export interface ParsedDrawCsv {
  rows: DrawImportRow[]
  /** Human-readable problems, in Spanish, one per offending line. */
  errors: string[]
}

/** Empty → null; not a plain non-negative integer → NaN. */
function parseOptionalInt(raw: string | undefined): number | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  return /^\d+$/.test(v) ? Number(v) : NaN
}

/**
 * Parse a draw CSV: a header naming `dni` and/or `email`, `sorteo`, and
 * optionally `minutos`. Comma or semicolon separated (Spanish Excel exports
 * use `;`). Quoted fields are not supported: none of these values need them.
 */
export function parseDrawCsv(text: string): ParsedDrawCsv {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return { rows: [], errors: ['El archivo está vacío.'] }

  const sep = lines[0]!.includes(';') ? ';' : ','
  const header = lines[0]!.split(sep).map(h => HEADER_ALIASES[h.trim().toLowerCase()] ?? null)

  if (!header.includes('dni') && !header.includes('email')) {
    return { rows: [], errors: ['Falta una columna "dni" o "email" para identificar a cada participante.'] }
  }
  if (!header.includes('draw_number')) {
    return { rows: [], errors: ['Falta la columna "sorteo".'] }
  }

  const rows: DrawImportRow[] = []
  const errors: string[] = []

  lines.slice(1).forEach((raw, i) => {
    const line = i + 1
    const cells = raw.split(sep)
    const get = (key: keyof Omit<DrawImportRow, 'line'>) => {
      const idx = header.indexOf(key)
      return idx === -1 ? undefined : cells[idx]
    }

    const draw = parseOptionalInt(get('draw_number'))
    const minutes = parseOptionalInt(get('performance_minutes'))

    if (Number.isNaN(draw) || draw === 0) {
      errors.push(`Fila ${line}: el número de sorteo debe ser un entero positivo.`)
      return
    }
    if (Number.isNaN(minutes) || (minutes !== null && (minutes < 1 || minutes > MAX_PERFORMANCE_MINUTES))) {
      errors.push(`Fila ${line}: los minutos deben estar entre 1 y ${MAX_PERFORMANCE_MINUTES}.`)
      return
    }

    const dni = normalizeDni(get('dni'))
    const email = normalizeEmail(get('email'))
    if (!dni && !email) {
      errors.push(`Fila ${line}: sin DNI ni email.`)
      return
    }

    rows.push({ line, dni, email, draw_number: draw, performance_minutes: minutes })
  })

  return { rows, errors }
}
