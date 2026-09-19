// Composers of the organisation's catalogue (KAN-16). ?q= searches ignoring accents.
import { defineEventHandler, getQuery } from 'h3'
import { withCatalog } from '~~/server/utils/works-catalog-handler'
import { listComposers } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'composers.list', (client, orgId) => {
  const query = getQuery(event)
  return listComposers(client, orgId, {
    q: typeof query.q === 'string' ? query.q : undefined,
    includeArchived: query.includeArchived === 'true',
  })
}))
