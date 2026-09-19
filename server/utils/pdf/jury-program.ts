// server/utils/pdf/jury-program.ts
// Content of the jury programme (KAN-22): one block per participant, in the
// order they perform, with the works they play and how long each lasts.
//
// Carries names, times and works only — no DNI, phone or e-mail.
import { effectiveSeconds, repertoireTotal } from '../../../shared/repertoire'
import { formatDuration } from '../../../shared/works-catalog'
import { shortDateTime } from './rehearsal-rows'

export interface JurySource {
  name: string
  draw_number: number | null
  order: number | null
  performance_time: string | null
  works: Array<{
    position: number
    composer: string
    title: string
    catalog_ref: string | null
    duration_seconds: number | null
    catalog_seconds: number | null
  }>
}

export interface JuryBlock {
  name: string
  draw: string
  time: string
  works: Array<{ composer: string; title: string; duration: string }>
  total: string
}

/**
 * Performance order: scheduled participants by time, then — for anyone not
 * scheduled yet — by draw number, then by insertion order. A programme that
 * is printed before the schedule exists still comes out in draw order.
 */
function compare(a: JurySource, b: JurySource): number {
  if (a.performance_time && b.performance_time) {
    const byTime = a.performance_time.localeCompare(b.performance_time)
    if (byTime) return byTime
  } else if (a.performance_time) {
    return -1
  } else if (b.performance_time) {
    return 1
  }
  const da = a.draw_number ?? Number.MAX_SAFE_INTEGER
  const db = b.draw_number ?? Number.MAX_SAFE_INTEGER
  if (da !== db) return da - db
  return (a.order ?? 0) - (b.order ?? 0)
}

export function buildJuryProgram(sources: readonly JurySource[]): JuryBlock[] {
  return [...sources].sort(compare).map((s) => {
    const works = [...s.works].sort((a, b) => a.position - b.position)
    const total = repertoireTotal(works)
    return {
      name: s.name,
      draw: s.draw_number != null ? String(s.draw_number) : '',
      time: shortDateTime(s.performance_time),
      works: works.map(w => ({
        composer: w.composer,
        title: w.catalog_ref ? `${w.title} (${w.catalog_ref})` : w.title,
        duration: formatDuration(effectiveSeconds(w)),
      })),
      total: total.seconds > 0 ? formatDuration(total.seconds) : '',
    }
  })
}
