import { defineEventHandler, createError, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import type { Database, ContestFormPayload } from '~~/types'

export default defineEventHandler(async (event) => {
  const { user, org } = await requireOrgOwner(event)

  const client = serverSupabaseAdmin()
  const body = await readBody<ContestFormPayload>(event)

  if (!body.name) throw createError({ statusCode: 400, statusMessage: "El nombre es obligatorio" })

  // Extraemos variables que necesitan mapeo personalizado
  const { short_description, prizes, rules, ...restBody } = body

  // Create slug from name, ensure unique within org
  const baseSlug = restBody.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let slug = baseSlug
  let suffix = 1
  while (true) {
    const { data: existing } = await client
      .from('contests')
      .select('id')
      .eq('slug', slug)
      .eq('organization_id', org.id)
      .maybeSingle()
    if (!existing) break
    slug = `${baseSlug}-${++suffix}`
  }

  const { data, error } = await client.from('contests').insert({
    name: restBody.name,
    starts_at: restBody.starts_at || null,
    ends_at: restBody.ends_at || null,
    organization_id: org.id,
    slug,
    description: short_description || null,
    rules: rules || null,
    settings: {
      prizes: prizes || null,
    }
  }).select().single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
