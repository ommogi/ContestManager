// Delete a work, or archive it when it is in use (KAN-16).
import { defineEventHandler } from 'h3'
import { requireParam, withCatalog } from '~~/server/utils/works-catalog-handler'
import { deleteOrArchive } from '~~/server/services/works-catalog'

export default defineEventHandler(event => withCatalog(event, 'works.delete', (client, orgId) =>
  deleteOrArchive(client, 'works', orgId, requireParam(event, 'id'))))
