/**
 * usePWA — Sprint 3.6 PWA + Web Notifications + Sprint 5.4 Web Push
 *
 * Gestisce:
 *  1. Registrazione Service Worker
 *  2. Permesso notifiche (Notification API)
 *  3. Prompt installazione PWA (beforeinstallprompt)
 *  4. Mostra Web Notification native per nuove notifiche in-app
 *  5. Ascolta messaggi dal SW (click su notifica)
 *  6. Web Push subscription (PushManager) per notifiche in background
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { db } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Converte base64url a Uint8Array per applicationServerKey
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// ── Registra Service Worker ──
async function registerSW() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker non supportato')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    console.log('[PWA] Service Worker registrato:', registration.scope)

    // Gestisci aggiornamenti
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          console.log('[PWA] Nuovo SW attivo')
        }
      })
    })

    return registration
  } catch (err) {
    console.warn('[PWA] Errore registrazione SW:', err)
    return null
  }
}

// ── Hook principale ──
export function usePWA(onNotificationClick, userInfo) {
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [swRegistration, setSwRegistration] = useState(null)
  const onClickRef = useRef(onNotificationClick)
  useEffect(() => { onClickRef.current = onNotificationClick }, [onNotificationClick])

  // ── 1. Registra SW al mount ──
  useEffect(() => {
    registerSW().then(reg => {
      if (reg) setSwRegistration(reg)
    })
  }, [])

  // ── 2. Intercetta install prompt ──
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      console.log('[PWA] Install prompt intercettato')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Controlla se già installata
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setInstallPrompt(null)
      console.log('[PWA] App installata!')
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // ── 3. Ascolta messaggi dal SW (click su notifica) ──
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        console.log('[PWA] Notification click dal SW:', event.data)
        onClickRef.current?.(event.data)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // ── 4. Auto-subscribe a Web Push quando le condizioni sono soddisfatte ──
  const hasAutoSubscribed = useRef(false)

  // Reset guard quando il permesso cambia (es. utente concede permesso dal banner)
  useEffect(() => {
    hasAutoSubscribed.current = false
  }, [notifPermission])

  useEffect(() => {
    if (hasAutoSubscribed.current) return
    if (!swRegistration) return
    if (!userInfo?.userId) return
    if (!VAPID_PUBLIC_KEY) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    hasAutoSubscribed.current = true

    // subscribeToPush inline per evitare dipendenze circolari
    ;(async () => {
      try {
        let subscription = await swRegistration.pushManager.getSubscription()
        if (!subscription) {
          subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
          console.log('[PWA] Push subscription creata (auto)')
        }
        const subJson = subscription.toJSON()
        await db.savePushSubscription(userInfo.userId, {
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
        }, userInfo.orgId)
        console.log('[PWA] Push subscription salvata nel DB (auto)')
      } catch (err) {
        console.warn('[PWA] Errore auto push subscription:', err)
        toast.error('Notifiche push non attivate. Riprova più tardi.', { duration: 4000 })
      }
    })()
  }, [swRegistration, notifPermission, userInfo?.userId, userInfo?.orgId])

  // ── Richiedi permesso notifiche ──
  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied'

    if (Notification.permission === 'granted') {
      setNotifPermission('granted')
      return 'granted'
    }

    try {
      const result = await Notification.requestPermission()
      setNotifPermission(result)
      console.log('[PWA] Permesso notifiche:', result)
      return result
    } catch {
      return 'denied'
    }
  }, [])

  // ── Mostra notifica nativa ──
  const showNotification = useCallback((title, body, data = {}) => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    // Usa il SW se disponibile (funziona anche in background)
    if (swRegistration) {
      swRegistration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: [200, 100, 200],
        tag: data.type || 'manutech',
        renotify: true,
        requireInteraction: false,
        data: {
          url: '/',
          report_id: data.report_id || null,
          type: data.type,
        },
      }).catch(e => console.error('[usePWA] showNotification failed:', e))
    } else {
      // Fallback: Notification API diretta
      try {
        new Notification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          tag: data.type || 'manutech',
        })
      } catch (e) {
        console.warn('[usePWA] Notification fallback failed', e)
      }
    }
  }, [swRegistration])

  // ── Sottoscrivi a Web Push (per notifiche in background) ──
  const subscribeToPush = useCallback(async (userId, orgId) => {
    if (!swRegistration || !VAPID_PUBLIC_KEY) {
      console.log('[PWA] Push subscription skipped: no SW or VAPID key')
      return null
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.log('[PWA] Push subscription skipped: no notification permission')
      return null
    }

    try {
      // Controlla se esiste già una subscription
      let subscription = await swRegistration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        console.log('[PWA] Push subscription creata')
      }

      // Salva nel DB
      const subJson = subscription.toJSON()
      await db.savePushSubscription(userId, {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      }, orgId)
      console.log('[PWA] Push subscription salvata nel DB')

      return subscription
    } catch (err) {
      console.warn('[PWA] Errore push subscription:', err)
      return null
    }
  }, [swRegistration])

  // ── Rimuovi push subscription ──
  const unsubscribeFromPush = useCallback(async (userId) => {
    if (!swRegistration) return

    try {
      const subscription = await swRegistration.pushManager.getSubscription()
      if (subscription) {
        await db.deletePushSubscription(userId, subscription.endpoint)
        await subscription.unsubscribe()
        console.log('[PWA] Push subscription rimossa')
      }
    } catch (err) {
      console.warn('[PWA] Errore rimozione push subscription:', err)
    }
  }, [swRegistration])

  // ── Trigger installazione ──
  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    console.log('[PWA] Install outcome:', outcome)
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      setIsInstalled(true)
    }
    return outcome === 'accepted'
  }, [installPrompt])

  return {
    // Stato
    notifPermission,    // 'default' | 'granted' | 'denied'
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    swReady: !!swRegistration,

    // Azioni
    requestPermission,
    showNotification,
    promptInstall,
    subscribeToPush,
    unsubscribeFromPush,
  }
}
