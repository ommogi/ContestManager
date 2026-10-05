import { describe, it, expect, vi } from 'vitest'
import { dedupeRecipients, campaignId, mapLimited, AudienceSchema } from '../services/custom-email'
import { renderCustomEmailHtml } from './email'
import { draftEmail, MAX_INTENT_CHARS, type EmailDraftContext } from './ai-email-draft'

describe('dedupeRecipients', () => {
  it('lowercases, drops invalid and repeated addresses', () => {
    expect(dedupeRecipients([
      { email: 'Ana@Example.com', name: 'Ana' },
      { email: 'ana@example.com', name: 'Ana bis' },
      { email: 'no-at-sign', name: 'X' },
      { email: null, name: 'Sin email' },
      { email: ' pau@example.com ', name: '' },
    ])).toEqual([
      { email: 'ana@example.com', name: 'Ana' },
      { email: 'pau@example.com', name: 'pau@example.com' },
    ])
  })
})

describe('campaignId', () => {
  const audience = { type: 'all_participants' } as const
  it('is stable for the same message and changes with the text', () => {
    expect(campaignId('c1', audience, 'Hola', 'Texto')).toBe(campaignId('c1', audience, ' Hola ', 'Texto '))
    expect(campaignId('c1', audience, 'Hola', 'Texto')).not.toBe(campaignId('c1', audience, 'Hola', 'Otro'))
    expect(campaignId('c1', audience, 'Hola', 'Texto')).not.toBe(campaignId('c2', audience, 'Hola', 'Texto'))
  })
})

describe('AudienceSchema', () => {
  it('rejects addresses smuggled in instead of ids', () => {
    expect(AudienceSchema.safeParse({ type: 'participants', participantIds: ['someone@example.com'] }).success).toBe(false)
    expect(AudienceSchema.safeParse({ type: 'emails', emails: ['x@y.z'] }).success).toBe(false)
  })
})

describe('mapLimited', () => {
  it('keeps order and never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimited([1, 2, 3, 4, 5], 2, async (n) => {
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 1))
      running--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBeLessThanOrEqual(2)
  })
})

describe('renderCustomEmailHtml', () => {
  it('escapes everything the organiser or a model wrote', () => {
    const html = renderCustomEmailHtml({
      orgName: 'Fundació <b>X</b>',
      contestName: 'Concurso',
      subject: 'Hola <script>',
      body: 'Primera línea\nsegunda <a href="http://evil">clic</a>\n\nOtro párrafo',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<a href="http://evil">')
    expect(html).not.toContain('<b>X</b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Primera línea<br>segunda')
    expect((html.match(/<p style="margin:0 0 14px/g) ?? []).length).toBe(2)
  })
})

describe('draftEmail', () => {
  const ctx: EmailDraftContext = {
    orgName: 'Fundació X',
    contestName: 'Concurs de Piano',
    locale: 'ca',
    audienceLabel: 'los participantes de Piano infantil',
    facts: ['Fecha de la ronda: 2026-10-12'],
  }

  it('returns the draft and passes language, audience and facts to the model', async () => {
    const call = vi.fn().mockResolvedValue({ subject: ' Recordatori ', body: ' Hola a tothom ' })
    expect(await draftEmail('Recordar convocatoria a las 9', ctx, call)).toEqual({ ok: true, subject: 'Recordatori', body: 'Hola a tothom' })
    const { system, user } = call.mock.calls[0]![0]
    expect(system).toContain('catalán')
    expect(system).toContain('[COMPLETAR')
    expect(user).toContain('Piano infantil')
    expect(user).toContain('2026-10-12')
  })

  it('does not call the model without an intent or with too long a one', async () => {
    const call = vi.fn()
    expect(await draftEmail('  ', ctx, call)).toEqual({ ok: false, reason: 'empty_intent' })
    expect(await draftEmail('x'.repeat(MAX_INTENT_CHARS + 1), ctx, call)).toEqual({ ok: false, reason: 'intent_too_long' })
    expect(call).not.toHaveBeenCalled()
  })

  it('retries once on an empty answer, then gives up', async () => {
    const call = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ subject: 'A', body: 'B' })
    expect((await draftEmail('algo', ctx, call)).ok).toBe(true)
    const empty = vi.fn().mockResolvedValue({ subject: '', body: '' })
    expect(await draftEmail('algo', ctx, empty)).toEqual({ ok: false, reason: 'no_draft' })
    expect(empty).toHaveBeenCalledTimes(2)
  })
})
