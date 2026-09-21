// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import { resolveVotingSystem, scoringTypeFor, votingSystemLabel, VOTING_SYSTEM_IDS } from '../../shared/voting'
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
