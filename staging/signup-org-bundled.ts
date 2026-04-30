/**
 * Edge Function: signup-org (BUNDLED single-file version for Dashboard deploy)
 *
 * Tutto il codice della Edge Function è inline in questo file (niente import lib/*).
 * Usa questo file se il Dashboard non supporta multi-file deploy.
 *
 * Source files originali (per manutenzione):
 *   - supabase/functions/signup-org/index.ts
 *   - supabase/functions/signup-org/lib/types.ts
 *   - supabase/functions/signup-org/lib/validation.ts
 *   - supabase/functions/signup-org/lib/ratelimit.ts
 *   - supabase/functions/signup-org/lib/crypto.ts
 *   - supabase/functions/signup-org/lib/provision.ts
 *   - supabase/functions/signup-org/lib/email.ts
 *
 * Secrets richiesti (Dashboard → Edge Functions → Manage secrets):
 *   - IP_HASH_SALT
 *   - SUPABASE_ENV ('staging' | 'production')
 *   - RESEND_API_KEY
 *   - SIGNUP_NOTIFICATION_EMAIL
 *   - SIGNUP_FROM_EMAIL (opzionale, default 'ManuTech <noreply@manutech.app>')
 *
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono auto-iniettate.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ════════════════════════════════════════════════════════════════
// TYPES (lib/types.ts)
// ════════════════════════════════════════════════════════════════

interface SignupRequest {
  org_name: string
  org_slug: string
  admin_email: string
  admin_password: string
  admin_full_name: string
}

type ErrorCode =
  | 'invalid_input'
  | 'slug_taken'
  | 'email_exists'
  | 'rate_limited'
  | 'internal'

type WarningCode =
  | 'owner_user_id_update_failed'
  | 'notification_email_failed'

interface SignupSuccess {
  ok: true
  org_id: string
  user_id: string
  warnings?: WarningCode[]
}

interface SignupError {
  ok: false
  error: ErrorCode
  message: string
  field?: keyof SignupRequest
}

type SignupResponse = SignupSuccess | SignupError

const STATUS_FOR_ERROR: Record<ErrorCode, number> = {
  invalid_input: 400,
  slug_taken:    409,
  email_exists:  409,
  rate_limited:  429,
  internal:      500,
}

// ════════════════════════════════════════════════════════════════
// VALIDATION (lib/validation.ts)
// ════════════════════════════════════════════════════════════════

type ValidationResult = { ok: true } | { ok: false; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/
const PWD_HAS_LETTER = /[A-Za-z]/
const PWD_HAS_DIGIT = /\d/

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function validateOrgName(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Nome organizzazione deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length < 2) return { ok: false, message: 'Nome organizzazione minimo 2 caratteri' }
  if (trimmed.length > 80) return { ok: false, message: 'Nome organizzazione massimo 80 caratteri' }
  return { ok: true }
}

function validateOrgSlug(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Slug deve essere stringa' }
  if (v.length < 3) return { ok: false, message: 'Slug minimo 3 caratteri' }
  if (v.length > 30) return { ok: false, message: 'Slug massimo 30 caratteri' }
  if (v.includes('--')) return { ok: false, message: 'Slug non può contenere doppio trattino' }
  if (!SLUG_RE.test(v)) {
    return { ok: false, message: 'Slug deve contenere solo lettere minuscole, numeri e trattini' }
  }
  return { ok: true }
}

function validateEmail(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Email deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length === 0) return { ok: false, message: 'Email obbligatoria' }
  if (trimmed.length > 254) return { ok: false, message: 'Email troppo lunga' }
  if (!EMAIL_RE.test(trimmed)) return { ok: false, message: 'Formato email non valido' }
  return { ok: true }
}

function validatePassword(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Password deve essere stringa' }
  if (v.length < 8) return { ok: false, message: 'Password minimo 8 caratteri' }
  if (v.length > 200) return { ok: false, message: 'Password troppo lunga' }
  if (!PWD_HAS_LETTER.test(v)) return { ok: false, message: 'Password deve contenere almeno una lettera' }
  if (!PWD_HAS_DIGIT.test(v)) return { ok: false, message: 'Password deve contenere almeno un numero' }
  return { ok: true }
}

function validateFullName(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Nome completo deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length < 2) return { ok: false, message: 'Nome completo minimo 2 caratteri' }
  if (trimmed.length > 80) return { ok: false, message: 'Nome completo massimo 80 caratteri' }
  return { ok: true }
}

function validateSignupRequest(
  body: unknown,
):
  | { ok: true; data: SignupRequest }
  | { ok: false; message: string; field: keyof SignupRequest }
{
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body JSON richiesto', field: 'org_name' }
  }
  const b = body as Record<string, unknown>

  const checks: Array<[keyof SignupRequest, (v: unknown) => ValidationResult]> = [
    ['org_name',        validateOrgName],
    ['org_slug',        validateOrgSlug],
    ['admin_email',     validateEmail],
    ['admin_password',  validatePassword],
    ['admin_full_name', validateFullName],
  ]

  for (const [field, validator] of checks) {
    const r = validator(b[field])
    if (!r.ok) return { ok: false, message: r.message, field }
  }

  const data: SignupRequest = {
    org_name:        (b.org_name as string).trim(),
    org_slug:        (b.org_slug as string).trim().toLowerCase(),
    admin_email:     (b.admin_email as string).trim().toLowerCase(),
    admin_password:  b.admin_password as string,
    admin_full_name: (b.admin_full_name as string).trim(),
  }
  return { ok: true, data }
}

// ════════════════════════════════════════════════════════════════
// RATE LIMIT (lib/ratelimit.ts)
// ════════════════════════════════════════════════════════════════

const RL_WINDOW_MS = 60 * 60 * 1000
const RL_MAX_ATTEMPTS = 5
const rlAttempts = new Map<string, number[]>()

interface RateLimitCheck { allowed: boolean; remainingMs?: number }

function checkRateLimit(ipHash: string): RateLimitCheck {
  const now = Date.now()
  const recent = (rlAttempts.get(ipHash) || []).filter(t => now - t < RL_WINDOW_MS)
  if (recent.length > 0) rlAttempts.set(ipHash, recent)
  else rlAttempts.delete(ipHash)
  if (recent.length < RL_MAX_ATTEMPTS) return { allowed: true }
  const oldest = recent[0]
  return { allowed: false, remainingMs: RL_WINDOW_MS - (now - oldest) }
}

function recordAttempt(ipHash: string): void {
  const now = Date.now()
  const recent = (rlAttempts.get(ipHash) || []).filter(t => now - t < RL_WINDOW_MS)
  recent.push(now)
  rlAttempts.set(ipHash, recent)
}

// ════════════════════════════════════════════════════════════════
// CRYPTO (lib/crypto.ts)
// ════════════════════════════════════════════════════════════════

const FALLBACK_SALT = 'manutech-dev-only-DO-NOT-USE-IN-PROD-c8b3e1a4'

function isProduction(): boolean {
  return Deno.env.get('SUPABASE_ENV') === 'production'
}

function getSalt(): string {
  const salt = Deno.env.get('IP_HASH_SALT')
  if (salt && salt.length >= 16) return salt
  if (isProduction()) {
    throw new Error(
      'IP_HASH_SALT not configured in production. ' +
      'Set it in Supabase Dashboard → Edge Function secrets (32+ random bytes).'
    )
  }
  console.warn(
    '[signup-org] IP_HASH_SALT missing or too short — using FALLBACK salt. ' +
    'This is acceptable in dev/staging only. In production this would HARD FAIL.'
  )
  return FALLBACK_SALT
}

async function hashIp(ip: string): Promise<string> {
  const salt = getSalt()
  const data = new TextEncoder().encode(ip + ':' + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function extractClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

// ════════════════════════════════════════════════════════════════
// EMAIL (lib/email.ts)
// ════════════════════════════════════════════════════════════════

const RESEND_API = 'https://api.resend.com/emails'

interface SendResult { ok: boolean; id?: string; error?: string }
interface NewSignupNotificationInput {
  orgId: string
  orgName: string
  orgSlug: string
  ownerEmail: string
  ownerName: string
  appBaseUrl?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

async function sendNewSignupNotification(
  input: NewSignupNotificationInput,
): Promise<SendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('SIGNUP_NOTIFICATION_EMAIL')
  const from = Deno.env.get('SIGNUP_FROM_EMAIL') || 'ManuTech <noreply@manutech.app>'

  if (!apiKey || !to) {
    console.warn('[signup-org] Email skip: RESEND_API_KEY or SIGNUP_NOTIFICATION_EMAIL missing')
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
      body: JSON.stringify({ from, to: [to], subject, html, text }),
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

// ════════════════════════════════════════════════════════════════
// PROVISION (lib/provision.ts)
// ════════════════════════════════════════════════════════════════

const TRIAL_DAYS = 30

type ProvisionResult =
  | { ok: true; org_id: string; user_id: string; warnings: WarningCode[] }
  | { ok: false; error: 'email_exists' | 'slug_taken' | 'internal'; message: string }

async function rollbackOrganization(supabase: SupabaseClient, orgId: string): Promise<void> {
  const { error } = await supabase.from('organizations').delete().eq('id', orgId)
  if (error) {
    console.error('[signup-org] ROLLBACK failed (orphan org):', error.message, { org_id: orgId })
  }
}

async function rollbackUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[signup-org] ROLLBACK failed (orphan auth user):', error.message, { user_id: userId })
  }
}

async function provisionOrganization(
  supabase: SupabaseClient,
  input: SignupRequest,
): Promise<ProvisionResult> {
  const warnings: WarningCode[] = []
  let orgId: string | null = null
  let userId: string | null = null

  // Step A: INSERT organizations (approval_status='pending')
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: input.org_name,
      slug: input.org_slug,
      plan: 'trial',
      status: 'trial',
      approval_status: 'pending',
      trial_ends_at: trialEndsAt,
      owner_user_id: null,
    })
    .select('id')
    .single()

  if (orgErr || !orgData) {
    const errCode = (orgErr as { code?: string })?.code
    const errMsg = orgErr?.message?.toLowerCase() ?? ''
    if (errCode === '23505' || errMsg.includes('duplicate key')) {
      console.warn('[signup-org] Step A slug race detected:', input.org_slug)
      return { ok: false, error: 'slug_taken', message: `Slug "${input.org_slug}" appena registrato da un altro utente, riprova` }
    }
    console.error('[signup-org] Step A failed:', orgErr?.message)
    return { ok: false, error: 'internal', message: `Errore creazione organizzazione: ${orgErr?.message || 'unknown'}` }
  }
  orgId = orgData.id

  // Step B: auth.admin.createUser con escape-hatch
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: input.admin_email,
    password: input.admin_password,
    email_confirm: true,
    user_metadata: {
      name: input.admin_full_name,
      role: 'admin',
      _signup_via_edge: 'true',
    },
  })

  if (userErr || !userData?.user) {
    await rollbackOrganization(supabase, orgId)
    const authStatus = (userErr as { status?: number })?.status
    const authCode = (userErr as { code?: string })?.code
    const msg = (userErr?.message || '').toLowerCase()
    const isEmailDup =
      authCode === 'email_exists' ||
      authCode === 'user_already_exists' ||
      authCode === 'email_address_already_exists' ||
      (authStatus === 422 && (msg.includes('already') || msg.includes('exists'))) ||
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('user already')

    if (isEmailDup) {
      return { ok: false, error: 'email_exists', message: `Email "${input.admin_email}" già registrata` }
    }
    console.error('[signup-org] Step B failed:', msg, { code: authCode, status: authStatus })
    return { ok: false, error: 'internal', message: `Errore creazione utente: ${userErr?.message || 'unknown'}` }
  }
  userId = userData.user.id

  // Step C: INSERT users (profilo applicativo)
  const { error: profileErr } = await supabase
    .from('users')
    .insert({
      auth_id: userId,
      email: input.admin_email,
      name: input.admin_full_name,
      role: 'admin',
      org_id: orgId,
      status: 'active',
    })

  if (profileErr) {
    console.error('[signup-org] Step C failed:', profileErr.message, { org_id: orgId, user_id: userId })
    await rollbackUser(supabase, userId)
    await rollbackOrganization(supabase, orgId)
    return { ok: false, error: 'internal', message: `Errore creazione profilo: ${profileErr.message}` }
  }

  // Step D: UPDATE owner_user_id (non bloccante)
  const { error: ownerErr } = await supabase
    .from('organizations')
    .update({ owner_user_id: userId })
    .eq('id', orgId)
  if (ownerErr) {
    console.warn('[signup-org] Step D failed (non-blocking):', ownerErr.message, { org_id: orgId, user_id: userId })
    warnings.push('owner_user_id_update_failed')
  }

  // Step E: notifica email super_admin (non bloccante)
  const emailRes = await sendNewSignupNotification({
    orgId,
    orgName: input.org_name,
    orgSlug: input.org_slug,
    ownerEmail: input.admin_email,
    ownerName: input.admin_full_name,
  })
  if (!emailRes.ok) {
    warnings.push('notification_email_failed')
  }

  return { ok: true, org_id: orgId, user_id: userId, warnings }
}

// ════════════════════════════════════════════════════════════════
// HTTP HANDLER (index.ts)
// ════════════════════════════════════════════════════════════════

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

function jsonError(error: ErrorCode, message: string, field?: string): Response {
  const body: SignupResponse = field
    // deno-lint-ignore no-explicit-any
    ? { ok: false, error, message, field: field as any }
    : { ok: false, error, message }
  return jsonOk(STATUS_FOR_ERROR[error], body)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonError('invalid_input', 'Solo POST è supportato')
  }

  const ip = extractClientIp(req)
  let ipHash: string
  try {
    ipHash = await hashIp(ip)
  } catch (err) {
    console.error('[signup-org] hashIp failed:', (err as Error).message)
    return jsonError('internal', 'Configurazione server incompleta')
  }

  const rl = checkRateLimit(ipHash)
  if (!rl.allowed) {
    const minutes = Math.ceil((rl.remainingMs ?? 0) / 60_000)
    return jsonError('rate_limited', `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? 'o' : 'i'}.`)
  }

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('[signup-org] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return jsonError('internal', 'Configurazione server incompleta')
  }
  const supabase = createClient(supabaseUrl, serviceKey)

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

  const result = await provisionOrganization(supabase, input)
  recordAttempt(ipHash)

  if (!result.ok) {
    return jsonError(result.error, result.message)
  }

  const successBody: SignupResponse = {
    ok: true,
    org_id: result.org_id,
    user_id: result.user_id,
    ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
  }
  return jsonOk(201, successBody)
})
