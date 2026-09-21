import { describe, it, expect } from 'vitest'
import { buildPromotionAuditRows } from './promotion-audit'

const base = {
  roundId: 'r-1',
  decidedBy: 'u-1',
  decidedByName: 'org@example.com',
  roundName: 'Semifinal',
  nextRoundName: 'Final',
}

describe('buildPromotionAuditRows (KAN-28)', () => {
  // Both sides are recorded: "nobody promoted them" is a decision too, and a
  // log with only the winners cannot say what happened to the rest.
  it('writes one row per participant, on both sides', () => {
    const rows = buildPromotionAuditRows({ ...base, promotedIds: ['a', 'b'], notPromotedIds: ['c'] })
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => r.action === 'promoted').map(r => r.participant_id)).toEqual(['a', 'b'])
    expect(rows.filter(r => r.action === 'not_promoted').map(r => r.participant_id)).toEqual(['c'])
    expect(rows.every(r => r.is_admin_action && r.changed_by === 'u-1' && r.round_id === 'r-1')).toBe(true)
  })

  it('says how the decision went, which is what makes it readable later', () => {
    const rows = buildPromotionAuditRows({ ...base, promotedIds: ['a'], notPromotedIds: ['b', 'c'] })
    expect(rows[0]!.notes).toBe('Pasa a Final · 1 de 3 clasificado')
    // Same tally on both sides, and it counts the promoted: one classified.
    expect(rows[1]!.notes).toBe('No pasa de Semifinal · 1 de 3 clasificado')
  })

  it('never counts a participant twice', () => {
    const rows = buildPromotionAuditRows({ ...base, promotedIds: ['a', 'a'], notPromotedIds: ['a', 'b'] })
    expect(rows.map(r => `${r.participant_id}:${r.action}`)).toEqual(['a:promoted', 'b:not_promoted'])
  })

  it('handles a round where nobody passes', () => {
    const rows = buildPromotionAuditRows({ ...base, promotedIds: [], notPromotedIds: ['a', 'b'] })
    expect(rows).toHaveLength(2)
    expect(rows[0]!.notes).toBe('No pasa de Semifinal · 0 de 2 clasificados')
  })

  it('falls back when the rounds have no name', () => {
    const rows = buildPromotionAuditRows({
      ...base, roundName: null, nextRoundName: null, promotedIds: ['a'], notPromotedIds: [],
    })
    expect(rows[0]!.notes).toContain('la ronda siguiente')
  })

  it('leaves the numeric columns empty: this entry is not a score', () => {
    const [row] = buildPromotionAuditRows({ ...base, promotedIds: ['a'], notPromotedIds: [] })
    expect(row!.old_value).toBeNull()
    expect(row!.new_value).toBeNull()
    expect(row!.judge_id).toBeNull()
  })
})
