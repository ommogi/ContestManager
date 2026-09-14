// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/.
import { describe, it, expect } from 'vitest'
import {
  CORE_FIELD_IDS,
  IRREDUCIBLE_CORE_FIELD_IDS,
  CORE_FIELD_DEFINITIONS,
  isCoreFieldId,
  isIrreducibleCoreFieldId,
  coreFieldColumn,
  buildDefaultFormFields,
  validateCoreFields,
  reconcileFormFields,
  resolvePublishedFields,
  visibleFields,
} from '../../shared/inscription-form-core'
import { FormSchemaBodySchema } from './schemas'
import type { FormField } from '../../shared/inscription-form'

function custom(id: string, order: number, overrides: Partial<FormField> = {}): FormField {
  return {
    id,
    type: 'text',
    label: id,
    required: false,
    order,
    hidden: false,
    validation: {},
    ...overrides,
  } as FormField
}

const defaults = buildDefaultFormFields()
const core = (id: string) => defaults.find(f => f.id === id)!

describe('core field catalogue', () => {
  it('covers the seven fields the public form renders today', () => {
    expect(CORE_FIELD_IDS).toEqual([
      'core.first_name', 'core.last_name', 'core.birthdate',
      'core.dni', 'core.country', 'core.phone', 'core.email',
    ])
  })

  it('marks exactly first_name, last_name and birthdate as irreducible', () => {
    expect(IRREDUCIBLE_CORE_FIELD_IDS).toEqual(['core.first_name', 'core.last_name', 'core.birthdate'])
    expect(isIrreducibleCoreFieldId('core.dni')).toBe(false)
    expect(isIrreducibleCoreFieldId('core.email')).toBe(false)
  })

  it('never lets an irreducible field be hidden or optional', () => {
    for (const d of CORE_FIELD_DEFINITIONS) {
      const irreducible = isIrreducibleCoreFieldId(d.id)
      expect(d.hideAllowed).toBe(!irreducible)
      expect(d.optionalAllowed).toBe(!irreducible)
    }
  })

  it('maps every core field to a participants column', () => {
    expect(coreFieldColumn('core.first_name')).toBe('first_name')
    expect(coreFieldColumn('core.birthdate')).toBe('birthdate')
    expect(coreFieldColumn('obra')).toBeNull()
  })

  it('recognises reserved ids only for the known seven', () => {
    expect(isCoreFieldId('core.dni')).toBe(true)
    expect(isCoreFieldId('core.nickname')).toBe(false)
    expect(isCoreFieldId('dni')).toBe(false)
  })
})

describe('buildDefaultFormFields', () => {
  it('reproduces today\'s form: seven visible fields in the current order', () => {
    expect(defaults.map(f => f.id)).toEqual([...CORE_FIELD_IDS])
    expect(defaults.every(f => f.hidden === false)).toBe(true)
    expect(defaults.every(f => f.isCore === true)).toBe(true)
    expect(defaults.map(f => f.order)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('keeps phone optional and the rest required, as today', () => {
    expect(core('core.phone').required).toBe(false)
    expect(core('core.first_name').required).toBe(true)
    expect(core('core.dni').required).toBe(true)
    expect(core('core.email').required).toBe(true)
  })

  it('carries the dni custom rule through to validation', () => {
    expect(core('core.dni').validation.customRule).toBe('dni')
  })

  it('passes its own validation', () => {
    expect(validateCoreFields(defaults)).toEqual([])
  })
})

describe('validateCoreFields', () => {
  it('accepts hiding dni, country, phone and email', () => {
    for (const id of ['core.dni', 'core.country', 'core.phone', 'core.email']) {
      const fields = defaults.map(f => (f.id === id ? { ...f, hidden: true, required: false } : f))
      expect(validateCoreFields(fields)).toEqual([])
    }
  })

  it('rejects hiding each irreducible field, in Spanish', () => {
    for (const id of IRREDUCIBLE_CORE_FIELD_IDS) {
      const fields = defaults.map(f => (f.id === id ? { ...f, hidden: true } : f))
      const issues = validateCoreFields(fields)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.fieldId).toBe(id)
      expect(issues[0]!.message).toMatch(/no se puede ocultar/)
    }
  })

  it('rejects making an irreducible field optional', () => {
    const fields = defaults.map(f => (f.id === 'core.birthdate' ? { ...f, required: false } : f))
    const issues = validateCoreFields(fields)
    expect(issues[0]!.message).toMatch(/obligatorio/)
  })

  it('rejects deleting an irreducible field', () => {
    const fields = defaults.filter(f => f.id !== 'core.last_name')
    const issues = validateCoreFields(fields)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/no se puede eliminar/)
  })

  it('accepts deleting an optional core field outright', () => {
    expect(validateCoreFields(defaults.filter(f => f.id !== 'core.dni'))).toEqual([])
  })

  it('tolerates a legacy schema that declares no core field at all', () => {
    expect(validateCoreFields([custom('obra', 0), custom('profesor', 1)])).toEqual([])
  })

  it('but demands the irreducible three once any core field is declared', () => {
    const issues = validateCoreFields([core('core.dni'), custom('obra', 1)])
    expect(issues.map(i => i.fieldId).sort()).toEqual([
      'core.birthdate', 'core.first_name', 'core.last_name',
    ])
  })

  it('rejects changing a core field\'s type', () => {
    const fields = defaults.map(f => (f.id === 'core.birthdate' ? { ...f, type: 'text' as const } : f))
    expect(validateCoreFields(fields)[0]!.message).toMatch(/no puede cambiar de tipo/)
  })

  it('rejects a custom field squatting on the reserved prefix', () => {
    const issues = validateCoreFields([...defaults, custom('core.nickname', 7)])
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/reservado/)
  })

  it('ignores ordinary custom fields', () => {
    expect(validateCoreFields([...defaults, custom('obra', 7), custom('profesor', 8)])).toEqual([])
  })

  it('reports every violation at once, not just the first', () => {
    const fields = defaults
      .filter(f => f.id !== 'core.first_name')
      .map(f => (f.id === 'core.birthdate' ? { ...f, hidden: true } : f))
    expect(validateCoreFields(fields).length).toBe(2)
  })
})

describe('reconcileFormFields', () => {
  it('lets a custom field sit above a core field and keeps that order', () => {
    const fields: FormField[] = [
      { ...core('core.first_name'), order: 0 },
      custom('obra', 1),
      { ...core('core.last_name'), order: 2 },
      { ...core('core.birthdate'), order: 3 },
      { ...core('core.dni'), order: 4 },
      { ...core('core.country'), order: 5 },
      { ...core('core.phone'), order: 6 },
      { ...core('core.email'), order: 7 },
    ]
    const result = reconcileFormFields(fields)
    expect(result.map(f => f.id)).toEqual([
      'core.first_name', 'obra', 'core.last_name', 'core.birthdate',
      'core.dni', 'core.country', 'core.phone', 'core.email',
    ])
  })

  it('renumbers order densely from zero', () => {
    const result = reconcileFormFields([
      { ...core('core.first_name'), order: 40 },
      custom('obra', 5),
      { ...core('core.last_name'), order: 90 },
    ])
    expect(result.map(f => f.order)).toEqual(result.map((_, i) => i))
  })

  it('restores an omitted optional core field as hidden and not required', () => {
    const result = reconcileFormFields(defaults.filter(f => f.id !== 'core.dni'))
    const dni = result.find(f => f.id === 'core.dni')!
    expect(dni.hidden).toBe(true)
    expect(dni.required).toBe(false)
    expect(dni.validation.required).toBe(false)
  })

  it('restores an omitted irreducible core field visible and required', () => {
    const result = reconcileFormFields(defaults.filter(f => f.id !== 'core.birthdate'))
    const birthdate = result.find(f => f.id === 'core.birthdate')!
    expect(birthdate.hidden).toBe(false)
    expect(birthdate.required).toBe(true)
  })

  it('forces the invariants back on if a payload slipped past validation', () => {
    const result = reconcileFormFields(
      defaults.map(f => (f.id === 'core.first_name' ? { ...f, hidden: true, required: false } : f)),
    )
    const first = result.find(f => f.id === 'core.first_name')!
    expect(first.hidden).toBe(false)
    expect(first.required).toBe(true)
  })

  it('honours dni marked optional and keeps validation.required in step', () => {
    const result = reconcileFormFields(
      defaults.map(f => (f.id === 'core.dni' ? { ...f, required: false } : f)),
    )
    const dni = result.find(f => f.id === 'core.dni')!
    expect(dni.required).toBe(false)
    expect(dni.validation.required).toBe(false)
    expect(dni.validation.customRule).toBe('dni')
  })

  it('keeps a relabelled core field but never a retyped or re-ided one', () => {
    const result = reconcileFormFields(
      defaults.map(f => (f.id === 'core.dni' ? { ...f, label: 'Documento', type: 'number' as const } : f)),
    )
    const dni = result.find(f => f.id === 'core.dni')!
    expect(dni.label).toBe('Documento')
    expect(dni.type).toBe('text')
    expect(dni.isCore).toBe(true)
  })

  it('always produces the full catalogue plus the custom fields', () => {
    const result = reconcileFormFields([custom('obra', 0)])
    expect(result).toHaveLength(CORE_FIELD_IDS.length + 1)
    expect(result.filter(f => f.isCore)).toHaveLength(CORE_FIELD_IDS.length)
  })

  it('is idempotent', () => {
    const once = reconcileFormFields([...defaults, custom('obra', 99)])
    expect(reconcileFormFields(once)).toEqual(once)
  })
})

describe('FormSchemaBodySchema core rules', () => {
  it('accepts the default schema plus a custom field', () => {
    const result = FormSchemaBodySchema.safeParse({ fields: [...defaults, custom('obra', 7)] })
    expect(result.success).toBe(true)
  })

  it('rejects a hidden birthdate over the wire', () => {
    const result = FormSchemaBodySchema.safeParse({
      fields: defaults.map(f => (f.id === 'core.birthdate' ? { ...f, hidden: true } : f)),
    })
    expect(result.success).toBe(false)
    expect(result.error!.issues.some(i => /no se puede ocultar/.test(i.message))).toBe(true)
  })

  it('rejects a missing first_name once the schema declares core fields', () => {
    const result = FormSchemaBodySchema.safeParse({
      fields: defaults.filter(f => f.id !== 'core.first_name'),
    })
    expect(result.success).toBe(false)
  })

  it('still accepts a purely custom schema (the pre-KAN-56 shape)', () => {
    // Every schema already in the database, and everything the current builder
    // emits, carries no core entry. Those contests render the default core
    // block plus their custom fields, so nothing is missing — rejecting them
    // would 400 the whole existing estate.
    const result = FormSchemaBodySchema.safeParse({ fields: [custom('obra', 0)] })
    expect(result.success).toBe(true)
  })

  it('accepts isCore on a field without tripping .strict()', () => {
    const result = FormSchemaBodySchema.safeParse({ fields: defaults })
    expect(result.success).toBe(true)
  })
})

describe('resolvePublishedFields', () => {
  it('falls back to today\'s form when no schema is published', () => {
    expect(resolvePublishedFields(null).map(f => f.id)).toEqual([...CORE_FIELD_IDS])
    expect(resolvePublishedFields([]).map(f => f.id)).toEqual([...CORE_FIELD_IDS])
  })

  it('appends a legacy custom-only schema after the core block, never inside it', () => {
    // The regression this guards: reconcileFormFields sorts by `order`, so a
    // legacy field saved at order 0 would land between first_name and
    // last_name and silently reorder a form that is already live.
    const result = resolvePublishedFields([custom('obra', 0), custom('profesor', 1)])
    expect(result.map(f => f.id)).toEqual([...CORE_FIELD_IDS, 'obra', 'profesor'])
    expect(result.map(f => f.order)).toEqual(result.map((_, i) => i))
  })

  it('honours the schema\'s own order once it declares core fields', () => {
    const stored = reconcileFormFields([
      { ...core('core.first_name'), order: 0 },
      custom('obra', 1),
      ...defaults
        .filter(f => f.id !== 'core.first_name')
        .map((f, i) => ({ ...f, order: i + 2 })),
    ])
    expect(resolvePublishedFields(stored).map(f => f.id)).toEqual([
      'core.first_name', 'obra', 'core.last_name', 'core.birthdate',
      'core.dni', 'core.country', 'core.phone', 'core.email',
    ])
  })

  it('keeps a hidden core field in the schema but out of the rendered form', () => {
    const stored = reconcileFormFields(
      defaults.map(f => (f.id === 'core.dni' ? { ...f, hidden: true, required: false } : f)),
    )
    const resolved = resolvePublishedFields(stored)
    expect(resolved.some(f => f.id === 'core.dni')).toBe(true)
    expect(visibleFields(resolved).some(f => f.id === 'core.dni')).toBe(false)
    // The irreducible three can never drop out of the rendered form.
    for (const id of IRREDUCIBLE_CORE_FIELD_IDS) {
      expect(visibleFields(resolved).some(f => f.id === id)).toBe(true)
    }
  })

  it('is idempotent on an already-resolved list', () => {
    const once = resolvePublishedFields([custom('obra', 0)])
    expect(resolvePublishedFields(once)).toEqual(once)
  })
})
