// server/services/repertoire.ts
// A participant's repertoire for a round (KAN-17).
//
// Reads go through the admin client after `requireContestOrganizer`; writes go
// through the `set_round_repertoire` RPC (migration 0071), which replaces the
// whole list in one transaction and enforces the lock and the catalogue scope.
//
// Relative imports: vitest does not resolve Nitro's `~~/` alias.
import { repertoireTotal, type RepertoireTotal } from '../../shared/repertoire'
import type { SupabaseAdmin } from './inscription-upload-purge'

export interface RepertoireEntry {
  work_id: string
  title: string
  catalog_ref: string | null
  composer: string
  archived: boolean
  duration_seconds: number | null
  catalog_seconds: number | null
}

export interface RepertoireView {
  roundParticipantId: string
  contestId: string
  roundStatus: string
  /** Editable only while the round is pending (agreed lock). */
  editable: boolean
  /** The slot length after this repertoire (KAN-18), and whether it is pinned by hand. */
  performanceMinutes: number | null
  performanceMinutesManual: boolean
  items: RepertoireEntry[]
  total: RepertoireTotal
  /** Same participant's repertoire in the previous round, to copy from. */
  previous: { roundName: string; items: RepertoireEntry[] } | null
}

export type RepertoireErrorCode =
  | 'round_participant_not_found'
  | 'round_locked'
  | 'work_other_organization'
  | 'work_archived'
  | 'duplicate_work'
  | 'invalid_duration'

const STATUS: Record<RepertoireErrorCode, number> = {
  round_participant_not_found: 404,
  round_locked: 409,
  work_other_organization: 400,
  work_archived: 409,
  duplicate_work: 400,
  invalid_duration: 400,
}

const MESSAGES: Record<RepertoireErrorCode, string> = {
  round_participant_not_found: 'El participante no está en esta ronda.',
  round_locked: 'La ronda ya ha empezado: su repertorio no se puede cambiar.',
  work_other_organization: 'Alguna obra no pertenece al catálogo de la organización.',
  work_archived: 'Alguna obra está archivada y no se puede añadir.',
  duplicate_work: 'La misma obra aparece dos veces.',
  invalid_duration: 'Alguna duración no es válida (hasta 2 horas).',
}

export class RepertoireError extends Error {
  readonly statusCode: number
  readonly userMessage: string

  constructor(public readonly code: RepertoireErrorCode) {
    super(code)
    this.name = 'RepertoireError'
    this.statusCode = STATUS[code]
    this.userMessage = MESSAGES[code]
  }
}

interface RpRow {
  id: string
  participant_id: string
  performance_minutes: number | null
  performance_minutes_manual: boolean | null
  round: {
    id: string
    name: string
    order: number
    status: string
    category_id: string
    category: { contest_id: string } | null
  } | null
}

interface ItemRow {
  duration_seconds: number | null
  work: {
    id: string
    title: string
    catalog_ref: string | null
    duration_seconds: number | null
    archived_at: string | null
    composer: { name: string } | null
  } | null
}

const ITEM_COLUMNS = 'duration_seconds, work:works(id, title, catalog_ref, duration_seconds, archived_at, composer:composers(name))'

function toEntries(rows: ItemRow[] | null): RepertoireEntry[] {
  return (rows ?? [])
    .filter(r => r.work)
    .map(r => ({
      work_id: r.work!.id,
      title: r.work!.title,
      catalog_ref: r.work!.catalog_ref,
      composer: r.work!.composer?.name ?? '—',
      archived: !!r.work!.archived_at,
      duration_seconds: r.duration_seconds,
      catalog_seconds: r.work!.duration_seconds,
    }))
}

async function itemsOf(client: SupabaseAdmin, rpId: string): Promise<RepertoireEntry[]> {
  const { data, error } = await client
    .from('round_participant_works')
    .select(ITEM_COLUMNS)
    .eq('round_participant_id', rpId)
    .order('position', { ascending: true })
  if (error) throw new Error(`round_participant_works.select: ${error.message}`)
  return toEntries(data as unknown as ItemRow[] | null)
}

/** Just enough to gate: which contest this round participant belongs to. */
export async function contestOfRoundParticipant(client: SupabaseAdmin, rpId: string): Promise<string> {
  const rp = await loadRp(client, rpId)
  return rp.round!.category!.contest_id
}

async function loadRp(client: SupabaseAdmin, rpId: string): Promise<RpRow> {
  const { data, error } = await client
    .from('round_participants')
    .select('id, participant_id, performance_minutes, performance_minutes_manual, round:rounds(id, name, order, status, category_id, category:categories(contest_id))')
    .eq('id', rpId)
    .maybeSingle()
  if (error) throw new Error(`round_participants.select: ${error.message}`)
  const rp = data as unknown as RpRow | null
  if (!rp?.round?.category) throw new RepertoireError('round_participant_not_found')
  return rp
}

export async function loadRepertoire(client: SupabaseAdmin, rpId: string): Promise<RepertoireView> {
  const rp = await loadRp(client, rpId)
  const round = rp.round!
  const items = await itemsOf(client, rpId)

  // The round before this one in the same category, and this participant in it.
  let previous: RepertoireView['previous'] = null
  const { data: prevRound } = await client
    .from('rounds')
    .select('id, name')
    .eq('category_id', round.category_id)
    .eq('order', round.order - 1)
    .maybeSingle()
  if (prevRound) {
    const { data: prevRp } = await client
      .from('round_participants')
      .select('id')
      .eq('round_id', (prevRound as { id: string }).id)
      .eq('participant_id', rp.participant_id)
      .maybeSingle()
    if (prevRp) {
      const prevItems = await itemsOf(client, (prevRp as { id: string }).id)
      if (prevItems.length) previous = { roundName: (prevRound as { name: string }).name, items: prevItems }
    }
  }

  return {
    roundParticipantId: rpId,
    contestId: round.category!.contest_id,
    roundStatus: round.status,
    editable: round.status === 'pending',
    performanceMinutes: rp.performance_minutes ?? null,
    performanceMinutesManual: !!rp.performance_minutes_manual,
    items,
    total: repertoireTotal(items),
    previous,
  }
}

export async function saveRepertoire(
  client: SupabaseAdmin,
  rpId: string,
  items: ReadonlyArray<{ work_id: string; duration_seconds: number | null }>,
): Promise<RepertoireView> {
  const { error } = await client.rpc('set_round_repertoire', {
    p_rp_id: rpId,
    p_items: items.map(i => ({ work_id: i.work_id, duration_seconds: i.duration_seconds })),
  } as never)

  if (error) {
    const code = (Object.keys(STATUS) as RepertoireErrorCode[]).find(c => (error.message ?? '').includes(c))
    if (code) throw new RepertoireError(code)
    throw new Error(`rpc:set_round_repertoire: ${error.message}`)
  }
  return loadRepertoire(client, rpId)
}
