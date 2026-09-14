// server/utils/rate-limit-store.ts
//
// Where the rate limiter keeps its counters (KAN-37).
//
// The limits themselves — `getLimit()` in the middleware — are untouched. Only
// the storage moved, which is the point of the issue: a counter held in a
// process `Map` is not a limit when the process is not the only one.
//
// On Vercel this is worse than the "N instances means N × the limit" the issue
// describes. Functions are ephemeral and every cold start begins with an empty
// map, so the 20/min on `/api/auth/**` — the bucket that exists to slow down
// brute force and credential stuffing — is close to no limit at all today.
//
// Scope, decided deliberately: the shared store backs only the buckets that
// exist to stop abuse (auth, public, financial). The general 120/min stays in
// memory. The bucket key is `client:path`, so making every endpoint shared
// would add a database write to each call the app shell makes on every page
// load, in exchange for almost nothing on a limit of 120.

export interface RateLimitHit {
  /** Requests counted in the current window, this one included. */
  count: number
  /** Epoch ms at which the window rolls over. */
  resetAt: number
}

export interface RateLimitStore {
  readonly name: 'memory' | 'postgres'
  hit(key: string, windowMs: number, now: number): Promise<RateLimitHit>
}

/* -------------------------------------------------------------------------- */
/* Memory                                                                      */
/* -------------------------------------------------------------------------- */

interface RateEntry {
  count: number
  resetAt: number
}

/** Hard cap so a distributed attack cannot exhaust memory on one instance. */
export const MAX_BUCKETS = 2000

export class MemoryRateLimitStore implements RateLimitStore {
  readonly name = 'memory' as const
  private buckets = new Map<string, RateEntry>()

  /** Exposed for tests and for the shared store's fallback accounting. */
  get size(): number {
    return this.buckets.size
  }

  cleanup(now: number): void {
    for (const [key, entry] of this.buckets.entries()) {
      if (entry.resetAt < now) this.buckets.delete(key)
    }
  }

  async hit(key: string, windowMs: number, now: number): Promise<RateLimitHit> {
    if (this.buckets.size > 1000) this.cleanup(now)

    // The map is full and this key is new. Returning a count past any limit
    // makes the caller reject — the pre-existing behaviour, kept on purpose:
    // under a distributed attack an instance protects itself before it
    // protects the experience of whoever is unlucky enough to be new.
    if (this.buckets.size >= MAX_BUCKETS && !this.buckets.has(key)) {
      return { count: Number.MAX_SAFE_INTEGER, resetAt: now + windowMs }
    }

    const entry = this.buckets.get(key)
    if (!entry || entry.resetAt < now) {
      const fresh = { count: 1, resetAt: now + windowMs }
      this.buckets.set(key, fresh)
      return { ...fresh }
    }

    entry.count++
    return { ...entry }
  }
}

/* -------------------------------------------------------------------------- */
/* Postgres                                                                    */
/* -------------------------------------------------------------------------- */

/** Minimal client shape, so tests need no Supabase. */
export interface RateLimitRpcClient {
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

interface RateLimitHitRow {
  count: number
  reset_at: string
}

/**
 * Counters in Postgres, shared by every instance.
 *
 * The increment happens **inside** the database, in a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` behind
 * `rate_limit_hit()`. Reading the row and writing it back from the server
 * would let two simultaneous requests read the same value and both pass — the
 * exact race the shared store exists to close.
 *
 * When the database cannot answer, the request is counted in memory instead
 * and the failure is logged. A broken limiter must not become an outage; but
 * it must not fail silently either, which is the lesson of KAN-60.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  readonly name = 'postgres' as const
  private fallback = new MemoryRateLimitStore()
  private degradedLogged = false

  constructor(private getClient: () => RateLimitRpcClient) {}

  async hit(key: string, windowMs: number, now: number): Promise<RateLimitHit> {
    try {
      const { data, error } = await this.getClient().rpc('rate_limit_hit', {
        p_key: key,
        p_window_ms: windowMs,
      })
      if (error) throw new Error(error.message)

      const row = (Array.isArray(data) ? data[0] : data) as RateLimitHitRow | null
      if (!row || typeof row.count !== 'number') throw new Error('malformed rate_limit_hit row')

      return { count: row.count, resetAt: new Date(row.reset_at).getTime() }
    } catch (err) {
      // Logged once per process: a database that is down would otherwise emit
      // one line per request and bury everything else.
      if (!this.degradedLogged) {
        this.degradedLogged = true
        console.error('[rate-limit] shared store unavailable, counting in memory:', (err as Error)?.message)
      }
      return this.fallback.hit(key, windowMs, now)
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Paths whose counters are worth a round trip to the database.
 *
 * These are the buckets that exist to stop abuse rather than to smooth load:
 * authentication (brute force), the public inscription surface (no session to
 * key on) and anything that moves money.
 */
export function usesSharedStore(path: string): boolean {
  if (path.startsWith('/api/auth/')) return true
  if (path.startsWith('/api/public/')) return true
  if (path.startsWith('/api/billing/')) {
    const readOnly = path.startsWith('/api/billing/balance')
      || path.startsWith('/api/billing/plans')
      || path.startsWith('/api/billing/connect/status')
    return !readOnly
  }
  return path.includes('/refund') || path.includes('/cancel')
}

/**
 * Reads `RATE_LIMIT_STORE`. Anything other than `postgres` means memory, and
 * `postgres` without a service key falls back with a warning rather than
 * leaving the app unlimited — failing open on configuration is how a limiter
 * quietly stops existing.
 */
export function resolveStoreMode(env: NodeJS.ProcessEnv = process.env): 'memory' | 'postgres' {
  if ((env.RATE_LIMIT_STORE ?? '').trim().toLowerCase() !== 'postgres') return 'memory'
  if (!env.SUPABASE_SERVICE_KEY) {
    console.warn('[rate-limit] RATE_LIMIT_STORE=postgres but SUPABASE_SERVICE_KEY is unset; using memory')
    return 'memory'
  }
  return 'postgres'
}
