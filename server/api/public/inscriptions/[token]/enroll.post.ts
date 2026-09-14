import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseUser, serverSupabaseAdmin, requireAuth, internalError } from '~~/server/utils/supabase'
import { sendEnrollmentEmail } from '~~/server/utils/email'
import { EnrollBodySchema } from '~~/server/utils/schemas'
import {
  persistParticipantFormResponses,
  prepareFormSubmission,
} from '~~/server/utils/inscription-form-responses'

const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  auth_required:       { status: 401, message: 'Debes iniciar sesión para inscribirte.' },
  contest_not_found:   { status: 404, message: 'Concurso no encontrado.' },
  registration_closed: { status: 400, message: 'Las inscripciones están cerradas.' },
  category_not_found:  { status: 404, message: 'Categoría no encontrada.' },
  age_below_min:       { status: 400, message: 'No cumples la edad mínima de la categoría.' },
  age_above_max:       { status: 400, message: 'Superas la edad máxima de la categoría.' },
  category_full:       { status: 400, message: 'La categoría está completa.' },
  insufficient_tickets:{ status: 402, message: 'La organización no tiene tickets disponibles.' },
  already_enrolled_in_category: { status: 409, message: 'Ya estás inscrito en esta categoría.' },
  user_is_judge_in_contest:     { status: 409, message: 'Estás asignado como jurado en este concurso y no puedes inscribirte como participante.' },
  contest_active:      { status: 409, message: 'El concurso ya está en curso. Inscripciones cerradas.' },
}

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const rawBody = await readBody(event)
  const parsed = EnrollBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { category_id, first_name, last_name, birthdate } = parsed.data
  const dni = parsed.data.dni ?? null
  const country = parsed.data.country ?? null
  const email = parsed.data.email ?? null
  const phone = parsed.data.phone ?? null

  const client = serverSupabaseUser(event)
  const admin = serverSupabaseAdmin()
  const effectiveEmail = email || user.email

  // Validate the configurable form *before* anything is created (KAN-49).
  // Runs on every request, not only when the body carries `responses`: the
  // published schema is re-read here, so a handcrafted request that omits the
  // key cannot skip a required field. Returns null when the contest has no
  // published form, which leaves the rest of this handler untouched.
  const submission = await prepareFormSubmission(admin, token, parsed.data)

  const { data, error } = await client.rpc('enroll_participant', {
    p_token: token,
    p_category_id: category_id,
    p_first_name: first_name,
    p_last_name: last_name,
    p_birthdate: birthdate,
    p_dni: dni,
    p_country: country,
    p_email: effectiveEmail,
    p_phone: phone,
  })

  if (error) {
    // Unique constraint = already enrolled
    if ((error as any).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Ya estás inscrito en esta categoría.' })
    }
    const key = (error.message || '').toLowerCase()
    for (const k of Object.keys(ERROR_MESSAGES)) {
      if (key.includes(k)) {
        const m = ERROR_MESSAGES[k]
        if (!m) continue
        throw createError({ statusCode: m.status, statusMessage: m.message })
      }
    }
    throw internalError(event, error, 'rpc:enroll_participant')
  }

  const participantId = typeof data === 'string' ? data : null

  // Store the answers now that the participant exists. Not fire-and-forget:
  // losing them silently is exactly the failure this ticket exists to prevent,
  // so the request fails loudly and says what did and did not happen. There is
  // no money on this path, so the participant simply stays enrolled.
  if (submission && participantId) {
    try {
      await persistParticipantFormResponses(admin, participantId, submission)
    } catch (e) {
      console.error(
        `[enroll] form responses not stored for participant ${participantId} ` +
        `(schema ${submission.formSchemaId}):`,
        (e as Error)?.message,
      )
      throw createError({
        statusCode: 500,
        statusMessage: 'Te has inscrito, pero no hemos podido guardar las respuestas del formulario. Contacta con la organización.',
      })
    }
  }

  // Fire-and-forget confirmation email
  if (effectiveEmail) {
    try {
      const [contestRes, categoryRes] = await Promise.all([
        admin.rpc('get_contest_by_token', { p_token: token }),
        admin.from('categories').select('name').eq('id', category_id).single(),
      ])
      const contest = (contestRes.data as any[])?.[0]
      const categoryName = (categoryRes.data as any)?.name ?? 'Categoría'
      if (contest) {
        // Do not await — user should not wait for email delivery
        sendEnrollmentEmail({
          to: effectiveEmail,
          first_name,
          contest_name: contest.name,
          category_name: categoryName,
          amount_paid_cents: null,
          is_paid: false,
          contest_slug: contest.slug ?? null,
        })
      }
    } catch (e) {
      console.error('[enroll] failed to dispatch email:', e)
    }
  }

  return { participant_id: data }
})
