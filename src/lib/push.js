/**
 * push.js — iscrizione Web Push del telefono, allineata al server.
 *
 * Fino a ott 2026 l'app si iscriveva con la chiave VAPID pubblica scritta
 * nella build (VITE_VAPID_PUBLIC_KEY, su Vercel) e il server firmava con
 * la coppia nei secrets di Supabase. Le due copie non coincidevano: Google
 * (403), Mozilla (401) e Apple (400) rifiutavano ogni push, e l'app non se
 * ne accorgeva perché riusava l'iscrizione esistente senza guardare con
 * quale chiave era stata fatta.
 *
 * Qui la chiave si chiede al server (GET su send-push-notification) e
 * l'iscrizione si rifà da sola quando non corrisponde. La chiave della
 * build resta solo come ripiego, se la funzione non risponde.
 */

import { supabaseUrl } from './db/_client'
import { db } from './supabase'

const BUILD_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || null
// Chiave con cui QUESTO browser si è iscritto: serve dove il browser non
// espone `subscription.options.applicationServerKey` (Safari vecchi).
const KEY_MARK = 'manutech_push_key'

let serverKeyPromise = null

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Chiave pubblica con cui firma il server. Una richiesta per sessione.
export function getServerVapidKey() {
  if (!serverKeyPromise) {
    serverKeyPromise = (async () => {
      if (supabaseUrl) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, { method: 'GET' })
          if (res.ok) {
            const { publicKey } = await res.json()
            if (publicKey) return { key: publicKey, source: 'server' }
          }
        } catch (e) {
          console.warn('[push] chiave dal server non disponibile:', e?.message)
        }
      }
      return BUILD_KEY ? { key: BUILD_KEY, source: 'build' } : null
    })()
    // Un errore di rete non deve restare in cache per tutta la sessione.
    serverKeyPromise.then(r => { if (!r || r.source === 'build') serverKeyPromise = null })
  }
  return serverKeyPromise
}

function readMark() {
  try { return localStorage.getItem(KEY_MARK) } catch { return null }
}
function writeMark(key) {
  try { localStorage.setItem(KEY_MARK, key) } catch { /* storage pieno o bloccato */ }
}

// La chiave con cui è stata fatta l'iscrizione corrisponde a quella del
// server? `null` = non si può sapere.
function subscriptionMatches(subscription, key) {
  const current = subscription?.options?.applicationServerKey
  if (current) {
    const a = new Uint8Array(current)
    const b = urlBase64ToUint8Array(key)
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  const mark = readMark()
  return mark ? mark === key : null
}

/**
 * Garantisce che il browser sia iscritto con la chiave del server e che
 * l'iscrizione sia salvata per questo utente. Ritorna { renewed, source }.
 * `force` rifà comunque l'iscrizione (tasto "Ripara" della diagnostica).
 */
export async function ensurePushSubscription(registration, userId, orgId, { force = false } = {}) {
  if (!registration?.pushManager) throw new Error('Push non supportato su questo browser')
  const server = await getServerVapidKey()
  if (!server?.key) throw new Error('Chiave push non disponibile')

  let subscription = await registration.pushManager.getSubscription()
  let renewed = false
  // Iscrizione esistente: si tiene solo se è sicuramente della chiave
  // giusta. Il dubbio (`null`) si risolve rifacendola: costa un secondo.
  if (subscription && (force || subscriptionMatches(subscription, server.key) !== true)) {
    const oldEndpoint = subscription.endpoint
    try { await subscription.unsubscribe() } catch { /* già invalida */ }
    db.deletePushSubscription(userId, oldEndpoint)
      .catch(e => console.warn('[push] pulizia vecchia iscrizione:', e?.message))
    subscription = null
    renewed = true
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(server.key),
    })
  }
  writeMark(server.key)

  const json = subscription.toJSON()
  await db.savePushSubscription(userId, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  }, orgId)
  return { renewed, source: server.source, endpoint: json.endpoint }
}

// Per la diagnostica: l'iscrizione di questo browser va con il server?
export async function checkSubscriptionKey(registration) {
  const server = await getServerVapidKey()
  const subscription = await registration?.pushManager?.getSubscription()
  if (!server?.key || !subscription) return { server: server?.source || null, matches: null }
  return { server: server.source, matches: subscriptionMatches(subscription, server.key) }
}
