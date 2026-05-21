import { Resend } from 'resend'
import { serverSupabaseAdmin } from './supabase'

function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let _resend: Resend | null = null
function getResend(): Resend | null {
  if (_resend) return _resend
  const key = process.env.RESEND_API_KEY || ''
  if (!key) return null
  _resend = new Resend(key)
  return _resend
}

async function logEmail(
  opts: {
    to: string
    template: string
    subject: string
    payload: Record<string, any>
  }
): Promise<string | null> {
  try {
    const admin = serverSupabaseAdmin()
    const { data } = await admin.from('email_logs').insert({
      to_address: opts.to,
      template: opts.template,
      subject: opts.subject,
      payload: opts.payload,
      status: 'pending',
    }).select('id').single()
    return data?.id ?? null
  } catch (e: any) {
    console.error('[email] logEmail insert failed:', e?.message)
    return null
  }
}

async function updateEmailLog(
  logId: string | null,
  status: 'sent' | 'failed',
  providerMessageId?: string | null,
  error?: string | null
) {
  if (!logId) return
  try {
    const admin = serverSupabaseAdmin()
    await admin.from('email_logs').update({
      status,
      provider_message_id: providerMessageId ?? null,
      error: error ?? null,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    }).eq('id', logId)
  } catch (e: any) {
    console.error('[email] updateEmailLog failed:', e?.message)
  }
}

export interface WelcomeEmailPayload {
  to: string
  first_name: string | null
  email: string
  marketing_consent?: boolean
}

export async function sendWelcomeEmail(p: WelcomeEmailPayload) {
  const subject = '¡Bienvenido a ContestSaas! 🎉'
  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#71717a;">Bienvenido</p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;line-height:1.2;">¡Gracias por unirte! 🎉</h1>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
              Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
              Bienvenido a <strong>ContestSaas</strong>. Estamos encantados de contar contigo.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#52525b;">
              Desde tu panel podrás crear concursos, gestionar participantes y seguir el desarrollo de tus eventos en tiempo real.
            </p>
            <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 8px;">Próximos pasos:</p>
              <ol style="font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                <li>Completa tu perfil</li>
                <li>Crea tu primera organización</li>
                <li>Configura tu primer concurso</li>
              </ol>
            </div>
            <p style="margin:0;">
              <a href="${process.env.APP_BASE_URL || 'https://contestsaas.app'}/dashboard"
                 style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 22px;border-radius:10px;">
                Ir al dashboard
              </a>
            </p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">
              ¿Preguntas? Responde a este correo y te ayudaremos encantados.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`.trim()

  return sendWithLog({
    to: p.to,
    template: 'welcome',
    subject,
    payload: { first_name: p.first_name, email: p.email, marketing_consent: p.marketing_consent },
    html,
  })
}

export interface EnrollmentEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  category_name: string
  amount_paid_cents?: number | null
  is_paid: boolean
  contest_slug?: string | null
}

export async function sendEnrollmentEmail(p: EnrollmentEmailPayload) {
  const amount = p.amount_paid_cents ? `€${(p.amount_paid_cents / 100).toFixed(2)}` : null
  const subject = p.is_paid
    ? `Inscripción confirmada · ${p.contest_name}`
    : `Inscripción recibida · ${p.contest_name}`

  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      ${p.is_paid ? '✓ Inscripción confirmada' : '✓ Inscripción recibida'}
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">
      Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">
      Has quedado inscrito en <strong>${escapeHtml(p.contest_name)}</strong> (${escapeHtml(p.category_name)}).
      ${p.is_paid && amount ? `El pago de <strong>${escapeHtml(amount)}</strong> se ha procesado correctamente.` : ''}
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Concurso</p>
      <p style="font-size:14px;font-weight:600;margin:0 0 12px;">${escapeHtml(p.contest_name)}</p>
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Categoría</p>
      <p style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(p.category_name)}</p>
    </div>
    <p style="color:#71717a;font-size:12px;margin:24px 0 0;">
      Recibirás más información cuando el concurso comience. Si tienes preguntas, responde a este correo.
    </p>
  </div>
</body></html>`.trim()

  return sendWithLog({
    to: p.to,
    template: 'enrollment',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name, category_name: p.category_name, amount_paid_cents: p.amount_paid_cents, is_paid: p.is_paid },
    html,
  })
}

export interface JudgeInvitationEmailPayload {
  to: string
  contest_name: string
  organization_name: string | null
  invited_by_name: string | null
  invite_url: string
}

export async function sendJudgeInvitationEmail(p: JudgeInvitationEmailPayload) {
  const subject = `Invitación como jurado · ${p.contest_name}`
  const orgLabel = p.organization_name ? escapeHtml(p.organization_name) : 'una organización'
  const acceptUrl = `${p.invite_url}?action=accept`
  const rejectUrl = `${p.invite_url}?action=reject`
  const logoUrl = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/logo.png'

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">

          <tr><td style="padding:32px 32px 24px;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 45%,#064e3b 100%);text-align:center;">
            <img src="${logoUrl}" alt="ContestSaas" width="64" height="64" style="display:block;margin:0 auto 14px;border-radius:14px;object-fit:contain;" />
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a5b4fc;">ContestSaas</p>
            <h1 style="margin:0;font-size:22px;font-weight:800;line-height:1.2;color:#ffffff;">Te han invitado como jurado</h1>
          </td></tr>

          <tr><td style="padding:28px 32px 8px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hola,</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              ${p.invited_by_name ? `<strong>${escapeHtml(p.invited_by_name)}</strong> de ` : ''}${orgLabel} te ha invitado a participar como <strong>jurado</strong> en el concurso:
            </p>
            <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin:0 0 20px;">
              <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;">Concurso</p>
              <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#18181b;">${escapeHtml(p.contest_name)}</p>
            </div>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#52525b;">
              Puedes aceptar o rechazar la invitación desde los botones de abajo.
            </p>
          </td></tr>

          <tr><td style="padding:0 32px 24px;" align="center">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:8px;">
                <a href="${acceptUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 24px;border-radius:10px;">
                  Aceptar
                </a>
              </td>
              <td style="padding-left:8px;">
                <a href="${rejectUrl}"
                   style="display:inline-block;background:#ffffff;color:#3f3f46;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 24px;border-radius:10px;border:1px solid #d4d4d8;">
                  Rechazar
                </a>
              </td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:0 32px 24px;">
            <div style="border-left:3px solid #6366f1;padding:10px 14px;background:#eef2ff;border-radius:0 8px 8px 0;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4f46e5;">¿No funcionan los botones?</p>
              <p style="margin:0;font-size:12px;color:#52525b;word-break:break-all;line-height:1.5;">${p.invite_url}</p>
            </div>
          </td></tr>

          <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">
              Si no esperabas esta invitación, ignora este correo. ¿Preguntas? Responde a este mensaje.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`.trim()

  return sendWithLog({
    to: p.to,
    template: 'judge_invitation',
    subject,
    payload: {
      contest_name: p.contest_name,
      organization_name: p.organization_name,
      invited_by_name: p.invited_by_name,
      invite_url: p.invite_url,
    },
    html,
  })
}

async function sendWithLog(
  opts: {
    to: string
    template: string
    subject: string
    payload: Record<string, any>
    html: string
  }
): Promise<{ sent: boolean; id: string | null; error?: string }> {
  const logId = await logEmail({
    to: opts.to,
    template: opts.template,
    subject: opts.subject,
    payload: opts.payload,
  })

  const resend = getResend()
  if (!resend) {
    await updateEmailLog(logId, 'failed', null, 'Email service not configured')
    return { sent: false, id: null, error: 'Email service not configured' }
  }

  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
  try {
    const r = await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html })
    await updateEmailLog(logId, 'sent', r?.data?.id ?? null)
    return { sent: true, id: r?.data?.id ?? null }
  } catch (err: any) {
    await updateEmailLog(logId, 'failed', null, err?.message)
    console.error('[email] resend failed:', err?.message)
    return { sent: false, id: null, error: err?.message }
  }
}

export interface ScheduleEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  round_name: string
  is_performance: boolean
  time: string
  room?: string | null
  accompanist?: string | null
  contest_slug?: string | null
}

export async function sendScheduleEmail(p: ScheduleEmailPayload) {
  const typeLabel = p.is_performance ? 'Actuación' : 'Ensayo'
  const subject = `${typeLabel} programado/a · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      📅 ${escapeHtml(typeLabel)} programado/a
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      Tu ${typeLabel.toLowerCase()} en <strong>${escapeHtml(p.round_name)}</strong> (${escapeHtml(p.contest_name)}) ha sido programado/a.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Hora</p>
      <p style="font-size:16px;font-weight:700;margin:0 0 12px;">${escapeHtml(p.time)}</p>
      ${p.room ? `<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Sala</p><p style="font-size:14px;font-weight:600;margin:0 0 12px;">${escapeHtml(p.room)}</p>` : ''}
      ${p.accompanist ? `<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Acompañante</p><p style="font-size:14px;font-weight:600;margin:0;">${escapeHtml(p.accompanist)}</p>` : ''}
    </div>
  </div>
</body></html>`.trim()
  return sendWithLog({
    to: p.to,
    template: 'schedule',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name, round_name: p.round_name, is_performance: p.is_performance, time: p.time, room: p.room, accompanist: p.accompanist },
    html,
  })
}

export interface PromotionEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  round_name: string
  is_promoted: boolean
  is_final?: boolean
  contest_slug?: string | null
}

export async function sendPromotionEmail(p: PromotionEmailPayload) {
  const subject = p.is_promoted
    ? `¡Clasificado! Pasas a la siguiente ronda · ${p.contest_name}`
    : `Resultado de tu participación · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid ${p.is_promoted ? '#16a34a' : '#e4e4e7'};border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      ${p.is_promoted ? '🎉 ¡Clasificado!' : '🏁 Resultado de tu participación'}
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      ${p.is_promoted
        ? `Has sido clasificado/a en <strong>${escapeHtml(p.round_name)}</strong> del concurso <strong>${escapeHtml(p.contest_name)}</strong>.`
        : `No has sido clasificado/a en <strong>${escapeHtml(p.round_name)}</strong> del concurso <strong>${escapeHtml(p.contest_name)}</strong>. Gracias por tu participación.`
      }
    </p>
    ${p.is_promoted && !p.is_final ? '<p style="font-size:14px;color:#16a34a;font-weight:600;">Estás en la siguiente ronda. ¡Mucha suerte!</p>' : ''}
    ${p.is_promoted && p.is_final ? '<p style="font-size:14px;color:#16a34a;font-weight:600;">¡Enhorabuena, has llegado a la ronda final!</p>' : ''}
  </div>
</body></html>`.trim()
  return sendWithLog({
    to: p.to,
    template: 'promotion',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name, round_name: p.round_name, is_promoted: p.is_promoted, is_final: p.is_final },
    html,
  })
}

export interface ContestStartedEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  contest_slug?: string | null
}

export async function sendContestStartedEmail(p: ContestStartedEmailPayload) {
  const subject = `¡El concurso ha comenzado! · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      🎵 ¡El concurso ha comenzado!
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      El concurso <strong>${escapeHtml(p.contest_name)}</strong> ya está activo. ¡Mucha suerte!
    </p>
    <p style="color:#71717a;font-size:12px;margin:24px 0 0;">
      Recibirás notificaciones cuando se programe tu actuación o ensayo.
    </p>
  </div>
</body></html>`.trim()
  return sendWithLog({
    to: p.to,
    template: 'contest_started',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name },
    html,
  })
}

export interface RankingPublishedEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  category_name: string
  contest_slug?: string | null
}

export async function sendRankingPublishedEmail(p: RankingPublishedEmailPayload) {
  const subject = `Clasificación publicada · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      🏆 Clasificación publicada
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      La clasificación final de <strong>${escapeHtml(p.category_name)}</strong> en <strong>${escapeHtml(p.contest_name)}</strong> ya está disponible.
    </p>
  </div>
</body></html>`.trim()
  return sendWithLog({
    to: p.to,
    template: 'ranking_published',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name, category_name: p.category_name },
    html,
  })
}

export interface JudgeInvitationExpiredPayload {
  to: string
  first_name: string | null
  contest_name: string
}

export interface JudgePoolInvitationEmailPayload {
  to: string
  organization_name: string | null
  invited_by_name: string | null
  invite_url: string
}

export async function sendJudgePoolInvitationEmail(p: JudgePoolInvitationEmailPayload) {
  const subject = `Invitación al pool de jurados${p.organization_name ? ' · ' + p.organization_name : ''}`
  const orgLabel = p.organization_name ? escapeHtml(p.organization_name) : 'una organización'
  const acceptUrl = `${p.invite_url}?action=accept`
  const rejectUrl = `${p.invite_url}?action=reject`
  const logoUrl = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/logo.png'

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">

          <tr><td style="padding:32px 32px 24px;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 45%,#064e3b 100%);text-align:center;">
            <img src="${logoUrl}" alt="ContestSaas" width="64" height="64" style="display:block;margin:0 auto 14px;border-radius:14px;object-fit:contain;" />
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a5b4fc;">ContestSaas</p>
            <h1 style="margin:0;font-size:22px;font-weight:800;line-height:1.2;color:#ffffff;">Te han invitado al pool de jurados</h1>
          </td></tr>

          <tr><td style="padding:28px 32px 8px;">
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hola,</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
              ${p.invited_by_name ? `<strong>${escapeHtml(p.invited_by_name)}</strong> de ` : ''}${orgLabel} te ha invitado a formar parte de su <strong>pool de jurados</strong>.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#52525b;">
              Aceptar te permitirá ser asignado como jurado en sus concursos. Puedes aceptar o rechazar la invitación desde los botones de abajo.
            </p>
          </td></tr>

          <tr><td style="padding:0 32px 24px;" align="center">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:8px;">
                <a href="${acceptUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 24px;border-radius:10px;">
                  Aceptar
                </a>
              </td>
              <td style="padding-left:8px;">
                <a href="${rejectUrl}"
                   style="display:inline-block;background:#ffffff;color:#3f3f46;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 24px;border-radius:10px;border:1px solid #d4d4d8;">
                  Rechazar
                </a>
              </td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:0 32px 24px;">
            <div style="border-left:3px solid #6366f1;padding:10px 14px;background:#eef2ff;border-radius:0 8px 8px 0;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4f46e5;">¿No funcionan los botones?</p>
              <p style="margin:0;font-size:12px;color:#52525b;word-break:break-all;line-height:1.5;">${p.invite_url}</p>
            </div>
          </td></tr>

          <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">
              Si no esperabas esta invitación, ignora este correo. ¿Preguntas? Responde a este mensaje.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`.trim()

  return sendWithLog({
    to: p.to,
    template: 'judge_pool_invitation',
    subject,
    payload: {
      organization_name: p.organization_name,
      invited_by_name: p.invited_by_name,
      invite_url: p.invite_url,
    },
    html,
  })
}

export async function sendJudgeInvitationExpiredEmail(p: JudgeInvitationExpiredPayload) {
  const subject = `Tu invitación como jurado ha expirado · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      ⏰ Invitación expirada
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + escapeHtml(p.first_name) : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      El concurso <strong>${escapeHtml(p.contest_name)}</strong> ha comenzado. Tu invitación como jurado ha expirado y ya no es válida.
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#71717a;">
      Si crees que esto es un error, contacta con el organizador del concurso.
    </p>
  </div>
</body></html>`.trim()
  return sendWithLog({
    to: p.to,
    template: 'judge_invitation_expired',
    subject,
    payload: { first_name: p.first_name, contest_name: p.contest_name },
    html,
  })
}
