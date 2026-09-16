import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import {
  collectUploadPathsToPurge,
  removeUploadObjects,
} from '~~/server/services/inscription-upload-purge'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const client = serverSupabaseAdmin()
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'ID or Slug is required' })

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)

  // Resolve to id scoped to user's org (slug is unique per org)
  let q = client.from('contests').select('id').limit(1)
  if (isUUID) {
    q = q.eq('id', idOrSlug).eq('organization_id', org.id)
  } else {
    q = q.eq('slug', idOrSlug).eq('organization_id', org.id)
  }
  const { data: row } = await q.maybeSingle()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })

  const contestId = (row as any).id as string

  // ── Uploaded files ─────────────────────────────────────────────────────────
  //
  // `inscription_uploads.contest_id` is ON DELETE CASCADE, so the delete below
  // takes the ledger rows with it and leaves the Storage objects with nothing
  // pointing at them. Unlike a deleted participant — whose row survives the
  // delete and gets stamped `purge_after` by a trigger — nothing could ever find
  // these again, so the keys are read while they still exist.
  //
  // Read failures are fatal on purpose: the alternative is deleting the contest
  // and leaking its files with no record that they were ever there.
  let paths: string[] = []
  try {
    paths = await collectUploadPathsToPurge(client, { contestIds: [contestId] })
  } catch (e) {
    console.error('[contests.delete] could not read upload paths:', (e as Error)?.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  const { error } = await client.from('contests').delete().eq('id', contestId)
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Objects after the row, never before: a crash in between leaks storage, which
  // is what happened anyway until now. The other order would destroy the files
  // of a contest that still exists.
  //
  // Best-effort, and loud. The contest is gone; answering 500 because its
  // cleanup stumbled would describe the wrong thing. The log carries the keys so
  // whatever is left can be removed by hand.
  if (paths.length > 0) {
    const { removed, failures } = await removeUploadObjects(client, paths)
    for (const failure of failures) {
      console.error(
        `[contests.delete] ${failure.paths.length} object(s) left in the bucket for ` +
        `contest ${contestId}: ${failure.message}`,
        failure.paths,
      )
    }
    if (removed > 0) {
      console.info(`[contests.delete] removed ${removed} upload(s) for contest ${contestId}`)
    }
  }

  return { success: true }
})
