import { createClient } from '@supabase/supabase-js'
import type { H3Error, H3Event } from 'h3'
import { getHeader, createError } from 'h3'

let _adminClient: ReturnType<typeof createClient> | null = null

/**
 * Service-role Supabase client. Bypasses RLS, so every caller must have passed
 * an ownership/membership gate first (`requireOrgOwner`, `requireOrgOwnerOrMember`).
 *
 * Fails loudly when its env vars are missing (KAN-55). Previously the `|| ''`
 * fallbacks swallowed the absence and built a client with an empty key: the
 * misconfiguration only surfaced later as an opaque PostgREST auth error on the
 * first query, naming nothing. Now the very first call names the exact variable
 * that is missing. The thrown `Error` is not an H3 error on purpose — Nitro
 * turns unhandled errors into a generic 500, so the variable name reaches the
 * server log and never the client.
 */
export const serverSupabaseAdmin = () => {
  if (_adminClient) return _adminClient
  const url = process.env.SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''
  const missing: string[] = []
  if (!url.trim()) missing.push('SUPABASE_URL')
  if (!serviceKey.trim()) missing.push('SUPABASE_SERVICE_KEY')
  if (missing.length > 0) {
    throw new Error(
      `[supabase] Missing required environment variable(s): ${missing.join(', ')}. `
      + 'The admin (service-role) client cannot be created. Set them in your .env '
      + '(see .env.example) or in the hosting provider environment settings.',
    )
  }
  _adminClient = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  return _adminClient
}

export const serverSupabaseClient = (event: H3Event) => {
  return serverSupabaseUser(event)
}

/**
 * Supabase client scoped to the caller's JWT. Required for RPCs/queries that
 * rely on `auth.uid()` (e.g. SECURITY DEFINER functions that validate the user).
 */
export const serverSupabaseUser = (event: H3Event) => {
  const url = process.env.SUPABASE_URL || ''
  const anonKey = process.env.SUPABASE_ANON_KEY || ''
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return createClient(url, anonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// ─── Internal error responses ────────────────────────────────────────────────

/**
 * Closed set of generic `statusMessage` values allowed on a 500 response.
 *
 * RULE: a Supabase/PostgREST/Postgres error is NEVER propagated to the client.
 * Its `message`, `details`, `hint` and `code` expose table names, column names
 * and constraint names, which lets an attacker reconstruct the schema without
 * database access (OWASP Top 10:2025 A10, ASVS 5.0 16.5.1). The real message is
 * logged server-side with route, method and operation; the client only gets one
 * of the codes below.
 *
 * Semantic 4xx business errors (`forbidden`, `org_owner_required`,
 * `registration_closed`, Zod validation, …) are a separate contract with the
 * frontend and are unaffected by this rule.
 */
export const INTERNAL_ERROR_CODES = [
  'internal_error',
  'org_delete_failed',
  'auth_delete_failed',
  'stripe_error',
  'audit_log_failed',
  'cancel_partial',
] as const

export type InternalErrorCode = (typeof INTERNAL_ERROR_CODES)[number]

/** Shape of a PostgrestError — a plain object, not an `Error` instance. */
interface PostgrestLikeError {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

/** Build a debuggable one-line description of any thrown/returned error. */
function describeCause(cause: unknown): string {
  if (cause == null) return 'unknown'
  if (typeof cause === 'string') return cause
  if (cause instanceof Error) return cause.message

  if (typeof cause === 'object') {
    const err = cause as PostgrestLikeError
    const parts: string[] = []
    if (typeof err.code === 'string' && err.code) parts.push(`code=${err.code}`)
    if (typeof err.message === 'string' && err.message) parts.push(err.message)
    if (typeof err.details === 'string' && err.details) parts.push(`details=${err.details}`)
    if (typeof err.hint === 'string' && err.hint) parts.push(`hint=${err.hint}`)
    if (parts.length) return parts.join(' | ')
  }

  return String(cause)
}

/**
 * Log an internal failure with enough context to debug it (method, route,
 * operation) and return a sanitized 500 error for the client.
 *
 * Usage: `if (error) throw internalError(event, error, 'organizations.select')`
 *
 * @param event     current request, used for method + route context
 * @param cause     the raw Supabase/Stripe/unknown error — logged, never sent
 * @param operation short, stable label of what failed, e.g. `rounds.update`
 * @param code      generic client-facing code, defaults to `internal_error`
 */
export function internalError(
  event: H3Event | null,
  cause: unknown,
  operation: string,
  code: InternalErrorCode = 'internal_error',
): H3Error {
  const method = event?.method || event?.node?.req?.method || ''
  const path = event?.path || event?.node?.req?.url || ''
  // eslint-disable-next-line no-console
  console.error(`[api error] ${method} ${path} :: ${operation} ::`, describeCause(cause))
  return createError({ statusCode: 500, statusMessage: code })
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

export interface SupabaseUser {
  id: string
  email?: string
  [key: string]: unknown
}

export interface OrgOwnerResult {
  user: SupabaseUser
  org: {
    id: string
    name: string
    slug: string
    owner_id: string
    ticket_balance: number
    activation_balance: number
    stripe_account_id: string | null
    stripe_onboarding_done: boolean
    stripe_charges_enabled: boolean
    stripe_payouts_enabled: boolean
  }
}

export interface OrgOwnerOrMemberResult {
  user: SupabaseUser
  org: { id: string } | null
  member: { id: string; role: string } | null
}

/**
 * Require any authenticated user.
 * Returns the user object from event.context (set by server/middleware/auth.ts).
 * Throws 401 if no user.
 */
export function requireAuth(event: H3Event): SupabaseUser {
  const user = event.context.user as SupabaseUser | undefined
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}

/**
 * Require the user to be an organization owner.
 * Returns { user, org } with the org data.
 * Throws 401 if not authenticated, 403 if not an org owner.
 */
export async function requireOrgOwner(event: H3Event): Promise<OrgOwnerResult> {
  const user = requireAuth(event)
  const admin = serverSupabaseAdmin()

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name, slug, owner_id, ticket_balance, activation_balance, stripe_account_id, stripe_onboarding_done, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error) {
    throw internalError(event, error, 'organizations.select')
  }
  if (!org) {
    throw createError({ statusCode: 403, statusMessage: 'org_owner_required' })
  }

  return { user, org }
}

/**
 * Require the user to be either an org owner OR a contest member.
 * Returns { user, org, member } — at least one of org or member will be non-null.
 * Throws 401 if not authenticated, 403 if neither owner nor member.
 */
export async function requireOrgOwnerOrMember(
  event: H3Event,
  contestId: string,
): Promise<OrgOwnerOrMemberResult> {
  const user = requireAuth(event)
  const admin = serverSupabaseAdmin()

  // Check if owner of the organization that owns THIS contest.
  // Must be scoped to the contest — checking "owns any org" would let any
  // organizer act on every other tenant's contests.
  const { data: contest } = await admin
    .from('contests')
    .select('organization_id')
    .eq('id', contestId)
    .maybeSingle()

  if (contest) {
    const { data: org } = await admin
      .from('organizations')
      .select('id')
      .eq('id', (contest as any).organization_id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (org) {
      return { user, org, member: null }
    }
  }

  // Check if accepted contest member (by user_id or email).
  // Pending/rejected judges are NOT granted access.
  const { data: memberById } = await admin
    .from('contest_members')
    .select('id, role')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .eq('invitation_status', 'accepted')
    .maybeSingle()

  if (memberById) {
    return { user, org: null, member: memberById }
  }

  const { data: member } = await admin
    .from('contest_members')
    .select('id, role')
    .eq('contest_id', contestId)
    .eq('email', user.email)
    .eq('invitation_status', 'accepted')
    .maybeSingle()

  if (member) {
    return { user, org: null, member }
  }

  throw createError({ statusCode: 403, statusMessage: 'forbidden' })
}
