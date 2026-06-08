import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { getHeader, createError } from 'h3'

let _adminClient: ReturnType<typeof createClient> | null = null

export const serverSupabaseAdmin = () => {
  if (_adminClient) return _adminClient
  const url = process.env.SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''
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
    throw createError({ statusCode: 500, statusMessage: error.message })
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

  // Check if org owner
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (org) {
    return { user, org, member: null }
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
