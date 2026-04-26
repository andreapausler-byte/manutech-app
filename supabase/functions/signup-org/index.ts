/**
 * Edge Function: signup-org
 *
 * Crea atomicamente una nuova organizzazione + utente admin.
 * Service_role bypassa RLS. Risposta NON include session: il client
 * fa signInWithPassword separatamente dopo aver ricevuto OK.
 *
 * Secrets richiesti:
 *   SUPABASE_URL                — già presente (altre Edge Functions)
 *   SUPABASE_SERVICE_ROLE_KEY   — già presente
 *   IP_HASH_SALT                — NUOVO: 32+ random bytes per GDPR ip hashing
 *   SUPABASE_ENV                — NUOVO: 'production' | 'staging' | 'development'
 *
 * Pre-go-live checklist:
 *   • Configurare IP_HASH_SALT in Supabase Dashboard → Edge Function secrets
 *   • Configurare SUPABASE_ENV='production' (abilita HARD FAIL su missing salt)
 *   • Configurare rate limit /rest/v1/rpc/check_slug_available a 30/min/IP
 *   • Attivare email verification (Sprint 2 con Resend) — TODO
 *
 * ════════════════════════════════════════════════════════════════
 * ARCHITECTURAL DECISION — Trigger handle_new_user durante signup
 * ════════════════════════════════════════════════════════════════
 *
 * Il trigger handle_new_user (migration 032) crea AUTOMATICAMENTE
 * la riga in public.users a ogni INSERT in auth.users. Questa
 * Edge Function deve fare un createUser ma NON vuole che il trigger
 * lavori in background — vuole controllare ogni step esplicitamente.
 *
 * Tre approcci valutati:
 *
 * Opzione 1 (RIFIUTATA) — lascia trigger creare org placeholder,
 *   poi UPDATE i campi mancanti (slug, plan, trial_ends_at, owner).
 *   Problema: stati intermedi non riproducibili in caso di crash
 *   tra createUser e UPDATE. Race condition su slug. Doppia INSERT
 *   in organizations confonde audit trail.
 *
 * Opzione 2 (RIFIUTATA) — passa UUID seed Amarcord come placeholder
 *   org_id nel metadata, poi UPDATE users.org_id a posteriori.
 *   Problema: viola la regola "Amarcord = dato di produzione sacro".
 *   Per millisecondi l'utente è admin di Amarcord (permission leak
 *   su realtime/audit subscriptions). Hardcoded coupling con UUID
 *   specifico di un cliente reale.
 *
 * Opzione 3 (SCELTA) — migration 034 introduce escape-hatch nel
 *   trigger: se user_metadata._signup_via_edge='true', il trigger
 *   ritorna immediatamente senza fare INSERT. L'Edge Function fa
 *   tutto manualmente in 4 step espliciti con rollback chirurgico.
 *   Vantaggi: atomico, single-responsibility, audit-friendly,
 *   future-proof per altre Edge Function di provisioning.
 *
 * Il flag _signup_via_edge è documentato come "escape-hatch del
 * trigger handle_new_user, usabile SOLO da Edge Function signup-org".
 * Vedi anche /CLAUDE.md sezione "Multi-tenancy".
 * ════════════════════════════════════════════════════════════════
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ErrorCode, SignupResponse } from './lib/types.ts'
import { STATUS_FOR_ERROR } from './lib/types.ts'
import { validateSignupRequest } from './lib/validation.ts'
import { checkRateLimit, recordAttempt } from './lib/ratelimit.ts'
import { extractClientIp, hashIp } from './lib/crypto.ts'
import { provisionOrganization } from './lib/provision.ts'

// ── CORS headers (signup è no-auth, accessibile da web client) ──
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonOk(status: number, body: SignupResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function jsonError(
  error: ErrorCode,
  message: string,
  field?: string,
): Response {
  const body: SignupResponse = field
    // deno-lint-ignore no-explicit-any
    ? { ok: false, error, message, field: field as any }
    : { ok: false, error, message }
  return jsonOk(STATUS_FOR_ERROR[error], body)
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── 1. CORS preflight ────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 2. Method check ──────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonError('invalid_input', 'Solo POST è supportato')
  }

  // ── 3. Rate limit (PRIMA del parsing per flood protection) ──
  const ip = extractClientIp(req)
  let ipHash: string
  try {
    ipHash = await hashIp(ip)
  } catch (err) {
    // Solo IP_HASH_SALT mancante in production trigger questo path
    console.error('[signup-org] hashIp failed:', (err as Error).message)
    return jsonError('internal', 'Configurazione server incompleta')
  }

  const rl = checkRateLimit(ipHash)
  if (!rl.allowed) {
    const minutes = Math.ceil((rl.remainingMs ?? 0) / 60_000)
    return jsonError(
      'rate_limited',
      `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? 'o' : 'i'}.`,
    )
  }

  // ── 4. Parse + validate input ────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('invalid_input', 'Body JSON non valido')
  }

  const v = validateSignupRequest(body)
  if (!v.ok) {
    return jsonError('invalid_input', v.message, v.field)
  }
  const input = v.data

  // ── 5. Init Supabase client (service_role bypassa RLS) ──
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[signup-org] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return jsonError('internal', 'Configurazione server incompleta')
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── 6. Check slug disponibile (RPC creata in 033) ────────
  const { data: avail, error: slugErr } = await supabase.rpc('check_slug_available', {
    _slug: input.org_slug,
  })

  if (slugErr) {
    console.error('[signup-org] check_slug_available RPC failed:', slugErr.message)
    return jsonError('internal', 'Errore verifica slug')
  }
  if (!avail) {
    recordAttempt(ipHash)
    return jsonError('slug_taken', `Slug "${input.org_slug}" già usato`)
  }

  // ── 7. Provisioning atomico (rollback gestito internamente) ──
  const result = await provisionOrganization(supabase, input)

  // recordAttempt è chiamato SEMPRE (success o failure). Intenzionale:
  // anche signup riusciti contano contro il limite di 5/h per IP.
  // Razionale: un attacker che vuole creare 100 org bot-driven sarebbe
  // contato 5 volte per IP (= bloccato), non solo quando fallisce.
  // Vedi README sezione "Rate limiting policy" per spiegazione completa.
  recordAttempt(ipHash)

  if (!result.ok) {
    return jsonError(result.error, result.message)
  }

  // ── 8. Success response (warnings opzionali) ──
  const successBody: SignupResponse = {
    ok: true,
    org_id: result.org_id,
    user_id: result.user_id,
    ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
  }
  return jsonOk(201, successBody)
})
