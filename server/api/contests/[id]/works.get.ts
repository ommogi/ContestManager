// Search the catalogue of the contest's organisation (KAN-17). The catalogue
// endpoints of KAN-16 are owner-only; organisers of a contest need to pick
// works for its participants too. Active works only.
import { defineEventHandler, createError, getRouterParam, getQuery } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { listWorks } from '~~/server/services/works-catalog'
import type { SupabaseAdmin } from '~~/server/services/inscription-upload-purge'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })
  await requireContestOrganizer(event, contestId)

  const client = serverSupabaseAdmin() as unknown as SupabaseAdmin
  const { data: contest, error } = await client
    .from('contests')
    .select('organization_id')
    .eq('id', contestId)
    .maybeSingle()
  if (error) throw internalError(event, error, 'contests.select')
  const orgId = (contest as { organization_id: string } | null)?.organization_id
  if (!orgId) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })

  const query = getQuery(event)
  try {
    return await listWorks(client, orgId, { q: typeof query.q === 'string' ? query.q : undefined })
  } catch (err) {
    throw internalError(event, err, 'works.list')
  }
})
