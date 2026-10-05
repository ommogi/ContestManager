// server/utils/ai.ts
// The one place the app talks to the AI provider, OpenAI (epic KAN-85).
//
// Every AI feature proposes; the organisation confirms. Nothing here writes to
// the database: callers get a suggestion back and the existing endpoints, with
// their own validation and RLS, remain the only way anything is persisted.
//
// No key configured means the feature is off, not broken: `getOpenAI()`
// returns null and the endpoint answers 503, while the rest of the app carries
// on untouched.

import OpenAI from 'openai'

/**
 * gpt-6.1-sol: reading contest rules (Spanish or Catalan, often ambiguous) is a
 * judgement task, and the button is pressed a couple of times per contest, so
 * quality beats price — about 5 cents a proposal against 0.3 for gpt-6-luna.
 * OPENAI_MODEL overrides it.
 */
export const DEFAULT_AI_MODEL = 'gpt-6.1-sol'

let client: OpenAI | null = null
let clientKey: string | null = null

export function aiModel(): string {
  return String(useRuntimeConfig().openaiModel || '') || DEFAULT_AI_MODEL
}

export function getOpenAI(): OpenAI | null {
  const key = String(useRuntimeConfig().openaiApiKey || '')
  if (!key) return null
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key })
    clientKey = key
  }
  return client
}
