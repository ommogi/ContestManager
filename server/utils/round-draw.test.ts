// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though most of the module under test is in shared/.
import { describe, it, expect } from 'vitest'
import {
  carryDrawNumbers,
  drawReadiness,
  matchDrawImport,
  normalizeDni,
  parseDrawCsv,
  randomDraw,
  type DrawImportRow,
} from '../../shared/round-draw'
import { RoundDrawImportSchema, RoundDrawSchema } from './schemas'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

describe('drawReadiness', () => {
  it('is ready when everyone has a distinct number', () => {
    expect(drawReadiness([
      { id: 'a', draw_number: 2, performance_minutes: null },
      { id: 'b', draw_number: 1, performance_minutes: 12 },
    ])).toEqual({ ready: true, missing: [], duplicates: [] })
  })

  // KAN-11: "sin orden de sorteo, el generador no se puede lanzar".
  it('names who is missing a number', () => {
    const r = drawReadiness([
      { id: 'a', draw_number: 1, performance_minutes: null },
      { id: 'b', draw_number: null, performance_minutes: null },
    ])
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual(['b'])
  })

  it('reports repeated numbers', () => {
    const r = drawReadiness([
      { id: 'a', draw_number: 3, performance_minutes: null },
      { id: 'b', draw_number: 3, performance_minutes: null },
      { id: 'c', draw_number: 1, performance_minutes: null },
    ])
    expect(r).toEqual({ ready: false, missing: [], duplicates: [3] })
  })

  it('is not ready for an empty round: there is nothing to schedule', () => {
    expect(drawReadiness([]).ready).toBe(false)
  })
})

describe('carryDrawNumbers (KAN-27)', () => {
  const p = (id: string, draw: number | null) => ({ participant_id: id, draw_number: draw })

  // The example in the ticket: promote 3, 7 and 12 and they become 1, 2 and 3.
  it('compacts to 1..N keeping the relative order', () => {
    const carried = carryDrawNumbers([p('c', 12), p('a', 3), p('b', 7)])
    expect([...carried.entries()]).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })

  // The unique index on (round_id, draw_number) does not forgive a collision.
  it('continues after the numbers already in the round', () => {
    const carried = carryDrawNumbers([p('a', 4), p('b', 9)], { startAt: 6 })
    expect([...carried.values()]).toEqual([6, 7])
  })

  it('leaves the undrawn last and still undrawn', () => {
    const carried = carryDrawNumbers([p('sin', null), p('b', 9), p('otro', null), p('a', 2)])
    expect([...carried.entries()]).toEqual([['a', 1], ['b', 2], ['sin', null], ['otro', null]])
  })

  it('handles an empty promotion', () => {
    expect(carryDrawNumbers([]).size).toBe(0)
  })
})

describe('randomDraw', () => {
  it('hands out each number from 1 to N exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const draw = randomDraw(ids)
    expect([...draw.keys()]).toEqual(ids)
    expect([...draw.values()].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('uses the random source it is given', () => {
    // Always picking index 0 rotates the numbers: a deterministic permutation.
    const draw = randomDraw(['a', 'b', 'c'], () => 0)
    expect([...draw.values()]).toEqual([2, 3, 1])
  })
})

describe('matchDrawImport', () => {
  const candidates = [
    { id: 'rp-1', dni: '12345678Z', email: 'ana@example.com' },
    { id: 'rp-2', dni: null, email: 'Luis@Example.com' },
  ]
  const row = (over: Partial<DrawImportRow>): DrawImportRow =>
    ({ line: 1, dni: null, email: null, draw_number: 1, performance_minutes: null, ...over })

  it('matches by DNI regardless of dashes, spaces or case', () => {
    const r = matchDrawImport([row({ dni: '12345678-z', draw_number: 4, performance_minutes: 9 })], candidates)
    expect(r.matched).toEqual([{ id: 'rp-1', draw_number: 4, performance_minutes: 9 }])
  })

  it('falls back to e-mail, case-insensitively', () => {
    const r = matchDrawImport([row({ email: ' luis@example.COM ' })], candidates)
    expect(r.matched.map(m => m.id)).toEqual(['rp-2'])
  })

  it('reports lines that match nobody in the round', () => {
    const r = matchDrawImport([row({ line: 7, dni: '99999999R' })], candidates)
    expect(r.matched).toEqual([])
    expect(r.unmatched).toEqual([7])
  })

  // A second line for the same person is a mistake in the file, not an update.
  it('keeps the first line for a participant and reports the rest', () => {
    const r = matchDrawImport([
      row({ line: 1, dni: '12345678Z', draw_number: 1 }),
      row({ line: 2, email: 'ana@example.com', draw_number: 5 }),
    ], candidates)
    expect(r.matched).toEqual([{ id: 'rp-1', draw_number: 1, performance_minutes: null }])
    expect(r.repeated).toEqual([2])
  })
})

describe('parseDrawCsv', () => {
  it('reads a comma-separated file with Spanish headers', () => {
    const r = parseDrawCsv('dni,sorteo,minutos\n12345678Z,2,15\n,3,\n')
    expect(r.errors).toEqual(['Fila 2: sin DNI ni email.'])
    expect(r.rows).toEqual([
      { line: 1, dni: '12345678Z', email: null, draw_number: 2, performance_minutes: 15 },
    ])
  })

  it('reads the semicolon files Spanish Excel exports, with a BOM', () => {
    const r = parseDrawCsv('﻿Email;Sorteo\r\nana@example.com;1\r\n')
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toMatchObject({ email: 'ana@example.com', draw_number: 1, performance_minutes: null })
  })

  it('leaves the draw empty when the cell is empty', () => {
    expect(parseDrawCsv('dni,sorteo\n12345678Z,\n').rows[0]!.draw_number).toBeNull()
  })

  it.each([
    ['dni,sorteo\n12345678Z,0\n', 'número de sorteo'],
    ['dni,sorteo\n12345678Z,dos\n', 'número de sorteo'],
    ['dni,sorteo,minutos\n12345678Z,1,0\n', 'minutos'],
    ['dni,sorteo,minutos\n12345678Z,1,241\n', 'minutos'],
  ])('rejects a bad value in %j', (csv, fragment) => {
    const r = parseDrawCsv(csv)
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toContain(fragment)
  })

  it('refuses a file with no way to identify participants', () => {
    expect(parseDrawCsv('nombre,sorteo\nAna,1\n').errors[0]).toContain('"dni" o "email"')
  })

  it('refuses a file with no draw column', () => {
    expect(parseDrawCsv('dni,minutos\n12345678Z,10\n').errors[0]).toContain('"sorteo"')
  })
})

describe('normalizeDni', () => {
  it('treats blank as absent', () => {
    expect(normalizeDni('  ')).toBeNull()
    expect(normalizeDni(null)).toBeNull()
  })
})

describe('RoundDrawSchema', () => {
  it('accepts a draw with gaps and blanks', () => {
    expect(RoundDrawSchema.safeParse({
      rows: [
        { id: id(1), draw_number: 1, performance_minutes: 10 },
        { id: id(2), draw_number: null, performance_minutes: null },
      ],
    }).success).toBe(true)
  })

  it('accepts the KAN-18 manual flag', () => {
    expect(RoundDrawSchema.safeParse({
      rows: [{ id: id(1), draw_number: 1, performance_minutes: 25, performance_minutes_manual: true }],
    }).success).toBe(true)
  })

  it('rejects the same number twice in one request', () => {
    const r = RoundDrawSchema.safeParse({
      rows: [
        { id: id(1), draw_number: 2, performance_minutes: null },
        { id: id(2), draw_number: 2, performance_minutes: null },
      ],
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('duplicate_draw_number')
  })

  it('rejects the same participant twice', () => {
    const r = RoundDrawSchema.safeParse({
      rows: [
        { id: id(1), draw_number: 1, performance_minutes: null },
        { id: id(1), draw_number: 2, performance_minutes: null },
      ],
    })
    expect(r.error?.issues[0]?.message).toBe('duplicate_row_id')
  })

  it.each([
    { draw_number: 0, performance_minutes: null },
    { draw_number: 1.5, performance_minutes: null },
    { draw_number: 1, performance_minutes: 0 },
    { draw_number: 1, performance_minutes: 241 },
  ])('rejects out-of-range values %j', (values) => {
    expect(RoundDrawSchema.safeParse({ rows: [{ id: id(1), ...values }] }).success).toBe(false)
  })
})

describe('RoundDrawImportSchema', () => {
  it('defaults to a dry run', () => {
    const r = RoundDrawImportSchema.parse({
      rows: [{ line: 1, dni: '12345678Z', email: null, draw_number: 1, performance_minutes: null }],
    })
    expect(r.apply).toBe(false)
  })
})
