// server/utils/ai-form-draft.ts
// Proposes the custom fields of an inscription form from the contest rules
// (KAN-86, epic KAN-85).
//
// The model fills a deliberately small schema — label, type, options, a few
// hints — and this module turns it into real `FormField`s: stable ids, the
// per-type extras, and the same `FormSchemaBodySchema` the save endpoint uses.
// Asking the model for the full contract directly would hand it id generation,
// `order`, `validation` and the per-type rules, all things code does better.
//
// Core fields are never proposed. They already exist in every form
// (`shared/inscription-form-core.ts`), and a custom "Email" or "DNI" beside the
// core one would ask the participant twice and store the answer in the wrong
// place. The prompt says so, and `isCoreDuplicate` enforces it regardless.
//
// The model call is injected so the logic is testable without the network.

import { z } from 'zod/v4'
// Relative imports: vitest does not resolve the `~~` alias.
import type { FormField, FormFieldType } from '../../shared/inscription-form'
import { CORE_FIELD_DEFINITIONS } from '../../shared/inscription-form-core'
import { FormSchemaBodySchema } from './schemas'

/** Above this the rules are not rules any more; refuse rather than truncate. */
export const MAX_RULES_CHARS = 60_000
/** A form longer than this is a questionnaire, not an inscription. */
export const MAX_PROPOSED_FIELDS = 25

const PROPOSABLE_TYPES = [
  'text', 'textarea', 'number', 'date', 'url',
  'select', 'radio', 'checkbox', 'checkbox-group', 'file',
] as const satisfies readonly FormFieldType[]

const OPTION_TYPES = new Set<FormFieldType>(['select', 'radio', 'checkbox-group'])

/** What the model fills. Nullable rather than optional: structured outputs want every key present. */
export const AiFieldSchema = z.object({
  label: z.string(),
  type: z.enum(PROPOSABLE_TYPES),
  description: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()),
  accept: z.string().nullable(),
  maxSizeMB: z.number().nullable(),
})

export const AiFormDraftSchema = z.object({
  fields: z.array(AiFieldSchema),
  notes: z.string().nullable(),
})

export type AiField = z.infer<typeof AiFieldSchema>
export type AiFormDraft = z.infer<typeof AiFormDraftSchema>

export const SYSTEM_PROMPT = [
  'Eres un asistente que prepara formularios de inscripción para concursos de música.',
  'A partir de las bases de un concurso, propones los campos PERSONALIZADOS que la organización necesita recoger de cada participante.',
  '',
  'El formulario ya incluye siempre estos campos, así que NO los propongas ni variantes suyas:',
  ...CORE_FIELD_DEFINITIONS.map(d => `- ${d.label}`),
  '',
  'Criterios:',
  '- Propón solo lo que las bases piden o necesitan de verdad (instrumento, especialidad, categoría elegida, repertorio, centro de estudios, profesor, acompañante, documentos a adjuntar, autorizaciones, etc.). No inventes requisitos.',
  '- Usa "select" o "radio" cuando las bases dan una lista cerrada (instrumentos admitidos, categorías), con esa lista como opciones.',
  '- Usa "file" para documentos que deban adjuntarse (DNI escaneado, partituras, autorización paterna, justificante). Indica en "accept" los formatos si las bases los dicen, por ejemplo ".pdf,image/*".',
  '- Usa "textarea" para texto largo como el repertorio o un currículum breve.',
  '- Usa "checkbox" para aceptaciones (aceptar las bases, autorizar la grabación).',
  '- Las etiquetas, cortas y en el idioma de las bases. La descripción, solo si aclara algo útil; si no, null.',
  '- "options" vacío salvo en select, radio y checkbox-group.',
  '- En "notes", una o dos frases sobre algo que la organización deba revisar (requisitos ambiguos, datos que conviene pedir aparte). null si no hay nada.',
  `- Como máximo ${MAX_PROPOSED_FIELDS} campos.`,
].join('\n')

export function buildUserPrompt(rules: string): string {
  return `Bases del concurso:\n\n<bases>\n${rules}\n</bases>\n\nPropón los campos personalizados del formulario de inscripción.`
}

/** Lowercase, no accents, words joined by `_`. */
export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

const CORE_LABEL_SLUGS = new Set(CORE_FIELD_DEFINITIONS.map(d => slugify(d.label)))

// Things that are a core field under another name. Matched against the slug,
// so accents and case do not matter.
const CORE_SYNONYMS = /^(nombre|nombre_completo|apellido|apellidos|primer_apellido|segundo_apellido|fecha_de_nacimiento|fecha_nacimiento|edad|dni|nie|pasaporte|dni_nie|documento_de_identidad|numero_de_documento|pais|nacionalidad|telefono|movil|telefono_movil|email|e_mail|correo|correo_electronico)$/

export function isCoreDuplicate(field: Pick<AiField, 'label'>): boolean {
  const slug = slugify(field.label)
  return CORE_LABEL_SLUGS.has(slug) || CORE_SYNONYMS.test(slug)
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || 'campo'
  for (let n = 2; taken.has(id); n++) id = `${base || 'campo'}_${n}`
  taken.add(id)
  return id
}

/**
 * Turns the model's proposal into fields the save endpoint accepts.
 * `existingIds` keeps new ids clear of fields already in the form.
 */
export function toFormFields(draft: AiFormDraft, existingIds: Iterable<string> = []): FormField[] {
  const taken = new Set(existingIds)
  const fields: FormField[] = []

  for (const raw of draft.fields) {
    if (fields.length >= MAX_PROPOSED_FIELDS) break
    const label = raw.label.trim().slice(0, 200)
    if (!label || isCoreDuplicate(raw)) continue

    const base = {
      id: uniqueId(`ai_${slugify(label)}`, taken),
      label,
      required: raw.required,
      order: fields.length,
      hidden: false,
      validation: { required: raw.required },
      ...(raw.description?.trim() ? { description: raw.description.trim().slice(0, 1000) } : {}),
    }

    if (OPTION_TYPES.has(raw.type)) {
      const takenValues = new Set<string>()
      const options = raw.options
        .map(o => o.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 100)
        .map(o => ({ value: uniqueId(slugify(o), takenValues), label: o }))
      // A list with nothing to choose from cannot be saved; drop it rather than
      // invent options the rules never gave.
      if (options.length === 0) continue
      fields.push({ ...base, type: raw.type as 'select' | 'radio' | 'checkbox-group', options } as FormField)
    } else if (raw.type === 'file') {
      const accept = raw.accept?.trim().slice(0, 200)
      const maxSizeMB = raw.maxSizeMB !== null && raw.maxSizeMB > 0
        ? Math.min(raw.maxSizeMB, 25)
        : undefined
      fields.push({
        ...base,
        type: 'file',
        ...(accept ? { accept } : {}),
        ...(maxSizeMB !== undefined ? { maxSizeMB } : {}),
      })
    } else if (raw.type === 'textarea') {
      fields.push({ ...base, type: 'textarea', rows: 4 })
    } else {
      fields.push({ ...base, type: raw.type } as FormField)
    }
  }
  return fields
}

export type AiDraftCall = (input: { system: string, user: string }) => Promise<AiFormDraft | null>

export type AiDraftResult =
  | { ok: true, fields: FormField[], notes: string | null }
  | { ok: false, reason: 'empty_rules' | 'rules_too_long' | 'no_proposal' }

/**
 * Asks once and, if nothing usable comes back, asks once more. A second
 * empty answer is reported, never papered over with a made-up form.
 */
export async function draftFormFromRules(
  rules: string,
  call: AiDraftCall,
  existingIds: Iterable<string> = [],
): Promise<AiDraftResult> {
  const text = rules.trim()
  if (!text) return { ok: false, reason: 'empty_rules' }
  if (text.length > MAX_RULES_CHARS) return { ok: false, reason: 'rules_too_long' }

  const ids = [...existingIds]
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await call({ system: SYSTEM_PROMPT, user: buildUserPrompt(text) })
    if (!draft) continue
    const fields = toFormFields(draft, ids)
    if (fields.length === 0) continue
    // Same gate as the save endpoint: a proposal the builder could not save is
    // not a proposal.
    if (!FormSchemaBodySchema.safeParse({ fields }).success) continue
    return { ok: true, fields, notes: draft.notes?.trim() || null }
  }
  return { ok: false, reason: 'no_proposal' }
}
