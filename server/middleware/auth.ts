import { defineEventHandler, getHeader, getCookie, createError } from 'h3'
import { serverSupabaseAdmin } from '../utils/supabase'

export default defineEventHandler(async (event) => {
  // Only intercept API endpoints, let frontend handle its own auth middleware
  if (!event.path.startsWith('/api/') || event.path.startsWith('/api/_')) return

  const authHeader = getHeader(event, 'authorization')

  let token = ''
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1] || ''
  }

  if (token) {
    const adminClient = serverSupabaseAdmin()
    const { data: { user }, error } = await adminClient.auth.getUser(token)

    if (error || !user) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    event.context.user = user
  }
})
