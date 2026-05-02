/**
 * ManuTech Service Worker — Sprint 3.6 PWA
 * 
 * Funzionalità:
 *  1. Cache dell'app shell (network-first per HTML, cache-first per assets)
 *  2. Gestione push notification
 *  3. Gestione click su notifica → apri app sulla pagina giusta
 *  4. Background sync placeholder per future funzionalità offline
 */

// Bump ad ogni release per invalidare la cache.
// v7.3.0 = release Ottimizzazione (KPI dashboard)
const CACHE_NAME = 'manutech-v7.3.0'
const APP_SHELL = [
  '/',
  '/manifest.json',
]

// ── Install: pre-cache app shell ──
self.addEventListener('install', (event) => {
  console.log('[SW] Install')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: pulisci vecchie cache ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate')
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch: network-first per navigazione, cache-first per assets ──
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET
  if (request.method !== 'GET') return

  // Skip API calls e Supabase
  if (request.url.includes('supabase') || request.url.includes('/rest/') || request.url.includes('/auth/')) return

  // Navigazione → network-first con fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')))
    )
    return
  }

  // Assets statici (JS, CSS, immagini, fonts) → cache-first
  if (
    request.url.includes('/assets/') ||
    request.url.includes('/icons/') ||
    request.url.includes('fonts.googleapis') ||
    request.url.includes('fonts.gstatic')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }
})

// ── Push: ricevi notifica push e mostrala ──
self.addEventListener('push', (event) => {
  console.log('[SW] Push received')

  let data = { title: 'ManuTech', body: 'Nuova notifica', type: 'default' }

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() }
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [100, 50, 100],
    tag: data.type || 'default',
    renotify: true,
    data: {
      url: data.url || '/',
      report_id: data.report_id || null,
      type: data.type,
    },
    actions: [],
  }

  // Azioni contestuali per tipo notifica
  if (data.type === 'assigned' || data.type === 'status_change') {
    options.actions = [
      { action: 'open', title: 'Apri segnalazione' },
    ]
  } else if (data.type === 'maintenance_overdue' || data.type === 'maintenance_reminder') {
    options.actions = [
      { action: 'open', title: 'Vedi dettagli' },
    ]
  } else if (data.type === 'comment') {
    options.actions = [
      { action: 'open', title: 'Rispondi' },
    ]
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// ── Notification click: apri app sulla pagina giusta ──
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action)
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Se l'app è già aperta, portala in primo piano
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus()
            // Manda messaggio per navigare alla pagina giusta
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              report_id: event.notification.data?.report_id,
              notif_type: event.notification.data?.type,
            })
            return
          }
        }
        // Altrimenti apri una nuova finestra
        return clients.openWindow(urlToOpen)
      })
  )
})

// ── Message: ricevi comandi dal client ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
