// server/services/round-schedule.ts
// Generate a round's schedule from its draw and session window (KAN-13).
//
// The plan is always rebuilt here from the database — the client's preview is
// never trusted as the thing to write. Writing goes through the
// `apply_round_schedule` RPC (migration 0067), one statement for the round.
//
// Kept out of the handler so vitest can reach it; relative imports for the
// same reason as ./stripe-webhook.ts.
import { planSchedule, type SchedulePlan } from '../../shared/schedule-generator'
import type { SupabaseAdmin } from './inscription-upload-purge'

export interface ScheduleContext {
  plan: SchedulePlan
  /** How many participants already have a performance time (would be overwritten). */
  alreadyScheduled: number
  /** round_participants ids whose slot was adjusted by hand (KAN-15); regenerating loses those edits. */
  manuallyEdited: string[]
  /** Display names by round_participants id, for the preview. */
  names: Record<string, string>
  roundStatus: string
}

interface RoundRow {
  status: string
  category_id: string
  session_date: string | null
  session_start: string | null
  session_end: string | null
}

interface ContestRow {
  performance_default_minutes: number | null
  call_offset_minutes: number | null
}

interface ParticipantRow {
  id: string
  draw_number: number | null
  performance_minutes: number | null
  performance_time: string | null
  schedule_edited_at: string | null
  participant: { name: string | null; first_name: string | null; last_name: string | null } | null
}

export type RoundScheduleErrorCode = 'round_not_found' | 'round_closed' | 'foreign_round_participant'

const STATUS: Record<RoundScheduleErrorCode, number> = {
  round_not_found: 404,
  round_closed: 409,
  foreign_round_participant: 400,
}

const MESSAGES: Record<RoundScheduleErrorCode, string> = {
  round_not_found: 'La ronda no existe.',
  round_closed: 'La ronda está cerrada y no admite cambios.',
  foreign_round_participant: 'Algún participante no pertenece a esta ronda.',
}

/** A refusal raised on purpose, safe to show the organisation. */
export class RoundScheduleError extends Error {
  readonly statusCode: number
  readonly userMessage: string

  constructor(public readonly code: RoundScheduleErrorCode) {
    super(code)
    this.name = 'RoundScheduleError'
    this.statusCode = STATUS[code]
    this.userMessage = MESSAGES[code]
  }
}

function displayName(p: ParticipantRow['participant']): string {
  if (p?.name) return p.name
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || '—'
}

/** Read everything the generator needs and plan the round. */
export async function loadRoundSchedule(client: SupabaseAdmin, roundId: string): Promise<ScheduleContext> {
  const { data: round, error: roundError } = await client
    .from('rounds')
    .select('status, category_id, session_date, session_start, session_end')
    .eq('id', roundId)
    .maybeSingle()
  if (roundError) throw new Error(`rounds.select: ${roundError.message}`)
  if (!round) throw new RoundScheduleError('round_not_found')
  const r = round as unknown as RoundRow

  const { data: category, error: categoryError } = await client
    .from('categories')
    .select('contests(performance_default_minutes, call_offset_minutes)')
    .eq('id', r.category_id)
    .maybeSingle()
  if (categoryError) throw new Error(`categories.select: ${categoryError.message}`)
  const contest = (category as unknown as { contests: ContestRow | null } | null)?.contests ?? null

  const { data: rows, error: rowsError } = await client
    .from('round_participants')
    .select('id, draw_number, performance_minutes, performance_time, schedule_edited_at, participant:participants(name, first_name, last_name)')
    .eq('round_id', roundId)
  if (rowsError) throw new Error(`round_participants.select: ${rowsError.message}`)
  const participants = (rows as unknown as ParticipantRow[] | null) ?? []

  const plan = planSchedule({
    entries: participants.map(p => ({
      id: p.id,
      draw_number: p.draw_number,
      performance_minutes: p.performance_minutes,
    })),
    defaultMinutes: contest?.performance_default_minutes ?? null,
    sessionDate: r.session_date,
    sessionStart: r.session_start,
    sessionEnd: r.session_end,
    callOffsetMinutes: contest?.call_offset_minutes ?? null,
  })

  return {
    plan,
    alreadyScheduled: participants.filter(p => !!p.performance_time).length,
    manuallyEdited: participants.filter(p => !!p.schedule_edited_at).map(p => p.id),
    names: Object.fromEntries(participants.map(p => [p.id, displayName(p.participant)])),
    roundStatus: r.status,
  }
}

/** Write a plan that `planSchedule` accepted. Returns how many rows changed. */
export async function applyRoundSchedule(
  client: SupabaseAdmin,
  roundId: string,
  plan: SchedulePlan,
): Promise<number> {
  const { data, error } = await client.rpc('apply_round_schedule', {
    p_round_id: roundId,
    p_rows: plan.slots.map(s => ({
      id: s.id,
      performance_time: s.performance_time,
      performance_end_time: s.performance_end_time,
    })),
  } as never)

  if (error) {
    const code = (Object.keys(STATUS) as RoundScheduleErrorCode[]).find(c => (error.message ?? '').includes(c))
    if (code) throw new RoundScheduleError(code)
    throw new Error(`rpc:apply_round_schedule: ${error.message}`)
  }
  return Number(data ?? 0)
}
