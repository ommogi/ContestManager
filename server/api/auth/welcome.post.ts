import { defineEventHandler, readBody, createError } from 'h3'
import { sendWelcomeEmail } from '../../utils/email'
import { z } from 'zod'

const welcomeEmailSchema = z.object({
  email: z.string().email(),
  first_name: z.string().nullable().optional(),
  marketing_consent: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  console.log('📧 [welcome] ========== Endpoint called ==========')
  console.log('[welcome] Request body:', JSON.stringify(await readBody(event), null, 2))
  try {
    const body = await readBody(event)
    console.log('[welcome] Body parsed:', body)
    const validated = welcomeEmailSchema.parse(body)
    console.log('[welcome] Validated:', validated)

    const emailResult = await sendWelcomeEmail({
      to: validated.email,
      first_name: validated.first_name,
      email: validated.email,
      marketing_consent: validated.marketing_consent,
    })
    
    console.log('📧 [welcome] Email result:', emailResult)
    console.log('📧 [welcome] ========== Done ==========')

    return {
      success: true,
      message: 'Welcome email queued',
      result: emailResult,
    }
  } catch (error: any) {
    console.error('❌ [welcome] Error:', error)
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        message: 'Invalid payload',
        data: error.errors,
      })
    }
    throw error
  }
})
