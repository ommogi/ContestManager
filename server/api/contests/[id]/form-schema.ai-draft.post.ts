// server/api/contests/[id]/form-schema.ai-draft.post.ts
// Proposes the custom fields of the inscription form from the contest rules
// (KAN-86). Returns a proposal and saves nothing: the organisation reviews it
// and keeps it through the normal save endpoint, as an unpublished draft.

import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { getOpenAI, aiModel } from '~~/server/utils/ai'
import { AiFormDraftSchema, draftFormFromRules, MAX_RULES_CHARS, type AiDraftCall } from '~~/server/utils/ai-form-draft'
import type { FormField } from '~~/shared/inscription-form'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  await requireOrgOwnerOrMember(event, contestId)

  const openai = getOpenAI()
  if (!openai) {
    throw createError({ statusCode: 503, statusMessage: 'ai_not_configured', message: 'El asistente de IA no está configurado.' })
  }

  const body = (await readBody(event).catch(() => null)) as { rulesText?: unknown } | null
  const admin = serverSupabaseAdmin()

  // Text sent in the request wins (the organiser may paste bases they have not
  // saved yet); otherwise the rules already stored on the contest.
  let rules = typeof body?.rulesText === 'string' ? body.rulesText : ''
  if (!rules.trim()) {
    const { data, error } = await admin.from('contests').select('rules').eq('id', contestId).maybeSingle()
    if (error) throw internalError(event, error, 'contests.select')
    rules = String((data as { rules?: string | null } | null)?.rules ?? '')
  }

  // Keep proposed ids clear of whatever the latest saved version already has.
  const { data: latest } = await admin
    .from('inscription_form_schemas')
    .select('schema_json')
    .eq('contest_id', contestId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const existingIds = ((latest as { schema_json?: FormField[] | null } | null)?.schema_json ?? []).map(f => f.id)

  const call: AiDraftCall = async ({ system, user }) => {
    // Structured output: the response is constrained to AiFormDraftSchema, and
    // a refusal or a truncated answer leaves output_parsed null.
    const response = await openai.responses.parse({
      model: aiModel(),
      instructions: system,
      input: user,
      max_output_tokens: 16000,
      text: { format: zodTextFormat(AiFormDraftSchema, 'inscription_form_draft') },
    })
    if (response.status === 'incomplete') return null
    return response.output_parsed ?? null
  }

  let result
  try {
    result = await draftFormFromRules(rules, call, existingIds)
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      throw createError({ statusCode: 429, statusMessage: 'ai_busy', message: 'El asistente está saturado. Prueba en un minuto.' })
    }
    if (error instanceof OpenAI.APIError) {
      console.error('[ai-draft] openai error', error.status, error.message)
      throw createError({ statusCode: 502, statusMessage: 'ai_unavailable', message: 'El asistente de IA no ha respondido. Prueba de nuevo.' })
    }
    throw error
  }

  if (!result.ok) {
    const messages = {
      empty_rules: 'El concurso no tiene bases. Escríbelas o pégalas para que la IA pueda proponer el formulario.',
      rules_too_long: `Las bases superan los ${MAX_RULES_CHARS.toLocaleString('es-ES')} caracteres. Pega solo la parte relevante para la inscripción.`,
      no_proposal: 'La IA no ha podido proponer un formulario con estas bases.',
    } as const
    throw createError({
      statusCode: result.reason === 'no_proposal' ? 422 : 400,
      statusMessage: result.reason,
      message: messages[result.reason],
    })
  }

  return { fields: result.fields, notes: result.notes }
})
