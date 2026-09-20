import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseUser, serverSupabaseAdmin, requireAuth, internalError } from '~~/server/utils/supabase'
import { sendEnrollmentEmail } from '~~/server/utils/email'
import { notifyOrganization } from '~~/server/services/org-notifications'
import { EnrollBodySchema } from '~~/server/utils/schemas'
import {
  assertOwnedUploadPaths,
  collectUploadPaths,
  confirmInscriptionUploads,
  persistParticipantFormResponses,
  prepareFormSubmission,
  stripHiddenCoreValues,
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
  // dni/country/phone are read further down, once the published schema says
  // whether this contest asks for them at all (KAN-70).
  // `email` is required by the schema, so there is no `?? null` and no fallback
  // to `user.email` (KAN-65). That fallback used to fill `participants.email`
  // from the authenticated session whenever the participant did not supply one,
  // which made hiding the field in the builder a promise the server broke. The
  // field is irreducible now, so the body always carries the address the
  // participant actually typed — and nothing else reaches the database.
  const email = parsed.data.email

  const client = serverSupabaseUser(event)
  const admin = serverSupabaseAdmin()

  // Validate the configurable form *before* anything is created (KAN-49).
  // Runs on every request, not only when the body carries `responses`: the
  // published schema is re-read here, so a handcrafted request that omits the
  // key cannot skip a required field. Returns null when the contest has no
  // published form, which leaves the rest of this handler untouched.
  const submission = await prepareFormSubmission(admin, token, parsed.data)

  // Drop the core values this contest's form does not ask for (KAN-70).
  //
  // `optionalCoreValue()` on the public page already sends `null` for a hidden
  // field, so nothing the UI produces changes shape here; what changes is that
  // a handcrafted body can no longer put a DNI into `participants.dni` for a
  // contest whose form hides the DNI. Silently, by design — see
  // `stripHiddenCoreValues`.
  //
  // `submission` is null when the contest has no published form. Then there is
  // no such thing as a hidden field and the body passes through exactly as it
  // did before, which is what keeps the existing contests untouched.
  const { dni, country, phone } = stripHiddenCoreValues(
    {
      dni: parsed.data.dni ?? null,
      country: parsed.data.country ?? null,
      phone: parsed.data.phone ?? null,
    },
    submission?.hiddenCoreColumns,
  )

  // Object keys are `{contest_id}/{user_id}/…`, so a reference to somebody
  // else's upload is detectable before anything is created. Runs here rather
  // than after the RPC so a forged path leaves no participant behind (KAN-49).
  const uploadPaths = submission ? collectUploadPaths(submission.responses) : []
  if (submission) {
    assertOwnedUploadPaths(uploadPaths, { contestId: submission.contestId, userId: user.id })
  }

  const { data, error } = await client.rpc('enroll_participant', {
    p_token: token,
    p_category_id: category_id,
    p_first_name: first_name,
    p_last_name: last_name,
    p_birthdate: birthdate,
    p_dni: dni,
    p_country: country,
    p_email: email,
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

    // ── Confirm the uploaded files (KAN-49) ──────────────────────────────────
    //
    // Until this runs, every file the participant uploaded is still `pending`
    // in `inscription_uploads` and `sweep_orphan_inscription_uploads` will mark
    // it purgeable 24 hours later — so the answers just stored would be left
    // pointing at deleted objects. The same call purges what the participant
    // picked and then discarded, which is why it is made even when the form
    // referenced no file at all (an empty `p_paths` means "keep nothing").
    //
    // Ordering: after the answers, not before. If this step fails the answers
    // are already safe and the file references in them can be recovered from
    // the ledger; the reverse order would confirm files for an inscription
    // whose answers were never stored.
    //
    // Failure policy on THIS path — no money is involved, so there is no Stripe
    // retry to lean on:
    //   · files were referenced → the inscription would silently lose them in
    //     24 hours, so fail loudly and tell the participant to contact the
    //     organization. Same shape as the answer-write failure above.
    //   · nothing was referenced → the only thing missed is the early purge of
    //     discarded uploads, which the orphan sweep does anyway. Log it and let
    //     the inscription succeed; a 500 here would be a lie.
    try {
      await confirmInscriptionUploads(admin, {
        contestId: submission.contestId,
        userId: user.id,
        participantId,
        paths: uploadPaths,
      })
    } catch (e) {
      console.error(
        `[enroll] uploads not confirmed for participant ${participantId} ` +
        `(contest ${submission.contestId}, ${uploadPaths.length} file(s)):`,
        (e as Error)?.message,
      )
      if (uploadPaths.length > 0) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Te has inscrito, pero no hemos podido guardar los archivos adjuntos. Contacta con la organización.',
        })
      }
    }
  }

  // Fire-and-forget confirmation email
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
        to: email,
        first_name,
        contest_name: contest.name,
        category_name: categoryName,
        amount_paid_cents: null,
        is_paid: false,
        contest_slug: contest.slug ?? null,
      })

      // KAN-29: tell the organisation too, if it wants to hear about it.
      void notifyOrganization(admin as never, {
        contestId: contest.id,
        event: 'enrollment_created',
        entityId: String(data),
        subject: `Nueva inscripción · ${contest.name}`,
        title: 'Nueva inscripción',
        lines: [`${first_name} ${last_name} se ha inscrito en ${contest.name}.`],
        facts: [
          { label: 'Participante', value: `${first_name} ${last_name}` },
          { label: 'Categoría', value: categoryName },
          { label: 'Inscripción', value: 'Gratuita' },
        ],
        actionPath: contest.slug ? `/contests/${contest.slug}` : null,
      })
    }
  } catch (e) {
    console.error('[enroll] failed to dispatch email:', e)
  }

  return { participant_id: data }
})
