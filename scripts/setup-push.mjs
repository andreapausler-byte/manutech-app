#!/usr/bin/env node
/**
 * setup-push.mjs — Setup automatico Web Push Notifications
 *
 * Cosa fa:
 * 1. Genera VAPID keys (se non esistono)
 * 2. Mostra le istruzioni per configurare Supabase
 * 3. Genera il SQL da eseguire su Supabase per completare il setup
 *
 * Uso:
 *   node scripts/setup-push.mjs
 *   node scripts/setup-push.mjs --generate-keys
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { webcrypto } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ENV_PATH = resolve(ROOT, '.env')

// ── Genera VAPID keys usando Web Crypto ──
async function generateVapidKeys() {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )

  const publicKeyRaw = new Uint8Array(
    await webcrypto.subtle.exportKey('raw', keyPair.publicKey)
  )
  const privateKeyJwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey)

  // base64url encode
  const toBase64Url = (buf) =>
    Buffer.from(buf).toString('base64url')

  const publicKey = toBase64Url(publicKeyRaw)
  // Private key 'd' component is already base64url in JWK
  const privateKey = privateKeyJwk.d

  return { publicKey, privateKey }
}

// ── Leggi .env ──
function readEnv() {
  if (!existsSync(ENV_PATH)) return {}
  const content = readFileSync(ENV_PATH, 'utf-8')
  const vars = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match) vars[match[1]] = match[2]
  }
  return vars
}

// ── Aggiorna .env ──
function updateEnv(key, value) {
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : ''
  const regex = new RegExp(`^${key}=.*$`, 'm')

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }

  writeFileSync(ENV_PATH, content)
}

// ── Main ──
async function main() {
  console.log('\n🔔 ManuTech — Setup Web Push Notifications\n')
  console.log('─'.repeat(55))

  const env = readEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL || ''
  let vapidPublicKey = env.VITE_VAPID_PUBLIC_KEY || ''

  // Step 1: Verifica Supabase URL
  if (!supabaseUrl) {
    console.log('\n❌ VITE_SUPABASE_URL non configurato nel .env')
    console.log('   Configura prima Supabase, poi riesegui questo script.')
    process.exit(1)
  }
  console.log(`\n✅ Supabase URL: ${supabaseUrl}`)

  // Step 2: Genera VAPID keys se necessario
  let vapidPrivateKey = null

  if (!vapidPublicKey || process.argv.includes('--generate-keys')) {
    console.log('\n📝 Generazione nuove VAPID keys...')
    const keys = await generateVapidKeys()
    vapidPublicKey = keys.publicKey
    vapidPrivateKey = keys.privateKey

    // Salva public key nel .env
    updateEnv('VITE_VAPID_PUBLIC_KEY', vapidPublicKey)
    console.log(`   ✅ Public key salvata nel .env`)
  } else {
    console.log(`✅ VAPID public key: ${vapidPublicKey.slice(0, 20)}...`)
  }

  // Step 3: Mostra istruzioni
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/send-push-notification`

  console.log('\n' + '═'.repeat(55))
  console.log('  ISTRUZIONI PER COMPLETARE IL SETUP')
  console.log('═'.repeat(55))

  if (vapidPrivateKey) {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║  ⚠️  SALVA QUESTE CHIAVI — NON VERRANNO RIVISUALIZZATE  ║
╠═══════════════════════════════════════════════════════╣
║  VAPID Public Key:                                    ║
║  ${vapidPublicKey}
║                                                       ║
║  VAPID Private Key:                                   ║
║  ${vapidPrivateKey}
╚═══════════════════════════════════════════════════════╝`)
  }

  console.log(`
── STEP 1: Secrets Edge Function ──────────────────────
Vai su Supabase Dashboard → Project Settings → Edge Functions → Secrets
Aggiungi:

  VAPID_PUBLIC_KEY  = ${vapidPublicKey}${vapidPrivateKey ? `\n  VAPID_PRIVATE_KEY = ${vapidPrivateKey}` : '\n  VAPID_PRIVATE_KEY = <la chiave privata generata in precedenza>'}
  VAPID_SUBJECT     = mailto:admin@manutech.it

── STEP 2: Deploy Edge Function ───────────────────────
Esegui da terminale:

  npx supabase functions deploy send-push-notification --project-ref ${supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1] || '<PROJECT_REF>'}

── STEP 3: Configura il trigger (SQL) ─────────────────
Esegui questa query nel SQL Editor di Supabase:`)

  console.log(`
-- 1. Esegui la migration 009 (se non l'hai già fatto):
--    Copia il contenuto di supabase/migrations/009_push_notification_trigger.sql

-- 2. Poi configura URL e chiave:
INSERT INTO public.push_config (key, value) VALUES
  ('edge_function_url', '${edgeFunctionUrl}'),
  ('service_role_key', '<INCOLLA_QUI_LA_SERVICE_ROLE_KEY>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Trova la service_role_key in:
-- Supabase Dashboard → Settings → API → Project API keys → service_role
`)

  console.log('── STEP 4: Vercel Environment Variables ────────────────')
  console.log(`Aggiungi/aggiorna su Vercel → Settings → Environment Variables:

  VITE_VAPID_PUBLIC_KEY = ${vapidPublicKey}
`)

  console.log('─'.repeat(55))
  console.log('✅ Setup completato! Segui gli step sopra per attivare le push.')
  console.log('')
}

main().catch(console.error)
