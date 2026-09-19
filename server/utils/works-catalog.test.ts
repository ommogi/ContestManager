// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import {
  catalogKey,
  formatDuration,
  parseDuration,
  secondsToSlotMinutes,
  similarComposers,
} from '../../shared/works-catalog'
import { ComposerBodySchema, WorkBodySchema } from './schemas'

// Same inputs and outputs as the check run against public.catalog_key() in
// production while writing 0070 — the two implementations must agree.
describe('catalogKey (mirror of public.catalog_key)', () => {
  it.each([
    ['Rachmaninov', 'rachmaninov'],
    ['  RACHMÁNINOV ', 'rachmaninov'],
    ['S. Rachmaninoff', 's rachmaninoff'],
    ['Dvořák', 'dvorak'],
    ['Janáček', 'janacek'],
    ['Górecki', 'gorecki'],
    ['Isaac Albéniz', 'isaac albeniz'],
    ['Col·legi', 'col legi'],
    ['Chopin, Fryderyk', 'chopin fryderyk'],
    ['Preludio Op. 23, nº 5', 'preludio op 23 n 5'],
  ])('%j → %j', (input, key) => {
    expect(catalogKey(input)).toBe(key)
  })
})

describe('durations', () => {
  it.each([
    ['7:30', 450],
    ['7', 420],
    ['0:45', 45],
    ['1:02:00', 3720],
    [' 12:05 ', 725],
  ])('parses %j as %i s', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds)
  })

  it.each(['', '0', '0:00', '7:60', 'siete', '121', '2:00:01'])('rejects %j', (text) => {
    expect(parseDuration(text)).toBeNull()
  })

  it('formats as m:ss', () => {
    expect(formatDuration(450)).toBe('7:30')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3720)).toBe('62:00')
    expect(formatDuration(null)).toBe('')
  })

  it('rounds up to whole minutes for a slot', () => {
    expect(secondsToSlotMinutes(450)).toBe(8)
    expect(secondsToSlotMinutes(480)).toBe(8)
  })
})

describe('similarComposers', () => {
  const existing = [
    { id: '1', name: 'Sergei Rachmaninov' },
    { id: '2', name: 'Isaac Albéniz' },
    { id: '3', name: 'Enrique Granados' },
  ]

  // The three spellings from KAN-16.
  it.each(['Rajmáninov', 'S. Rachmaninoff', 'Rachmaninov'])('flags %j as Rachmaninov', (name) => {
    expect(similarComposers(name, existing).map(c => c.id)).toEqual(['1'])
  })

  it('flags an accent-only difference', () => {
    expect(similarComposers('isaac albeniz', existing).map(c => c.id)).toEqual(['2'])
  })

  it('leaves a genuinely new composer alone', () => {
    expect(similarComposers('Frederic Mompou', existing)).toEqual([])
    expect(similarComposers('Bach', existing)).toEqual([])
  })
})

describe('schemas', () => {
  it('accepts a composer name and trims it', () => {
    expect(ComposerBodySchema.parse({ name: '  Albéniz ' }).name).toBe('Albéniz')
  })

  it('rejects an empty composer name', () => {
    expect(ComposerBodySchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('accepts a work with an optional duration and catalogue number', () => {
    expect(WorkBodySchema.safeParse({
      composer_id: '00000000-0000-0000-0000-000000000001', title: 'Preludio', catalog_ref: 'Op. 23 nº 5', duration_seconds: 450,
    }).success).toBe(true)
    expect(WorkBodySchema.safeParse({
      composer_id: '00000000-0000-0000-0000-000000000001', title: 'Preludio', duration_seconds: null,
    }).success).toBe(true)
  })

  it.each([0, 7201, 1.5])('rejects a duration of %j seconds', (duration_seconds) => {
    expect(WorkBodySchema.safeParse({
      composer_id: '00000000-0000-0000-0000-000000000001', title: 'X', duration_seconds,
    }).success).toBe(false)
  })
})
