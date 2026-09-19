// server/services/round-draw.ts
// Save a round's draw numbers and performance lengths (KAN-11).
//
// The writing is done by the `set_round_draw` RPC (migration 0066) in one
// statement, so two participants can swap numbers without tripping the
// per-round unique constraint halfway. This module maps what the RPC raises to
// the codes the endpoints answer with, and is kept out of the handlers so
// vitest can reach it. Relative imports for the same reason as
// ./stripe-webhook.ts: vitest does not resolve Nitro's `~~/` alias.
import type { DrawEntry } from '../../shared/round-draw'
import type { SupabaseAdmin } from './inscription-upload-purge'

export type RoundDrawErrorCode =
  | 'round_not_found'
  | 'round_closed'
  | 'foreign_round_participant'
  | 'duplicate_draw_number'
  | 'invalid_draw_values'

const STATUS: Record<RoundDrawErrorCode, number> = {
  round_not_found: 404,
  round_closed: 409,
  foreign_round_participant: 400,
  duplicate_draw_number: 409,
  invalid_draw_values: 400,
}

const MESSAGES: Record<RoundDrawErrorCode, string> = {
  round_not_found: 'La ronda no existe.',
  round_closed: 'La ronda está cerrada y no admite cambios.',
  foreign_round_participant: 'Algún participante no pertenece a esta ronda.',
  duplicate_draw_number: 'Hay números de sorteo repetidos en la ronda.',
  invalid_draw_values: 'Algún número de sorteo o duración no es válido.',
}

/** A refusal the RPC raised on purpose, safe to show the organisation. */
export class RoundDrawError extends Error {
  readonly statusCode: number
  readonly userMessage: string

  constructor(public readonly code: RoundDrawErrorCode) {
    super(code)
    this.name = 'RoundDrawError'
    this.statusCode = STATUS[code]
    this.userMessage = MESSAGES[code]
  }
}

/**
 * Only the RPC's own signals are recognised. Anything else is an internal
 * failure and must not reach the client: Postgres messages carry table and
 * constraint names.
 */
export function classifyDrawError(message: string | undefined): RoundDrawErrorCode | null {
  const msg = message ?? ''
  return (Object.keys(STATUS) as RoundDrawErrorCode[]).find(code => msg.includes(code)) ?? null
}

/** Apply the draw; returns how many rows changed. */
export async function applyRoundDraw(
  client: SupabaseAdmin,
  roundId: string,
  rows: readonly DrawEntry[],
): Promise<number> {
  const { data, error } = await client.rpc('set_round_draw', {
    p_round_id: roundId,
    p_rows: rows.map(r => ({
      id: r.id,
      draw_number: r.draw_number,
      performance_minutes: r.performance_minutes,
      ...(r.performance_minutes_manual === undefined ? {} : { performance_minutes_manual: r.performance_minutes_manual }),
    })),
  } as never)

  if (error) {
    const code = classifyDrawError(error.message)
    if (code) throw new RoundDrawError(code)
    throw new Error(`rpc:set_round_draw: ${error.message}`)
  }
  return Number(data ?? 0)
}
