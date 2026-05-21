/**
 * Edge Function: send-push-notification
 *
 * Triggerata da Database Webhook su INSERT in public.notifications.
 * Invia Web Push notification ai dispositivi registrati dell'utente target.
 *
 * Secrets necessari (Supabase Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY  — chiave pubblica VAPID (base64url)
 *   VAPID_PRIVATE_KEY — chiave privata VAPID (base64url)
 *   VAPID_SUBJECT     — email o URL del mittente (es. mailto:admin@manutech.it)
 *
 * Webhook config (Supabase Dashboard → Database → Webhooks):
 *   Table: notifications, Event: INSERT
 *   Method: POST, URL: <edge-function-url>/send-push-notification
 *   Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── VAPID / Web Push crypto utilities ──

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = ''
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64Url(new Uint8Array(buffer))
}

// Importa chiave ECDSA P-256 dal formato raw (32 bytes)
async function importVapidPrivateKey(privateKeyBase64Url: string): Promise<CryptoKey> {
  const rawKey = base64UrlToUint8Array(privateKeyBase64Url)
  // Converte raw 32 bytes in JWK format per ECDSA P-256
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyBase64Url,
    x: '', // verrà derivato dalla public key
    y: '',
  }
  // Importiamo direttamente come PKCS8 non funziona con raw, usiamo JWK
  // Prima dobbiamo derivare x,y dalla public key
  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  ).catch(async () => {
    // Fallback: importa come JWK con la public key completa
    // Per ECDSA sign servono d + x + y. Usiamo un approccio diverso.
    // Generiamo il JWT con HMAC come workaround
    throw new Error('Direct raw import failed, see alternative approach')
  })
}

// Crea un JWT VAPID firmato con ECDSA P-256
async function createVapidJwt(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
  expSeconds = 12 * 3600
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + expSeconds,
    sub: subject,
  }

  const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Importa la private key come JWK per ECDSA signing
  const rawPrivate = base64UrlToUint8Array(privateKey)
  const rawPublic = base64UrlToUint8Array(publicKey)

  // Estrai x, y dalla uncompressed public key (65 bytes: 0x04 + 32x + 32y)
  const x = uint8ArrayToBase64Url(rawPublic.slice(1, 33))
  const y = uint8ArrayToBase64Url(rawPublic.slice(33, 65))
  const d = privateKey

  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    d,
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken)
  )

  // Converti firma DER a raw r||s (64 bytes)
  const sigBytes = new Uint8Array(signature)
  let rawSig: Uint8Array

  if (sigBytes.length === 64) {
    rawSig = sigBytes
  } else {
    // Web Crypto può restituire formato raw (r||s) direttamente
    rawSig = sigBytes
  }

  const sigB64 = arrayBufferToBase64Url(rawSig)
  return `${unsignedToken}.${sigB64}`
}

// ── Encrypt push message payload (RFC 8291 + aes128gcm) ──

async function encryptPayload(
  payload: string,
  subscriptionPublicKey: string,  // base64url p256dh
  subscriptionAuth: string         // base64url auth
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // Genera ephemeral ECDH key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey)
  )

  // Importa subscriber's public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    base64UrlToUint8Array(subscriptionPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      serverKeys.privateKey,
      256
    )
  )

  const authSecret = base64UrlToUint8Array(subscriptionAuth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF per derivare le chiavi di encryption
  const encoder = new TextEncoder()

  // IKM = HKDF(salt=auth_secret, IKM=ecdh_secret, info="WebPush: info\0" || ua_public || as_public)
  // RFC 8291 Section 3.4: salt=auth_secret, IKM=ecdh_secret
  const authInfo = encoder.encode('WebPush: info\0')
  const clientPubBytes = base64UrlToUint8Array(subscriptionPublicKey)
  const combinedInfo = new Uint8Array(authInfo.length + clientPubBytes.length + serverPublicKeyRaw.length)
  combinedInfo.set(authInfo)
  combinedInfo.set(clientPubBytes, authInfo.length)
  combinedInfo.set(serverPublicKeyRaw, authInfo.length + clientPubBytes.length)

  const sharedKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits'])
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: combinedInfo },
      sharedKey,
      256
    )
  )

  // CEK = HKDF(salt=salt, IKM=ikm, "Content-Encoding: aes128gcm\0", 16)
  const ikmKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits'])
  const contentEncKey = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: aes128gcm\0') },
      ikmKey,
      128
    )
  )

  // Nonce = HKDF(salt=salt, IKM=ikm, "Content-Encoding: nonce\0", 12)
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: nonce\0') },
      ikmKey,
      96
    )
  )

  // Encrypt con AES-128-GCM
  const aesKey = await crypto.subtle.importKey('raw', contentEncKey, { name: 'AES-GCM' }, false, ['encrypt'])

  // Padding: aggiungi delimiter \x02 dopo il payload
  const payloadBytes = encoder.encode(payload)
  const paddedPayload = new Uint8Array(payloadBytes.length + 1)
  paddedPayload.set(payloadBytes)
  paddedPayload[payloadBytes.length] = 2 // Delimiter

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      paddedPayload
    )
  )

  // Costruisci il body aes128gcm: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyRaw.length)
  header.set(salt)
  new DataView(header.buffer).setUint32(16, rs)
  header[20] = serverPublicKeyRaw.length
  header.set(serverPublicKeyRaw, 21)

  const encrypted = new Uint8Array(header.length + ciphertext.length)
  encrypted.set(header)
  encrypted.set(ciphertext, header.length)

  return { encrypted, salt, serverPublicKey: serverPublicKeyRaw }
}

// ── Send a single Web Push notification ──

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ success: boolean; status: number; expired?: boolean }> {
  const payloadStr = JSON.stringify(payload)

  // Encrypt payload
  const { encrypted } = await encryptPayload(payloadStr, subscription.p256dh, subscription.auth)

  // VAPID JWT
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const jwt = await createVapidJwt(audience, vapidSubject, vapidPublicKey, vapidPrivateKey)

  // Raw VAPID public key per header
  const vapidPubKeyForHeader = vapidPublicKey

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${vapidPubKeyForHeader}`,
      'Urgency': 'high',
    },
    body: encrypted,
  })

  const expired = response.status === 404 || response.status === 410
  return { success: response.ok, status: response.status, expired }
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
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@manutech.it'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured')
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Payload dal Database Webhook
    const body = await req.json()
    const notification = body.record || body

    console.log('[Push] Webhook received:', JSON.stringify({ type: notification?.type, title: notification?.title, target_user: notification?.target_user, org_id: notification?.org_id }))

    if (!notification?.type || !notification?.title) {
      console.error('[Push] Invalid payload:', JSON.stringify(body))
      return new Response(JSON.stringify({ error: 'Invalid notification payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Init Supabase con service_role (bypassa RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Trova le push subscriptions da notificare
    let subscriptions: Array<{ endpoint: string; p256dh: string; auth: string; user_id: string }> = []

    if (notification.target_user) {
      // Notifica mirata: subscription dell'utente target
      const { data } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .eq('user_id', notification.target_user)

      subscriptions = data || []
    } else {
      // Broadcast: tutte le subscription della stessa org (escluso il mittente)
      let query = supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, user_id')
        .eq('org_id', notification.org_id || 'default')

      if (notification.from_user) {
        query = query.neq('user_id', notification.from_user)
      }

      const { data } = await query
      subscriptions = data || []
    }

    console.log(`[Push] Found ${subscriptions.length} subscription(s) for notification type="${notification.type}"`)

    if (subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Controlla preferenze notifiche per ogni utente target
    const userIds = [...new Set(subscriptions.map(s => s.user_id))]
    const { data: prefsData } = await supabase
      .from('notification_preferences')
      .select('user_id, prefs, role, is_org_default')
      .or(`user_id.in.(${userIds.join(',')}),is_org_default.eq.true`)
      .eq('org_id', notification.org_id || 'default')

    // Ottieni i ruoli degli utenti target
    const { data: usersData } = await supabase
      .from('users')
      .select('id, role')
      .in('id', userIds)

    const userRoles: Record<string, string> = {}
    usersData?.forEach(u => { userRoles[u.id] = u.role })

    // Default ruolo.
    //
    // Sprint 1b-B (Phase B wiring 19/5):
    //   - `new_report_critical` = nuovo report severity='critica'. Admin SEMPRE
    //     on (override implicito anche se hanno silenziato new_report standard).
    //   - `intervention_assigned` / `_rescheduled` / `_cancelled` = eventi dal
    //     dominio interventi (notifyAssignee in db/interventions.js). Tecnico
    //     ON di default — è il loro lavoro del giorno. Admin ON come courtesy
    //     per chi pianifica e vuole follow-up. Operatore OFF (non gestisce
    //     interventi, vede già le notifiche via status_change del report).
    // Sprint 1c (21/5):
    //   - participant_added / participant_removed = l'utente è stato
    //     aggiunto/rimosso come "altro coinvolto" su un intervento. ON
    //     per tutti i ruoli: è il loro stato che cambia, lo devono
    //     sapere indipendentemente dal ruolo.
    //   - intervention_scheduled_change / intervention_status_change =
    //     l'intervento a cui partecipano cambia data o status. ON per
    //     tutti i ruoli quando l'utente è già coinvolto (assigned /
    //     supervised / participant) — il fan-out è già filtrato a monte
    //     dal client lato InterventionForm save handler.
    const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
      admin: { new_report: true, new_report_critical: true, quick_report: true, assigned: true, status_change: true, comment: true, intervention_assigned: true, intervention_rescheduled: true, intervention_cancelled: true, maintenance_taken: true, maintenance_completed: true, maintenance_reminder: true, maintenance_overdue: true, participant_added: true, participant_removed: true, intervention_scheduled_change: true, intervention_status_change: true },
      tecnico: { new_report: false, new_report_critical: true, quick_report: false, assigned: true, status_change: true, comment: true, intervention_assigned: true, intervention_rescheduled: true, intervention_cancelled: true, maintenance_taken: false, maintenance_completed: false, maintenance_reminder: true, maintenance_overdue: true, participant_added: true, participant_removed: true, intervention_scheduled_change: true, intervention_status_change: true },
      operatore: { new_report: false, new_report_critical: false, quick_report: false, assigned: true, status_change: true, comment: true, intervention_assigned: false, intervention_rescheduled: false, intervention_cancelled: false, maintenance_taken: false, maintenance_completed: false, maintenance_reminder: true, maintenance_overdue: true, participant_added: true, participant_removed: true, intervention_scheduled_change: true, intervention_status_change: true },
    }

    // Preferenze per utente
    const userPrefs: Record<string, Record<string, boolean>> = {}
    const orgDefaults: Record<string, Record<string, boolean>> = {}

    prefsData?.forEach(p => {
      if (p.is_org_default && p.role) {
        orgDefaults[p.role] = p.prefs as Record<string, boolean>
      } else if (p.user_id) {
        userPrefs[p.user_id] = p.prefs as Record<string, boolean>
      }
    })

    function shouldNotify(userId: string, notifType: string): boolean {
      // 1. Pref personale
      if (userPrefs[userId]) return userPrefs[userId][notifType] !== false
      // 2. Org default per ruolo
      const role = userRoles[userId] || 'operatore'
      if (orgDefaults[role]) return orgDefaults[role][notifType] !== false
      // 3. Default di sistema
      const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.operatore
      return defaults[notifType] !== false
    }

    // Filtra subscription in base a preferenze
    const eligibleSubs = subscriptions.filter(s => shouldNotify(s.user_id, notification.type))

    if (eligibleSubs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'All filtered by preferences' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Prepara payload push
    const pushPayload = {
      title: notification.title,
      body: notification.body || '',
      type: notification.type,
      report_id: notification.report_id,
      url: notification.report_id ? `/reports/${notification.report_id}` : '/',
    }

    // Invia push a tutti i dispositivi eligibili
    const results = await Promise.allSettled(
      eligibleSubs.map(async (sub) => {
        const result = await sendWebPush(sub, pushPayload, vapidPublicKey, vapidPrivateKey, vapidSubject)
        console.log(`[Push] Result for ${sub.endpoint.slice(0, 60)}...: status=${result.status}, success=${result.success}`)

        // Rimuovi subscription scaduta
        if (result.expired) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint)
          console.log(`[Push] Removed expired subscription: ${sub.endpoint.slice(0, 50)}...`)
        }

        return result
      })
    )

    const sent = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length
    const expired = results.filter(r => r.status === 'fulfilled' && (r.value as { expired?: boolean }).expired).length
    const failed = results.length - sent

    console.log(`[Push] Sent: ${sent}, Failed: ${failed}, Expired removed: ${expired}`)

    return new Response(
      JSON.stringify({ sent, failed, expired, total: eligibleSubs.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[Push] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
