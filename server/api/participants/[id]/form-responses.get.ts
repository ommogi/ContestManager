// server/api/participants/[id]/form-responses.get.ts
// One participant's custom-form answers (organizers only), for the detail panel.
//
// The route parameter is a participant, not a contest, so the contest has to be
// resolved first and the existing gate applied to THAT contest — otherwise the
// endpoint would be a way to read any participant of any contest.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import {
  loadFormResponsesForParticipants,
  FormResponsesQueryError,
  type FormResponsesClient,
} from '~~/server/utils/form-responses'

export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) throw createError({ statusCode: 400, statusMessage: 'Missing participant ID' })

  const admin = serverSupabaseAdmin()

  const { data: participant, error } = await admin
    .from('participants')
    .select('id, contest_id')
    .eq('id', participantId)
    .maybeSingle()

  if (error) {
    console.error('[form-responses] participant lookup failed:', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!participant) {
    throw createError({ statusCode: 404, statusMessage: 'participant_not_found' })
  }

  await requireOrgOwnerOrMember(event, String(participant.contest_id))

  try {
    const [resolved] = await loadFormResponsesForParticipants(
      admin as unknown as FormResponsesClient,
      [participantId],
    )
    // loadFormResponsesForParticipants always returns one entry per requested
    // id, so the fallback only guards against a future refactor.
    return resolved ?? {
      participantId,
      formSchemaId: null,
      schemaVersion: null,
      submittedAt: null,
      fields: [],
    }
  } catch (err) {
    if (err instanceof FormResponsesQueryError) {
      console.error('[form-responses] participant fetch failed:', err.message)
      throw createError({ statusCode: 500, statusMessage: 'internal_error' })
    }
    throw err
  }
})
