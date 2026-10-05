// server/api/contests/[id]/emails.post.ts
// The organisation writes to its participants or its jury (feat/ai, email
// drafter). `dryRun: true` answers who would receive it and sends nothing; the
// UI always asks for that first and shows the count before the real send.

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { sendCustomEmail } from '~~/server/utils/email'
import { notificationRecipient } from '~~/shared/org-notifications'
import {
  AudienceSchema,
  PaymentFilterSchema,
  MAX_RECIPIENTS,
  campaignId,
  mapLimited,
  resolveRecipients,
} from '~~/server/services/custom-email'

const BodySchema = z.object({
  audience: AudienceSchema,
  paymentStatus: PaymentFilterSchema.optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  dryRun: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  const { user } = await requireContestOrganizer(event, contestId)

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { audience, paymentStatus, subject, body, dryRun } = parsed.data

  const client = serverSupabaseAdmin()
  let recipients
  try {
    recipients = await resolveRecipients(client as any, contestId, audience, paymentStatus)
  } catch (error: any) {
    throw internalError(event, error, 'custom-email.recipients')
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw createError({ statusCode: 400, statusMessage: 'too_many_recipients', message: `Como máximo ${MAX_RECIPIENTS} destinatarios por envío.` })
  }

  if (dryRun) {
    return { dryRun: true, count: recipients.length, recipients: recipients.map(r => r.name) }
  }
  if (recipients.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'no_recipients', message: 'No hay nadie con email en ese grupo.' })
  }

  const { data: contest, error: cErr } = await client
    .from('contests')
    .select('name, organizations(name, notification_email)')
    .eq('id', contestId)
    .maybeSingle()
  if (cErr || !contest) throw internalError(event, cErr ?? new Error('contest not found'), 'contests.select')
  const org = (contest as any).organizations as { name: string, notification_email: string | null } | null

  // Replies go to the organisation: its alert address, else whoever is sending.
  const replyTo = notificationRecipient(org, user.email ?? null)
  const campaign = campaignId(contestId, audience, subject, body)

  const results = await mapLimited(recipients, 2, r => sendCustomEmail({
    to: r.email,
    orgName: org?.name ?? 'La organización',
    contestName: (contest as any).name,
    subject,
    body,
    replyTo,
    dedupeKey: `custom:${campaign}:${r.email}`,
    payload: { contest_id: contestId, campaign, audience: audience.type, sent_by: user.id },
  }))

  return {
    dryRun: false,
    campaign,
    count: recipients.length,
    sent: results.filter(r => r.sent).length,
    duplicates: results.filter(r => r.duplicate).length,
    failed: results.filter(r => !r.sent && !r.duplicate).length,
  }
})
