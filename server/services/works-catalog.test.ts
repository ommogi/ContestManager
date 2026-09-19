import { describe, it, expect } from 'vitest'
import { CatalogError, createComposer, deleteOrArchive, listWorks } from './works-catalog'
import type { SupabaseAdmin } from './inscription-upload-purge'

// A chainable fake of supabase-js: every filter is recorded, and the terminal
// call resolves with whatever the test scripted for that table and operation.
type Result = { data: unknown; error: { code?: string; message?: string } | null }

function createClient(script: Record<string, Result | Result[]>) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, ...unknown[]]>; payload?: unknown }> = []

  function next(key: string): Result {
    const entry = script[key]
    if (Array.isArray(entry)) return entry.shift() ?? { data: null, error: null }
    return entry ?? { data: [], error: null }
  }

  const client = {
    from(table: string) {
      const call = { table, op: 'select', filters: [] as Array<[string, ...unknown[]]>, payload: undefined as unknown }
      calls.push(call)
      const api: any = {
        select: () => api,
        insert: (p: unknown) => { call.op = 'insert'; call.payload = p; return api },
        update: (p: unknown) => { call.op = 'update'; call.payload = p; return api },
        delete: () => { call.op = 'delete'; return api },
        then: (resolve: (r: Result) => void, reject: (e: unknown) => void) =>
          Promise.resolve(next(`${table}.${call.op}`)).then(resolve, reject),
        single: async () => next(`${table}.${call.op}`),
        maybeSingle: async () => next(`${table}.${call.op}`),
      }
      for (const f of ['eq', 'is', 'ilike', 'or', 'order', 'limit']) {
        api[f] = (...args: unknown[]) => { call.filters.push([f, ...args]); return api }
      }
      return api
    },
  } as unknown as SupabaseAdmin

  return { client, calls }
}

describe('createComposer', () => {
  const existing = { data: [{ id: 'c1', name: 'Sergei Rachmaninov', archived_at: null }], error: null }

  it('refuses the same name spelt with other accents or case', async () => {
    const { client } = createClient({ 'composers.select': existing })
    await expect(createComposer(client, 'org-1', 'SERGEI RACHMÁNINOV'))
      .rejects.toMatchObject({ code: 'composer_exists', statusCode: 409 })
  })

  // The KAN-16 case: a variant the unique key cannot catch.
  it('stops on a look-alike and names it', async () => {
    const { client } = createClient({ 'composers.select': existing })
    const run = createComposer(client, 'org-1', 'S. Rachmaninoff')
    await expect(run).rejects.toBeInstanceOf(CatalogError)
    await expect(run).rejects.toMatchObject({ code: 'composer_similar', details: { similar: [{ id: 'c1' }] } })
  })

  it('creates the look-alike once the warning was seen', async () => {
    const created = { id: 'c2', name: 'S. Rachmaninoff', archived_at: null }
    const { client, calls } = createClient({
      'composers.select': existing,
      'composers.insert': { data: created, error: null },
    })
    await expect(createComposer(client, 'org-1', 'S. Rachmaninoff', true)).resolves.toEqual(created)
    expect(calls.find(c => c.op === 'insert')?.payload).toEqual({ organization_id: 'org-1', name: 'S. Rachmaninoff' })
  })

  it('turns a race on the unique index into composer_exists', async () => {
    const { client } = createClient({
      'composers.select': { data: [], error: null },
      'composers.insert': { data: null, error: { code: '23505' } },
    })
    await expect(createComposer(client, 'org-1', 'Albéniz')).rejects.toMatchObject({ code: 'composer_exists' })
  })
})

describe('deleteOrArchive', () => {
  it('deletes a row nothing uses', async () => {
    const { client } = createClient({ 'works.delete': { data: [{ id: 'w1' }], error: null } })
    await expect(deleteOrArchive(client, 'works', 'org-1', 'w1')).resolves.toEqual({ deleted: true, archived: false })
  })

  // KAN-16: "una obra en uso no se puede borrar; se archiva".
  it('archives when a foreign key refuses the delete', async () => {
    const { client, calls } = createClient({
      'composers.delete': { data: null, error: { code: '23503' } },
      'composers.update': { data: [{ id: 'c1' }], error: null },
    })
    await expect(deleteOrArchive(client, 'composers', 'org-1', 'c1')).resolves.toEqual({ deleted: false, archived: true })
    const update = calls.find(c => c.op === 'update')!
    expect(update.payload).toMatchObject({ archived_at: expect.any(String) })
    expect(update.filters).toContainEqual(['eq', 'organization_id', 'org-1'])
  })

  it('reports a row of another organisation as not found', async () => {
    const { client } = createClient({ 'works.delete': { data: [], error: null } })
    await expect(deleteOrArchive(client, 'works', 'org-1', 'someone-elses')).rejects.toMatchObject({ code: 'not_found', statusCode: 404 })
  })
})

describe('listWorks', () => {
  it('searches title or composer with the accent-free key', async () => {
    const { client, calls } = createClient({
      'composers.select': { data: [{ id: 'c1', name: 'Rachmaninov', archived_at: null }], error: null },
      'works.select': { data: [], error: null },
    })
    await listWorks(client, 'org-1', { q: 'Rachmáninov' })

    const works = calls.find(c => c.table === 'works')!
    expect(works.filters).toContainEqual(['eq', 'organization_id', 'org-1'])
    expect(works.filters).toContainEqual(['or', 'title_key.ilike.%rachmaninov%,composer_id.in.(c1)'])
    expect(works.filters).toContainEqual(['is', 'archived_at', null])
  })

  it('cannot be steered by filter syntax in the search text', async () => {
    const { client, calls } = createClient({ 'composers.select': { data: [], error: null } })
    await listWorks(client, 'org-1', { q: 'x),organization_id.neq.(' })
    const works = calls.find(c => c.table === 'works')!
    expect(works.filters).toContainEqual(['ilike', 'title_key', '%x organization id neq%'])
  })
})
