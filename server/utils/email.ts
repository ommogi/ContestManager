import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend(): Resend | null {
  if (_resend) return _resend
  const key = process.env.RESEND_API_KEY || ''
  if (!key) return null
  _resend = new Resend(key)
  return _resend
}

export interface WelcomeEmailPayload {
  to: string
  first_name: string | null
  email: string
  marketing_consent?: boolean
}

export async function sendWelcomeEmail(p: WelcomeEmailPayload) {
  const startTime = Date.now()
  console.log('📧 [email] sendWelcomeEmail called with:', p.to)
  const resend = getResend()
  if (!resend) {
    console.error('❌ [email] RESEND_API_KEY not set - welcome email FAILED')
    console.error('[email] process.env.RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY)
    return { error: 'Email service not configured', retryable: true }
  }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
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
              Hola${p.first_name ? ' ' + p.first_name : ''},
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

  try {
    console.log('[email] Calling resend.emails.send()...')
    const r = await resend.emails.send({ from, to: p.to, subject, html })
    const duration = Date.now() - startTime
    console.log('[email] Resend response:', JSON.stringify(r, null, 2))
    console.log('[email] Email sent successfully in', duration, 'ms')
    return { sent: true, id: r?.data?.id ?? null, duration }
  } catch (err: any) {
    const duration = Date.now() - startTime
    console.error('❌ [email] Resend error:', err?.message)
    console.error('[email] Full error:', JSON.stringify(err, null, 2))
    console.error('[email] Duration before failure:', duration, 'ms')
    const retryable = err?.status >= 500 || err?.message?.includes('timeout')
    return { error: err?.message, retryable, duration }
  }
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
  const resend = getResend()
  if (!resend) {
    console.error('[email] RESEND_API_KEY not set - enrollment email FAILED')
    return { error: 'Email service not configured', retryable: true }
  }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
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
      Hola${p.first_name ? ' ' + p.first_name : ''},
    </p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">
      Has quedado inscrito en <strong>${p.contest_name}</strong> (${p.category_name}).
      ${p.is_paid && amount ? `El pago de <strong>${amount}</strong> se ha procesado correctamente.` : ''}
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Concurso</p>
      <p style="font-size:14px;font-weight:600;margin:0 0 12px;">${p.contest_name}</p>
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Categoría</p>
      <p style="font-size:14px;font-weight:600;margin:0;">${p.category_name}</p>
    </div>
    <p style="color:#71717a;font-size:12px;margin:24px 0 0;">
      Recibirás más información cuando el concurso comience. Si tienes preguntas, responde a este correo.
    </p>
  </div>
</body></html>`.trim()

  try {
    const r = await resend.emails.send({ from, to: p.to, subject, html })
    return { sent: true, id: r?.data?.id ?? null }
  } catch (err: any) {
    console.error('[email] resend failed:', err?.message)
    return { error: err?.message }
  }
}

async function send(resend: Resend, from: string, to: string, subject: string, html: string) {
  try {
    const r = await resend.emails.send({ from, to, subject, html })
    return { sent: true, id: r?.data?.id ?? null }
  } catch (err: any) {
    console.error('[email] resend failed:', err?.message)
    return { error: err?.message }
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
  const resend = getResend()
  if (!resend) return { skipped: true }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
  const typeLabel = p.is_performance ? 'Actuación' : 'Ensayo'
  const subject = `${typeLabel} programado/a · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      📅 ${typeLabel} programado/a
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + p.first_name : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      Tu ${typeLabel.toLowerCase()} en <strong>${p.round_name}</strong> (${p.contest_name}) ha sido programado/a.
    </p>
    <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Hora</p>
      <p style="font-size:16px;font-weight:700;margin:0 0 12px;">${p.time}</p>
      ${p.room ? `<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Sala</p><p style="font-size:14px;font-weight:600;margin:0 0 12px;">${p.room}</p>` : ''}
      ${p.accompanist ? `<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin:0 0 4px;">Acompañante</p><p style="font-size:14px;font-weight:600;margin:0;">${p.accompanist}</p>` : ''}
    </div>
  </div>
</body></html>`.trim()
  return send(resend, from, p.to, subject, html)
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
  const resend = getResend()
  if (!resend) return { skipped: true }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
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
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + p.first_name : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      ${p.is_promoted
        ? `Has sido clasificado/a en <strong>${p.round_name}</strong> del concurso <strong>${p.contest_name}</strong>.`
        : `No has sido clasificado/a en <strong>${p.round_name}</strong> del concurso <strong>${p.contest_name}</strong>. Gracias por tu participación.`
      }
    </p>
    ${p.is_promoted && !p.is_final ? '<p style="font-size:14px;color:#16a34a;font-weight:600;">Estás en la siguiente ronda. ¡Mucha suerte!</p>' : ''}
    ${p.is_promoted && p.is_final ? '<p style="font-size:14px;color:#16a34a;font-weight:600;">¡Enhorabuena, has llegado a la ronda final!</p>' : ''}
  </div>
</body></html>`.trim()
  return send(resend, from, p.to, subject, html)
}

export interface ContestStartedEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  contest_slug?: string | null
}

export async function sendContestStartedEmail(p: ContestStartedEmailPayload) {
  const resend = getResend()
  if (!resend) return { skipped: true }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
  const subject = `¡El concurso ha comenzado! · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      🎵 ¡El concurso ha comenzado!
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + p.first_name : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      El concurso <strong>${p.contest_name}</strong> ya está activo. ¡Mucha suerte!
    </p>
    <p style="color:#71717a;font-size:12px;margin:24px 0 0;">
      Recibirás notificaciones cuando se programe tu actuación o ensayo.
    </p>
  </div>
</body></html>`.trim()
  return send(resend, from, p.to, subject, html)
}

export interface RankingPublishedEmailPayload {
  to: string
  first_name: string | null
  contest_name: string
  category_name: string
  contest_slug?: string | null
}

export async function sendRankingPublishedEmail(p: RankingPublishedEmailPayload) {
  const resend = getResend()
  if (!resend) return { skipped: true }
  const from = process.env.RESEND_FROM || 'ContestSaas <noreply@contestsaas.app>'
  const subject = `Clasificación publicada · ${p.contest_name}`
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <div style="border:2px solid #e4e4e7;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">
      🏆 Clasificación publicada
    </h1>
    <p style="color:#71717a;font-size:14px;margin:0 0 24px;">Hola${p.first_name ? ' ' + p.first_name : ''},</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
      La clasificación final de <strong>${p.category_name}</strong> en <strong>${p.contest_name}</strong> ya está disponible.
    </p>
  </div>
</body></html>`.trim()
  return send(resend, from, p.to, subject, html)
}
