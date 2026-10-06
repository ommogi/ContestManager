// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import { MAX_PLANNED_ROUNDS, canStartRound, plannedRoundNames } from '../../shared/round-plan'
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

describe('canStartRound', () => {
  const r = (id: string, order: number, status: string, is_ranking = false) => ({ id, order, status, is_ranking })

  it('starts the first round', () => {
    expect(canStartRound([r('a', 1, 'pending'), r('b', 2, 'pending')], 'a')).toEqual({ ok: true })
  })

  it('starts the next round once the previous ones are closed', () => {
    expect(canStartRound([r('a', 1, 'closed'), r('b', 2, 'closed'), r('c', 3, 'pending')], 'c')).toEqual({ ok: true })
  })

  it('refuses a round while an earlier one is active or still pending', () => {
    const rounds = [r('a', 1, 'closed'), r('b', 2, 'active'), r('c', 3, 'pending'), r('d', 4, 'pending')]
    expect(canStartRound(rounds, 'c')).toEqual({ ok: false, reason: 'previous_open' })
    expect(canStartRound(rounds, 'd')).toEqual({ ok: false, reason: 'previous_open' })
  })

  it('refuses a round while another of the same order is running', () => {
    expect(canStartRound([r('a', 2, 'active'), r('b', 2, 'pending')], 'b')).toEqual({ ok: false, reason: 'previous_open' })
  })

  it('ignores the ranking pseudo-round', () => {
    expect(canStartRound([r('a', 1, 'closed'), r('rank', 1, 'closed', true), r('b', 2, 'pending')], 'b')).toEqual({ ok: true })
    expect(canStartRound([r('rank', 1, 'pending', true), r('b', 2, 'pending')], 'b')).toEqual({ ok: true })
  })

  it('only starts pending rounds', () => {
    expect(canStartRound([r('a', 1, 'active')], 'a')).toEqual({ ok: false, reason: 'not_pending' })
    expect(canStartRound([], 'x')).toEqual({ ok: false, reason: 'not_found' })
  })
})
