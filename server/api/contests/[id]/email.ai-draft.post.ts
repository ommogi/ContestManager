// server/api/contests/[id]/email.ai-draft.post.ts
// Drafts an email from the organiser's intent (feat/ai, email drafter).
// Returns subject and body and sends nothing: sending is
// POST /api/contests/:id/emails, after the organiser has read and edited it.

import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { getOpenAI, aiModel } from '~~/server/utils/ai'
import { AiEmailDraftSchema, draftEmail, MAX_INTENT_CHARS, type AiEmailCall, type DraftLocale } from '~~/server/utils/ai-email-draft'
import { AudienceSchema } from '~~/server/services/custom-email'

const BodySchema = z.object({
  intent: z.string(),
  audience: AudienceSchema.optional(),
})

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  await requireContestOrganizer(event, contestId)

  const openai = getOpenAI()
  if (!openai) {
    throw createError({ statusCode: 503, statusMessage: 'ai_not_configured', message: 'El asistente de IA no está configurado.' })
  }

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  const { intent, audience } = parsed.data

  const client = serverSupabaseAdmin()
  const { data: contest, error } = await client
    .from('contests')
    .select('name, starts_at, ends_at, organizations(name, locale)')
    .eq('id', contestId)
    .maybeSingle()
  if (error || !contest) throw internalError(event, error ?? new Error('contest not found'), 'contests.select')
  const c = contest as any
  const org = c.organizations as { name: string, locale: string | null } | null

  // Facts the model may use. Names of things, dates and times only — never
  // anything about a person.
  const facts: string[] = []
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null)
  const starts = day(c.starts_at)
  const ends = day(c.ends_at)
  if (starts) facts.push(`Fechas del concurso: ${starts}${ends && ends !== starts ? ` a ${ends}` : ''}`)

  let audienceLabel = 'los participantes del concurso'
  if (audience?.type === 'judges') audienceLabel = 'los miembros del jurado'
  if (audience?.type === 'participants') audienceLabel = 'algunos participantes del concurso'
  if (audience?.type === 'category') {
    const { data: cat } = await client.from('categories').select('name').eq('id', audience.categoryId).eq('contest_id', contestId).maybeSingle()
    if (cat) audienceLabel = `los participantes de la categoría ${(cat as any).name}`
  }
  if (audience?.type === 'round') {
    const { data: round } = await client
      .from('rounds')
      .select('name, session_date, session_start, session_end, categories!inner(name, contest_id)')
      .eq('id', audience.roundId)
      .eq('categories.contest_id', contestId)
      .maybeSingle()
    if (round) {
      const r = round as any
      audienceLabel = `los participantes de la ronda ${r.name} de ${r.categories.name}`
      if (r.session_date) facts.push(`Fecha de la ronda: ${r.session_date}`)
      if (r.session_start) facts.push(`Franja de la ronda: ${r.session_start}${r.session_end ? `–${r.session_end}` : ''}`)
    }
  }

  const locale: DraftLocale = org?.locale === 'ca' ? 'ca' : 'es'

  const call: AiEmailCall = async ({ system, user }) => {
    const response = await openai.responses.parse({
      model: aiModel(),
      instructions: system,
      input: user,
      max_output_tokens: 4000,
      text: { format: zodTextFormat(AiEmailDraftSchema, 'email_draft') },
    })
    if (response.status === 'incomplete') return null
    return response.output_parsed ?? null
  }

  let result
  try {
    result = await draftEmail(intent, { orgName: org?.name ?? 'La organización', contestName: c.name, locale, audienceLabel, facts }, call)
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      throw createError({ statusCode: 429, statusMessage: 'ai_busy', message: 'El asistente está saturado. Prueba en un minuto.' })
    }
    if (err instanceof OpenAI.APIError) {
      console.error('[email-ai-draft] openai error', err.status, err.message)
      throw createError({ statusCode: 502, statusMessage: 'ai_unavailable', message: 'El asistente de IA no ha respondido. Prueba de nuevo.' })
    }
    throw err
  }

  if (!result.ok) {
    const messages = {
      empty_intent: 'Escribe qué quieres comunicar.',
      intent_too_long: `Resume lo que quieres decir en menos de ${MAX_INTENT_CHARS.toLocaleString('es-ES')} caracteres.`,
      no_draft: 'La IA no ha podido redactar el correo. Prueba a explicarlo de otra forma.',
    } as const
    throw createError({ statusCode: result.reason === 'no_draft' ? 422 : 400, statusMessage: result.reason, message: messages[result.reason] })
  }

  return { subject: result.subject, body: result.body }
})
