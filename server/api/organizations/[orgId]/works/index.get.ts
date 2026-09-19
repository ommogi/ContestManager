// Works of the organisation's catalogue (KAN-16). ?q= matches title or
// composer, accents and case ignored; ?composerId=, ?includeArchived=true.
import { defineEventHandler, getQuery } from 'h3'
import { withCatalog } from '~~/server/utils/works-catalog-handler'
import { listWorks } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'works.list', (client, orgId) => {
  const query = getQuery(event)
  return listWorks(client, orgId, {
    q: typeof query.q === 'string' ? query.q : undefined,
    composerId: typeof query.composerId === 'string' ? query.composerId : undefined,
    includeArchived: query.includeArchived === 'true',
  })
}))
