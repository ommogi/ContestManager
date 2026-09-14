// server/api/contests/[id]/form-responses.get.ts
// Custom-form answers of every participant in a contest (organizers only).
//
// Feeds the inscriptions table and the CSV export. Each participant's answers
// are resolved against the schema version THEY answered, not against whatever
// is published today — see server/utils/form-responses.ts.
//
// Exactly three queries, whether the contest has 1 inscription or 500:
// participants (with the columns backing the core entries), their response
// rows, and the distinct schemas those rows point at.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import {
  loadContestParticipants,
  loadFormResponsesForParticipants,
  FormResponsesQueryError,
  type FormResponsesClient,
} from '~~/server/utils/form-responses'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  // Same gate as the three form-schema.* endpoints. 401 without a session,
  // 403 for an authenticated stranger.
  await requireOrgOwnerOrMember(event, contestId)

  const client = serverSupabaseAdmin() as unknown as FormResponsesClient

  try {
    const rows = await loadContestParticipants(client, contestId)
    const participants = await loadFormResponsesForParticipants(client, rows)
    return { contestId, participants }
  } catch (err) {
    if (err instanceof FormResponsesQueryError) {
      // Supabase error text can name columns and policies; log it, don't ship it.
      console.error('[form-responses] contest fetch failed:', err.message)
      throw createError({ statusCode: 500, statusMessage: 'internal_error' })
    }
    throw err
  }
})
