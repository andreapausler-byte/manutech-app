/**
 * Edge Function: send-email-notification
 *
 * Triggerata dal trigger PostgreSQL su INSERT in public.notifications.
 * Invia email di notifica agli utenti target tramite Resend API.
 *
 * Secrets necessari (Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY — chiave API Resend (https://resend.com)
 *   EMAIL_FROM     — indirizzo mittente (es. "ManuTech <notifiche@manutech.it>")
 *   APP_URL        — URL frontend (es. "https://app.manutech.it")
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tipo notifica → label italiana ──
const TYPE_LABELS: Record<string, string> = {
  new_report: 'Nuova segnalazione',
  new_report_critical: 'Segnalazione critica',
  quick_report: 'Report rapido',
  assigned: 'Segnalazione assegnata',
  status_change: 'Cambio stato',
  comment: 'Nuovo messaggio',
  maintenance_taken: 'Manutenzione presa in carico',
  maintenance_completed: 'Manutenzione completata',
  maintenance_reminder: 'Manutenzione in scadenza',
  maintenance_overdue: 'Manutenzione scaduta',
  intervention_assigned: 'Intervento assegnato',
  intervention_rescheduled: 'Intervento riprogrammato',
  intervention_cancelled: 'Intervento annullato',
  intervention_scheduled_change: 'Data intervento modificata',
  intervention_status_change: 'Avanzamento intervento',
  participant_added: 'Coinvolto in un intervento',
  participant_removed: 'Rimosso da un intervento',
}

// ── Template HTML email ──
function buildEmailHtml(notification: {
  title: string
  body?: string
  type: string
  report_id?: string
}, appUrl: string): string {
  const reportUrl = notification.report_id
    ? `${appUrl}/reports/${notification.report_id}`
    : appUrl

  const typeLabel = TYPE_LABELS[notification.type] || notification.type
  const hasReportLink = !!notification.report_id
  const ctaLabel = hasReportLink ? 'Vai alla segnalazione &rarr;' : 'Apri ManuTech &rarr;'

  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:24px 28px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">ManuTech</td>
              <td align="right" style="color:rgba(255,255,255,0.75);font-size:12px;font-weight:500">${typeLabel}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px">
          <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1a2e;line-height:1.3">
            ${escapeHtml(notification.title)}
          </h2>
          ${notification.body ? `<p style="margin:0 0 20px;font-size:14px;color:#4a4a68;line-height:1.6">${escapeHtml(notification.body)}</p>` : ''}

          <table cellpadding="0" cellspacing="0" style="margin:24px 0">
            <tr><td style="background:#6366f1;border-radius:10px;padding:12px 24px">
              <a href="${reportUrl}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block">
                ${ctaLabel}
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 28px 20px;border-top:1px solid #eef0f4">
          <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5">
            Ricevi questa email perch&eacute; hai le notifiche email attive su ManuTech.
            Puoi modificare le preferenze dall'app &rarr; Impostazioni &rarr; Notifiche Email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Invio a Resend ──
//
// Ogni notifica è una chiamata a questa funzione, e le notifiche nascono a
// gruppi: un cambio stato avvisa autore e assegnatario, un intervento tutti
// i coinvolti, il job delle scadenze delle 06:45 tutti i piani insieme.
// Sono chiamate parallele: oltre il limite al secondo del team Resend
// risponde 429 e quelle email andavano perse senza traccia. Su
// rate_limit_exceeded la richiesta non è stata elaborata, quindi si riprova
// senza rischio di doppioni. Le quote giornaliera e mensile rispondono
// anch'esse 429, ma riprovare non serve: si registra il motivo e basta.
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const MAX_ATTEMPTS = 3

// Un indirizzo malformato non deve arrivare a Resend: oltre a non partire,
// col batch "strict" farebbe scartare anche gli altri destinatari.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ResendError = { name?: string; message?: string }
type BatchResult = {
  ok: boolean
  status: number
  data: Array<{ id: string }>
  errors: Array<{ index: number; message: string }>
  error: ResendError | null
}

async function sendBatch(
  apiKey: string,
  emails: Array<Record<string, unknown>>,
): Promise<BatchResult> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Permissive: gli indirizzi rifiutati tornano in `errors`, gli altri
        // partono. Il default (strict) scartava l'intero batch.
        'x-batch-validation': 'permissive',
      },
      body: JSON.stringify(emails),
    })
    const payload = await res.json().catch(() => null)

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        data: Array.isArray(payload?.data) ? payload.data : [],
        errors: Array.isArray(payload?.errors) ? payload.errors : [],
        error: null,
      }
    }

    const error: ResendError = { name: payload?.name, message: payload?.message }
    const retryable = res.status === 429 && !String(error.name || '').includes('quota')
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      return { ok: false, status: res.status, data: [], errors: [], error }
    }

    // Il limite è al secondo: un secondo d'attesa basta. Il jitter evita che
    // le chiamate partite insieme riprovino di nuovo tutte insieme.
    const retryAfter = Math.min(Number(res.headers.get('retry-after')) || 1, 2)
    console.warn(`[Email] Resend 429 ${error.name || ''}, nuovo tentativo ${attempt + 1}/${MAX_ATTEMPTS}`)
    await new Promise(r => setTimeout(r, retryAfter * 1000 + Math.random() * 500))
  }
}

function json(body: Record<string, unknown>, status = 200): Response {
  // `channel` distingue questa risposta da quella del push in
  // net._http_response, dove l'URL chiamato non viene salvato.
  return new Response(JSON.stringify({ channel: 'email', ...body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Default preferenze email per ruolo ──
//
// Filosofia (allineata a send-push-notification, ma più selettiva):
// l'email è il canale "deve arrivare comunque" — ON solo per gli eventi
// che cambiano il lavoro di qualcuno (assegnazioni, riprogrammazioni,
// annullamenti, critiche). Il rumore di avanzamento resta su push/in-app.
// I tipi assenti dalla mappa NON generano email (fallback === true).
const EMAIL_ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: {
    email_new_report: true,
    email_new_report_critical: true,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: true,
    email_maintenance_completed: true,
    email_maintenance_reminder: true,
    email_maintenance_overdue: true,
    email_intervention_assigned: true,
    email_intervention_rescheduled: true,
    email_intervention_cancelled: true,
    email_intervention_scheduled_change: false,
    email_intervention_status_change: false,
    email_participant_added: true,
    email_participant_removed: false,
  },
  tecnico: {
    email_new_report: true,
    email_new_report_critical: true,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: false,
    email_maintenance_completed: false,
    email_maintenance_reminder: true,
    email_maintenance_overdue: true,
    email_intervention_assigned: true,
    email_intervention_rescheduled: true,
    email_intervention_cancelled: true,
    email_intervention_scheduled_change: true,
    email_intervention_status_change: false,
    email_participant_added: true,
    email_participant_removed: false,
  },
  operatore: {
    email_new_report: false,
    email_new_report_critical: false,
    email_quick_report: false,
    email_assigned: true,
    email_status_change: true,
    email_comment: false,
    email_maintenance_taken: false,
    email_maintenance_completed: false,
    email_maintenance_reminder: false,
    email_maintenance_overdue: false,
    email_intervention_assigned: false,
    email_intervention_rescheduled: false,
    email_intervention_cancelled: false,
    email_intervention_scheduled_change: true,
    email_intervention_status_change: false,
    email_participant_added: true,
    email_participant_removed: false,
  },
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'ManuTech <onboarding@resend.dev>'
    const appUrl = (Deno.env.get('APP_URL') || 'https://manutech-app.vercel.app').replace(/\/$/, '')

    if (!resendApiKey) {
      console.error('[Email] RESEND_API_KEY not configured')
      return json({ error: 'RESEND_API_KEY not configured' }, 500)
    }

    // Payload dal Database trigger (stesso formato del push)
    const body = await req.json()
    const notification = body.record || body

    console.log('[Email] Webhook received:', JSON.stringify({
      type: notification?.type,
      title: notification?.title,
      target_user: notification?.target_user,
    }))

    if (!notification?.type || !notification?.title) {
      return json({ error: 'Invalid notification payload' }, 400)
    }

    // Init Supabase con service_role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Trova gli utenti target con le loro email. Solo account attivi: gli
    // inviti mai accettati e gli utenti disattivati non ricevono più nulla
    // (prima un broadcast arrivava anche a loro, consumando la quota Resend).
    let targetUsers: Array<{ id: string; email: string; role: string }> = []

    let query = supabase
      .from('users')
      .select('id, email, role')
      .eq('status', 'active')

    if (notification.target_user) {
      query = query.eq('id', notification.target_user)
    } else {
      // Broadcast: tutti gli utenti della stessa org (escluso il mittente)
      query = query.eq('org_id', notification.org_id || 'default')
      if (notification.from_user) {
        query = query.neq('id', notification.from_user)
      }
    }
    const { data: usersData, error: usersError } = await query
    if (usersError) {
      console.error('[Email] Users query failed:', usersError.message)
      return json({ error: `users: ${usersError.message}` }, 500)
    }
    targetUsers = usersData || []

    if (targetUsers.length === 0) {
      return json({ sent: 0, message: 'No target users found' })
    }

    // Carica preferenze notifiche. Se la query fallisce si va avanti con i
    // default di ruolo: meglio un'email in più che nessuna.
    const userIds = targetUsers.map(u => u.id)
    const { data: prefsData, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id, prefs, role, is_org_default')
      .or(`user_id.in.(${userIds.join(',')}),is_org_default.eq.true`)
      .eq('org_id', notification.org_id || 'default')
    if (prefsError) {
      console.error('[Email] Preferences query failed, using role defaults:', prefsError.message)
    }

    const userPrefs: Record<string, Record<string, boolean>> = {}
    const orgDefaults: Record<string, Record<string, boolean>> = {}

    prefsData?.forEach(p => {
      if (p.is_org_default && p.role) {
        orgDefaults[p.role] = p.prefs as Record<string, boolean>
      } else if (p.user_id) {
        userPrefs[p.user_id] = p.prefs as Record<string, boolean>
      }
    })

    // Controlla se l'utente vuole email per questo tipo di notifica
    function shouldEmail(userId: string, role: string, notifType: string): boolean {
      const emailKey = `email_${notifType}`
      // 1. Preferenza personale
      if (userPrefs[userId] && emailKey in userPrefs[userId]) {
        return userPrefs[userId][emailKey] !== false
      }
      // 2. Default org per ruolo
      if (orgDefaults[role] && emailKey in orgDefaults[role]) {
        return orgDefaults[role][emailKey] !== false
      }
      // 3. Default di sistema
      const defaults = EMAIL_ROLE_DEFAULTS[role] || EMAIL_ROLE_DEFAULTS.operatore
      return defaults[emailKey] === true
    }

    // Filtra utenti eligibili
    const wanted = targetUsers.filter(u => shouldEmail(u.id, u.role, notification.type))
    const eligible = wanted.filter(u => EMAIL_RE.test((u.email || '').trim()))
    const invalid = wanted.length - eligible.length
    if (invalid > 0) {
      console.warn(`[Email] ${invalid} indirizzo/i malformato/i saltato/i:`,
        wanted.filter(u => !eligible.includes(u)).map(u => u.id).join(','))
    }

    console.log(`[Email] ${eligible.length}/${targetUsers.length} users eligible for email_${notification.type}`)

    if (eligible.length === 0) {
      return json({ sent: 0, invalid, message: 'All filtered by email preferences' })
    }

    // Genera HTML
    const html = buildEmailHtml(notification, appUrl)
    const subject = notification.title

    // Invia con l'endpoint batch di Resend (max 100 email per chiamata):
    // una sola richiesta HTTP copre qualsiasi broadcast realistico. Il vecchio
    // invio sequenziale con pausa 600ms superava il timeout di net.http_post
    // (~5s) già con 5+ destinatari, troncando la coda a metà.
    const BATCH_SIZE = 100
    let sent = 0
    let failed = 0
    let lastError: string | null = null

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const chunk = eligible.slice(i, i + BATCH_SIZE)
      try {
        const result = await sendBatch(resendApiKey, chunk.map(u => ({
          from: emailFrom,
          to: u.email.trim(),
          subject,
          html,
        })))

        if (!result.ok) {
          // Il motivo (daily_quota_exceeded, rate_limit_exceeded,
          // validation_error per un mittente non verificato...) finisce
          // nella risposta: si legge da SQL in net._http_response.
          lastError = `${result.status} ${result.error?.name || ''}: ${result.error?.message || ''}`.trim()
          console.error(`[Email] Batch failed (${chunk.length} recipients): ${lastError}`)
          failed += chunk.length
        } else {
          result.errors.forEach(e => {
            console.error(`[Email] Rifiutato ${chunk[e.index]?.email?.trim()}: ${e.message}`)
            lastError = e.message
          })
          console.log(`[Email] Batch sent to ${result.data.length}/${chunk.length} recipient(s)`)
          sent += result.data.length
          failed += chunk.length - result.data.length
        }
      } catch (err) {
        lastError = (err as Error).message
        console.error(`[Email] Batch error (${chunk.length} recipients):`, lastError)
        failed += chunk.length
      }
    }

    console.log(`[Email] Sent: ${sent}, Failed: ${failed}`)

    // Se non è partita nessuna email la risposta non è un 200: prima un
    // fallimento totale risultava "ok" in net._http_response.
    return json(
      { sent, failed, invalid, total: eligible.length, ...(lastError ? { error: lastError } : {}) },
      sent === 0 && failed > 0 ? 502 : 200,
    )
  } catch (err) {
    console.error('[Email] Error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
