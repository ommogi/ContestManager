import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { JudgePoolSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()
  const organizationId = getRouterParam(event, 'orgId')

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organization ID is required'
    })
  }

  if (organizationId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const rawBody = await readBody(event)
  const parsed = JudgePoolSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { email, specialty } = parsed.data
  // Use the email's local part as a placeholder name when none is provided —
  // judges.full_name is NOT NULL but UI shows it; the real name comes in once
  // the judge signs up and fills their profile.
  const full_name = parsed.data.full_name?.trim() || email.split('@')[0] || email

  // 1. Buscar o Crear el perfil global del Juez
  let { data: judge, error: judgeError } = await client
    .from('judges')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!judge) {
    const { data: newJudge, error: createErrorMsg } = await client
      .from('judges')
      .insert({ full_name, email, specialty })
      .select('id')
      .single()

    if (createErrorMsg) throw createError({ statusCode: 500, statusMessage: createErrorMsg.message })
    judge = newJudge
  }

  // 2. Crear el vínculo en la organización si no existe ya
  const { data: membership, error: memberError } = await client
    .from('judge_pool_members')
    .insert({
      organization_id: organizationId,
      judge_id: judge.id
    })
    .select()
    .single()

  if (memberError && memberError.code !== '23505') { // 23505 is unique violation
    throw createError({
      statusCode: 500,
      statusMessage: memberError.message
    })
  }

  // Retornamos el perfil completo para el frontend
  return {
    ...membership,
    full_name,
    email,
    specialty,
    judge_id: judge.id
  }
})
