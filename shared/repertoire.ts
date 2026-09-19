// shared/repertoire.ts
// A participant's repertoire for a round (KAN-17): works in playing order,
// each lasting its own override or the catalogue's indicative length.
import { formatDuration, secondsToSlotMinutes } from './works-catalog'

export interface RepertoireItem {
  work_id: string
  /** Override for this participant; null = the catalogue's length. */
  duration_seconds: number | null
  /** The catalogue's indicative length, for display and fallback. */
  catalog_seconds: number | null
}

/** Seconds this item takes, or null when neither the override nor the catalogue says. */
export function effectiveSeconds(item: Pick<RepertoireItem, 'duration_seconds' | 'catalog_seconds'>): number | null {
  return item.duration_seconds ?? item.catalog_seconds ?? null
}

export interface RepertoireTotal {
  seconds: number
  /** Whole minutes for a performance slot, rounded up (KAN-18). */
  slotMinutes: number
  /** Items with no length at all; the total undercounts while there are any. */
  missing: number
}

export function repertoireTotal(items: ReadonlyArray<Pick<RepertoireItem, 'duration_seconds' | 'catalog_seconds'>>): RepertoireTotal {
  let seconds = 0
  let missing = 0
  for (const item of items) {
    const s = effectiveSeconds(item)
    if (s === null) missing++
    else seconds += s
  }
  return { seconds, slotMinutes: seconds > 0 ? secondsToSlotMinutes(seconds) : 0, missing }
}

/** "3 obras · 18:30" — the summary shown next to a participant. */
export function repertoireSummary(items: ReadonlyArray<Pick<RepertoireItem, 'duration_seconds' | 'catalog_seconds'>>): string {
  if (items.length === 0) return 'Sin repertorio'
  const { seconds } = repertoireTotal(items)
  const count = `${items.length} obra${items.length === 1 ? '' : 's'}`
  return seconds > 0 ? `${count} · ${formatDuration(seconds)}` : count
}
