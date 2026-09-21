// server/utils/promotion-audit.ts
// The promotion of a round, written down (KAN-28).
//
// The client decides how many pass in the moment — no fixed number, no
// percentage — so the only record of who decided what is this one. Rows go to
// `score_audit_logs` (migration 0010), the same trail the round's audit dialog
// already shows.
//
// Pure so it can be tested without a database.

export interface PromotionAuditInput {
  roundId: string
  /** Who passed, and who did not, as decided in the promotion screen. */
  promotedIds: readonly string[]
  notPromotedIds: readonly string[]
  decidedBy: string
  decidedByName: string | null
  roundName: string | null
  nextRoundName: string | null
}

export interface PromotionAuditRow {
  round_id: string
  participant_id: string
  judge_id: null
  changed_by: string
  changed_by_name: string | null
  action: 'promoted' | 'not_promoted'
  old_value: null
  new_value: null
  notes: string
  is_admin_action: true
}

/**
 * One row per participant of the round, both those who passed and those who
 * did not: "nobody promoted them" is as much a decision as promoting them, and
 * a log that only lists the winners cannot answer what happened to the rest.
 *
 * `notes` carries the shape of the decision ("Pasa a Ronda 2 · 3 de 10
 * clasificados"), which is what makes the entry readable months later.
 */
export function buildPromotionAuditRows(input: PromotionAuditInput): PromotionAuditRow[] {
  const promoted = [...new Set(input.promotedIds)]
  const promotedSet = new Set(promoted)
  // A participant cannot be on both sides; the promoted list wins.
  const notPromoted = [...new Set(input.notPromotedIds)].filter(id => !promotedSet.has(id))

  const total = promoted.length + notPromoted.length
  const tally = `${promoted.length} de ${total} clasificado${promoted.length === 1 ? '' : 's'}`
  const from = input.roundName ?? 'la ronda'
  const to = input.nextRoundName ?? 'la ronda siguiente'

  const row = (participant_id: string, action: PromotionAuditRow['action']): PromotionAuditRow => ({
    round_id: input.roundId,
    participant_id,
    judge_id: null,
    changed_by: input.decidedBy,
    changed_by_name: input.decidedByName,
    action,
    old_value: null,
    new_value: null,
    notes: action === 'promoted'
      ? `Pasa a ${to} · ${tally}`
      : `No pasa de ${from} · ${tally}`,
    is_admin_action: true,
  })

  return [
    ...promoted.map(id => row(id, 'promoted')),
    ...notPromoted.map(id => row(id, 'not_promoted')),
  ]
}
