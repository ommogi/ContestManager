import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()
  const organizationId = getRouterParam(event, 'orgId')
  const body = await readBody(event)

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Organization ID is required'
    })
  }

  if (organizationId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const { full_name, email, specialty } = body
  if (!full_name || !email) {
    throw createError({ statusCode: 400, statusMessage: 'Full name and email are required' })
  }

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
