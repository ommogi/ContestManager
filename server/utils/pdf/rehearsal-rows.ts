// server/utils/pdf/rehearsal-rows.ts
// Rows of the rehearsal sheet (KAN-20): call time and rehearsal time first, as
// the client asked, then who and where. One row per participant, ordered by
// rehearsal time; participants without one go last, by name.
//
// Deliberately carries no DNI, phone or e-mail: the sheet is handed out.
import { callTime } from '../../../shared/session-window'

export interface RehearsalSource {
  name: string
  category: string | null
  rehearsal_time: string | null
  rehearsal_room: string | null
  rehearsal_accompanist: string | null
}

export interface RehearsalRow {
  call: string
  rehearsal: string
  name: string
  category: string
  room: string
  accompanist: string
}

/** "2026-10-12T14:05" → "12/10 14:05"; the sheet can span several days. */
export function shortDateTime(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : ''
}

export function buildRehearsalRows(
  sources: readonly RehearsalSource[],
  callOffsetMinutes: number | null,
): RehearsalRow[] {
  const sorted = [...sources].sort((a, b) => {
    if (a.rehearsal_time && b.rehearsal_time) {
      return a.rehearsal_time.localeCompare(b.rehearsal_time) || a.name.localeCompare(b.name, 'es')
    }
    if (a.rehearsal_time) return -1
    if (b.rehearsal_time) return 1
    return a.name.localeCompare(b.name, 'es')
  })

  return sorted.map(s => ({
    call: s.rehearsal_time && callOffsetMinutes !== null
      ? shortDateTime(callTime(s.rehearsal_time, callOffsetMinutes))
      : '',
    rehearsal: shortDateTime(s.rehearsal_time),
    name: s.name,
    category: s.category ?? '',
    room: s.rehearsal_room ?? '',
    accompanist: s.rehearsal_accompanist ?? '',
  }))
}
