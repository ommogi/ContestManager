// server/services/works-catalog.ts
// An organisation's catalogue of composers and works (KAN-16).
//
// Every function is scoped by organization_id: the endpoints gate on
// requireOrgOwner and pass the caller's own org, and every query filters by
// it, so an id from another organisation simply matches nothing.
//
// Relative imports: vitest does not resolve Nitro's `~~/` alias.
import { catalogKey, similarComposers } from '../../shared/works-catalog'
import type { SupabaseAdmin } from './inscription-upload-purge'

export interface Composer {
  id: string
  name: string
  archived_at: string | null
}

export interface Work {
  id: string
  composer_id: string
  title: string
  catalog_ref: string | null
  duration_seconds: number | null
  archived_at: string | null
  composer?: { id: string; name: string } | null
}

export type CatalogErrorCode =
  | 'not_found'
  | 'composer_exists'
  | 'composer_similar'
  | 'work_exists'
  | 'composer_other_organization'

const STATUS: Record<CatalogErrorCode, number> = {
  not_found: 404,
  composer_exists: 409,
  composer_similar: 409,
  work_exists: 409,
  composer_other_organization: 400,
}

const MESSAGES: Record<CatalogErrorCode, string> = {
  not_found: 'No existe en el catálogo de tu organización.',
  composer_exists: 'Ese compositor ya está en el catálogo.',
  composer_similar: 'Hay compositores con un nombre parecido. Revisa que no sea el mismo.',
  work_exists: 'Esa obra ya está en el catálogo para este compositor.',
  composer_other_organization: 'El compositor no pertenece a tu organización.',
}

/** A refusal meant for the organisation, with whatever it needs to act on it. */
export class CatalogError extends Error {
  readonly statusCode: number
  readonly userMessage: string

  constructor(public readonly code: CatalogErrorCode, public readonly details?: unknown) {
    super(code)
    this.name = 'CatalogError'
    this.statusCode = STATUS[code]
    this.userMessage = MESSAGES[code]
  }
}

interface PgError { code?: string; message?: string }

function fail(operation: string, error: PgError): never {
  throw new Error(`${operation}: ${error.message ?? error.code ?? 'unknown'}`)
}

/**
 * Search terms go through the same key as the stored names, which leaves only
 * [a-z0-9 ]: nothing that could break out of a PostgREST filter.
 */
function searchPattern(q: string | undefined): string | null {
  const key = catalogKey(q)
  return key ? `%${key}%` : null
}

// ─── Composers ───────────────────────────────────────────────────────────────

export async function listComposers(
  client: SupabaseAdmin,
  orgId: string,
  options: { q?: string; includeArchived?: boolean } = {},
): Promise<Composer[]> {
  let query = client
    .from('composers')
    .select('id, name, archived_at')
    .eq('organization_id', orgId)
    .order('name_key', { ascending: true })
  const pattern = searchPattern(options.q)
  if (pattern) query = query.ilike('name_key', pattern)
  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query
  if (error) fail('composers.select', error)
  return (data as Composer[] | null) ?? []
}

/**
 * The same name (ignoring accents and case) is refused outright. A merely
 * similar one ("Rachmaninoff" when "Rachmaninov" exists) is refused unless the
 * caller says it saw the warning — which is the whole point of KAN-16.
 */
export async function createComposer(
  client: SupabaseAdmin,
  orgId: string,
  name: string,
  force = false,
): Promise<Composer> {
  const existing = await listComposers(client, orgId, { includeArchived: true })
  const key = catalogKey(name)
  const same = existing.find(c => catalogKey(c.name) === key)
  if (same) throw new CatalogError('composer_exists', { composer: same })

  if (!force) {
    const similar = similarComposers(name, existing)
    if (similar.length > 0) throw new CatalogError('composer_similar', { similar })
  }

  const { data, error } = await client
    .from('composers')
    .insert({ organization_id: orgId, name } as never)
    .select('id, name, archived_at')
    .single()
  // A concurrent insert of the same name loses to the unique index.
  if (error?.code === '23505') throw new CatalogError('composer_exists')
  if (error) fail('composers.insert', error)
  return data as Composer
}

export async function updateComposer(
  client: SupabaseAdmin,
  orgId: string,
  id: string,
  patch: { name?: string; archived?: boolean },
): Promise<Composer> {
  const updates: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const others = (await listComposers(client, orgId, { includeArchived: true })).filter(c => c.id !== id)
    const clash = others.find(c => catalogKey(c.name) === catalogKey(patch.name))
    if (clash) throw new CatalogError('composer_exists', { composer: clash })
    updates.name = patch.name
  }
  if (patch.archived !== undefined) updates.archived_at = patch.archived ? new Date().toISOString() : null

  const { data, error } = await client
    .from('composers')
    .update(updates as never)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id, name, archived_at')
    .maybeSingle()
  if (error?.code === '23505') throw new CatalogError('composer_exists')
  if (error) fail('composers.update', error)
  if (!data) throw new CatalogError('not_found')
  return data as Composer
}

// ─── Works ───────────────────────────────────────────────────────────────────

const WORK_COLUMNS = 'id, composer_id, title, catalog_ref, duration_seconds, archived_at, composer:composers(id, name)'

/** Search matches the title or the composer's name, accents and case ignored. */
export async function listWorks(
  client: SupabaseAdmin,
  orgId: string,
  options: { q?: string; composerId?: string; includeArchived?: boolean } = {},
): Promise<Work[]> {
  let query = client
    .from('works')
    .select(WORK_COLUMNS)
    .eq('organization_id', orgId)
    .order('title_key', { ascending: true })
    .limit(500)
  if (options.composerId) query = query.eq('composer_id', options.composerId)
  if (!options.includeArchived) query = query.is('archived_at', null)

  const pattern = searchPattern(options.q)
  if (pattern) {
    const composers = await listComposers(client, orgId, { q: options.q, includeArchived: true })
    const ids = composers.map(c => c.id)
    query = ids.length
      ? query.or(`title_key.ilike.${pattern},composer_id.in.(${ids.join(',')})`)
      : query.ilike('title_key', pattern)
  }

  const { data, error } = await query
  if (error) fail('works.select', error)
  return (data as unknown as Work[] | null) ?? []
}

function workError(operation: string, error: PgError): never {
  if (error.code === '23505') throw new CatalogError('work_exists')
  if ((error.message ?? '').includes('composer_other_organization')) {
    throw new CatalogError('composer_other_organization')
  }
  fail(operation, error)
}

export async function createWork(
  client: SupabaseAdmin,
  orgId: string,
  body: { composer_id: string; title: string; catalog_ref?: string | null; duration_seconds?: number | null },
): Promise<Work> {
  const { data, error } = await client
    .from('works')
    .insert({
      organization_id: orgId,
      composer_id: body.composer_id,
      title: body.title,
      catalog_ref: body.catalog_ref || null,
      duration_seconds: body.duration_seconds ?? null,
    } as never)
    .select(WORK_COLUMNS)
    .single()
  if (error) workError('works.insert', error)
  return data as unknown as Work
}

export async function updateWork(
  client: SupabaseAdmin,
  orgId: string,
  id: string,
  patch: {
    composer_id?: string
    title?: string
    catalog_ref?: string | null
    duration_seconds?: number | null
    archived?: boolean
  },
): Promise<Work> {
  const { archived, ...fields } = patch
  const updates: Record<string, unknown> = { ...fields }
  if ('catalog_ref' in fields) updates.catalog_ref = fields.catalog_ref || null
  if (archived !== undefined) updates.archived_at = archived ? new Date().toISOString() : null

  const { data, error } = await client
    .from('works')
    .update(updates as never)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select(WORK_COLUMNS)
    .maybeSingle()
  if (error) workError('works.update', error)
  if (!data) throw new CatalogError('not_found')
  return data as unknown as Work
}

// ─── Delete, or archive when in use ──────────────────────────────────────────

/**
 * KAN-16: "una obra en uso no se puede borrar; se archiva". Whatever uses a
 * row — a work for a composer, the KAN-17 repertoire for a work — references
 * it with ON DELETE RESTRICT, so the delete is simply tried and a foreign-key
 * refusal (23503) turns into archiving. No list of "users" to keep in sync.
 */
export async function deleteOrArchive(
  client: SupabaseAdmin,
  table: 'composers' | 'works',
  orgId: string,
  id: string,
): Promise<{ deleted: boolean; archived: boolean }> {
  const { data, error } = await client
    .from(table)
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')

  if (error?.code === '23503') {
    const { data: archived, error: archiveError } = await client
      .from(table)
      .update({ archived_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('id')
    if (archiveError) fail(`${table}.archive`, archiveError)
    if (!archived?.length) throw new CatalogError('not_found')
    return { deleted: false, archived: true }
  }
  if (error) fail(`${table}.delete`, error)
  if (!data?.length) throw new CatalogError('not_found')
  return { deleted: true, archived: false }
}
