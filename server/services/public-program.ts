// server/services/public-program.ts
// Read what the public programme needs (KAN-21): every scheduled turn of a
// contest, whatever the category or the round it belongs to.
//
// The select asks for names, times, categories and works and nothing else.
// What is never read cannot be printed by mistake, and this document is handed
// to the audience.
//
// Kept out of the handler so vitest can reach it; relative imports for the
// same reason as ./round-schedule.ts.
import type { ProgramSource } from '../utils/pdf/public-program'
import type { SupabaseAdmin } from './inscription-upload-purge'

interface SlotRow {
  draw_number: number | null
  order: number | null
  performance_time: string | null
  participant: { name: string | null; first_name: string | null; last_name: string | null } | null
  round: {
    is_ranking: boolean | null
    categories: { name: string; contest_id: string } | null
  } | null
  repertoire: Array<{
    position: number
    work: { title: string; catalog_ref: string | null; composer: { name: string } | null } | null
  }> | null
}

export async function loadProgramSources(
  client: SupabaseAdmin,
  contestId: string,
): Promise<ProgramSource[]> {
  const { data, error } = await client
    .from('round_participants')
    .select(`
      draw_number, order, performance_time,
      participant:participants(name, first_name, last_name),
      round:rounds!inner(is_ranking, categories!inner(name, contest_id)),
      repertoire:round_participant_works(position, work:works(title, catalog_ref, composer:composers(name)))
    `)
    .eq('rounds.categories.contest_id', contestId)

  if (error) throw new Error(`round_participants.select: ${error.message}`)

  const rows = (data as unknown as SlotRow[] | null) ?? []

  return rows
    // The Ranking pseudo-round is a results table, not a session: nobody plays in it.
    .filter(row => row.round?.is_ranking !== true)
    .map(row => ({
      performance_time: row.performance_time,
      draw_number: row.draw_number,
      order: row.order,
      name: row.participant?.name
        || `${row.participant?.first_name ?? ''} ${row.participant?.last_name ?? ''}`.trim()
        || '—',
      category: row.round?.categories?.name ?? '',
      works: (row.repertoire ?? []).filter(w => w.work).map(w => ({
        position: w.position,
        composer: w.work!.composer?.name ?? '',
        title: w.work!.title,
        catalog_ref: w.work!.catalog_ref,
      })),
    }))
}
