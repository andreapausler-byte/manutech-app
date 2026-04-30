/**
 * Email notifications via Resend
 *
 * Wrapper minimale (no SDK, fetch diretto su REST API). Nessuna libreria
 * extra in Deno per ridurre cold start.
 *
 * Errori non bloccanti: se l'invio fallisce, ritorna { ok: false } e
 * provision.ts segnala come warning non-fatale (l'utente è registrato
 * comunque, il super_admin può scoprire la org tramite la pagina pending).
 *
 * Secrets richiesti:
 *   RESEND_API_KEY              — re_xxx, da resend.com → API Keys
 *   SIGNUP_NOTIFICATION_EMAIL   — destinatario notifica (es. owner SaaS)
 *   SIGNUP_FROM_EMAIL           — mittente (default: noreply@manutech.app)
 */

const RESEND_API = 'https://api.resend.com/emails'

interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

interface NewSignupNotificationInput {
  orgId: string
  orgName: string
  orgSlug: string
  ownerEmail: string
  ownerName: string
  appBaseUrl?: string
}

export async function sendNewSignupNotification(
  input: NewSignupNotificationInput,
): Promise<SendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('SIGNUP_NOTIFICATION_EMAIL')
  const from = Deno.env.get('SIGNUP_FROM_EMAIL') || 'ManuTech <noreply@manutech.app>'

  if (!apiKey || !to) {
    console.warn(
      '[signup-org] Email skip: RESEND_API_KEY or SIGNUP_NOTIFICATION_EMAIL missing',
    )
    return { ok: false, error: 'config_missing' }
  }

  const subject = `[ManuTech] Nuovo signup in attesa: ${input.orgName}`
  const baseUrl = input.appBaseUrl || 'https://manutech.app'
  const reviewUrl = `${baseUrl}/super-admin/pending-orgs`

  const html = renderHtml(input, reviewUrl)
  const text = renderText(input, reviewUrl)

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[signup-org] Resend send failed:', res.status, body)
      return { ok: false, error: `resend_${res.status}` }
    }

    const data = await res.json().catch(() => null) as { id?: string } | null
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error('[signup-org] Resend network error:', (err as Error).message)
    return { ok: false, error: 'network' }
  }
}

function renderText(i: NewSignupNotificationInput, reviewUrl: string): string {
  return [
    'Nuova richiesta di registrazione su ManuTech.',
    '',
    `Organizzazione: ${i.orgName}`,
    `Slug:           ${i.orgSlug}`,
    `Owner:          ${i.ownerName} <${i.ownerEmail}>`,
    `Org ID:         ${i.orgId}`,
    '',
    `Approva o rifiuta: ${reviewUrl}`,
    '',
    '— ManuTech',
  ].join('\n')
}

function renderHtml(i: NewSignupNotificationInput, reviewUrl: string): string {
  // Inline styles only (email client compatibility).
  // Niente font Outfit/JetBrainsMono qui: Gmail/Outlook li strippano.
  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Nuovo signup ManuTech</title></head>
<body style="margin:0;padding:24px;background:#0a0a0f;color:#e8e8f0;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#16161f;border-radius:16px;padding:32px;border:1px solid #2a2a38;">
    <div style="font-size:14px;color:#a8a8b8;margin-bottom:8px;">ManuTech · Moderazione signup</div>
    <h1 style="margin:0 0 16px;font-size:22px;color:#fff;">Nuova organizzazione in attesa</h1>
    <p style="margin:0 0 24px;color:#c8c8d8;line-height:1.5;">
      Una nuova azienda ha richiesto l'accesso a ManuTech. Verifica i dati e approva o rifiuta dalla console di moderazione.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:8px 0;color:#8888a0;width:40%;">Organizzazione</td>
        <td style="padding:8px 0;color:#fff;font-weight:600;">${escapeHtml(i.orgName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8888a0;">Slug</td>
        <td style="padding:8px 0;color:#fff;font-family:ui-monospace,monospace;">${escapeHtml(i.orgSlug)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8888a0;">Owner</td>
        <td style="padding:8px 0;color:#fff;">${escapeHtml(i.ownerName)} &lt;${escapeHtml(i.ownerEmail)}&gt;</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#8888a0;">Org ID</td>
        <td style="padding:8px 0;color:#fff;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(i.orgId)}</td>
      </tr>
    </table>
    <div style="margin-top:32px;text-align:center;">
      <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 24px;background:#7c6aff;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
        Apri console moderazione
      </a>
    </div>
    <div style="margin-top:24px;padding-top:24px;border-top:1px solid #2a2a38;font-size:12px;color:#666680;">
      Email automatica · ManuTech signup-org Edge Function
    </div>
  </div>
</body>
</html>`.trim()
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
