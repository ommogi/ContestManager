import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { ParticipantPatchSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const admin  = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // Block edit if parent contest is active or terminal
  const { data: row } = await admin
    .from('participants')
    .select('contests:contest_id(status)')
    .eq('id', id)
    .single() as any

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, (row as any)?.contests?.contest_id || '')

  const status = row?.contests?.status
  if (status && ['active','finished','cancelled'].includes(status)) {
    throw createError({ statusCode: 409, statusMessage: 'El concurso ya está en curso. No se pueden gestionar inscripciones.' })
  }

  const rawBody = await readBody(event)
  const parsed = ParticipantPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const updates: Record<string, unknown> = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  )

  // Derive name from first_name / last_name when either changes
  if (parsed.data.first_name !== undefined || parsed.data.last_name !== undefined) {
    const fn = parsed.data.first_name ?? (row as any)?.first_name ?? ''
    const ln = parsed.data.last_name ?? (row as any)?.last_name ?? ''
    updates.name = `${fn} ${ln}`.trim() || null
  }

  const { data, error } = await admin
    .from('participants').update(updates).eq('id', id).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
