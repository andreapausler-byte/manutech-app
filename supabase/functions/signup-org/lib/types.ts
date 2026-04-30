/**
 * Edge Function signup-org — Contratto API
 *
 * NB: questi tipi devono restare allineati con SignupPage.jsx (client React).
 * Modifiche breaking → bumpa il commento "API version" e segnala in README.
 *
 * API version: 1.0.0
 */

// ── Request body in arrivo dal client (POST JSON) ──
export interface SignupRequest {
  org_name: string         // 2-80 char dopo trim
  org_slug: string         // /^[a-z0-9-]{3,30}$/ — no leading/trailing/double dash
  admin_email: string      // RFC 5322 semplificata, max 254 char, lowercase
  admin_password: string   // min 8 char, ≥1 lettera + ≥1 numero
  admin_full_name: string  // 2-80 char dopo trim
}

// ── Codici errore tassativi (il client React ne dipende) ──
export type ErrorCode =
  | 'invalid_input'  // 400 — validazione fallita (campo in `field`)
  | 'slug_taken'     // 409 — slug già usato
  | 'email_exists'   // 409 — email già registrata in auth.users
  | 'rate_limited'   // 429 — > MAX_ATTEMPTS signup/ora dallo stesso IP
  | 'internal'       // 500 — errore non gestito (rollback eseguito)

// ── Warning non bloccanti (Q3 decisione: Step D fail = warning, no rollback) ──
export type WarningCode =
  | 'owner_user_id_update_failed'  // org creata, user creato, ma owner_user_id NULL
  | 'notification_email_failed'    // signup ok ma email super_admin non inviata

// ── Response success (HTTP 201) ──
export interface SignupSuccess {
  ok: true
  org_id: string              // UUID nuova organization
  user_id: string             // UUID auth user
  warnings?: WarningCode[]    // popolato solo se ci sono stati warning non bloccanti
  // NB: nessun session token — il client fa signInWithPassword separatamente
}

// ── Response error (HTTP 400/409/429/500) ──
export interface SignupError {
  ok: false
  error: ErrorCode
  message: string                    // italiano, mostrabile direttamente all'utente
  field?: keyof SignupRequest        // popolato solo per error='invalid_input'
}

export type SignupResponse = SignupSuccess | SignupError

// ── HTTP status code per ogni ErrorCode (single source of truth) ──
export const STATUS_FOR_ERROR: Record<ErrorCode, number> = {
  invalid_input: 400,
  slug_taken:    409,
  email_exists:  409,
  rate_limited:  429,
  internal:      500,
}
