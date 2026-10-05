// server/utils/ai-email-draft.ts
// Drafts an organiser's email from a one-line intent (feat/ai, email drafter).
//
// The model gets the intent plus a small factual context — contest, category
// or round names, dates — and nothing personal: no participant names, no
// emails, no DNI. It returns subject and body as plain text; the organiser
// edits them and the send endpoint escapes everything.
//
// The model call is injected so the logic is testable without the network.

import { z } from 'zod/v4'

export const MAX_INTENT_CHARS = 2_000

export const AiEmailDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
})
export type AiEmailDraft = z.infer<typeof AiEmailDraftSchema>

export type DraftLocale = 'es' | 'ca'

export interface EmailDraftContext {
  orgName: string
  contestName: string
  locale: DraftLocale
  /** Who it goes to, in words: "los participantes de Piano infantil". */
  audienceLabel: string
  /** "Label: value" facts the model may use, e.g. "Fecha de la ronda: 12/10/2026". */
  facts: string[]
}

const LANGUAGE: Record<DraftLocale, string> = { es: 'castellano', ca: 'catalán' }

export function buildEmailSystemPrompt(locale: DraftLocale): string {
  return [
    'Redactas correos de una organización de concursos de música a sus participantes o a su jurado.',
    `Escribe en ${LANGUAGE[locale]}, con un tono cordial, claro y breve.`,
    'Usa solo los datos que te dan. Si falta un dato necesario (una hora, un lugar), escribe [COMPLETAR: qué falta] en su sitio, nunca lo inventes.',
    'El cuerpo es texto plano: párrafos separados por una línea en blanco, sin markdown, sin HTML y sin enlaces inventados.',
    'No incluyas firma con nombres de personas; termina con un saludo y el nombre de la organización.',
    'El asunto, de menos de 80 caracteres.',
  ].join('\n')
}

export function buildEmailUserPrompt(intent: string, ctx: EmailDraftContext): string {
  const facts = ctx.facts.length ? ctx.facts.map(f => `- ${f}`).join('\n') : '- (ninguno)'
  return [
    `Organización: ${ctx.orgName}`,
    `Concurso: ${ctx.contestName}`,
    `Destinatarios: ${ctx.audienceLabel}`,
    'Datos disponibles:',
    facts,
    '',
    'Lo que la organización quiere decir:',
    `<intencion>\n${intent}\n</intencion>`,
  ].join('\n')
}

export type AiEmailCall = (input: { system: string, user: string }) => Promise<AiEmailDraft | null>

export type AiEmailResult =
  | { ok: true, subject: string, body: string }
  | { ok: false, reason: 'empty_intent' | 'intent_too_long' | 'no_draft' }

/** Asks once, retries once on an unusable answer, never invents a fallback. */
export async function draftEmail(intent: string, ctx: EmailDraftContext, call: AiEmailCall): Promise<AiEmailResult> {
  const text = intent.trim()
  if (!text) return { ok: false, reason: 'empty_intent' }
  if (text.length > MAX_INTENT_CHARS) return { ok: false, reason: 'intent_too_long' }

  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await call({ system: buildEmailSystemPrompt(ctx.locale), user: buildEmailUserPrompt(text, ctx) })
    const subject = draft?.subject.trim().slice(0, 200)
    const body = draft?.body.trim().slice(0, 10_000)
    if (subject && body) return { ok: true, subject, body }
  }
  return { ok: false, reason: 'no_draft' }
}
