import { describe, it, expect, vi } from 'vitest'
import {
  draftFormFromRules,
  toFormFields,
  isCoreDuplicate,
  slugify,
  MAX_RULES_CHARS,
  MAX_PROPOSED_FIELDS,
  type AiField,
  type AiFormDraft,
} from './ai-form-draft'
import { FormSchemaBodySchema } from './schemas'

function field(over: Partial<AiField> = {}): AiField {
  return {
    label: 'Instrumento',
    type: 'select',
    description: null,
    required: true,
    options: ['Piano', 'Violín', 'Violonchelo'],
    accept: null,
    maxSizeMB: null,
    ...over,
  }
}

function draft(fields: AiField[], notes: string | null = null): AiFormDraft {
  return { fields, notes }
}

const RULES = 'Concurso de piano y cuerda. Hay que adjuntar el DNI escaneado en PDF y el repertorio.'

describe('slugify', () => {
  it('drops accents, case and punctuation', () => {
    expect(slugify('  Fecha de Nacimiento ')).toBe('fecha_de_nacimiento')
    expect(slugify('Violín / Viola')).toBe('violin_viola')
  })
})

describe('isCoreDuplicate', () => {
  it('catches the core fields and their usual synonyms', () => {
    for (const label of ['Nombre', 'Apellidos', 'Fecha de nacimiento', 'DNI / NIE / Pasaporte', 'País', 'Teléfono', 'Email', 'Correo electrónico', 'Móvil', 'DNI']) {
      expect(isCoreDuplicate({ label }), label).toBe(true)
    }
  })

  it('lets through things that only mention a core word', () => {
    expect(isCoreDuplicate({ label: 'DNI escaneado' })).toBe(false)
    expect(isCoreDuplicate({ label: 'Nombre del profesor' })).toBe(false)
    expect(isCoreDuplicate({ label: 'Teléfono del tutor legal' })).toBe(false)
  })
})

describe('toFormFields', () => {
  it('builds fields the save endpoint accepts', () => {
    const fields = toFormFields(draft([
      field(),
      field({ label: 'Repertorio', type: 'textarea', options: [] }),
      field({ label: 'DNI escaneado', type: 'file', options: [], accept: '.pdf,image/*', maxSizeMB: 5 }),
      field({ label: 'Acepto las bases', type: 'checkbox', options: [] }),
    ]))

    expect(fields.map(f => f.type)).toEqual(['select', 'textarea', 'file', 'checkbox'])
    expect(fields.map(f => f.order)).toEqual([0, 1, 2, 3])
    expect(fields[0]).toMatchObject({
      id: 'ai_instrumento',
      options: [
        { value: 'piano', label: 'Piano' },
        { value: 'violin', label: 'Violín' },
        { value: 'violonchelo', label: 'Violonchelo' },
      ],
      validation: { required: true },
    })
    expect(fields[2]).toMatchObject({ accept: '.pdf,image/*', maxSizeMB: 5 })
    expect(FormSchemaBodySchema.safeParse({ fields }).success).toBe(true)
  })

  it('never proposes a core field', () => {
    const fields = toFormFields(draft([
      field({ label: 'Email', type: 'text', options: [] }),
      field({ label: 'Nombre', type: 'text', options: [] }),
      field(),
    ]))
    expect(fields.map(f => f.label)).toEqual(['Instrumento'])
    expect(fields.every(f => !f.id.startsWith('core.'))).toBe(true)
  })

  it('drops a choice field with nothing to choose instead of inventing options', () => {
    expect(toFormFields(draft([field({ options: ['  ', ''] })]))).toEqual([])
  })

  it('keeps ids unique, among themselves and against the existing form', () => {
    const fields = toFormFields(
      draft([field({ label: 'Profesor', type: 'text', options: [] }), field({ label: 'Profesor', type: 'text', options: [] })]),
      ['ai_profesor'],
    )
    expect(fields.map(f => f.id)).toEqual(['ai_profesor_2', 'ai_profesor_3'])
  })

  it('makes repeated option values unique so the schema accepts them', () => {
    const [f] = toFormFields(draft([field({ options: ['Piano', 'piano', 'PIANO'] })]))
    expect((f as { options: { value: string }[] }).options.map(o => o.value)).toEqual(['piano', 'piano_2', 'piano_3'])
  })

  it('removes options from types that do not take them and caps file size', () => {
    const [text, file] = toFormFields(draft([
      field({ label: 'Centro de estudios', type: 'text' }),
      field({ label: 'Partitura', type: 'file', options: [], maxSizeMB: 500 }),
    ]))
    expect(text).not.toHaveProperty('options')
    expect(file).toMatchObject({ maxSizeMB: 25 })
  })

  it('caps the number of fields', () => {
    const many = Array.from({ length: 40 }, (_, i) => field({ label: `Pregunta ${i}`, type: 'text', options: [] }))
    expect(toFormFields(draft(many))).toHaveLength(MAX_PROPOSED_FIELDS)
  })
})

describe('draftFormFromRules', () => {
  it('returns the proposal and the notes', async () => {
    const call = vi.fn().mockResolvedValue(draft([field()], ' Revisa la edad mínima. '))
    const result = await draftFormFromRules(RULES, call)
    expect(result).toMatchObject({ ok: true, notes: 'Revisa la edad mínima.' })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0]![0].user).toContain(RULES)
  })

  it('does not call the model without rules, or with too much text', async () => {
    const call = vi.fn()
    expect(await draftFormFromRules('   ', call)).toEqual({ ok: false, reason: 'empty_rules' })
    expect(await draftFormFromRules('x'.repeat(MAX_RULES_CHARS + 1), call)).toEqual({ ok: false, reason: 'rules_too_long' })
    expect(call).not.toHaveBeenCalled()
  })

  it('retries once when the answer is unusable, then gives up', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(draft([field()]))
    expect((await draftFormFromRules(RULES, call)).ok).toBe(true)
    expect(call).toHaveBeenCalledTimes(2)

    const useless = vi.fn().mockResolvedValue(draft([field({ label: 'Email', type: 'text', options: [] })]))
    expect(await draftFormFromRules(RULES, useless)).toEqual({ ok: false, reason: 'no_proposal' })
    expect(useless).toHaveBeenCalledTimes(2)
  })

  it('lets a model error propagate to the endpoint', async () => {
    const call = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(draftFormFromRules(RULES, call)).rejects.toThrow('boom')
  })
})
