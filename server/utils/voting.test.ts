// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import {
  BINARY_FAIL,
  BINARY_PASS,
  binaryVoteLabel,
  checkScoreSubmission,
  isBinaryScoring,
  isBinaryVoteValue,
  resolveVotingSystem,
  scoringTypeFor,
  votingSystemLabel,
  VOTING_SYSTEM_IDS,
} from '../../shared/voting'
import { ContestCreateSchema, ContestPatchSchema } from './schemas'

describe('voting system (KAN-23)', () => {
  it('knows the two systems', () => {
    expect([...VOTING_SYSTEM_IDS]).toEqual(['numeric', 'binary'])
  })

  // Existing contests have no value; the ticket wants them numeric.
  it.each([undefined, null, '', 'weighted', 42])('reads %j as numeric', (value) => {
    expect(resolveVotingSystem(value)).toBe('numeric')
  })

  it('keeps a known system', () => {
    expect(resolveVotingSystem('binary')).toBe('binary')
  })

  // A binary round scores with 'vote', the value already in the enum.
  it('maps to the round scoring type', () => {
    expect(scoringTypeFor('binary')).toBe('vote')
    expect(scoringTypeFor('numeric')).toBe('numeric')
    expect(scoringTypeFor(undefined)).toBe('numeric')
  })

  it('labels for the screen', () => {
    expect(votingSystemLabel('binary')).toBe('Binario')
    expect(votingSystemLabel('nonsense')).toBe('Numérico')
  })
})

describe('contest schemas', () => {
  it('accepts the field on create and on patch', () => {
    expect(ContestCreateSchema.safeParse({ name: 'X', voting_system: 'binary' }).success).toBe(true)
    expect(ContestPatchSchema.safeParse({ voting_system: 'numeric' }).success).toBe(true)
  })

  it('stays optional, so nothing that worked before breaks', () => {
    expect(ContestCreateSchema.safeParse({ name: 'X' }).success).toBe(true)
  })

  it('rejects an unknown system', () => {
    expect(ContestCreateSchema.safeParse({ name: 'X', voting_system: 'ranked' }).success).toBe(false)
  })
})

// ─── KAN-24 ──────────────────────────────────────────────────────────────────

describe('binary votes', () => {
  it('reads the round, not the contest: only a vote round is binary', () => {
    expect(isBinaryScoring('vote')).toBe(true)
    expect(isBinaryScoring('numeric')).toBe(false)
    expect(isBinaryScoring('rank')).toBe(false)
    expect(isBinaryScoring(undefined)).toBe(false)
  })

  it('stores the verdict as 1 and 0', () => {
    expect(BINARY_PASS).toBe(1)
    expect(BINARY_FAIL).toBe(0)
  })

  it('labels a stored value', () => {
    expect(binaryVoteLabel(1)).toBe('Pasa')
    expect(binaryVoteLabel('1')).toBe('Pasa')
    expect(binaryVoteLabel(0)).toBe('No pasa')
    expect(binaryVoteLabel(null)).toBe('No pasa')
  })

  it('accepts nothing between the two options', () => {
    expect(isBinaryVoteValue(1)).toBe(true)
    expect(isBinaryVoteValue(0)).toBe(true)
    expect(isBinaryVoteValue(0.5)).toBe(false)
    expect(isBinaryVoteValue(2)).toBe(false)
    expect(isBinaryVoteValue('1')).toBe(false)
  })
})

describe('checkScoreSubmission', () => {
  const judge = (over: Partial<Parameters<typeof checkScoreSubmission>[0]> = {}) => checkScoreSubmission({
    scoringType: 'vote',
    roundStatus: 'active',
    value: BINARY_PASS,
    isAdminAction: false,
    ...over,
  })

  it('lets a judge vote in an open round', () => {
    expect(judge()).toEqual({ ok: true })
    expect(judge({ value: BINARY_FAIL })).toEqual({ ok: true })
  })

  // Same rule the numeric screen already enforced client-side, now on the
  // server and for both kinds of round.
  it.each(['numeric', 'vote'])('refuses a judge on a closed %s round', (scoringType) => {
    expect(judge({ scoringType, roundStatus: 'closed', value: 1 }))
      .toEqual({ ok: false, status: 409, code: 'round_closed' })
  })

  it('refuses a judge on a round that has not started', () => {
    expect(judge({ roundStatus: 'pending' }))
      .toEqual({ ok: false, status: 409, code: 'round_not_active' })
  })

  // Correcting a score after the round closed is what the admin override is for.
  it('lets an organiser write whatever the round state', () => {
    expect(judge({ roundStatus: 'closed', isAdminAction: true })).toEqual({ ok: true })
    expect(judge({ roundStatus: 'pending', isAdminAction: true })).toEqual({ ok: true })
  })

  it.each([0.5, 2, -1, Number.NaN])('refuses %j as a vote, admin or not', (value) => {
    const failure = { ok: false, status: 400, code: 'invalid_binary_vote' }
    expect(judge({ value })).toEqual(failure)
    expect(judge({ value, isAdminAction: true, roundStatus: 'closed' })).toEqual(failure)
  })

  // A numeric round keeps taking the marks it always took: the only thing that
  // has no meaning there is a value that is not a number.
  it('leaves numeric scoring alone', () => {
    expect(judge({ scoringType: 'numeric', value: 8.5 })).toEqual({ ok: true })
    expect(judge({ scoringType: 'numeric', value: 0 })).toEqual({ ok: true })
    expect(judge({ scoringType: 'numeric', value: Number.POSITIVE_INFINITY }))
      .toEqual({ ok: false, status: 400, code: 'invalid_score' })
  })
})
