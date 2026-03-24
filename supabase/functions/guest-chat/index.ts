/**
 * Edge Function: guest-chat
 *
 * Gestisce l'accesso guest (senza login) alla chat dei report.
 * Usa il service role per bypassare le RLS policies.
 *
 * Azioni:
 *   validate     — Valida un token guest e ritorna i dati base del report
 *   get-comments — Ritorna i commenti di un report (se token valido)
 *   add-comment  — Inserisce un commento come guest (se token valido)
 *
 * Secrets necessari (già configurati per le altre Edge Functions):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS headers (guest requests have no auth) ──
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Simple in-memory rate limiter ──
const rateLimits = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimits.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (timestamps.length >= RATE_LIMIT_MAX) return true
  timestamps.push(now)
  rateLimits.set(key, timestamps)
  return false
}

// ── Validate a guest token ──
async function validateToken(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  token: string,
): Promise<{ valid: boolean; orgId?: string }> {
  const { data, error } = await supabase
    .from('guest_tokens')
    .select('id, org_id, enabled, expires_at')
    .eq('report_id', reportId)
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return { valid: false }
  if (!data.enabled) return { valid: false }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false }

  return { valid: true, orgId: data.org_id }
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, reportId, token, text, guestName } = await req.json()

    if (!action || !reportId || !token) {
      return new Response(
        JSON.stringify({ error: 'Parametri mancanti: action, reportId, token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Init Supabase with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Validate token for every action
    const { valid, orgId } = await validateToken(supabase, reportId, token)
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Token non valido o scaduto' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── ACTION: validate ──
    if (action === 'validate') {
      const { data: report } = await supabase
        .from('reports')
        .select('id, title, status, severity')
        .eq('id', reportId)
        .single()

      if (!report) {
        return new Response(
          JSON.stringify({ error: 'Segnalazione non trovata' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ valid: true, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── ACTION: get-comments ──
    if (action === 'get-comments') {
      const { data: comments, error } = await supabase
        .from('comments')
        .select('*, user:users(name, role)')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true })

      if (error) throw error

      return new Response(
        JSON.stringify(comments || []),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── ACTION: add-comment ──
    if (action === 'add-comment') {
      // Rate limit by token
      if (isRateLimited(`add:${token}`)) {
        return new Response(
          JSON.stringify({ error: 'Troppi messaggi. Riprova tra un minuto.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (!text || typeof text !== 'string' || !text.trim()) {
        return new Response(
          JSON.stringify({ error: 'Il messaggio non può essere vuoto' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (text.length > 2000) {
        return new Response(
          JSON.stringify({ error: 'Messaggio troppo lungo (max 2000 caratteri)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const name = (guestName || 'Ospite').slice(0, 50).trim()

      const { data: comment, error } = await supabase
        .from('comments')
        .insert({
          report_id: reportId,
          text: text.trim(),
          user_id: null,
          user_name: name,
          user_role: 'guest',
          media: null,
          org_id: orgId || 'default',
        })
        .select('*')
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify(comment),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ error: `Azione sconosciuta: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[guest-chat] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Errore interno del server' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
