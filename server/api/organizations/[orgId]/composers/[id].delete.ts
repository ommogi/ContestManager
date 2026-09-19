// Delete a composer, or archive it when it still has works (KAN-16).
import { defineEventHandler } from 'h3'
import { requireParam, withCatalog } from '~~/server/utils/works-catalog-handler'
import { deleteOrArchive } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'composers.delete', (client, orgId) =>
  deleteOrArchive(client, 'composers', orgId, requireParam(event, 'id'))))
