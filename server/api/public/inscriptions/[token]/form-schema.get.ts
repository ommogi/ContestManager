// server/api/public/inscriptions/[token]/form-schema.get.ts
// The field list the public inscription form must render, resolved for the
// contest behind a registration token (KAN-56).
//
// Deliberately a separate endpoint from `[token].get.ts`: that one answers with
// the contest and its categories and is consumed by the page on every load,
// and the form schema is an independent concern with its own fallback rules.
//
// Public on purpose — the inscription page is reachable without a session, and
// `get_inscription_form_schema` is SECURITY DEFINER and only ever returns the
// *published* schema. No draft, no unpublished version, nothing about other
// contests. The token is the capability.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import { parseSchemaFields } from '~~/server/utils/form-responses'
import { resolvePublishedFields } from '~~/shared/inscription-form-core'
import type { PublishedFormSchema } from '~~/shared/inscription-form'

interface ContestByTokenRow {
  id: string
}

interface PublishedSchemaRow {
  id: string
  version: number
  published_at: string | null
  schema_json: unknown
}

export default defineEventHandler(async (event): Promise<PublishedFormSchema> => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const client = serverSupabaseAdmin()

  const contestRes = await client.rpc('get_contest_by_token', { p_token: token })
  // The supabase-js mocks resolve with `{ data, error }` and never throw, so
  // every call is checked rather than wrapped in try/catch.
  if (contestRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'contest_lookup_failed' })
  }

  const contest = (contestRes.data as ContestByTokenRow[] | null)?.[0]
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  const schemaRes = await client.rpc('get_inscription_form_schema', { p_contest_id: contest.id })
  if (schemaRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'form_schema_lookup_failed' })
  }

  const row = (schemaRes.data as PublishedSchemaRow[] | null)?.[0] ?? null

  // No published schema is a normal state, not an error: the contest renders
  // the default core form, exactly as it does today.
  return {
    id: row?.id ?? null,
    version: row?.version ?? null,
    publishedAt: row?.published_at ?? null,
    fields: resolvePublishedFields(row ? parseSchemaFields(row.schema_json) : null),
  }
})
