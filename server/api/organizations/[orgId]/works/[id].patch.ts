// Edit, archive or restore a work (KAN-16).
import { defineEventHandler, readBody, createError } from 'h3'
import { requireParam, withCatalog } from '~~/server/utils/works-catalog-handler'
import { WorkPatchSchema } from '~~/server/utils/schemas'
import { updateWork } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'works.update', async (client, orgId) => {
  const parsed = WorkPatchSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  return updateWork(client, orgId, requireParam(event, 'id'), parsed.data)
}))
