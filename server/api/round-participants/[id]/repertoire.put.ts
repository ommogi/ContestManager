// Replace a participant's repertoire for a round (KAN-17). Pending rounds only;
// the RPC enforces that and the catalogue scope. Organisers only.
import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { RepertoireBodySchema } from '~~/server/utils/schemas'
import { contestOfRoundParticipant, RepertoireError, saveRepertoire } from '~~/server/services/repertoire'
import type { SupabaseAdmin } from '~~/server/services/inscription-upload-purge'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })
  const client = serverSupabaseAdmin() as unknown as SupabaseAdmin

  try {
    await requireContestOrganizer(event, await contestOfRoundParticipant(client, id))

    const parsed = RepertoireBodySchema.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
    }
    return await saveRepertoire(client, id, parsed.data.items)
  } catch (err) {
    if (err instanceof RepertoireError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.code, message: err.userMessage })
    }
    if ((err as { statusCode?: number })?.statusCode) throw err
    throw internalError(event, err, 'repertoire.save')
  }
})
