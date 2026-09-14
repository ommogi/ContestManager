// GET /api/public/inscriptions/:token/form-schema  (KAN-44)
//
// Public, unauthenticated. The invitation token is the only credential: it is
// resolved through `get_contest_by_token`, the same path
// `server/api/public/inscriptions/[token].get.ts` uses, so revoking or
// rotating a token closes this endpoint at the same instant.
//
// Serves only the published schema. `get_inscription_form_schema` filters
// `is_published = true` and orders by `version desc` inside the function, so
// drafts and superseded versions are unreachable from here — the handler
// never sees them and so cannot leak them.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import {
  FormSchemaLookupError,
  loadPublishedFormSchema,
} from '~~/server/utils/inscription-form-schema'
import type { PublishedFormSchema } from '#shared/inscription-form'

export default defineEventHandler(async (event): Promise<PublishedFormSchema> => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  try {
    // Admin client because the RPCs are SECURITY DEFINER and there is no user
    // session to gate on — the token *is* the gate. Nothing beyond the
    // published schema is read, and no row is written.
    return await loadPublishedFormSchema(serverSupabaseAdmin(), token)
  } catch (e) {
    if (e instanceof FormSchemaLookupError) {
      if (e.reason === 'contest_not_found') {
        // Same statusMessage as [token].get.ts, so a bad token is
        // indistinguishable between the two endpoints.
        throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
      }
      // Database detail stays in the logs (KAN-43): a public caller gets a
      // generic 500.
      console.error('[form-schema] lookup failed:', e.reason, e.message)
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
    throw e
  }
})
