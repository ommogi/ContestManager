import { describe, it, expect } from 'vitest'
import { buildPublicProgram, programDays, type ProgramSource } from './public-program'

function source(over: Partial<ProgramSource> = {}): ProgramSource {
  return {
    performance_time: '2026-10-12T18:30',
    draw_number: 1,
    order: 1,
    name: 'Ana Pérez',
    category: 'Junior',
    works: [],
    ...over,
  }
}

const bach = { position: 1, composer: 'Bach', title: 'Partita nº 2', catalog_ref: 'BWV 1004' }
const chopin = { position: 2, composer: 'Chopin', title: 'Balada nº 1', catalog_ref: null }

describe('buildPublicProgram (KAN-21)', () => {
  it('groups by the day of the performance, in date order', () => {
    const { days } = buildPublicProgram([
      source({ performance_time: '2026-10-13T10:00', name: 'Luis' }),
      source({ performance_time: '2026-10-12T18:30', name: 'Ana' }),
    ], { includeWorks: false })

    expect(days.map(d => d.date)).toEqual(['2026-10-12', '2026-10-13'])
    expect(days[0]!.rows.map(r => r.name)).toEqual(['Ana'])
    expect(days[0]!.rows[0]!.time).toBe('18:30')
  })

  // Turn order: the clock first, then the draw, then the name. A category is
  // not a section of the day — the audience sees one continuous programme.
  it('orders a day by time, then draw, then name', () => {
    const { days } = buildPublicProgram([
      source({ performance_time: '2026-10-12T18:45', draw_number: 9, name: 'Carmen', category: 'Senior' }),
      source({ performance_time: '2026-10-12T18:30', draw_number: 4, name: 'Ana' }),
      source({ performance_time: '2026-10-12T18:30', draw_number: 2, name: 'Luis' }),
    ], { includeWorks: false })

    expect(days[0]!.rows.map(r => r.name)).toEqual(['Luis', 'Ana', 'Carmen'])
    expect(days[0]!.rows.map(r => r.draw)).toEqual(['2', '4', '9'])
  })

  it('ties on time and draw break by name', () => {
    const { days } = buildPublicProgram([
      source({ draw_number: null, order: null, name: 'Zoe' }),
      source({ draw_number: null, order: null, name: 'Ana' }),
    ], { includeWorks: false })
    expect(days[0]!.rows.map(r => r.name)).toEqual(['Ana', 'Zoe'])
  })

  // Reads like a printed concert programme: the turn is announced once and the
  // pieces hang under it.
  it('prints one row per work, with the turn only on the first', () => {
    const { days } = buildPublicProgram(
      [source({ works: [chopin, bach] })],
      { includeWorks: true },
    )

    expect(days[0]!.rows).toEqual([
      { time: '18:30', draw: '1', name: 'Ana Pérez', category: 'Junior', work: 'Bach — Partita nº 2 (BWV 1004)' },
      { time: '', draw: '', name: '', category: '', work: 'Chopin — Balada nº 1' },
    ])
    // Two rows, one performance.
    expect(days[0]!.performances).toBe(1)
  })

  it('still prints the turn when there is no repertoire', () => {
    const { days } = buildPublicProgram([source({ works: [] })], { includeWorks: true })
    expect(days[0]!.rows).toHaveLength(1)
    expect(days[0]!.rows[0]!.work).toBe('')
  })

  // The way out if KAN-32 ends in "the jury picks the piece".
  it('leaves the works out when asked', () => {
    const { days } = buildPublicProgram(
      [source({ works: [bach, chopin] })],
      { includeWorks: false },
    )
    expect(days[0]!.rows).toHaveLength(1)
    expect(days[0]!.rows[0]!.work).toBe('')
  })

  it('takes one jornada when given a date', () => {
    const sources = [
      source({ performance_time: '2026-10-12T18:30' }),
      source({ performance_time: '2026-10-13T10:00' }),
    ]
    expect(buildPublicProgram(sources, { includeWorks: false, date: '2026-10-13' }).days)
      .toHaveLength(1)
    expect(buildPublicProgram(sources, { includeWorks: false, date: '2026-10-14' }).days)
      .toEqual([])
  })

  // Without a turn there is nowhere to print them, but silence would look like
  // the programme had lost people.
  it('counts whoever has no time yet instead of dropping them quietly', () => {
    const { days, unscheduled } = buildPublicProgram([
      source({ performance_time: null, name: 'Sin hora' }),
      source({ performance_time: '', name: 'Vacío' }),
      source({ performance_time: '12/10/2026 18:30', name: 'Mal formato' }),
      source({ name: 'Ana' }),
    ], { includeWorks: false })

    expect(unscheduled).toBe(3)
    expect(days[0]!.rows.map(r => r.name)).toEqual(['Ana'])
  })

  it('has nothing to show for an empty contest', () => {
    expect(buildPublicProgram([], { includeWorks: true })).toEqual({ days: [], unscheduled: 0 })
  })
})

describe('programDays', () => {
  it('lists the days that have performances, with their count', () => {
    expect(programDays([
      source({ performance_time: '2026-10-12T18:30' }),
      source({ performance_time: '2026-10-12T19:00' }),
      source({ performance_time: '2026-10-13T10:00' }),
      source({ performance_time: null }),
    ])).toEqual([
      { date: '2026-10-12', performances: 2 },
      { date: '2026-10-13', performances: 1 },
    ])
  })
})
