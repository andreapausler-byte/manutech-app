/**
 * usePWA — Sprint 3.6 PWA + Web Notifications
 * 
 * Gestisce:
 *  1. Registrazione Service Worker
 *  2. Permesso notifiche (Notification API)
 *  3. Prompt installazione PWA (beforeinstallprompt)
 *  4. Mostra Web Notification native per nuove notifiche in-app
 *  5. Ascolta messaggi dal SW (click su notifica)
 */

import { useState, useEffect, useCallback, useRef } from 'react'

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
export function usePWA(onNotificationClick) {
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [swRegistration, setSwRegistration] = useState(null)
  const onClickRef = useRef(onNotificationClick)
  onClickRef.current = onNotificationClick

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

    // Non mostrare se l'app è in primo piano e visibile
    if (document.visibilityState === 'visible' && !data.forceShow) return

    // Usa il SW se disponibile (funziona anche in background)
    if (swRegistration) {
      swRegistration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: [100, 50, 100],
        tag: data.type || 'manutech',
        renotify: true,
        data: {
          url: '/',
          report_id: data.report_id || null,
          type: data.type,
        },
      }).catch(() => {})
    } else {
      // Fallback: Notification API diretta
      try {
        new Notification(title, {
          body,
          icon: '/icons/icon-192x192.png',
          tag: data.type || 'manutech',
        })
      } catch {}
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
  }
}
