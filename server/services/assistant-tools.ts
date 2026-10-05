// server/services/assistant-tools.ts
// The tools the organiser's assistant can call (feat/ai, Sidekick-style).
//
// Two kinds:
//   * read tools return facts about the caller's own organisation, trimmed to
//     what a question needs — names, statuses, times. Never DNI, phone, email
//     or birthdate: those do not go to the model.
//   * propose_* tools write NOTHING. They validate the target, then return a
//     Proposal: the exact request an existing endpoint would receive, with
//     warnings. The organiser confirms it in the UI, which calls that endpoint
//     with their own session, so every write still passes the endpoint's gate
//     and validation.
//
// Every id coming from the model is re-scoped to the organisation here; a
// round or contest of another tenant is "not found", never an error that
// leaks its existence.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ToolContext {
  client: SupabaseClient
  orgId: string
}

export interface Proposal {
  kind: 'request' | 'email'
  title: string
  description: string
  /** For kind 'request': what the UI sends on confirm. */
  request?: { method: 'PATCH' | 'POST', url: string, body: Record<string, unknown> }
  /** For kind 'email': what the composer opens with. */
  email?: { contestId: string, contestName: string, audience: Record<string, unknown>, intent: string }
  warnings: string[]
}

export type ToolResult = { data: unknown, proposal?: Proposal }

class NotFound extends Error {}

const MAX_ROWS = 200

function person(p: { first_name?: string | null, last_name?: string | null, name?: string | null } | null | undefined) {
  if (!p) return ''
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || ''
}

async function contestInOrg(ctx: ToolContext, contestId: string) {
  const { data } = await ctx.client
    .from('contests')
    .select('id, name, slug, status, starts_at, ends_at')
    .eq('id', contestId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!data) throw new NotFound('contest_not_found')
  return data as { id: string, name: string, slug: string, status: string, starts_at: string | null, ends_at: string | null }
}

async function roundInOrg(ctx: ToolContext, roundId: string) {
  const { data } = await ctx.client
    .from('rounds')
    .select('id, name, status, session_date, session_start, session_end, category_id, categories(id, name, contest_id)')
    .eq('id', roundId)
    .maybeSingle()
  const round = data as any
  if (!round?.categories?.contest_id) throw new NotFound('round_not_found')
  const contest = await contestInOrg(ctx, round.categories.contest_id)
  return { round, contest }
}

// ─── Tool definitions (OpenAI function tools, strict JSON schema) ───────────

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})
const str = (description: string) => ({ type: 'string', description })
const nstr = (description: string) => ({ type: ['string', 'null'], description })

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'list_contests',
    description: 'Lista los concursos de la organización con su id, estado y fechas.',
    parameters: obj({}),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'contest_overview',
    description: 'Resumen de un concurso: categorías, rondas (con estado y franja) y recuento de participantes por estado de pago.',
    parameters: obj({ contest_id: str('id del concurso') }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'round_schedule',
    description: 'Orden de actuación de una ronda: número de sorteo, nombre, hora de actuación y de ensayo, sala. Incluye round_participant_id para proponer cambios.',
    parameters: obj({ round_id: str('id de la ronda') }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'participants',
    description: 'Participantes de un concurso con categoría y estado de pago (free, pending, paid, refunded). Sin datos personales.',
    parameters: obj({
      contest_id: str('id del concurso'),
      payment_status: nstr('filtrar por estado de pago, o null'),
      category_id: nstr('filtrar por categoría, o null'),
    }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'scores_summary',
    description: 'Puntuaciones de una ronda por participante: media, número de votos y cuántos jurados faltan.',
    parameters: obj({ round_id: str('id de la ronda') }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'propose_slot_change',
    description: 'Propone cambiar la hora de actuación, de ensayo o la sala de un participante en una ronda. No cambia nada: el organizador lo confirma. Formato de hora: YYYY-MM-DDTHH:mm, el mismo que devuelve round_schedule.',
    parameters: obj({
      round_participant_id: str('round_participant_id de round_schedule'),
      performance_time: nstr('nueva hora de actuación o null si no cambia'),
      rehearsal_time: nstr('nueva hora de ensayo o null si no cambia'),
      rehearsal_room: nstr('nueva sala de ensayo o null si no cambia'),
      reason: str('motivo breve, en una frase'),
    }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'propose_schedule_generation',
    description: 'Propone generar automáticamente los turnos de una ronda a partir del orden de sorteo y la franja. No cambia nada hasta que el organizador confirma.',
    parameters: obj({ round_id: str('id de la ronda') }),
    strict: true,
  },
  {
    type: 'function' as const,
    name: 'propose_email',
    description: 'Propone escribir un correo. Abre el redactor con la intención ya escrita para que el organizador revise y envíe.',
    parameters: obj({
      contest_id: str('id del concurso'),
      audience: { type: 'string', enum: ['all_participants', 'category', 'round', 'judges'], description: 'a quién va' },
      target_id: nstr('id de la categoría o ronda si audience es category o round; si no, null'),
      intent: str('lo que hay que comunicar, en una o dos frases'),
    }),
    strict: true,
  },
]

// ─── Implementations ─────────────────────────────────────────────────────────

type Args = Record<string, any>

const handlers: Record<string, (ctx: ToolContext, a: Args) => Promise<ToolResult>> = {
  async list_contests(ctx) {
    const { data } = await ctx.client
      .from('contests')
      .select('id, name, slug, status, starts_at, ends_at')
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    return { data: data ?? [] }
  },

  async contest_overview(ctx, a) {
    const contest = await contestInOrg(ctx, a.contest_id)
    const [{ data: categories }, { data: rounds }, { data: participants }] = await Promise.all([
      ctx.client.from('categories').select('id, name').eq('contest_id', contest.id).order('order'),
      ctx.client
        .from('rounds')
        .select('id, name, status, "order", session_date, session_start, session_end, category_id, categories!inner(contest_id)')
        .eq('categories.contest_id', contest.id),
      ctx.client.from('participants').select('payment_status').eq('contest_id', contest.id),
    ])
    const byPayment: Record<string, number> = {}
    for (const p of participants ?? []) {
      const k = (p as any).payment_status ?? 'unknown'
      byPayment[k] = (byPayment[k] ?? 0) + 1
    }
    return {
      data: {
        contest,
        categories: categories ?? [],
        rounds: (rounds ?? []).map((r: any) => ({
          id: r.id, name: r.name, status: r.status, order: r.order, category_id: r.category_id,
          session_date: r.session_date, session_start: r.session_start, session_end: r.session_end,
        })),
        participants_total: (participants ?? []).length,
        participants_by_payment_status: byPayment,
      },
    }
  },

  async round_schedule(ctx, a) {
    const { round, contest } = await roundInOrg(ctx, a.round_id)
    const { data } = await ctx.client
      .from('round_participants')
      .select('id, draw_number, performance_time, performance_end_time, performance_minutes, rehearsal_time, rehearsal_room, participants(first_name, last_name, name)')
      .eq('round_id', round.id)
      .order('draw_number', { ascending: true, nullsFirst: false })
      .limit(MAX_ROWS)
    return {
      data: {
        contest: contest.name,
        round: { id: round.id, name: round.name, status: round.status, category: round.categories?.name, session_date: round.session_date, session_start: round.session_start, session_end: round.session_end },
        slots: (data ?? []).map((rp: any) => ({
          round_participant_id: rp.id,
          draw_number: rp.draw_number,
          name: person(rp.participants),
          performance_time: rp.performance_time,
          performance_end_time: rp.performance_end_time,
          performance_minutes: rp.performance_minutes,
          rehearsal_time: rp.rehearsal_time,
          rehearsal_room: rp.rehearsal_room,
        })),
      },
    }
  },

  async participants(ctx, a) {
    const contest = await contestInOrg(ctx, a.contest_id)
    let q = ctx.client
      .from('participants')
      .select('first_name, last_name, name, payment_status, status, categories(name)')
      .eq('contest_id', contest.id)
      .limit(MAX_ROWS)
    if (a.payment_status) q = q.eq('payment_status', a.payment_status)
    if (a.category_id) q = q.eq('category_id', a.category_id)
    const { data } = await q
    return {
      data: (data ?? []).map((p: any) => ({
        name: person(p), category: p.categories?.name ?? null, payment_status: p.payment_status, status: p.status,
      })),
    }
  },

  async scores_summary(ctx, a) {
    const { round } = await roundInOrg(ctx, a.round_id)
    const [{ data: slots }, { data: scores }, { count: judges }] = await Promise.all([
      ctx.client.from('round_participants').select('participant_id, participants(first_name, last_name, name)').eq('round_id', round.id),
      ctx.client.from('scores').select('participant_id, value').eq('round_id', round.id),
      ctx.client.from('contest_members').select('id', { count: 'exact', head: true })
        .eq('contest_id', round.categories.contest_id).eq('role', 'judge').eq('invitation_status', 'accepted'),
    ])
    const values = new Map<string, number[]>()
    for (const s of scores ?? []) {
      const list = values.get((s as any).participant_id) ?? []
      list.push(Number((s as any).value))
      values.set((s as any).participant_id, list)
    }
    return {
      data: {
        round: round.name,
        judges: judges ?? 0,
        participants: (slots ?? []).map((rp: any) => {
          const v = values.get(rp.participant_id) ?? []
          return {
            name: person(rp.participants),
            votes: v.length,
            average: v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 100) / 100 : null,
            missing_votes: Math.max(0, (judges ?? 0) - v.length),
          }
        }),
      },
    }
  },

  async propose_slot_change(ctx, a) {
    const { data } = await ctx.client
      .from('round_participants')
      .select('id, round_id, performance_time, rehearsal_time, rehearsal_room, participants(first_name, last_name, name)')
      .eq('id', a.round_participant_id)
      .maybeSingle()
    if (!data) throw new NotFound('round_participant_not_found')
    const rp = data as any
    const { round } = await roundInOrg(ctx, rp.round_id)

    const body: Record<string, string> = {}
    const changes: string[] = []
    for (const [key, label] of [['performance_time', 'actuación'], ['rehearsal_time', 'ensayo'], ['rehearsal_room', 'sala de ensayo']] as const) {
      if (a[key] && a[key] !== rp[key]) {
        body[key] = a[key]
        changes.push(`${label}: ${rp[key] ?? '—'} → ${a[key]}`)
      }
    }
    if (changes.length === 0) return { data: { ok: false, reason: 'Nada que cambiar: los valores son los actuales.' } }

    const warnings = []
    if (body.performance_time) warnings.push('El participante recibirá un email con el nuevo horario.')
    if (round.status === 'closed') warnings.push('La ronda está cerrada: el cambio será rechazado.')

    return {
      data: { ok: true, proposed: changes },
      proposal: {
        kind: 'request',
        title: `Mover a ${person(rp.participants)} (${round.name})`,
        description: `${changes.join(' · ')}. ${a.reason}`,
        request: { method: 'PATCH', url: `/api/round-participants/${rp.id}`, body },
        warnings,
      },
    }
  },

  async propose_schedule_generation(ctx, a) {
    const { round } = await roundInOrg(ctx, a.round_id)
    return {
      data: { ok: true },
      proposal: {
        kind: 'request',
        title: `Generar turnos de ${round.categories?.name ?? ''} · ${round.name}`.trim(),
        description: `Reparte los turnos por orden de sorteo en la franja ${round.session_date ?? '(sin fecha)'} ${round.session_start ?? ''}–${round.session_end ?? ''}.`,
        request: { method: 'POST', url: `/api/rounds/${round.id}/schedule/generate`, body: { dryRun: false, overwrite: false } },
        warnings: [
          'No sobrescribe turnos ya generados: si existen, la app lo indicará.',
          'Si los participantes no caben en la franja, no se aplica nada.',
        ],
      },
    }
  },

  async propose_email(ctx, a) {
    const contest = await contestInOrg(ctx, a.contest_id)
    let audience: Record<string, unknown> = { type: a.audience }
    if (a.audience === 'category') {
      if (!a.target_id) return { data: { ok: false, reason: 'Falta la categoría.' } }
      audience = { type: 'category', categoryId: a.target_id }
    }
    if (a.audience === 'round') {
      if (!a.target_id) return { data: { ok: false, reason: 'Falta la ronda.' } }
      await roundInOrg(ctx, a.target_id)
      audience = { type: 'round', roundId: a.target_id }
    }
    return {
      data: { ok: true },
      proposal: {
        kind: 'email',
        title: `Escribir a ${a.audience === 'judges' ? 'el jurado' : 'los participantes'} · ${contest.name}`,
        description: a.intent,
        email: { contestId: contest.id, contestName: contest.name, audience, intent: a.intent },
        warnings: ['Se abrirá el redactor: revisa el texto y los destinatarios antes de enviar.'],
      },
    }
  },
}

/** Runs one tool call. Unknown tools and foreign ids answer as data, so the model can recover. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string): Promise<ToolResult> {
  const handler = handlers[name]
  if (!handler) return { data: { error: 'unknown_tool' } }
  let args: Args
  try {
    args = JSON.parse(rawArgs || '{}')
  } catch {
    return { data: { error: 'invalid_arguments' } }
  }
  try {
    return await handler(ctx, args)
  } catch (e) {
    if (e instanceof NotFound) return { data: { error: e.message } }
    throw e
  }
}
