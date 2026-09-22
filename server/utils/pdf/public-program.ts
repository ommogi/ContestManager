// server/utils/pdf/public-program.ts
// Content of the public programme (KAN-21): who plays, in what order and what
// they perform, one day at a time.
//
// A "jornada" is the day of the slot's `performance_time`, not the round's
// session: that is what is actually played that afternoon, and it crosses
// categories and rounds. Someone without a time is not in the programme —
// there is no turn to print them in — and is counted instead, so the
// organisation can see nobody was quietly dropped.
//
// Carries names, times, categories and works only: no DNI, phone or e-mail.
//
// Relative imports: vitest does not resolve Nitro's `~~/` alias.

export interface ProgramWork {
  position: number
  composer: string
  title: string
  catalog_ref: string | null
}

export interface ProgramSource {
  /** `round_participants.performance_time`, "YYYY-MM-DDTHH:mm". */
  performance_time: string | null
  draw_number: number | null
  order: number | null
  name: string
  category: string
  works: ProgramWork[]
}

export interface ProgramRow {
  time: string
  draw: string
  name: string
  category: string
  work: string
}

export interface ProgramDay {
  /** "YYYY-MM-DD" */
  date: string
  rows: ProgramRow[]
  /** People playing that day, which is not the number of rows. */
  performances: number
}

export interface ProgramOptions {
  /**
   * KAN-32 is still open: if the jury ends up choosing the piece, a programme
   * with the works printed could not be published. Leaving them out keeps the
   * document usable either way.
   */
  includeWorks: boolean
  /** One "YYYY-MM-DD", or nothing for every day. */
  date?: string | null
}

export interface PublicProgram {
  days: ProgramDay[]
  /** Participants with no time yet, so they are in no day. */
  unscheduled: number
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/

function parseSlot(value: string | null | undefined): { date: string; time: string } | null {
  const m = DATE_TIME.exec(value ?? '')
  return m ? { date: m[1]!, time: m[2]! } : null
}

/** Turn order within a day: by the clock, then the draw, then the name. */
function compare(a: ProgramSource, b: ProgramSource): number {
  const byTime = (a.performance_time ?? '').localeCompare(b.performance_time ?? '')
  if (byTime) return byTime
  const da = a.draw_number ?? Number.MAX_SAFE_INTEGER
  const db = b.draw_number ?? Number.MAX_SAFE_INTEGER
  if (da !== db) return da - db
  const byOrder = (a.order ?? 0) - (b.order ?? 0)
  if (byOrder) return byOrder
  return a.name.localeCompare(b.name, 'es')
}

/** "Partita nº 2" + "BWV 1004" → "Bach — Partita nº 2 (BWV 1004)". */
function workLine(work: ProgramWork): string {
  const title = work.catalog_ref ? `${work.title} (${work.catalog_ref})` : work.title
  return work.composer ? `${work.composer} — ${title}` : title
}

/**
 * Rows of one performance. With the works printed it reads like a concert
 * programme: the first line carries the time and the player, the ones under it
 * only the next piece. That is also what lets it use the shared `table()`,
 * which draws one line per cell and does not wrap.
 */
function rowsFor(source: ProgramSource, time: string, includeWorks: boolean): ProgramRow[] {
  const head: ProgramRow = {
    time,
    draw: source.draw_number != null ? String(source.draw_number) : '',
    name: source.name,
    category: source.category,
    work: '',
  }
  if (!includeWorks) return [head]

  const works = [...source.works].sort((a, b) => a.position - b.position)
  if (works.length === 0) return [head]

  return works.map((work, index) => index === 0
    ? { ...head, work: workLine(work) }
    : { time: '', draw: '', name: '', category: '', work: workLine(work) })
}

export function buildPublicProgram(
  sources: readonly ProgramSource[],
  options: ProgramOptions,
): PublicProgram {
  const byDate = new Map<string, ProgramSource[]>()
  let unscheduled = 0

  for (const source of sources) {
    const slot = parseSlot(source.performance_time)
    if (!slot) { unscheduled++; continue }
    if (options.date && slot.date !== options.date) continue
    const day = byDate.get(slot.date)
    if (day) day.push(source)
    else byDate.set(slot.date, [source])
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => {
      const sorted = [...entries].sort(compare)
      return {
        date,
        performances: sorted.length,
        rows: sorted.flatMap(source => rowsFor(
          source,
          parseSlot(source.performance_time)!.time,
          options.includeWorks,
        )),
      }
    })

  return { days, unscheduled }
}

/** The days that have performances, for the picker. */
export function programDays(sources: readonly ProgramSource[]): Array<{ date: string; performances: number }> {
  return buildPublicProgram(sources, { includeWorks: false })
    .days.map(d => ({ date: d.date, performances: d.performances }))
}
