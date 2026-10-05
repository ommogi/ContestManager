// server/utils/assistant-loop.ts
// The organiser assistant's conversation loop (feat/ai, Sidekick-style).
//
// One request = one user turn: the model may call tools several times
// (bounded), then answers in text. Proposals produced by propose_* tools are
// collected and returned next to the answer; the UI shows them as cards the
// organiser confirms. The model call and the tool runner are injected so the
// loop is testable without the network or a database.

import { TOOL_DEFINITIONS, type Proposal, type ToolResult } from '../services/assistant-tools'

export const MAX_TOOL_ROUNDS = 6
export const MAX_HISTORY = 20
export const MAX_MESSAGE_CHARS = 4_000

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PageContext {
  contestId?: string | null
  contestName?: string | null
  categoryId?: string | null
  roundId?: string | null
  /** Today's date in the organiser's view, YYYY-MM-DD. */
  today?: string | null
}

export function buildSystemPrompt(orgName: string, page: PageContext): string {
  const where = [
    page.contestId ? `- Concurso abierto: ${page.contestName ?? ''} (contest_id ${page.contestId})` : null,
    page.categoryId ? `- Categoría abierta: category_id ${page.categoryId}` : null,
    page.roundId ? `- Ronda abierta: round_id ${page.roundId}` : null,
    page.today ? `- Hoy es ${page.today}` : null,
  ].filter(Boolean).join('\n')

  return [
    `Eres el asistente de Contest Manager para la organización "${orgName}", que gestiona concursos de música.`,
    'Respondes en el idioma del usuario, de forma breve y concreta.',
    '',
    'Reglas:',
    '- Usa las herramientas para consultar datos; nunca inventes nombres, horas, notas ni cifras. Si una herramienta no lo devuelve, dilo.',
    '- Cuando des un dato, di de qué concurso y ronda sale.',
    '- Tú no cambias nada. Para cambiar algo, usa una herramienta propose_*: el organizador verá una tarjeta y decidirá si la confirma. Di que lo has dejado propuesto, no que está hecho.',
    '- Las horas van en formato YYYY-MM-DDTHH:mm, igual que en round_schedule.',
    '- Si falta un dato para proponer algo (qué participante, qué hora), pregúntalo en vez de suponerlo.',
    '- No tienes acceso a DNI, teléfonos ni emails de participantes, y no los pidas.',
    where ? `\nContexto de la pantalla:\n${where}` : '',
  ].join('\n')
}

/** What the model is given: the tool list in its wire shape. */
export const TOOLS = TOOL_DEFINITIONS

export interface FunctionCall { type: 'function_call', call_id: string, name: string, arguments: string }
export interface ModelTurn {
  /** Every output item, echoed back as input on the next round. */
  output: unknown[]
  calls: FunctionCall[]
  text: string
}

export type ModelCall = (input: { instructions: string, input: unknown[] }) => Promise<ModelTurn>
export type ToolRunner = (name: string, args: string) => Promise<ToolResult>

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
}

export async function runAssistant(opts: {
  messages: ChatMessage[]
  instructions: string
  callModel: ModelCall
  runTool: ToolRunner
}): Promise<{ reply: string, proposals: Proposal[], toolCalls: number }> {
  const input: unknown[] = trimHistory(opts.messages).map(m => ({ role: m.role, content: m.content }))
  const proposals: Proposal[] = []
  let toolCalls = 0

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const turn = await opts.callModel({ instructions: opts.instructions, input })
    if (turn.calls.length === 0 || round === MAX_TOOL_ROUNDS) {
      const reply = turn.text.trim()
        || (turn.calls.length ? 'He necesitado demasiadas consultas para responder. ¿Puedes concretar más la pregunta?' : 'No tengo respuesta para eso.')
      return { reply, proposals, toolCalls }
    }

    input.push(...turn.output)
    for (const call of turn.calls) {
      toolCalls++
      const result = await opts.runTool(call.name, call.arguments)
      if (result.proposal) proposals.push(result.proposal)
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result.data) })
    }
  }
  return { reply: 'No tengo respuesta para eso.', proposals, toolCalls }
}
