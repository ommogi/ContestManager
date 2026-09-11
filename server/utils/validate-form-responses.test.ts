import { describe, it, expect } from 'vitest'
import type { FormField, FormResponses } from '../../shared/inscription-form'
import {
  pickKnownResponses,
  validateFormField,
  validateFormResponses,
} from '../../shared/inscription-form-validation'
import { assertValidFormResponses } from './validate-form-responses'

// ── Builders ────────────────────────────────────────────────────────────────

function field(overrides: Partial<FormField> & Pick<FormField, 'type'>): FormField {
  return {
    id: 'f1',
    label: 'Campo',
    required: false,
    order: 0,
    hidden: false,
    validation: {},
    ...overrides,
  } as FormField
}

function firstError(f: FormField, value: unknown) {
  return validateFormField(f, value as never)
}

// ── required ────────────────────────────────────────────────────────────────

describe('required', () => {
  it('rejects an empty string on a required field', () => {
    const e = firstError(field({ type: 'text', required: true }), '')
    expect(e).toMatchObject({ fieldId: 'f1', type: 'required', message: 'Este campo es requerido' })
  })

  it('rejects whitespace-only input, which would otherwise pass as answered', () => {
    expect(firstError(field({ type: 'text', required: true }), '   ')?.type).toBe('required')
  })

  it('rejects undefined and null', () => {
    expect(firstError(field({ type: 'text', required: true }), undefined)?.type).toBe('required')
    expect(firstError(field({ type: 'text', required: true }), null)?.type).toBe('required')
  })

  it('honours required declared only inside validation', () => {
    const f = field({ type: 'text', required: false, validation: { required: true } })
    expect(firstError(f, '')?.type).toBe('required')
  })

  it('accepts an empty optional field and skips the remaining rules', () => {
    const f = field({ type: 'text', validation: { minLength: 5 } })
    expect(firstError(f, '')).toBeNull()
  })

  it('uses the acceptance wording for a required checkbox', () => {
    const f = field({ type: 'checkbox', required: true })
    expect(firstError(f, false)?.message).toBe('Debes aceptar este campo')
  })

  it('treats an empty array as unanswered', () => {
    const f = field({ type: 'checkbox-group', required: true, options: [] })
    expect(firstError(f, [])?.type).toBe('required')
  })

  it('never requires a hidden field, which cannot be answered', () => {
    const f = field({ type: 'text', required: true, hidden: true })
    expect(firstError(f, '')).toBeNull()
  })
})

// ── lengths ─────────────────────────────────────────────────────────────────

describe('length rules', () => {
  it('rejects below minLength and accepts the exact boundary', () => {
    const f = field({ type: 'text', validation: { minLength: 3 } })
    expect(firstError(f, 'ab')).toMatchObject({ type: 'minLength', message: 'Mínimo 3 caracteres' })
    expect(firstError(f, 'abc')).toBeNull()
  })

  it('rejects above maxLength and accepts the exact boundary', () => {
    const f = field({ type: 'text', validation: { maxLength: 3 } })
    expect(firstError(f, 'abcd')).toMatchObject({ type: 'maxLength', message: 'Máximo 3 caracteres' })
    expect(firstError(f, 'abc')).toBeNull()
  })

  it('applies lengths to email too, which the composable used to skip', () => {
    const f = field({ type: 'email', validation: { maxLength: 5 } })
    expect(firstError(f, 'someone@example.com')?.type).toBe('maxLength')
  })
})

// ── numbers ─────────────────────────────────────────────────────────────────

describe('number rules', () => {
  it('enforces minValue and maxValue at the boundaries', () => {
    const f = field({ type: 'number', validation: { minValue: 1, maxValue: 10 } })
    expect(firstError(f, 0)).toMatchObject({ type: 'minValue', message: 'Valor mínimo: 1' })
    expect(firstError(f, 11)).toMatchObject({ type: 'maxValue', message: 'Valor máximo: 10' })
    expect(firstError(f, 1)).toBeNull()
    expect(firstError(f, 10)).toBeNull()
  })

  it('accepts a numeric string, which is what an <input> hands back', () => {
    const f = field({ type: 'number', validation: { minValue: 1 } })
    expect(firstError(f, '5')).toBeNull()
  })

  it('rejects a non-numeric answer', () => {
    expect(firstError(field({ type: 'number' }), 'abc')?.message).toBe('Debe ser un número')
  })

  it('accepts 0 rather than treating it as unanswered', () => {
    const f = field({ type: 'number', required: true, validation: { minValue: 0 } })
    expect(firstError(f, 0)).toBeNull()
  })
})

// ── pattern ─────────────────────────────────────────────────────────────────

describe('pattern', () => {
  it('rejects a non-matching value with the custom message', () => {
    const f = field({ type: 'text', validation: { pattern: '^A\\d+$', patternMessage: 'Debe empezar por A' } })
    expect(firstError(f, 'B12')).toMatchObject({ type: 'pattern', message: 'Debe empezar por A' })
    expect(firstError(f, 'A12')).toBeNull()
  })

  it('falls back to a generic message when none is configured', () => {
    const f = field({ type: 'text', validation: { pattern: '^A$' } })
    expect(firstError(f, 'B')?.message).toBe('Formato no válido')
  })

  it('fails open on a malformed pattern instead of blocking the inscription', () => {
    const f = field({ type: 'text', validation: { pattern: '([unclosed' } })
    expect(firstError(f, 'anything')).toBeNull()
  })
})

// ── options ─────────────────────────────────────────────────────────────────

describe('options membership', () => {
  const select = field({
    type: 'select',
    options: [{ value: 'a', label: 'Opción A' }, { value: 'b', label: 'Opción B' }],
  })

  it('accepts a declared value', () => {
    expect(firstError(select, 'a')).toBeNull()
  })

  it('rejects a value outside options', () => {
    expect(firstError(select, 'zzz')).toMatchObject({ type: 'option', message: 'Opción no válida' })
  })

  it('matches on value, not on label', () => {
    expect(firstError(select, 'Opción A')?.type).toBe('option')
  })

  it('allows a free value when allowOther is set', () => {
    const f = field({
      type: 'select',
      allowOther: true,
      options: [{ value: 'a', label: 'A' }],
    })
    expect(firstError(f, 'something else')).toBeNull()
  })
})

// ── checkbox-group ──────────────────────────────────────────────────────────

describe('checkbox-group', () => {
  const base = {
    type: 'checkbox-group' as const,
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
  }

  it('enforces minSelected', () => {
    const f = field({ ...base, minSelected: 2 })
    expect(firstError(f, ['a'])).toMatchObject({ type: 'minSelected', message: 'Selecciona al menos 2 opciones' })
    expect(firstError(f, ['a', 'b'])).toBeNull()
  })

  it('enforces maxSelected', () => {
    const f = field({ ...base, maxSelected: 2 })
    expect(firstError(f, ['a', 'b', 'c'])).toMatchObject({ type: 'maxSelected' })
    expect(firstError(f, ['a', 'b'])).toBeNull()
  })

  it('singularises the message for a limit of one', () => {
    const f = field({ ...base, required: true, minSelected: 1 })
    expect(firstError(f, [])?.message).toBe('Este campo es requerido')
    expect(firstError(field({ ...base, maxSelected: 1 }), ['a', 'b'])?.message)
      .toBe('Selecciona como máximo 1 opción')
  })

  it('leaves an optional empty group alone despite minSelected', () => {
    // Consistent with every other type: an unanswered optional field skips
    // the remaining rules rather than being failed by them.
    expect(firstError(field({ ...base, minSelected: 2 }), [])).toBeNull()
  })

  it('rejects a selection outside options', () => {
    expect(firstError(field(base), ['a', 'nope'])?.type).toBe('option')
  })

  it('rejects a non-array answer', () => {
    expect(firstError(field(base), 'a')?.message).toBe('Formato no válido')
  })
})

// ── customRule: dni ─────────────────────────────────────────────────────────

describe('customRule dni', () => {
  const f = field({ type: 'text', validation: { customRule: 'dni' } })

  // The two cases named in the KAN-52 acceptance criteria.
  it('accepts the valid NIE X1234567L', () => {
    expect(firstError(f, 'X1234567L')).toBeNull()
  })

  it('rejects DNI 12345678A, whose check letter is wrong', () => {
    const e = firstError(f, '12345678A')
    expect(e).not.toBeNull()
    expect(e?.type).toBe('custom')
    expect(e?.message).toBe('Letra de DNI incorrecta')
  })

  it('accepts a DNI with the correct check letter', () => {
    expect(firstError(f, '12345678Z')).toBeNull()
  })

  it('accepts lowercase input', () => {
    expect(firstError(f, 'x1234567l')).toBeNull()
  })

  it('rejects a passport-shaped value, since the rule is DNI/NIE', () => {
    expect(firstError(f, 'ABC123456')).not.toBeNull()
  })
})

// ── customRule: phone / email / url ─────────────────────────────────────────

describe('customRule phone', () => {
  const f = field({ type: 'phone', validation: { customRule: 'phone' } })

  it('accepts E.164 +34600112233', () => {
    expect(firstError(f, '+34600112233')).toBeNull()
  })

  it('rejects the spaced national format 600 112 233', () => {
    expect(firstError(f, '600 112 233')).toMatchObject({ message: 'Teléfono no válido' })
  })

  it('rejects a number with no plus prefix', () => {
    expect(firstError(f, '34600112233')).not.toBeNull()
  })
})

describe('customRule email and url', () => {
  it('validates email', () => {
    const f = field({ type: 'email', validation: { customRule: 'email' } })
    expect(firstError(f, 'a@b.co')).toBeNull()
    expect(firstError(f, 'not-an-email')?.message).toBe('Email no válido')
  })

  it('accepts an http(s) url', () => {
    const f = field({ type: 'url', validation: { customRule: 'url' } })
    expect(firstError(f, 'https://example.com')).toBeNull()
  })

  it('rejects a javascript: url even though URL() parses it', () => {
    const f = field({ type: 'url', validation: { customRule: 'url' } })
    expect(firstError(f, 'javascript:alert(1)')?.message).toBe('La URL debe empezar por http:// o https://')
  })

  it('rejects an unparseable url', () => {
    const f = field({ type: 'url', validation: { customRule: 'url' } })
    expect(firstError(f, 'nope')?.message).toBe('URL no válida')
  })
})

// ── whole-form ──────────────────────────────────────────────────────────────

describe('validateFormResponses', () => {
  const fields: FormField[] = [
    field({ id: 'b', type: 'text', label: 'Segundo', required: true, order: 2 }),
    field({ id: 'a', type: 'text', label: 'Primero', required: true, order: 1 }),
  ]

  it('passes when every rule is satisfied', () => {
    const res = validateFormResponses(fields, { a: 'x', b: 'y' })
    expect(res).toEqual({ isValid: true, errors: [] })
  })

  it('reports one error per offending field, keyed by id', () => {
    const res = validateFormResponses(fields, {})
    expect(res.isValid).toBe(false)
    expect(res.errors).toHaveLength(2)
    expect(res.errors.map(e => e.fieldId)).toEqual(['a', 'b'])
  })

  it('orders errors by the field order, not by insertion', () => {
    const res = validateFormResponses(fields, { a: '' })
    expect(res.errors[0].fieldId).toBe('a')
  })

  it('treats a missing responses object as all-unanswered', () => {
    const res = validateFormResponses(fields, undefined as unknown as FormResponses)
    expect(res.errors).toHaveLength(2)
  })

  it('validates an empty schema as valid', () => {
    expect(validateFormResponses([], {})).toEqual({ isValid: true, errors: [] })
  })
})

// ── response narrowing ──────────────────────────────────────────────────────

describe('pickKnownResponses', () => {
  const fields: FormField[] = [
    field({ id: 'keep', type: 'text' }),
    field({ id: 'ghost', type: 'text', hidden: true }),
  ]

  it('drops ids the schema does not declare', () => {
    const out = pickKnownResponses(fields, { keep: 'yes', injected: 'no' })
    expect(out).toEqual({ keep: 'yes' })
  })

  it('drops hidden fields, which are never rendered', () => {
    expect(pickKnownResponses(fields, { ghost: 'x' })).toEqual({})
  })

  it('survives a missing responses object', () => {
    expect(pickKnownResponses(fields, undefined as unknown as FormResponses)).toEqual({})
  })
})

// ── server gate ─────────────────────────────────────────────────────────────

describe('assertValidFormResponses', () => {
  const fields: FormField[] = [field({ id: 'name', type: 'text', required: true })]

  it('returns the narrowed responses when valid', () => {
    const out = assertValidFormResponses(fields, { name: 'Ada', extra: 'dropped' })
    expect(out).toEqual({ name: 'Ada' })
  })

  it('throws a 400 naming the offending field', () => {
    try {
      assertValidFormResponses(fields, { name: '' })
      throw new Error('should have thrown')
    } catch (e) {
      const err = e as { statusCode?: number, data?: { code?: string, errors?: Array<{ fieldId: string }> } }
      expect(err.statusCode).toBe(400)
      expect(err.data?.code).toBe('FORM_VALIDATION_FAILED')
      expect(err.data?.errors?.[0].fieldId).toBe('name')
    }
  })

  it('rejects a forged value that the UI would never offer', () => {
    const select = field({
      id: 'pick',
      type: 'select',
      required: true,
      options: [{ value: 'a', label: 'A' }],
    })
    expect(() => assertValidFormResponses([select], { pick: 'forged' })).toThrow()
  })
})
