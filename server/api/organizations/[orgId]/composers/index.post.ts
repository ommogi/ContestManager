// Add a composer (KAN-16). 409 composer_exists for the same name ignoring
// accents; 409 composer_similar with the look-alikes unless `force` is set.
import { defineEventHandler, readBody, createError } from 'h3'
import { withCatalog } from '~~/server/utils/works-catalog-handler'
import { ComposerBodySchema } from '~~/server/utils/schemas'
import { createComposer } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'composers.create', async (client, orgId) => {
  const parsed = ComposerBodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  return createComposer(client, orgId, parsed.data.name, parsed.data.force)
}))
