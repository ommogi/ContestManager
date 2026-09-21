import { describe, it, expect } from 'vitest'
import { buildJuryProgram, type JurySource } from './jury-program'
import { createDocument } from './document'

const src = (over: Partial<JurySource>): JurySource => ({
  name: 'Ana', draw_number: null, order: null, performance_time: null, works: [], ...over,
})
const work = (position: number, title: string, catalog: number | null, override: number | null = null) => ({
  position, composer: 'Albéniz', title, catalog_ref: null, duration_seconds: override, catalog_seconds: catalog,
})

describe('buildJuryProgram (KAN-22)', () => {
  it('orders by performance time', () => {
    const blocks = buildJuryProgram([
      src({ name: 'Luis', performance_time: '2026-10-12T14:20', draw_number: 1 }),
      src({ name: 'Ana', performance_time: '2026-10-12T14:00', draw_number: 2 }),
    ])
    expect(blocks.map(b => [b.name, b.time])).toEqual([['Ana', '12/10 14:00'], ['Luis', '12/10 14:20']])
  })

  // A programme printed before the schedule exists still follows the draw.
  it('falls back to the draw, then insertion order, for unscheduled participants', () => {
    const blocks = buildJuryProgram([
      src({ name: 'Sin sorteo', order: 1 }),
      src({ name: 'Tercero', draw_number: 3 }),
      src({ name: 'Con hora', performance_time: '2026-10-12T18:00', draw_number: 9 }),
      src({ name: 'Primero', draw_number: 1 }),
    ])
    expect(blocks.map(b => b.name)).toEqual(['Con hora', 'Primero', 'Tercero', 'Sin sorteo'])
  })

  it('lists works in playing order with their effective length and a total', () => {
    const [block] = buildJuryProgram([src({
      works: [work(2, 'Sevilla', 300, 330), { ...work(1, 'Asturias', 420), catalog_ref: 'Op. 47' }],
    })])
    expect(block!.works).toEqual([
      { composer: 'Albéniz', title: 'Asturias (Op. 47)', duration: '7:00' },
      { composer: 'Albéniz', title: 'Sevilla', duration: '5:30' },
    ])
    expect(block!.total).toBe('12:30')
  })

  it('leaves the total blank without any known length', () => {
    const [block] = buildJuryProgram([src({ works: [work(1, 'Improvisación', null)] })])
    expect(block!.works[0]!.duration).toBe('')
    expect(block!.total).toBe('')
  })
})

describe('PDF blocks', () => {
  it('puts one participant per page with room for notes', () => {
    const pdf = createDocument({ title: 'Programa del jurado', contestName: 'Concurs', locale: 'ca' })
    for (let i = 0; i < 3; i++) {
      if (i > 0) pdf.newPage()
      pdf.heading(`Participant ${i + 1}`, 'Núm. 1  ·  Piano')
      pdf.label('Repertori')
      pdf.list([{ strong: 'Mompou', text: 'Cançons i danses nº 6', right: '4:10' }])
      pdf.totalLine('Total', '4:10')
      pdf.notesArea('Anotacions')
    }
    expect(pdf.pageCount).toBe(3)
    expect(pdf.toBuffer().subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('moves the notes to a new page instead of squeezing them', () => {
    const pdf = createDocument({ title: 'X', contestName: 'X', locale: 'es' })
    pdf.list(Array.from({ length: 40 }, (_, i) => ({ strong: 'Bach', text: `Preludio ${i + 1}`, right: '2:00' })))
    const before = pdf.pageCount
    pdf.notesArea('Anotaciones')
    expect(pdf.pageCount).toBeGreaterThanOrEqual(before)
  })

  it('writes a placeholder for an empty repertoire', () => {
    const pdf = createDocument({ title: 'X', contestName: 'X', locale: 'es' })
    pdf.list([], 'Sin repertorio registrado.')
    expect(pdf.pageCount).toBe(1)
  })
})
