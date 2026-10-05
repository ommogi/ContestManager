// server/utils/ai.ts
// The one place the app talks to Claude (epic KAN-85).
//
// Every AI feature proposes; the organisation confirms. Nothing here writes to
// the database: callers get a suggestion back and the existing endpoints, with
// their own validation and RLS, remain the only way anything is persisted.
//
// No key configured means the feature is off, not broken: `getAnthropic()`
// returns null and the endpoint answers 503, while the rest of the app carries
// on untouched.

import Anthropic from '@anthropic-ai/sdk'

export const DEFAULT_AI_MODEL = 'claude-opus-5-5'

let client: Anthropic | null = null
let clientKey: string | null = null

export function getAnthropic(): Anthropic | null {
  const key = String(useRuntimeConfig().anthropicApiKey || '')
  if (!key) return null
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key })
    clientKey = key
  }
  return client
}

export function aiModel(): string {
  return String(useRuntimeConfig().anthropicModel || '') || DEFAULT_AI_MODEL
}
