// server/utils/works-catalog-handler.ts
// Shared shell of the catalogue endpoints (KAN-16): the organisation owner
// gate from ./supabase (not a new one), the "that org is yours" check the
// judge-pool endpoints also make, and turning CatalogError into a response.
import { createError, getRouterParam, type H3Event } from 'h3'
import { internalError, requireOrgOwner, serverSupabaseAdmin } from './supabase'
import { CatalogError } from '../services/works-catalog'
import type { SupabaseAdmin } from '../services/inscription-upload-purge'

export async function withCatalog<T>(
  event: H3Event,
  operation: string,
  run: (client: SupabaseAdmin, orgId: string) => Promise<T>,
): Promise<T> {
  const { org } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  if (orgId !== org.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  try {
    return await run(serverSupabaseAdmin() as unknown as SupabaseAdmin, orgId)
  } catch (err) {
    if (err instanceof CatalogError) {
      throw createError({
        statusCode: err.statusCode,
        statusMessage: err.code,
        message: err.userMessage,
        data: err.details,
      })
    }
    if ((err as { statusCode?: number })?.statusCode) throw err
    throw internalError(event, err, operation)
  }
}

export function requireParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) throw createError({ statusCode: 400, statusMessage: `Missing ${name}` })
  return value
}
