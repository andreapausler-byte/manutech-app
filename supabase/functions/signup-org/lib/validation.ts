/**
 * Edge Function signup-org — Validatori puri (no DB dependency)
 *
 * Tutte le funzioni:
 *  • Sono PURE: nessun side effect, nessuna chiamata DB
 *  • Ritornano { ok: true } o { ok: false, message } in italiano
 *  • Il caller (validateSignupRequest) costruisce SignupError con `field`
 *
 * Slug uniqueness è check separato (RPC check_slug_available in 033).
 */

import type { SignupRequest } from './types.ts'

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string }

// Email RFC 5322 semplificata (sufficiente per signup, non per validazione strict).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Slug: lowercase alfanumerico + dash, 3-30 char, no leading/trailing/double dash.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/

// Password: min 8 char, ≥1 lettera + ≥1 numero. No requisiti su special char.
const PWD_HAS_LETTER = /[A-Za-z]/
const PWD_HAS_DIGIT = /\d/

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

export function validateOrgName(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Nome organizzazione deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length < 2) return { ok: false, message: 'Nome organizzazione minimo 2 caratteri' }
  if (trimmed.length > 80) return { ok: false, message: 'Nome organizzazione massimo 80 caratteri' }
  return { ok: true }
}

export function validateOrgSlug(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Slug deve essere stringa' }
  if (v.length < 3) return { ok: false, message: 'Slug minimo 3 caratteri' }
  if (v.length > 30) return { ok: false, message: 'Slug massimo 30 caratteri' }
  if (v.includes('--')) return { ok: false, message: 'Slug non può contenere doppio trattino' }
  if (!SLUG_RE.test(v)) {
    return { ok: false, message: 'Slug deve contenere solo lettere minuscole, numeri e trattini' }
  }
  return { ok: true }
}

export function validateEmail(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Email deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length === 0) return { ok: false, message: 'Email obbligatoria' }
  if (trimmed.length > 254) return { ok: false, message: 'Email troppo lunga' }
  if (!EMAIL_RE.test(trimmed)) return { ok: false, message: 'Formato email non valido' }
  return { ok: true }
}

export function validatePassword(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Password deve essere stringa' }
  if (v.length < 8) return { ok: false, message: 'Password minimo 8 caratteri' }
  if (v.length > 200) return { ok: false, message: 'Password troppo lunga' }
  if (!PWD_HAS_LETTER.test(v)) return { ok: false, message: 'Password deve contenere almeno una lettera' }
  if (!PWD_HAS_DIGIT.test(v)) return { ok: false, message: 'Password deve contenere almeno un numero' }
  return { ok: true }
}

export function validateFullName(v: unknown): ValidationResult {
  if (!isString(v)) return { ok: false, message: 'Nome completo deve essere stringa' }
  const trimmed = v.trim()
  if (trimmed.length < 2) return { ok: false, message: 'Nome completo minimo 2 caratteri' }
  if (trimmed.length > 80) return { ok: false, message: 'Nome completo massimo 80 caratteri' }
  return { ok: true }
}

// ── Master: ritorna SignupRequest normalizzato (trim/lowercase) o errore con field ──
export function validateSignupRequest(
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

  // Normalizzazione: trim su nomi/slug/email, lowercase email
  const data: SignupRequest = {
    org_name:        (b.org_name as string).trim(),
    org_slug:        (b.org_slug as string).trim().toLowerCase(),
    admin_email:     (b.admin_email as string).trim().toLowerCase(),
    admin_password:  b.admin_password as string,  // mai trim/lowercase su password
    admin_full_name: (b.admin_full_name as string).trim(),
  }
  return { ok: true, data }
}
