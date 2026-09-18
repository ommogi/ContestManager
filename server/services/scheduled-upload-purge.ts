// server/services/scheduled-upload-purge.ts
// One run of the scheduled purge of inscription uploads (KAN-59, KAN-69).
//
// The database decides WHAT is purgeable (the participant-delete trigger, the
// orphan sweep and `confirm_inscription_uploads` stamp `purge_after`); this
// deletes the objects. Migration 0062 has pg_cron call the endpoint that wraps
// this every 15 minutes.
//
// Lives outside the handler so vitest can reach it — same split as
// ./stripe-webhook.ts. Relative imports for the same reason: vitest does not
// resolve Nitro's `~~/` alias.
import { INSCRIPTION_UPLOADS_BUCKET } from '../utils/inscription-uploads'
import type { SupabaseAdmin } from './inscription-upload-purge'

/** Job name in `maintenance_runs` and in `cron.job`. */
export const PURGE_JOB_NAME = 'purge-inscription-uploads'

/** How many objects to delete per run. Keeps the request bounded. */
export const PURGE_BATCH_SIZE = 200

export interface PurgeRunOptions {
  ttlHours: number
  /** Skip the orphan sweep and only delete what is already marked. */
  skipSweep?: boolean
}

export interface PurgeRunResult {
  swept: number
  deleted: number
  /** A full batch means there is very likely more; the next run takes it. */
  hasMore: boolean
}

/** A failed step, with the code the endpoint answers with. */
export class PurgeRunError extends Error {
  constructor(public readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'PurgeRunError'
  }
}

async function purge(client: SupabaseAdmin, options: PurgeRunOptions): Promise<PurgeRunResult> {
  let swept = 0
  if (!options.skipSweep) {
    const sweepRes = await client.rpc('sweep_orphan_inscription_uploads', {
      p_ttl_hours: options.ttlHours,
    } as never)
    // A failed sweep is not fatal: whatever was already marked can still be
    // purged below.
    if (!sweepRes.error) swept = Number(sweepRes.data ?? 0)
  }

  const { data, error } = await client
    .from('inscription_uploads')
    .select('id, path')
    .not('purge_after', 'is', null)
    .lte('purge_after', new Date().toISOString())
    .limit(PURGE_BATCH_SIZE)

  if (error) throw new PurgeRunError('purge_lookup_failed', error.message)

  const due = (data as { id: string; path: string }[] | null) ?? []
  if (due.length === 0) return { swept, deleted: 0, hasMore: false }

  const removeRes = await client.storage
    .from(INSCRIPTION_UPLOADS_BUCKET)
    .remove(due.map(row => row.path))

  if (removeRes.error) throw new PurgeRunError('purge_remove_failed', removeRes.error.message)

  // Ledger rows go only after the objects are gone. If this delete fails the
  // rows stay marked and the next run retries — deleting an already-deleted
  // object is a no-op, so the retry is safe.
  const { error: deleteError } = await client
    .from('inscription_uploads')
    .delete()
    .in('id', due.map(row => row.id))

  if (deleteError) throw new PurgeRunError('purge_cleanup_failed', deleteError.message)

  return { swept, deleted: due.length, hasMore: due.length === PURGE_BATCH_SIZE }
}

/**
 * Best-effort: a trace that cannot be written must not turn a purge that
 * worked into a failed request, nor hide the error of one that did not.
 */
async function recordRun(
  client: SupabaseAdmin,
  row: { swept: number; deleted: number; has_more: boolean; error: string | null },
): Promise<void> {
  try {
    const { error } = await client
      .from('maintenance_runs')
      .insert({ job: PURGE_JOB_NAME, ...row } as never)
    if (error) console.error('[maintenance] maintenance_runs insert failed', error.message)
  } catch (err) {
    console.error('[maintenance] maintenance_runs insert failed', err)
  }
}

/**
 * Sweep, delete what is due, and leave a `maintenance_runs` row saying what
 * happened — including when it failed, since a purge that silently stops is
 * exactly the problem KAN-69 was filed for.
 */
export async function runScheduledPurge(
  client: SupabaseAdmin,
  options: PurgeRunOptions,
): Promise<PurgeRunResult> {
  try {
    const result = await purge(client, options)
    await recordRun(client, {
      swept: result.swept,
      deleted: result.deleted,
      has_more: result.hasMore,
      error: null,
    })
    return result
  } catch (err) {
    const code = err instanceof PurgeRunError ? err.code : 'purge_failed'
    await recordRun(client, { swept: 0, deleted: 0, has_more: false, error: code })
    throw err instanceof PurgeRunError ? err : new PurgeRunError(code, String(err))
  }
}
