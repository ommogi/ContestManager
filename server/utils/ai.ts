// server/utils/ai.ts
// The one place the app talks to the AI provider, OpenAI (epic KAN-85).
//
// Every AI feature proposes; the organisation confirms. Nothing here writes to
// the database: callers get a suggestion back and the existing endpoints, with
// their own validation and RLS, remain the only way anything is persisted.
//
// No key or no model configured means the feature is off, not broken:
// `getOpenAI()` returns null and the endpoint answers 503, while the rest of
// the app carries on untouched. There is deliberately no default model: which
// one to pay for is a decision for whoever sets OPENAI_MODEL.

import OpenAI from 'openai'

let client: OpenAI | null = null
let clientKey: string | null = null

export function aiModel(): string {
  return String(useRuntimeConfig().openaiModel || '')
}

export function getOpenAI(): OpenAI | null {
  const key = String(useRuntimeConfig().openaiApiKey || '')
  if (!key || !aiModel()) return null
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key })
    clientKey = key
  }
  return client
}
