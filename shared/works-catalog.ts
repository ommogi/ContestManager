// shared/works-catalog.ts
// Catalogue of works (KAN-16): the name key that makes spellings collide, the
// mm:ss duration format, and the "did you mean…?" check for new composers.

// Same pairs as `public.catalog_key()` in migration 0070. The database is the
// authority (a unique index on the key); this copy only lets the page and the
// API spot a clash before sending it. Keep the two identical.
const FOLD_FROM = 'áàâäãåāąéèêëēěęíìîïīóòôöõøōőúùûüūůűñńňçčćýÿšśžźżłŀľřŕďťğ'
const FOLD_TO = 'aaaaaaaaeeeeeeeiiiiioooooooouuuuuuunnncccyysszzzlllrrdtg'
const FOLD = new Map([...FOLD_FROM].map((ch, i) => [ch, FOLD_TO[i]!]))

/** "  RACHMÁNINOV " → "rachmaninov"; "Col·legi" → "col legi". */
export function catalogKey(value: string | null | undefined): string {
  const folded = [...(value ?? '').toLowerCase()].map(ch => FOLD.get(ch) ?? ch).join('')
  return folded.replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Composers and titles use the same key. */
export const composerKey = catalogKey

// ─── Durations ───────────────────────────────────────────────────────────────

export const MAX_WORK_SECONDS = 7200

/**
 * "7:30" → 450, "7" → 420 (plain minutes), "1:02:00" → 3720. Null for anything
 * else, for 0 and for more than two hours — the database range.
 */
export function parseDuration(value: string | null | undefined): number | null {
  const v = (value ?? '').trim()
  if (!v) return null
  let seconds: number
  if (/^\d+$/.test(v)) {
    seconds = Number(v) * 60
  } else {
    const m = /^(?:(\d+):)?(\d{1,3}):([0-5]\d)$/.exec(v)
    if (!m) return null
    seconds = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return seconds >= 1 && seconds <= MAX_WORK_SECONDS ? seconds : null
}

/** 450 → "7:30"; 3720 → "62:00" (performances are counted in minutes). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seconds → whole minutes, rounded up: a 7:30 piece needs an 8-minute slot. */
export function secondsToSlotMinutes(seconds: number): number {
  return Math.ceil(seconds / 60)
}

// ─── Similar composers ───────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

/** The last word is usually the surname: "S. Rachmaninoff" → "rachmaninoff". */
function surname(key: string): string {
  const words = key.split(' ')
  return words[words.length - 1] ?? key
}

export interface NamedComposer {
  id: string
  name: string
}

/**
 * Composers that are probably the one being typed, to warn before a new one is
 * created. Catches what the unique key cannot: "Rachmaninov" vs "Rachmaninoff"
 * vs "S. Rachmaninoff" vs "Rajmáninov". Close surnames (edit distance scaled to
 * length) or one name containing the other.
 */
export function similarComposers<T extends NamedComposer>(name: string, existing: readonly T[]): T[] {
  const key = catalogKey(name)
  if (!key) return []
  const last = surname(key)
  return existing.filter((c) => {
    const other = catalogKey(c.name)
    if (!other) return false
    if (other === key) return true
    if (other.includes(key) || key.includes(other)) return true
    const otherLast = surname(other)
    const tolerance = Math.max(1, Math.floor(Math.max(last.length, otherLast.length) / 4))
    return levenshtein(last, otherLast) <= tolerance
  })
}
