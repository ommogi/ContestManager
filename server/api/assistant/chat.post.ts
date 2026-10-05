// server/api/assistant/chat.post.ts
// The organiser assistant (feat/ai, Sidekick-style): answers questions about
// the organisation's contests and proposes actions the organiser confirms in
// the UI. It never writes anything itself — see server/services/assistant-tools.ts.

import OpenAI from 'openai'
import { defineEventHandler, createError, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getOpenAI, aiModel } from '~~/server/utils/ai'
import { runTool } from '~~/server/services/assistant-tools'
import { buildSystemPrompt, runAssistant, TOOLS, MAX_HISTORY, type FunctionCall } from '~~/server/utils/assistant-loop'

const BodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).min(1).max(MAX_HISTORY * 2),
  context: z.object({
    contestSlug: z.string().max(200).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    roundId: z.string().uuid().nullable().optional(),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).optional(),
})

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const openai = getOpenAI()
  if (!openai) {
    throw createError({ statusCode: 503, statusMessage: 'ai_not_configured', message: 'El asistente de IA no está configurado.' })
  }

  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  const { messages, context } = parsed.data
  if (messages[messages.length - 1]!.role !== 'user') {
    throw createError({ statusCode: 400, statusMessage: 'last_message_must_be_user' })
  }

  const client = serverSupabaseAdmin()

  // The page the organiser is on, resolved inside their own organisation only.
  let contest: { id: string, name: string } | null = null
  if (context?.contestSlug) {
    const { data } = await client
      .from('contests')
      .select('id, name')
      .eq('slug', context.contestSlug)
      .eq('organization_id', org.id)
      .maybeSingle()
    contest = (data as any) ?? null
  }

  const instructions = buildSystemPrompt(org.name, {
    contestId: contest?.id ?? null,
    contestName: contest?.name ?? null,
    categoryId: contest ? context?.categoryId ?? null : null,
    roundId: contest ? context?.roundId ?? null : null,
    today: context?.today ?? null,
  })

  try {
    return await runAssistant({
      messages,
      instructions,
      runTool: (name, args) => runTool({ client: client as any, orgId: org.id }, name, args),
      callModel: async ({ instructions, input }) => {
        const response = await openai.responses.create({
          model: aiModel(),
          instructions,
          input: input as any,
          tools: TOOLS as any,
          max_output_tokens: 4000,
        })
        const output = (response.output ?? []) as unknown[]
        const calls = output.filter((o: any) => o?.type === 'function_call') as FunctionCall[]
        return { output, calls, text: response.output_text ?? '' }
      },
    })
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      throw createError({ statusCode: 429, statusMessage: 'ai_busy', message: 'El asistente está saturado. Prueba en un minuto.' })
    }
    if (err instanceof OpenAI.APIError) {
      console.error('[assistant] openai error', err.status, err.message)
      throw createError({ statusCode: 502, statusMessage: 'ai_unavailable', message: 'El asistente no ha respondido. Prueba de nuevo.' })
    }
    throw err
  }
})
