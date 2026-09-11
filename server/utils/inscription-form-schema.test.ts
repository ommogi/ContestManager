import { describe, it, expect } from 'vitest'
import {
  FormSchemaLookupError,
  emptyPublishedFormSchema,
  loadPublishedFormSchema,
  normalizeFields,
  type FormSchemaRpcClient,
  type RpcResult,
} from './inscription-form-schema'

// supabase-js resolves with `{ data, error }` and does not reject on a
// database error. These stubs behave the same way — a stub that threw would
// pass tests the real client could never satisfy (the KAN-60/KAN-63 failure).
function stubClient(responses: Record<string, RpcResult<unknown>>): FormSchemaRpcClient & { calls: Array<{ fn: string, params: Record<string, unknown> }> } {
  const calls: Array<{ fn: string, params: Record<string, unknown> }> = []
  return {
    calls,
    rpc(fn: string, params: Record<string, unknown>) {
      calls.push({ fn, params })
      return Promise.resolve(responses[fn] ?? { data: null, error: null })
    },
  }
}

const contestOk = { data: [{ id: 'contest-1' }], error: null }

function fieldRow(id: string, order = 0) {
  return { id, type: 'text', label: `Campo ${id}`, required: false, order, hidden: false, validation: {} }
}

describe('loadPublishedFormSchema', () => {
  it('resolves the token through get_contest_by_token, not a table query', async () => {
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: { data: [], error: null },
    })
    await loadPublishedFormSchema(client, 'tok-123')

    expect(client.calls[0]).toEqual({ fn: 'get_contest_by_token', params: { p_token: 'tok-123' } })
    expect(client.calls[1]).toEqual({
      fn: 'get_inscription_form_schema',
      params: { p_contest_id: 'contest-1' },
    })
  })

  it('returns the published schema with id, version and publishedAt', async () => {
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: {
        data: [{
          id: 'schema-3',
          version: 3,
          published_at: '2026-09-01T10:00:00Z',
          schema_json: [fieldRow('a'), fieldRow('b', 1)],
        }],
        error: null,
      },
    })

    const result = await loadPublishedFormSchema(client, 'tok')
    expect(result.id).toBe('schema-3')
    expect(result.version).toBe(3)
    expect(result.publishedAt).toBe('2026-09-01T10:00:00Z')
    expect(result.fields.map(f => f.id)).toEqual(['a', 'b'])
  })

  it('returns an empty schema, not an error, when nothing is published', async () => {
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: { data: [], error: null },
    })
    await expect(loadPublishedFormSchema(client, 'tok')).resolves.toEqual({
      id: null, version: null, publishedAt: null, fields: [],
    })
  })

  it('returns an empty schema when the rpc answers null', async () => {
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: { data: null, error: null },
    })
    await expect(loadPublishedFormSchema(client, 'tok')).resolves.toEqual(emptyPublishedFormSchema())
  })

  it('flags an unknown token as contest_not_found', async () => {
    const client = stubClient({ get_contest_by_token: { data: [], error: null } })
    await expect(loadPublishedFormSchema(client, 'bad')).rejects.toMatchObject({
      reason: 'contest_not_found',
      message: 'Contest not found',
    })
  })

  it('does not look up a schema once the token fails to resolve', async () => {
    const client = stubClient({ get_contest_by_token: { data: null, error: null } })
    await expect(loadPublishedFormSchema(client, 'bad')).rejects.toBeInstanceOf(FormSchemaLookupError)
    expect(client.calls.map(c => c.fn)).toEqual(['get_contest_by_token'])
  })

  it('surfaces a token lookup error distinctly from a missing contest', async () => {
    const client = stubClient({
      get_contest_by_token: { data: null, error: { message: 'connection reset' } },
    })
    await expect(loadPublishedFormSchema(client, 'tok')).rejects.toMatchObject({
      reason: 'contest_lookup_failed',
      message: 'connection reset',
    })
  })

  it('surfaces a schema lookup error', async () => {
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: { data: null, error: { message: 'permission denied' } },
    })
    await expect(loadPublishedFormSchema(client, 'tok')).rejects.toMatchObject({
      reason: 'schema_lookup_failed',
    })
  })

  it('ignores a bare schema_json array instead of reading a field as a schema row', async () => {
    // Guards the pre-KAN-62 RPC shape. A FormField also has a string `id`, so
    // a looser row check would return { id: 'a', version: null, fields: [] } —
    // a wrong answer that no test would otherwise catch.
    const client = stubClient({
      get_contest_by_token: contestOk,
      get_inscription_form_schema: { data: [fieldRow('a')], error: null },
    })
    await expect(loadPublishedFormSchema(client, 'tok')).resolves.toEqual(emptyPublishedFormSchema())
  })

  it('tolerates a single row returned unwrapped', async () => {
    const client = stubClient({
      get_contest_by_token: { data: { id: 'contest-1' }, error: null },
      get_inscription_form_schema: {
        data: { id: 's1', version: 1, published_at: null, schema_json: [fieldRow('a')] },
        error: null,
      },
    })
    const result = await loadPublishedFormSchema(client, 'tok')
    expect(result.id).toBe('s1')
    expect(result.fields).toHaveLength(1)
  })
})

describe('normalizeFields', () => {
  it('keeps field-shaped entries', () => {
    expect(normalizeFields([fieldRow('a')])).toHaveLength(1)
  })

  it('drops entries that would crash the renderer', () => {
    expect(normalizeFields([fieldRow('a'), { id: 'b' }, null, 'x', 42])).toHaveLength(1)
  })

  it('unwraps the legacy { fields: [...] } envelope', () => {
    expect(normalizeFields({ fields: [fieldRow('a')] })).toHaveLength(1)
  })

  it('returns an empty array for junk', () => {
    expect(normalizeFields(null)).toEqual([])
    expect(normalizeFields('nope')).toEqual([])
    expect(normalizeFields({})).toEqual([])
  })
})
