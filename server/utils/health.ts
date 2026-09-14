// server/utils/health.ts
//
// Dependency probes behind /api/health (KAN-54).
//
// Kept out of the route handler so it can be unit-tested with injected clients:
// vitest resolves neither Nitro's `~~/` alias nor its auto-imports, which is why
// every tested unit in this repo is a service or a util.
//
// The endpoint it backs used to `return { status: 'ok' }` unconditionally while
// importing — and never calling — the Supabase and Stripe clients. A control
// that reports a state it has not checked is worse than no control: a load
// balancer pointed at it would never take a broken instance out of rotation,
// and the failure surfaces the slowest way possible, through a user who cannot
// enrol.

export type DependencyStatus = 'up' | 'down'

export interface DependencyResult {
  status: DependencyStatus
  /** Milliseconds the probe took. Useful to spot a dependency degrading. */
  durationMs: number
  /**
   * Fixed, non-descriptive reason. Never a database message, a connection
   * string or a fragment of a key: this endpoint is reachable without a
   * session, so it says *that* something failed and never *what* (KAN-43).
   */
  reason?: 'timeout' | 'unavailable' | 'not_configured'
}

export interface HealthReport {
  status: 'ok' | 'degraded'
  dependencies: Record<string, DependencyResult>
}

/** Default per-probe budget. A slow dependency must not hang the whole check. */
export const PROBE_TIMEOUT_MS = 3000

class ProbeTimeout extends Error {}

/**
 * Races a promise against a timer.
 *
 * The timer is always cleared, including on the happy path: a pending timer
 * keeps the event loop alive, which in a serverless runtime delays the response
 * the caller is waiting for.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeout('timeout')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function probe(run: () => Promise<unknown>, timeoutMs: number): Promise<DependencyResult> {
  const started = Date.now()
  try {
    await withTimeout(Promise.resolve().then(run), timeoutMs)
    return { status: 'up', durationMs: Date.now() - started }
  } catch (err) {
    const reason = err instanceof ProbeTimeout
      ? 'timeout'
      // `serverSupabaseAdmin()` and `getStripe()` throw when their key is
      // missing (KAN-55). That is a configuration fault, not an outage, and
      // saying so is the whole point: a deployment with an unset service key
      // used to report `ok` until someone tried to use it.
      : /is not set|is required|missing/i.test((err as Error)?.message ?? '')
        ? 'not_configured'
        : 'unavailable'
    return { status: 'down', durationMs: Date.now() - started, reason }
  }
}

/** Minimal shape of the probes' dependencies, so tests need no real clients. */
export interface HealthSupabaseClient {
  from(table: string): {
    select(columns: string, options: { head: true; count: 'exact' }): PromiseLike<{ error: unknown }>
  }
}

export interface HealthStripeClient {
  balance: { retrieve(): PromiseLike<unknown> }
}

/**
 * Supabase probe: a HEAD count against one table.
 *
 * `head: true` asks PostgREST for the count and no rows at all, so this stays a
 * cheap metadata round-trip rather than a select of anything. It still proves
 * what matters — the connection resolves, the service key authenticates and
 * PostgREST answers.
 *
 * supabase-js resolves with `{ data, error }` instead of rejecting, so the
 * error is read explicitly. Writing this as a bare `await` in a try/catch is
 * the exact mistake that made KAN-60 and KAN-63 invisible, and here it would
 * report a dead database as healthy.
 */
export async function checkSupabase(
  getClient: () => HealthSupabaseClient,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<DependencyResult> {
  return probe(async () => {
    const { error } = await getClient().from('organizations').select('id', { head: true, count: 'exact' })
    if (error) throw new Error('supabase unavailable')
  }, timeoutMs)
}

/**
 * Stripe probe: retrieve the platform balance.
 *
 * One of the cheapest authenticated calls in the API, and it fails on an
 * invalid or revoked key, which is what needs detecting. The Stripe SDK does
 * reject on error, unlike supabase-js.
 */
export async function checkStripe(
  getClient: () => HealthStripeClient,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<DependencyResult> {
  return probe(() => Promise.resolve(getClient().balance.retrieve()), timeoutMs)
}

/**
 * Overall status plus the HTTP code a load balancer should act on.
 *
 * 503 when any dependency is down, so rotation decisions need only the status
 * line — a balancer should not have to parse a body to know an instance is
 * useless.
 */
export function summarize(dependencies: Record<string, DependencyResult>): {
  report: HealthReport
  statusCode: 200 | 503
} {
  const degraded = Object.values(dependencies).some(d => d.status === 'down')
  return {
    report: { status: degraded ? 'degraded' : 'ok', dependencies },
    statusCode: degraded ? 503 : 200,
  }
}
