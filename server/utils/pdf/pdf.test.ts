import { describe, it, expect } from 'vitest'
import { createDocument, pdfSafe } from './document'
import { pdfFilename } from './response'
import { buildRehearsalRows, shortDateTime, type RehearsalSource } from './rehearsal-rows'
import { PDF_STRINGS, fill, formatPdfDate, resolveLocale } from '../../../shared/pdf-i18n'

const src = (over: Partial<RehearsalSource>): RehearsalSource => ({
  name: 'Ana', category: 'Piano A', rehearsal_time: null, rehearsal_room: null, rehearsal_accompanist: null, ...over,
})

describe('buildRehearsalRows (KAN-20)', () => {
  it('orders by rehearsal time and computes the call time from the contest offset', () => {
    const rows = buildRehearsalRows([
      src({ name: 'Luis', rehearsal_time: '2026-10-12T16:00', rehearsal_room: 'Sala 2' }),
      src({ name: 'Ana', rehearsal_time: '2026-10-12T15:30', rehearsal_accompanist: 'Marta' }),
    ], 120)

    expect(rows).toEqual([
      { call: '12/10 13:30', rehearsal: '12/10 15:30', name: 'Ana', category: 'Piano A', room: '', accompanist: 'Marta' },
      { call: '12/10 14:00', rehearsal: '12/10 16:00', name: 'Luis', category: 'Piano A', room: 'Sala 2', accompanist: '' },
    ])
  })

  it('puts participants without a rehearsal last, by name', () => {
    const rows = buildRehearsalRows([
      src({ name: 'Zoe' }),
      src({ name: 'Bruno' }),
      src({ name: 'Carla', rehearsal_time: '2026-10-12T10:00' }),
    ], 60)
    expect(rows.map(r => r.name)).toEqual(['Carla', 'Bruno', 'Zoe'])
    expect(rows[1]!.call).toBe('')
  })

  it('leaves the call time empty when the contest has no offset', () => {
    expect(buildRehearsalRows([src({ rehearsal_time: '2026-10-12T10:00' })], null)[0]!.call).toBe('')
  })

  it('calls an early rehearsal on the previous day', () => {
    expect(buildRehearsalRows([src({ rehearsal_time: '2026-10-12T01:00' })], 120)[0]!.call).toBe('11/10 23:00')
  })

  it('formats unreadable times as blank', () => {
    expect(shortDateTime('mañana')).toBe('')
  })
})

describe('pdf-i18n', () => {
  it('has every Spanish string in Catalan too', () => {
    expect(Object.keys(PDF_STRINGS.ca).sort()).toEqual(Object.keys(PDF_STRINGS.es).sort())
    for (const value of Object.values(PDF_STRINGS.ca)) expect(value).toBeTruthy()
  })

  it('falls back to Spanish for anything unknown', () => {
    expect(resolveLocale('ca')).toBe('ca')
    expect(resolveLocale('en')).toBe('es')
    expect(resolveLocale(null)).toBe('es')
  })

  it('fills placeholders', () => {
    expect(fill(PDF_STRINGS.ca.callOffsetNote, { minutes: 120 })).toBe('Convocatòria 120 min abans de l’assaig')
  })

  it('writes dates in the document language', () => {
    const d = new Date('2026-10-12T10:00:00Z')
    expect(formatPdfDate(d, 'es')).toBe('12 de octubre de 2026')
    expect(formatPdfDate(d, 'ca')).toBe('12 d’octubre del 2026')
  })
})

describe('createDocument (KAN-19)', () => {
  const columns = [{ label: 'Nombre', width: 0.7 }, { label: 'Hora', width: 0.3 }]

  it('produces a PDF', () => {
    const doc = createDocument({ title: 'Test', contestName: 'Concurs Maria Canals', locale: 'ca' })
    doc.table(columns, [['Àngel Puig i Gràcia', '10:00']])
    const buffer = doc.toBuffer()
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('breaks a long table across pages', () => {
    const doc = createDocument({ title: 'Test', contestName: 'X', locale: 'es' })
    doc.table(columns, Array.from({ length: 60 }, (_, i) => [`Participante ${i + 1}`, '10:00']))
    expect(doc.pageCount).toBeGreaterThan(1)
  })

  it('stays on one page for a short table', () => {
    const doc = createDocument({ title: 'Test', contestName: 'X', locale: 'es' })
    doc.table(columns, [['Ana', '10:00']])
    expect(doc.pageCount).toBe(1)
  })

  it('keeps Catalan and Spanish characters and replaces what Helvetica cannot draw', () => {
    expect(pdfSafe('Col·legi d’Àngel Núñez')).toBe('Col·legi d’Àngel Núñez')
    expect(pdfSafe('Ensayo – sala 🎹')).toBe('Ensayo - sala ??')
  })
})

describe('pdfFilename', () => {
  it('folds accents and strips anything that could break the header', () => {
    expect(pdfFilename('Quadrant d’assajos', 'Concurs "Maria Canals"', 'Ronda 1')).toBe('quadrant-d-assajos-concurs-maria-canals-ronda-1.pdf')
  })

  it('never returns an empty name', () => {
    expect(pdfFilename('', null)).toBe('documento.pdf')
  })
})
