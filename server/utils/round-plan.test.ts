// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import { MAX_PLANNED_ROUNDS, plannedRoundNames } from '../../shared/round-plan'
import { CategoryCreateSchema } from './schemas'

describe('plannedRoundNames (KAN-26)', () => {
  it('names the rounds counting back from the final', () => {
    expect(plannedRoundNames(1)).toEqual(['Final'])
    expect(plannedRoundNames(2)).toEqual(['Semifinal', 'Final'])
    expect(plannedRoundNames(3)).toEqual(['Eliminatoria', 'Semifinal', 'Final'])
  })

  // One heat is "Eliminatoria"; several are numbered, so three rounds do not
  // read "Eliminatoria 1" with no Eliminatoria 2 anywhere.
  it('numbers the heats only when there is more than one', () => {
    expect(plannedRoundNames(4)).toEqual(['Eliminatoria 1', 'Eliminatoria 2', 'Semifinal', 'Final'])
    expect(plannedRoundNames(5)).toEqual([
      'Eliminatoria 1', 'Eliminatoria 2', 'Eliminatoria 3', 'Semifinal', 'Final',
    ])
  })

  it('goes up to the cap', () => {
    const names = plannedRoundNames(MAX_PLANNED_ROUNDS)
    expect(names).toHaveLength(MAX_PLANNED_ROUNDS)
    expect(names.at(-1)).toBe('Final')
    expect(names.at(-2)).toBe('Semifinal')
    expect(new Set(names).size).toBe(MAX_PLANNED_ROUNDS)
  })

  // An impossible number must not invent rounds — the caller reads the empty
  // list as "the organisation did not say".
  it.each([0, -3, MAX_PLANNED_ROUNDS + 1, 2.5, NaN, '3', null, undefined])(
    'refuses %j',
    (value) => { expect(plannedRoundNames(value)).toEqual([]) },
  )
})

describe('CategoryCreateSchema rounds_count', () => {
  const base = { name: 'Solistas Junior' }

  it('stays optional, so a category without a plan still validates', () => {
    expect(CategoryCreateSchema.safeParse(base).success).toBe(true)
  })

  it('accepts a count inside the cap', () => {
    expect(CategoryCreateSchema.safeParse({ ...base, rounds_count: 1 }).success).toBe(true)
    expect(CategoryCreateSchema.safeParse({ ...base, rounds_count: MAX_PLANNED_ROUNDS }).success).toBe(true)
  })

  it.each([0, -1, MAX_PLANNED_ROUNDS + 1, 2.5])('rejects %j', (value) => {
    expect(CategoryCreateSchema.safeParse({ ...base, rounds_count: value }).success).toBe(false)
  })
})
