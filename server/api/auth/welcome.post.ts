import { defineEventHandler, readBody, createError } from 'h3'
import { sendWelcomeEmail } from '../../utils/email'
import { requireAuth } from '../../utils/supabase'
import { z } from 'zod'

const welcomeEmailSchema = z.object({
  email: z.string().email(),
  first_name: z.string().nullable().optional(),
  marketing_consent: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  try {
    const body = await readBody(event)
    const validated = welcomeEmailSchema.parse(body)

    // Only allow sending welcome email to the authenticated user's own email
    if (validated.email !== user.email) {
      throw createError({ statusCode: 403, statusMessage: 'Can only send welcome email to your own address' })
    }

    const emailResult = await sendWelcomeEmail({
      to: validated.email,
      first_name: validated.first_name ?? null,
      email: validated.email,
      marketing_consent: validated.marketing_consent,
    })

    return {
      success: true,
      message: 'Welcome email queued',
      result: emailResult,
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        message: 'Invalid payload',
        data: error.issues,
      })
    }
    throw error
  }
})
