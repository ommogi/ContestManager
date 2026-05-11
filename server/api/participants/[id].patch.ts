import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseClient, serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

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

  const body = await readBody(event)
  const { data, error } = await serverSupabaseClient(event)
    .from('participants').update(body).eq('id', id).select().single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
