// Add a work to the catalogue (KAN-16).
import { defineEventHandler, readBody, createError } from 'h3'
import { withCatalog } from '~~/server/utils/works-catalog-handler'
import { WorkBodySchema } from '~~/server/utils/schemas'
import { createWork } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'works.create', async (client, orgId) => {
  const parsed = WorkBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  return createWork(client, orgId, parsed.data)
}))
