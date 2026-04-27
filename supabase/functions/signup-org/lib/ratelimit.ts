/**
 * Edge Function signup-org — Rate limiting in-memory
 *
 * Sliding window: max MAX_ATTEMPTS signup/ora per ipHash.
 *
 * ⚠️ LIMITE NOTO: l'in-memory store è perso al cold start della Edge
 * Function e NON è condiviso tra istanze in scaling orizzontale.
 * In pratica significa che 5 attempts/h diventano effettivi 5×N/h con
 * N istanze attive. Per audit trail/abuse protection vero serve tabella
 * `signup_attempts` con cleanup cron — Sprint futuro.
 *
 * Pattern coerente con guest-chat/index.ts (stesso codebase).
 */

const WINDOW_MS = 60 * 60 * 1000  // 1 ora
const MAX_ATTEMPTS = 5

// Map<ipHash, timestamps[]>
const attempts = new Map<string, number[]>()

export interface RateLimitCheck {
  allowed: boolean
  remainingMs?: number  // ms al prossimo tentativo permesso (per messaggio user)
}

export function checkRateLimit(ipHash: string): RateLimitCheck {
  const now = Date.now()
  const recent = (attempts.get(ipHash) || []).filter(t => now - t < WINDOW_MS)

  // Aggiorna la map per pulire timestamps scaduti (anche su check, low overhead)
  if (recent.length > 0) attempts.set(ipHash, recent)
  else attempts.delete(ipHash)

  if (recent.length < MAX_ATTEMPTS) {
    return { allowed: true }
  }

  // Calcola tempo prima che il più vecchio tentativo esca dalla window
  const oldest = recent[0]
  const remainingMs = WINDOW_MS - (now - oldest)
  return { allowed: false, remainingMs }
}

export function recordAttempt(ipHash: string): void {
  const now = Date.now()
  const recent = (attempts.get(ipHash) || []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  attempts.set(ipHash, recent)
}

// Esposto solo per test/debug — NON usare in produzione
export function _resetRateLimitForTesting(): void {
  attempts.clear()
}
