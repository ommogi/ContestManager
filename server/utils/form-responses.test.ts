import { describe, it, expect, vi } from 'vitest'
import {
  parseSchemaFields,
  parseResponses,
  toDisplayValue,
  resolveResponses,
  buildParticipantResponses,
  loadFormResponsesForParticipants,
  loadContestParticipants,
  toParticipantCoreRow,
  FormResponsesQueryError,
  PARTICIPANT_CORE_COLUMNS,
  type FormResponsesClient,
  type FormResponseRow,
  type FormSchemaRow,
} from './form-responses'
import type { FormField } from '../../shared/inscription-form'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function field(partial: Partial<FormField> & { id: string; type: FormField['type'] }): FormField {
  return {
    label: partial.id,
    required: false,
    order: 0,
    hidden: false,
    validation: {},
    ...partial,
  } as FormField
}

/** Version 1: the voice field labelled "Cuerda", options in Spanish. */
const schemaV1: FormSchemaRow = {
  id: 'schema-v1',
  version: 1,
  schema_json: [
    field({ id: 'voice', type: 'select', label: 'Cuerda', order: 0, options: [
      { value: 'soprano', label: 'Soprano' },
      { value: 'tenor', label: 'Tenor' },
    ] }),
    field({ id: 'piece', type: 'text', label: 'Obra', order: 1 }),
  ],
}

/** Version 2: same ids, different labels and different option labels. */
const schemaV2: FormSchemaRow = {
  id: 'schema-v2',
  version: 2,
  schema_json: [
    field({ id: 'voice', type: 'select', label: 'Tesitura', order: 0, options: [
      { value: 'soprano', label: 'Soprano lírica' },
      { value: 'tenor', label: 'Tenor dramático' },
    ] }),
    field({ id: 'piece', type: 'text', label: 'Obra a interpretar', order: 1 }),
    field({ id: 'notes', type: 'textarea', label: 'Observaciones', order: 2 }),
  ],
}

// ─── parseSchemaFields / parseResponses ──────────────────────────────────────

describe('parseSchemaFields', () => {
  it('accepts an already-parsed array', () => {
    expect(parseSchemaFields(schemaV1.schema_json)).toHaveLength(2)
  })

  it('accepts a JSON string', () => {
    expect(parseSchemaFields(JSON.stringify(schemaV1.schema_json))).toHaveLength(2)
  })

  it('degrades to an empty list on malformed JSON instead of throwing', () => {
    expect(parseSchemaFields('{not json')).toEqual([])
    expect(parseSchemaFields(null)).toEqual([])
    expect(parseSchemaFields({ fields: [] })).toEqual([])
  })

  it('drops entries without a string id', () => {
    expect(parseSchemaFields([{ type: 'text' }, { id: 'ok', type: 'text' }])).toHaveLength(1)
  })
})

describe('parseResponses', () => {
  it('parses objects and JSON strings, and rejects arrays', () => {
    expect(parseResponses({ a: 1 })).toEqual({ a: 1 })
    expect(parseResponses('{"a":1}')).toEqual({ a: 1 })
    expect(parseResponses('[1,2]')).toEqual({})
    expect(parseResponses('nope')).toEqual({})
  })
})

// ─── toDisplayValue ──────────────────────────────────────────────────────────

describe('toDisplayValue', () => {
  const select = field({ id: 'voice', type: 'select', options: [
    { value: 'soprano', label: 'Soprano' },
  ] })

  it('translates a select value to its option label', () => {
    expect(toDisplayValue(select, 'soprano')).toBe('Soprano')
  })

  it('echoes a select value with no matching option (allowOther)', () => {
    expect(toDisplayValue(select, 'contratenor')).toBe('contratenor')
  })

  it('translates a radio value the same way', () => {
    const radio = field({ id: 'r', type: 'radio', options: [{ value: 'a', label: 'Opción A' }] })
    expect(toDisplayValue(radio, 'a')).toBe('Opción A')
  })

  it('joins checkbox-group labels', () => {
    const group = field({ id: 'g', type: 'checkbox-group', options: [
      { value: 'a', label: 'Alfa' },
      { value: 'b', label: 'Beta' },
      { value: 'c', label: 'Gamma' },
    ] })
    expect(toDisplayValue(group, ['a', 'c'])).toBe('Alfa, Gamma')
  })

  it('falls back to the raw value for an unknown checkbox-group entry', () => {
    const group = field({ id: 'g', type: 'checkbox-group', options: [{ value: 'a', label: 'Alfa' }] })
    expect(toDisplayValue(group, ['a', 'zz'])).toBe('Alfa, zz')
  })

  it('renders a checkbox with its custom labels, or Sí/No by default', () => {
    const plain = field({ id: 'c', type: 'checkbox' })
    expect(toDisplayValue(plain, true)).toBe('Sí')
    expect(toDisplayValue(plain, false)).toBe('No')

    const custom = field({ id: 'c', type: 'checkbox', checkedLabel: 'Acepto', uncheckedLabel: 'No acepto' })
    expect(toDisplayValue(custom, true)).toBe('Acepto')
    expect(toDisplayValue(custom, false)).toBe('No acepto')
  })

  it('lists file names, never file contents', () => {
    const file = field({ id: 'f', type: 'file' })
    const value = [
      { path: 'c1/p1/f/uuid-partitura.pdf', name: 'partitura.pdf', size: 10, mimeType: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z' },
      { path: 'c1/p1/f/uuid-dni.pdf', name: 'dni.pdf', size: 20, mimeType: 'application/pdf', uploadedAt: '2026-01-01T00:00:00Z' },
    ]
    expect(toDisplayValue(file, value)).toBe('partitura.pdf, dni.pdf')
  })

  it('returns an empty string for null, undefined and empty text', () => {
    const text = field({ id: 't', type: 'text' })
    expect(toDisplayValue(text, null)).toBe('')
    expect(toDisplayValue(text, undefined)).toBe('')
    expect(toDisplayValue(text, '')).toBe('')
  })

  it('stringifies numbers and dates as stored', () => {
    expect(toDisplayValue(field({ id: 'n', type: 'number' }), 42)).toBe('42')
    expect(toDisplayValue(field({ id: 'd', type: 'date' }), '2026-05-01')).toBe('2026-05-01')
  })
})

// ─── resolveResponses ────────────────────────────────────────────────────────

describe('resolveResponses', () => {
  it('returns fields in schema order, not response-key order', () => {
    const fields = [
      field({ id: 'c', type: 'text', order: 2 }),
      field({ id: 'a', type: 'text', order: 0 }),
      field({ id: 'b', type: 'text', order: 1 }),
    ]
    const resolved = resolveResponses(fields, { c: '3', b: '2', a: '1' })
    expect(resolved.map(f => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('keeps unanswered schema fields with a null value and empty display', () => {
    const resolved = resolveResponses(parseSchemaFields(schemaV2.schema_json), { voice: 'tenor' })
    const notes = resolved.find(f => f.id === 'notes')
    expect(notes).toMatchObject({ label: 'Observaciones', value: null, displayValue: '' })
  })

  it('appends orphan response keys rather than dropping the answer', () => {
    const resolved = resolveResponses(
      [field({ id: 'kept', type: 'text', label: 'Conservado' })],
      { kept: 'sí', removed_field: 'dato que ya no tiene campo' },
    )
    expect(resolved.map(f => f.id)).toEqual(['kept', 'removed_field'])
    expect(resolved[1]).toMatchObject({
      label: 'removed_field',
      type: 'text',
      displayValue: 'dato que ya no tiene campo',
    })
  })

  it('renders an orphan array answer as a comma list', () => {
    const resolved = resolveResponses([], { gone: ['a', 'b'] })
    expect(resolved[0]?.displayValue).toBe('a, b')
  })

  it('exposes exactly { id, label, type, value, displayValue }', () => {
    const [first] = resolveResponses(parseSchemaFields(schemaV1.schema_json), { voice: 'soprano' })
    expect(Object.keys(first!).sort()).toEqual(['displayValue', 'id', 'label', 'type', 'value'])
  })
})

// ─── buildParticipantResponses: the version-crossing logic ───────────────────

describe('buildParticipantResponses', () => {
  const rows: FormResponseRow[] = [
    {
      participant_id: 'p-old',
      form_schema_id: 'schema-v1',
      responses_json: { voice: 'soprano', piece: 'Caro mio ben' },
      created_at: '2026-01-10T10:00:00Z',
    },
    {
      participant_id: 'p-new',
      form_schema_id: 'schema-v2',
      responses_json: { voice: 'soprano', piece: 'Nessun dorma', notes: 'Repetición a las 10' },
      created_at: '2026-03-10T10:00:00Z',
    },
  ]

  it('gives each participant the labels of THEIR schema version', () => {
    const [older, newer] = buildParticipantResponses(
      ['p-old', 'p-new'],
      rows,
      [schemaV1, schemaV2],
    )

    expect(older!.schemaVersion).toBe(1)
    expect(older!.fields.map(f => f.label)).toEqual(['Cuerda', 'Obra'])

    expect(newer!.schemaVersion).toBe(2)
    expect(newer!.fields.map(f => f.label)).toEqual(['Tesitura', 'Obra a interpretar', 'Observaciones'])
  })

  it('translates the same stored option value to each version\'s own label', () => {
    const [older, newer] = buildParticipantResponses(['p-old', 'p-new'], rows, [schemaV1, schemaV2])

    const oldVoice = older!.fields.find(f => f.id === 'voice')
    const newVoice = newer!.fields.find(f => f.id === 'voice')

    expect(oldVoice).toMatchObject({ value: 'soprano', displayValue: 'Soprano' })
    expect(newVoice).toMatchObject({ value: 'soprano', displayValue: 'Soprano lírica' })
  })

  it('does not leak a field added in v2 into a v1 participant', () => {
    const [older] = buildParticipantResponses(['p-old'], rows, [schemaV1, schemaV2])
    expect(older!.fields.map(f => f.id)).not.toContain('notes')
  })

  it('reports the schema id each participant answered', () => {
    const [older, newer] = buildParticipantResponses(['p-old', 'p-new'], rows, [schemaV1, schemaV2])
    expect(older!.formSchemaId).toBe('schema-v1')
    expect(newer!.formSchemaId).toBe('schema-v2')
  })

  it('keeps a participant with no response row, with fields: []', () => {
    const result = buildParticipantResponses(['p-old', 'p-none'], rows, [schemaV1, schemaV2])
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({
      participantId: 'p-none',
      formSchemaId: null,
      schemaVersion: null,
      submittedAt: null,
      fields: [],
    })
  })

  it('preserves the requested participant order', () => {
    const result = buildParticipantResponses(['p-new', 'p-none', 'p-old'], rows, [schemaV1, schemaV2])
    expect(result.map(r => r.participantId)).toEqual(['p-new', 'p-none', 'p-old'])
  })

  it('returns raw values with a null version when the schema row is missing', () => {
    const [only] = buildParticipantResponses(['p-old'], rows, [])
    expect(only!.schemaVersion).toBeNull()
    // No schema means no labels, but the answers still surface as orphans.
    expect(only!.fields.map(f => f.id).sort()).toEqual(['piece', 'voice'])
    expect(only!.fields.find(f => f.id === 'voice')!.displayValue).toBe('soprano')
  })

  it('keeps the most recent row when a participant answered two schemas', () => {
    const both: FormResponseRow[] = [
      { participant_id: 'p', form_schema_id: 'schema-v1', responses_json: { voice: 'tenor' }, created_at: '2026-01-01T00:00:00Z' },
      { participant_id: 'p', form_schema_id: 'schema-v2', responses_json: { voice: 'tenor' }, created_at: '2026-06-01T00:00:00Z' },
    ]
    const [only] = buildParticipantResponses(['p'], both, [schemaV1, schemaV2])
    expect(only!.schemaVersion).toBe(2)
    expect(only!.fields.find(f => f.id === 'voice')!.displayValue).toBe('Tenor dramático')
  })

  it('is order-independent about which row arrives first', () => {
    const reversed: FormResponseRow[] = [
      { participant_id: 'p', form_schema_id: 'schema-v2', responses_json: { voice: 'tenor' }, created_at: '2026-06-01T00:00:00Z' },
      { participant_id: 'p', form_schema_id: 'schema-v1', responses_json: { voice: 'tenor' }, created_at: '2026-01-01T00:00:00Z' },
    ]
    const [only] = buildParticipantResponses(['p'], reversed, [schemaV1, schemaV2])
    expect(only!.schemaVersion).toBe(2)
  })

  it('handles an empty contest', () => {
    expect(buildParticipantResponses([], [], [])).toEqual([])
  })
})

// ─── Query wrapper: constant number of round-trips ───────────────────────────

function stubClient(tables: Record<string, { data: unknown[] | null; error: { message: string } | null }>) {
  const calls: string[] = []
  const client: FormResponsesClient = {
    from: vi.fn((table: string) => {
      const result = tables[table] ?? { data: [], error: null }
      const terminal = () => {
        calls.push(table)
        return Promise.resolve(result as { data: Record<string, unknown>[] | null; error: { message: string } | null })
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(terminal),
          in: vi.fn(terminal),
        })),
      }
    }),
  }
  return { client, calls }
}

describe('loadFormResponsesForParticipants', () => {
  it('issues two queries for 500 participants, not 500', async () => {
    const participantIds = Array.from({ length: 500 }, (_, i) => `p-${i}`)
    const responseRows = participantIds.map((id, i) => ({
      participant_id: id,
      form_schema_id: i % 2 === 0 ? 'schema-v1' : 'schema-v2',
      responses_json: { voice: 'tenor' },
      created_at: '2026-01-01T00:00:00Z',
    }))

    const { client, calls } = stubClient({
      participant_form_responses: { data: responseRows, error: null },
      inscription_form_schemas: { data: [schemaV1, schemaV2], error: null },
    })

    const result = await loadFormResponsesForParticipants(client, participantIds)

    expect(calls).toEqual(['participant_form_responses', 'inscription_form_schemas'])
    expect(result).toHaveLength(500)
    expect(result[0]!.fields.find(f => f.id === 'voice')!.displayValue).toBe('Tenor')
    expect(result[1]!.fields.find(f => f.id === 'voice')!.displayValue).toBe('Tenor dramático')
  })

  it('skips the schema query entirely when nobody answered', async () => {
    const { client, calls } = stubClient({
      participant_form_responses: { data: [], error: null },
    })
    const result = await loadFormResponsesForParticipants(client, ['p1', 'p2'])
    expect(calls).toEqual(['participant_form_responses'])
    expect(result.every(r => r.fields.length === 0)).toBe(true)
  })

  it('queries nothing for an empty participant list', async () => {
    const { client, calls } = stubClient({})
    expect(await loadFormResponsesForParticipants(client, [])).toEqual([])
    expect(calls).toEqual([])
  })

  it('raises FormResponsesQueryError so the handler can hide the detail', async () => {
    const { client } = stubClient({
      participant_form_responses: { data: null, error: { message: 'permission denied for relation ...' } },
    })
    await expect(loadFormResponsesForParticipants(client, ['p1']))
      .rejects.toBeInstanceOf(FormResponsesQueryError)
  })
})

describe('loadContestParticipants', () => {
  it('returns the contest participants with their core columns', async () => {
    const { client, calls } = stubClient({
      participants: {
        data: [
          { id: 'p1', first_name: 'Ada', last_name: 'Lovelace', birthdate: '1990-01-01' },
          { id: 'p2', first_name: 'Alan', last_name: 'Turing', birthdate: '1991-02-02' },
        ],
        error: null,
      },
    })
    const rows = await loadContestParticipants(client, 'c1')
    expect(rows.map(r => r.id)).toEqual(['p1', 'p2'])
    expect(rows[0]).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace' })
    expect(calls).toEqual(['participants'])
  })

  it('raises FormResponsesQueryError on a database error', async () => {
    const { client } = stubClient({
      participants: { data: null, error: { message: 'boom' } },
    })
    await expect(loadContestParticipants(client, 'c1')).rejects.toBeInstanceOf(FormResponsesQueryError)
  })
})

// ─── Core fields come from the participant row, not from responses_json ──────
//
// The regression this covers (KAN-58): since KAN-56 the schema DECLARES core
// entries, but `prepareFormSubmission` strips them from the validated bag, so
// `responses_json` never holds them. Resolving them against `responses` alone
// made the organizer's viewer show name, surname and birthdate blank.

function coreField(id: string, label: string, type: FormField['type'], order: number): FormField {
  return field({ id, label, type, order, isCore: true, required: true } as Parameters<typeof field>[0])
}

const schemaWithCore: FormSchemaRow = {
  id: 'schema-core',
  version: 3,
  schema_json: [
    coreField('core.first_name', 'Nombre', 'text', 0),
    coreField('core.last_name', 'Apellidos', 'text', 1),
    coreField('core.birthdate', 'Fecha de nacimiento', 'date', 2),
    coreField('core.dni', 'DNI / NIE / Pasaporte', 'text', 3),
    coreField('core.country', 'País', 'text', 4),
    coreField('core.phone', 'Teléfono', 'phone', 5),
    coreField('core.email', 'Email', 'email', 6),
    field({ id: 'voice', type: 'select', label: 'Cuerda', order: 7, options: [
      { value: 'soprano', label: 'Soprano' },
    ] }),
  ],
}

// Exactly what the server stores: the organization's own questions only.
const coreRows: FormResponseRow[] = [{
  participant_id: 'p-core',
  form_schema_id: 'schema-core',
  responses_json: { voice: 'soprano' },
  created_at: '2026-05-01T10:00:00Z',
}]

const adaRow = {
  id: 'p-core',
  first_name: 'Ada',
  last_name: 'Lovelace',
  birthdate: '1990-04-11',
  dni: '12345678Z',
  country: 'ES',
  phone: '+34600112233',
  email: 'ada@example.com',
}

describe('core fields in the organizer viewer', () => {
  it('fills every core entry from the participant columns', () => {
    const [only] = buildParticipantResponses([adaRow], coreRows, [schemaWithCore])
    const byId = Object.fromEntries(only!.fields.map(f => [f.id, f]))

    expect(byId['core.first_name']).toMatchObject({ label: 'Nombre', value: 'Ada', displayValue: 'Ada' })
    expect(byId['core.last_name']).toMatchObject({ value: 'Lovelace', displayValue: 'Lovelace' })
    expect(byId['core.birthdate']).toMatchObject({ value: '1990-04-11', displayValue: '1990-04-11' })
    expect(byId['core.dni']).toMatchObject({ value: '12345678Z' })
    expect(byId['core.country']).toMatchObject({ value: 'ES' })
    expect(byId['core.phone']).toMatchObject({ value: '+34600112233' })
    expect(byId['core.email']).toMatchObject({ value: 'ada@example.com' })
  })

  it('is the regression: without the participant row the core entries stay blank', () => {
    // Precisely what the endpoint returned before this fix.
    const [only] = buildParticipantResponses(['p-core'], coreRows, [schemaWithCore])
    expect(only!.fields.find(f => f.id === 'core.first_name'))
      .toMatchObject({ value: null, displayValue: '' })
  })

  it('still resolves the organization own questions from responses_json', () => {
    const [only] = buildParticipantResponses([adaRow], coreRows, [schemaWithCore])
    expect(only!.fields.find(f => f.id === 'voice'))
      .toMatchObject({ value: 'soprano', displayValue: 'Soprano' })
  })

  it('keeps the schema order, core and custom interleaved as published', () => {
    const [only] = buildParticipantResponses([adaRow], coreRows, [schemaWithCore])
    expect(only!.fields.map(f => f.id)).toEqual([
      'core.first_name', 'core.last_name', 'core.birthdate', 'core.dni',
      'core.country', 'core.phone', 'core.email', 'voice',
    ])
  })

  it('leaves an optional core column empty rather than inventing a value', () => {
    const [only] = buildParticipantResponses([{ ...adaRow, phone: null }], coreRows, [schemaWithCore])
    expect(only!.fields.find(f => f.id === 'core.phone'))
      .toMatchObject({ value: null, displayValue: '' })
  })

  it('falls back to responses_json for a core id an older client wrote there', () => {
    // Belt and braces: core values should never be in the bag, but if a legacy
    // row has one and the column is empty, showing it beats losing it.
    const legacy: FormResponseRow[] = [{
      participant_id: 'p-core',
      form_schema_id: 'schema-core',
      responses_json: { voice: 'soprano', 'core.phone': '+34911223344' },
      created_at: '2026-05-01T10:00:00Z',
    }]
    const [only] = buildParticipantResponses([{ ...adaRow, phone: null }], legacy, [schemaWithCore])
    expect(only!.fields.find(f => f.id === 'core.phone')!.value).toBe('+34911223344')
  })

  it('prefers the typed column over a stale copy in responses_json', () => {
    const conflicting: FormResponseRow[] = [{
      participant_id: 'p-core',
      form_schema_id: 'schema-core',
      responses_json: { 'core.first_name': 'Nombre viejo' },
      created_at: '2026-05-01T10:00:00Z',
    }]
    const [only] = buildParticipantResponses([adaRow], conflicting, [schemaWithCore])
    expect(only!.fields.find(f => f.id === 'core.first_name')!.value).toBe('Ada')
  })

  it('keeps a participant with no response row on an empty list even with core data', () => {
    expect(buildParticipantResponses([adaRow], [], [schemaWithCore])[0]).toEqual({
      participantId: 'p-core',
      formSchemaId: null,
      schemaVersion: null,
      submittedAt: null,
      fields: [],
    })
  })

  it('resolves each participant against their own schema version AND their own columns', () => {
    const mixed: FormResponseRow[] = [
      ...coreRows,
      { participant_id: 'p-old', form_schema_id: 'schema-v1', responses_json: { voice: 'tenor' }, created_at: '2026-01-01T00:00:00Z' },
    ]
    const [ada, older] = buildParticipantResponses(
      [adaRow, { id: 'p-old', first_name: 'Alan' }],
      mixed,
      [schemaWithCore, schemaV1],
    )
    expect(ada!.schemaVersion).toBe(3)
    expect(ada!.fields.find(f => f.id === 'core.first_name')!.value).toBe('Ada')
    // schema-v1 declares no core entries at all, so nothing core surfaces.
    expect(older!.schemaVersion).toBe(1)
    expect(older!.fields.map(f => f.id)).toEqual(['voice', 'piece'])
  })
})

describe('PARTICIPANT_CORE_COLUMNS / toParticipantCoreRow', () => {
  it('names id plus every column the core catalogue writes to', () => {
    expect(PARTICIPANT_CORE_COLUMNS).toBe(
      'id, first_name, last_name, birthdate, dni, country, phone, email',
    )
  })

  it('narrows an untyped row and drops nulls', () => {
    expect(toParticipantCoreRow({ id: 'p1', first_name: 'Ada', phone: null, junk: 1 }))
      .toEqual({ id: 'p1', first_name: 'Ada' })
  })

  it('stringifies a non-string column rather than leaking the driver type', () => {
    expect(toParticipantCoreRow({ id: 'p1', birthdate: new Date('1990-04-11T00:00:00Z') }).birthdate)
      .toContain('1990')
  })
})

describe('loadFormResponsesForParticipants with core rows', () => {
  it('still issues two queries for 500 participants carrying core columns', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `p-${i}`,
      first_name: `Nombre ${i}`,
      last_name: 'Apellido',
      birthdate: '1990-01-01',
    }))
    const responseRows = rows.map(r => ({
      participant_id: r.id,
      form_schema_id: 'schema-core',
      responses_json: { voice: 'soprano' },
      created_at: '2026-01-01T00:00:00Z',
    }))

    const { client, calls } = stubClient({
      participant_form_responses: { data: responseRows, error: null },
      inscription_form_schemas: { data: [schemaWithCore], error: null },
    })

    const result = await loadFormResponsesForParticipants(client, rows)

    // Two here plus the caller's one participants query = three for the whole
    // viewer, for 500 inscriptions as for one.
    expect(calls).toEqual(['participant_form_responses', 'inscription_form_schemas'])
    expect(result).toHaveLength(500)
    expect(result[0]!.fields.find(f => f.id === 'core.first_name')!.value).toBe('Nombre 0')
    expect(result[499]!.fields.find(f => f.id === 'core.first_name')!.value).toBe('Nombre 499')
  })
})
