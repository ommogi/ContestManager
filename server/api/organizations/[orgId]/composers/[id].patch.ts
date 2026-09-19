// Rename, archive or restore a composer (KAN-16).
import { defineEventHandler, readBody, createError } from 'h3'
import { requireParam, withCatalog } from '~~/server/utils/works-catalog-handler'
import { ComposerPatchSchema } from '~~/server/utils/schemas'
import { updateComposer } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'composers.update', async (client, orgId) => {
  const parsed = ComposerPatchSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  return updateComposer(client, orgId, requireParam(event, 'id'), parsed.data)
}))
