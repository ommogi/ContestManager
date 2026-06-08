import { defineEventHandler } from 'h3'
import { serverSupabaseAdmin } from '../utils/supabase'
import { getStripe } from '../utils/stripe'

export default defineEventHandler(async () => {
  return { status: 'ok' }
})
