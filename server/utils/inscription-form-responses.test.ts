import { describe, it, expect, vi } from 'vitest'
import type { FormField } from '../../shared/inscription-form'
import {
  MAX_RESPONSES_BYTES,
  coerceFormResponses,
  persistParticipantFormResponses,
  prepareFormSubmission,
  readPendingFormResponses,
  refreshPendingFormResponses,
  stashPendingFormResponses,
  type FormResponsesAdmin,
} from './inscription-form-responses'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const CONTEST_ID = 'cccccccc-0000-4000-8000-000000000001'
const SCHEMA_ID = 'ssssssss-0000-4000-8000-000000000001'
const OTHER_SCHEMA_ID = 'ssssssss-0000-4000-8000-000000000002'

function textField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: 'bio',
    type: 'textarea',
    label: 'Biografía',
    required: true,
    order: 0,
    hidden: false,
    validation: { required: true },
    ...overrides,
  } as FormField
}

/**
 * Stubs the two RPCs `loadPublishedFormSchema` makes. supabase-js resolves with
 * `{ data, error }` and never rejects, so these resolve too — a stub that threw
 * would test a code path that cannot happen in production.
 */
function rpcClient(opts: {
  contest?: { id: string } | null
  schemaRow?: Record<string, unknown> | null
  contestError?: { message: string }
  schemaError?: { message: string }
}) {
  return {
    rpc: vi.fn((fn: string) => {
      if (fn === 'get_contest_by_token') {
        return Promise.resolve({
          data: opts.contest === null ? [] : [opts.contest ?? { id: CONTEST_ID }],
          error: opts.contestError ?? null,
        })
      }
      return Promise.resolve({
        data: opts.schemaRow ? [opts.schemaRow] : [],
        error: opts.schemaError ?? null,
      })
    }),
  }
}

function publishedRow(fields: FormField[]) {
  return {
    id: SCHEMA_ID,
    version: 3,
    published_at: '2026-01-01T00:00:00Z',
    schema_json: fields,
  }
}

/** Records every write so the assertions can inspect what reached the database. */
function createMockAdmin(opts: {
  pendingRow?: Record<string, unknown> | null
  selectError?: { message: string } | null
  writeError?: { message: string } | null
} = {}) {
  const calls = {
    upserts: [] as Array<{ table: string; values: unknown; options: unknown }>,
    inserts: [] as Array<{ table: string; values: unknown }>,
    updates: [] as Array<{ table: string; values: unknown }>,
  }

  const admin = {
    from: (table: string) => ({
      upsert: (values: unknown, options: unknown) => {
        calls.upserts.push({ table, values, options })
        return Promise.resolve({ error: opts.writeError ?? null })
      },
      insert: (values: unknown) => {
        calls.inserts.push({ table, values })
        return Promise.resolve({ error: opts.writeError ?? null })
      },
      update: (values: unknown) => {
        calls.updates.push({ table, values })
        const result = { error: opts.writeError ?? null }
        const eq = () => {
          const chain = Promise.resolve(result) as Promise<typeof result> & {
            is: () => Promise<typeof result>
          }
          chain.is = () => Promise.resolve(result)
          return chain
        }
        return { eq }
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: opts.pendingRow ?? null,
            error: opts.selectError ?? null,
          }),
        }),
      }),
    }),
  } as unknown as FormResponsesAdmin

  return { admin, calls }
}

// ─────────────────────────────────────────────────────────────────────────────
// prepareFormSubmission
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareFormSubmission', () => {
  it('returns null when the contest has no published form', async () => {
    const client = rpcClient({ schemaRow: null })
    await expect(prepareFormSubmission(client, 'tok', {})).resolves.toBeNull()
  })

  it('rejects a body naming a schema when nothing is published', async () => {
    const client = rpcClient({ schemaRow: null })
    await expect(
      prepareFormSubmission(client, 'tok', { form_schema_id: SCHEMA_ID }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects answers written against a superseded schema version', async () => {
    const client = rpcClient({ schemaRow: publishedRow([textField()]) })
    await expect(
      prepareFormSubmission(client, 'tok', {
        form_schema_id: OTHER_SCHEMA_ID,
        responses: { bio: 'algo' },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: expect.stringContaining('ha cambiado'),
    })
  })

  it('validates even when the body omits `responses` entirely', async () => {
    // The hole this closes: a handcrafted request skipping a required field by
    // simply not sending the key.
    const client = rpcClient({ schemaRow: publishedRow([textField()]) })
    await expect(prepareFormSubmission(client, 'tok', {})).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'FORM_VALIDATION_FAILED' },
    })
  })

  it('rejects a required field left empty with a per-field 400', async () => {
    const client = rpcClient({ schemaRow: publishedRow([textField()]) })
    await expect(
      prepareFormSubmission(client, 'tok', {
        form_schema_id: SCHEMA_ID,
        responses: { bio: '   ' },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { errors: [expect.objectContaining({ fieldId: 'bio', type: 'required' })] },
    })
  })

  it('drops responses for ids the schema does not declare', async () => {
    const client = rpcClient({ schemaRow: publishedRow([textField()]) })
    const submission = await prepareFormSubmission(client, 'tok', {
      form_schema_id: SCHEMA_ID,
      responses: { bio: 'hola', injected: 'no debería guardarse' },
    })
    expect(submission).toEqual({ formSchemaId: SCHEMA_ID, responses: { bio: 'hola' } })
  })

  it('accepts a 5.000-character textarea', async () => {
    const long = 'á'.repeat(5000)
    const client = rpcClient({ schemaRow: publishedRow([textField()]) })
    const submission = await prepareFormSubmission(client, 'tok', {
      form_schema_id: SCHEMA_ID,
      responses: { bio: long },
    })
    expect(submission?.responses.bio).toHaveLength(5000)
  })

  it('refuses a payload past the size ceiling with 413', async () => {
    const client = rpcClient({
      schemaRow: publishedRow([textField({ required: false, validation: {} })]),
    })
    await expect(
      prepareFormSubmission(client, 'tok', {
        form_schema_id: SCHEMA_ID,
        responses: { bio: 'x'.repeat(MAX_RESPONSES_BYTES + 1) },
      }),
    ).rejects.toMatchObject({ statusCode: 413 })
  })

  it('maps an unknown token to 404', async () => {
    const client = rpcClient({ contest: null })
    await expect(prepareFormSubmission(client, 'tok', {})).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('does not leak the database message when the lookup fails', async () => {
    const client = rpcClient({ contestError: { message: 'relation "contests" does not exist' } })
    await expect(prepareFormSubmission(client, 'tok', {})).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'internal_error',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// coerceFormResponses
// ─────────────────────────────────────────────────────────────────────────────

describe('coerceFormResponses', () => {
  it('keeps every legal response shape and drops the rest', () => {
    expect(coerceFormResponses({
      text: 'a',
      num: 3,
      bool: true,
      empty: null,
      list: ['a', 'b'],
      files: [{ path: 'p', name: 'n', size: 1, mimeType: 'text/plain', uploadedAt: 'now' }],
      nested: { a: 1 },
      mixed: ['a', 2],
    })).toEqual({
      text: 'a',
      num: 3,
      bool: true,
      empty: null,
      list: ['a', 'b'],
      files: [{ path: 'p', name: 'n', size: 1, mimeType: 'text/plain', uploadedAt: 'now' }],
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

describe('persistParticipantFormResponses', () => {
  it('upserts on the unique pair rather than inserting', async () => {
    const { admin, calls } = createMockAdmin()
    await persistParticipantFormResponses(admin, 'part-1', {
      formSchemaId: SCHEMA_ID,
      responses: { bio: 'hola' },
    })
    expect(calls.inserts).toHaveLength(0)
    expect(calls.upserts).toEqual([{
      table: 'participant_form_responses',
      values: {
        participant_id: 'part-1',
        form_schema_id: SCHEMA_ID,
        responses_json: { bio: 'hola' },
      },
      options: { onConflict: 'participant_id,form_schema_id' },
    }])
  })

  it('throws on the supabase error object instead of ignoring it', async () => {
    // supabase-js resolves with `{ error }`; a try/catch here would catch nothing.
    const { admin } = createMockAdmin({ writeError: { message: 'permission denied' } })
    await expect(
      persistParticipantFormResponses(admin, 'part-1', { formSchemaId: SCHEMA_ID, responses: {} }),
    ).rejects.toThrow('participant_form_responses: permission denied')
  })
})

describe('stashPendingFormResponses', () => {
  it('returns a metadata-safe id and keeps the long answer out of it', async () => {
    const long = 'x'.repeat(5000)
    const { admin, calls } = createMockAdmin()
    const draftId = await stashPendingFormResponses(admin, {
      contestId: CONTEST_ID,
      userId: 'u1',
      submission: { formSchemaId: SCHEMA_ID, responses: { bio: long } },
    })

    // Stripe caps a metadata value at 500 characters; a uuid is 36.
    expect(draftId).toHaveLength(36)
    expect(draftId.length).toBeLessThanOrEqual(500)
    expect(draftId).not.toContain('x'.repeat(10))

    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0]).toMatchObject({
      table: 'pending_form_responses',
      values: { id: draftId, contest_id: CONTEST_ID, form_schema_id: SCHEMA_ID, user_id: 'u1' },
    })
    const values = calls.inserts[0]!.values as { responses_json: { bio: string } }
    expect(values.responses_json.bio).toHaveLength(5000)
  })

  it('throws when the draft cannot be written', async () => {
    const { admin } = createMockAdmin({ writeError: { message: 'disk full' } })
    await expect(
      stashPendingFormResponses(admin, {
        contestId: CONTEST_ID,
        userId: null,
        submission: { formSchemaId: SCHEMA_ID, responses: {} },
      }),
    ).rejects.toThrow('pending_form_responses insert: disk full')
  })
})

describe('refreshPendingFormResponses', () => {
  it('overwrites the draft a reused checkout session points at', async () => {
    const { admin, calls } = createMockAdmin()
    await refreshPendingFormResponses(admin, 'draft-1', {
      formSchemaId: SCHEMA_ID,
      responses: { bio: 'nueva respuesta' },
    })
    expect(calls.updates).toEqual([{
      table: 'pending_form_responses',
      values: { form_schema_id: SCHEMA_ID, responses_json: { bio: 'nueva respuesta' } },
    }])
  })
})

describe('readPendingFormResponses', () => {
  it('resolves a draft id back into answers', async () => {
    const { admin } = createMockAdmin({
      pendingRow: { form_schema_id: SCHEMA_ID, responses_json: { bio: 'hola' } },
    })
    await expect(readPendingFormResponses(admin, 'draft-1')).resolves.toEqual({
      formSchemaId: SCHEMA_ID,
      responses: { bio: 'hola' },
    })
  })

  it('returns null for a draft that no longer exists', async () => {
    const { admin } = createMockAdmin({ pendingRow: null })
    await expect(readPendingFormResponses(admin, 'draft-1')).resolves.toBeNull()
  })

  it('throws on a select error rather than treating it as an empty draft', async () => {
    const { admin } = createMockAdmin({ selectError: { message: 'timeout' } })
    await expect(readPendingFormResponses(admin, 'draft-1')).rejects.toThrow(
      'pending_form_responses select: timeout',
    )
  })
})
