// server/services/custom-email.ts
// Who an organisation's own message goes to, and how a campaign stays
// idempotent (feat/ai, email drafter).
//
// Recipients are always resolved here, from the contest the caller was already
// authorised for — never taken as addresses from the request — so a crafted
// body cannot turn the endpoint into a relay to arbitrary inboxes.

import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_RECIPIENTS = 500

export const AudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_participants') }),
  z.object({ type: z.literal('category'), categoryId: z.string().uuid() }),
  z.object({ type: z.literal('round'), roundId: z.string().uuid() }),
  z.object({ type: z.literal('judges') }),
  z.object({ type: z.literal('participants'), participantIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS) }),
])

export type Audience = z.infer<typeof AudienceSchema>

export const PaymentFilterSchema = z.enum(['free', 'pending', 'paid', 'refunded'])

export interface Recipient {
  email: string
  name: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lowercases, drops rows without a usable address and repeated addresses. */
export function dedupeRecipients(rows: Array<{ email?: string | null, name?: string | null }>): Recipient[] {
  const seen = new Set<string>()
  const out: Recipient[] = []
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    out.push({ email, name: row.name?.trim() || email })
  }
  return out
}

/**
 * Same audience and same text → same key, so pressing "Enviar" twice (or a
 * retried request) is deduplicated per recipient by email_logs.dedupe_key.
 */
export function campaignId(contestId: string, audience: Audience, subject: string, body: string): string {
  return createHash('sha256')
    .update(JSON.stringify([contestId, audience, subject.trim(), body.trim()]))
    .digest('hex')
    .slice(0, 24)
}

function personName(p: { first_name?: string | null, last_name?: string | null, name?: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || ''
}

type ParticipantRow = {
  email: string | null
  first_name: string | null
  last_name: string | null
  name: string | null
  payment_status: string | null
}

/**
 * Resolves an audience inside one contest. Every id in the audience is
 * re-scoped to `contestId`: a category, round or participant of another
 * contest simply matches nothing.
 */
export async function resolveRecipients(
  client: SupabaseClient,
  contestId: string,
  audience: Audience,
  paymentStatus?: z.infer<typeof PaymentFilterSchema>,
): Promise<Recipient[]> {
  const cols = 'email, first_name, last_name, name, payment_status'

  if (audience.type === 'judges') {
    const { data, error } = await client
      .from('contest_members')
      .select('email, full_name')
      .eq('contest_id', contestId)
      .eq('role', 'judge')
      .eq('invitation_status', 'accepted')
    if (error) throw error
    return dedupeRecipients((data ?? []).map((m: any) => ({ email: m.email, name: m.full_name })))
  }

  let rows: ParticipantRow[] = []
  if (audience.type === 'round') {
    const { data: round, error: rErr } = await client
      .from('rounds')
      .select('id, categories!inner(contest_id)')
      .eq('id', audience.roundId)
      .eq('categories.contest_id', contestId)
      .maybeSingle()
    if (rErr) throw rErr
    if (!round) return []
    const { data, error } = await client
      .from('round_participants')
      .select(`participants!inner(${cols})`)
      .eq('round_id', audience.roundId)
    if (error) throw error
    rows = (data ?? []).map((r: any) => r.participants)
  } else {
    let q = client.from('participants').select(cols).eq('contest_id', contestId)
    if (audience.type === 'category') q = q.eq('category_id', audience.categoryId)
    if (audience.type === 'participants') q = q.in('id', audience.participantIds)
    const { data, error } = await q
    if (error) throw error
    rows = (data ?? []) as ParticipantRow[]
  }

  if (paymentStatus) rows = rows.filter(r => r.payment_status === paymentStatus)
  return dedupeRecipients(rows.map(r => ({ email: r.email, name: personName(r) })))
}

/** Runs `fn` over `items`, at most `limit` at a time (Resend allows ~2 req/s). */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
