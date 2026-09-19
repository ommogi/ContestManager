// A participant's repertoire for a round (KAN-17), with its total and the
// previous round's list to copy from. Organisers only.
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { contestOfRoundParticipant, loadRepertoire, RepertoireError } from '~~/server/services/repertoire'
import type { SupabaseAdmin } from '~~/server/services/inscription-upload-purge'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })
  const client = serverSupabaseAdmin() as unknown as SupabaseAdmin

  try {
    await requireContestOrganizer(event, await contestOfRoundParticipant(client, id))
    return await loadRepertoire(client, id)
  } catch (err) {
    if (err instanceof RepertoireError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.code, message: err.userMessage })
    }
    if ((err as { statusCode?: number })?.statusCode) throw err
    throw internalError(event, err, 'repertoire.load')
  }
})
