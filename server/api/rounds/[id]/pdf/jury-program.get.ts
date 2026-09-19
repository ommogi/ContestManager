// server/api/rounds/[id]/pdf/jury-program.get.ts
// Jury programme of a round as a PDF (KAN-22): a page per participant in
// performance order, with their repertoire and room for handwritten notes.
//
// For the jury and the organisation: the owner, or an accepted member whose
// role is `organizer` or `judge`. Viewers are contest members too, and are
// refused.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { createDocument } from '~~/server/utils/pdf/document'
import { pdfFilename, sendPdf } from '~~/server/utils/pdf/response'
import { buildJuryProgram, type JurySource } from '~~/server/utils/pdf/jury-program'
import { pdfStrings, resolveLocale } from '~~/shared/pdf-i18n'

interface RoundRow {
  name: string
  categories: {
    name: string
    contest_id: string
    contests: {
      name: string
      organizations: { name: string | null; locale: string | null } | null
    } | null
  } | null
}

interface ParticipantRow {
  draw_number: number | null
  order: number | null
  performance_time: string | null
  participant: { name: string | null; first_name: string | null; last_name: string | null } | null
  repertoire: Array<{
    position: number
    duration_seconds: number | null
    work: { title: string; catalog_ref: string | null; duration_seconds: number | null; composer: { name: string } | null } | null
  }> | null
}

export default defineEventHandler(async (event) => {
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  const admin = serverSupabaseAdmin()

  const { data, error } = await admin
    .from('rounds')
    .select('name, categories(name, contest_id, contests(name, organizations(name, locale)))')
    .eq('id', roundId)
    .maybeSingle()
  if (error) throw internalError(event, error, 'rounds.select')
  const round = data as unknown as RoundRow | null
  const category = round?.categories
  if (!round || !category?.contest_id) throw createError({ statusCode: 404, statusMessage: 'Round not found' })

  const access = await requireOrgOwnerOrMember(event, category.contest_id)
  if (access.member && !['organizer', 'judge'].includes(access.member.role)) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const { data: rows, error: rowsError } = await admin
    .from('round_participants')
    .select(`
      draw_number, order, performance_time,
      participant:participants(name, first_name, last_name),
      repertoire:round_participant_works(position, duration_seconds, work:works(title, catalog_ref, duration_seconds, composer:composers(name)))
    `)
    .eq('round_id', roundId)
  if (rowsError) throw internalError(event, rowsError, 'round_participants.select')

  const sources: JurySource[] = ((rows as unknown as ParticipantRow[] | null) ?? []).map(r => ({
    name: r.participant?.name
      || `${r.participant?.first_name ?? ''} ${r.participant?.last_name ?? ''}`.trim()
      || '—',
    draw_number: r.draw_number,
    order: r.order,
    performance_time: r.performance_time,
    works: (r.repertoire ?? []).filter(w => w.work).map(w => ({
      position: w.position,
      composer: w.work!.composer?.name ?? '',
      title: w.work!.title,
      catalog_ref: w.work!.catalog_ref,
      duration_seconds: w.duration_seconds,
      catalog_seconds: w.work!.duration_seconds,
    })),
  }))

  const contest = category.contests
  const locale = resolveLocale(contest?.organizations?.locale)
  const t = pdfStrings(locale)
  const pdf = createDocument({
    title: t.juryProgramTitle,
    contestName: contest?.name ?? '',
    subtitle: `${category.name}  ·  ${round.name}`,
    orgName: contest?.organizations?.name ?? null,
    locale,
  })

  const blocks = buildJuryProgram(sources)
  if (blocks.length === 0) pdf.note(t.noRows)

  blocks.forEach((block, i) => {
    // One participant per page, so each judge can annotate on their own sheet.
    if (i > 0) pdf.newPage()
    const meta = [
      block.draw ? `${t.drawNumber} ${block.draw}` : '',
      category.name,
      block.time ? `${t.performanceTime} ${block.time}` : '',
    ].filter(Boolean).join('  ·  ')
    pdf.heading(block.name, meta)
    pdf.label(t.repertoire)
    pdf.list(block.works.map(w => ({ strong: w.composer, text: w.title, right: w.duration })), t.noRepertoire)
    if (block.total) pdf.totalLine(t.total, block.total)
    pdf.notesArea(t.notes)
  })

  return sendPdf(event, pdf.toBuffer(), pdfFilename(t.juryProgramTitle, contest?.name, round.name))
})
