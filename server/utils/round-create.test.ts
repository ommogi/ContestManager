import { describe, expect, it } from 'vitest'
import { buildRoundInsert } from './round-create'

const NOW = new Date('2026-10-06T10:00:00.000Z')

describe('buildRoundInsert', () => {
  it('keeps only the fields a client may set on a normal round', () => {
    const row = buildRoundInsert('cat', { name: 'Ronda 2', order: 2, status: 'active', is_published: true }, NOW)
    expect(row).toEqual({ category_id: 'cat', name: 'Ronda 2', order: 2 })
  })

  it('creates the ranking closed and unpublished', () => {
    const row = buildRoundInsert('cat', { name: 'Ranking', order: 3, is_ranking: true, is_published: true }, NOW)
    expect(row).toEqual({
      category_id: 'cat',
      name: 'Ranking',
      order: 3,
      is_ranking: true,
      status: 'closed',
      closed_at: NOW.toISOString(),
      is_published: false,
    })
  })

  it('does not mark a round as ranking unless asked', () => {
    expect(buildRoundInsert('cat', { name: 'Final', is_ranking: false }, NOW)).not.toHaveProperty('is_ranking')
  })
})
