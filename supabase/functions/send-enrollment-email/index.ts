// Supabase Edge Function: send-enrollment-email
// Sends an enrollment confirmation email via Resend.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY  — Resend API key (re_…)
//   FROM_EMAIL      — Verified sender, e.g. "Contest Manager <inscripciones@yourdomain.com>"
//
// Optional:
//   APP_BASE_URL    — Base URL used for "Ir a mi concurso" CTA (defaults to https://contestsaas.app)
//
// POST body:
// {
//   to: string,                 // recipient email (required)
//   participant_name: string,   // display name
//   contest_name: string,
//   contest_slug?: string,
//   category_name: string,
//   starts_at?: string | null,  // ISO date string
// }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')     ?? 'Contest Manager <onboarding@resend.dev>'
const APP_BASE_URL   = Deno.env.get('APP_BASE_URL')   ?? 'https://contestsaas.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
}

interface Payload {
  to: string
  participant_name: string
  contest_name: string
  contest_slug?: string
  category_name: string
  starts_at?: string | null
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildHtml(p: Payload): string {
  const dateStr = p.starts_at
    ? new Date(p.starts_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null
  const ctaUrl = p.contest_slug
    ? `${APP_BASE_URL}/my-contests/${encodeURIComponent(p.contest_slug)}`
    : `${APP_BASE_URL}/my-contests`

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#71717a;">Confirmación de inscripción</p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;line-height:1.2;">${esc(p.contest_name)}</h1>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Hola <strong>${esc(p.participant_name)}</strong>,</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
              Tu inscripción se ha registrado correctamente. Nos alegra contar contigo.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e4e4e7;border-radius:12px;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #f4f4f5;">
                  <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a1a1aa;">Categoría</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;">${esc(p.category_name)}</p>
                </td>
              </tr>
              ${dateStr ? `
              <tr>
                <td style="padding:12px 16px;">
                  <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a1a1aa;">Inicio del concurso</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;">${esc(dateStr)}</p>
                </td>
              </tr>` : ''}
            </table>

            <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:#52525b;">
              Puedes consultar el estado de tu participación, ver las categorías y recibir notificaciones desde tu panel.
            </p>

            <p style="margin:0;">
              <a href="${esc(ctaUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.5px;padding:12px 22px;border-radius:10px;">
                Ir a mi concurso
              </a>
            </p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #f4f4f5;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">
              Este correo es automático. Si no te reconoces como destinatario, ignóralo.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function buildText(p: Payload): string {
  const dateStr = p.starts_at
    ? new Date(p.starts_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : null
  const lines = [
    `Confirmación de inscripción — ${p.contest_name}`,
    '',
    `Hola ${p.participant_name},`,
    '',
    'Tu inscripción se ha registrado correctamente.',
    '',
    `Categoría: ${p.category_name}`,
  ]
  if (dateStr) lines.push(`Inicio: ${dateStr}`)
  lines.push('', `Panel: ${APP_BASE_URL}/my-contests${p.contest_slug ? `/${p.contest_slug}` : ''}`)
  return lines.join('\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (!body?.to || !body?.contest_name || !body?.category_name || !body?.participant_name) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [body.to],
      subject: `Inscripción confirmada · ${body.contest_name}`,
      html: buildHtml(body),
      text: buildText(body),
    }),
  })

  const resendData = await resendRes.json().catch(() => ({}))

  if (!resendRes.ok) {
    return new Response(JSON.stringify({ error: 'Resend error', details: resendData }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, id: resendData?.id ?? null }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
