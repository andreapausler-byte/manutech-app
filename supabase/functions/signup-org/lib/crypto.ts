/**
 * Edge Function signup-org — IP hashing per GDPR compliance
 *
 * Salva solo SHA-256(ip + IP_HASH_SALT) come chiave di rate limiting.
 * L'IP grezzo non viene mai persistito o loggato.
 *
 * Configurazione SUPABASE_ENV-aware (Q2 decisione):
 *   • production → HARD FAIL se IP_HASH_SALT manca (impedisce GDPR violation)
 *   • dev/staging → WARN + fallback fisso documentato (sviluppo non blocca)
 */

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

export async function hashIp(ip: string): Promise<string> {
  const salt = getSalt()
  const data = new TextEncoder().encode(ip + ':' + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Estrae l'IP del client dai headers proxy.
 * Order: X-Forwarded-For (primo hop) > X-Real-IP > 'unknown'.
 *
 * Fallback 'unknown': tutti i client senza IP detectabile condividono
 * lo stesso rate limit bucket. Safe default contro IP spoofing.
 */
export function extractClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    // X-Forwarded-For: "client, proxy1, proxy2" — primo è il client originale
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}
