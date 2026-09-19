// server/api/rounds/[id]/pdf/rehearsals.get.ts
// Rehearsal sheet of a round as a PDF (KAN-20), on the shared template (KAN-19).
//
// Organisers only: the owner, or an accepted contest member with the
// `organizer` role. Judges and viewers are contest members too, and
// `requireOrgOwnerOrMember` alone would let them through.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { createDocument } from '~~/server/utils/pdf/document'
import { pdfFilename, sendPdf } from '~~/server/utils/pdf/response'
import { buildRehearsalRows, type RehearsalSource } from '~~/server/utils/pdf/rehearsal-rows'
import { fill, pdfStrings, resolveLocale } from '~~/shared/pdf-i18n'

interface RoundRow {
  name: string
  category_id: string
  categories: {
    name: string
    contest_id: string
    contests: {
      name: string
      call_offset_minutes: number | null
      organizations: { name: string | null; locale: string | null } | null
    } | null
  } | null
}

interface ParticipantRow {
  rehearsal_time: string | null
  rehearsal_room: string | null
  rehearsal_accompanist: string | null
  participant: { name: string | null; first_name: string | null; last_name: string | null } | null
}

export default defineEventHandler(async (event) => {
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  const admin = serverSupabaseAdmin()

  const { data, error } = await admin
    .from('rounds')
    .select('name, category_id, categories(name, contest_id, contests(name, call_offset_minutes, organizations(name, locale)))')
    .eq('id', roundId)
    .maybeSingle()
  if (error) throw internalError(event, error, 'rounds.select')
  const round = data as unknown as RoundRow | null
  const category = round?.categories
  if (!round || !category?.contest_id) throw createError({ statusCode: 404, statusMessage: 'Round not found' })

  await requireContestOrganizer(event, category.contest_id)

  const { data: rows, error: rowsError } = await admin
    .from('round_participants')
    .select('rehearsal_time, rehearsal_room, rehearsal_accompanist, participant:participants(name, first_name, last_name)')
    .eq('round_id', roundId)
  if (rowsError) throw internalError(event, rowsError, 'round_participants.select')

  const contest = category.contests
  const offset = contest?.call_offset_minutes ?? null
  const locale = resolveLocale(contest?.organizations?.locale)

  const sources: RehearsalSource[] = ((rows as unknown as ParticipantRow[] | null) ?? []).map(r => ({
    name: r.participant?.name
      || `${r.participant?.first_name ?? ''} ${r.participant?.last_name ?? ''}`.trim()
      || '—',
    category: category.name,
    rehearsal_time: r.rehearsal_time,
    rehearsal_room: r.rehearsal_room,
    rehearsal_accompanist: r.rehearsal_accompanist,
  }))
  const lines = buildRehearsalRows(sources, offset)

  const t = pdfStrings(locale)
  const pdf = createDocument({
    title: t.rehearsalsTitle,
    contestName: contest?.name ?? '',
    subtitle: `${category.name}  ·  ${round.name}`,
    orgName: contest?.organizations?.name ?? null,
    locale,
  })
  pdf.note(offset !== null ? fill(t.callOffsetNote, { minutes: offset }) : t.noCallOffset)
  pdf.table(
    [
      { label: t.callTime, width: 0.14, bold: true },
      { label: t.rehearsalTime, width: 0.14, bold: true },
      { label: t.participant, width: 0.30, bold: true },
      { label: t.category, width: 0.16 },
      { label: t.room, width: 0.12 },
      { label: t.accompanist, width: 0.14 },
    ],
    lines.map(l => [l.call, l.rehearsal, l.name, l.category, l.room, l.accompanist]),
    t.noRows,
  )

  return sendPdf(event, pdf.toBuffer(), pdfFilename(t.rehearsalsTitle, contest?.name, round.name))
})
