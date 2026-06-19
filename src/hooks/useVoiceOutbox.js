/**
 * useVoiceOutbox — stato reattivo della coda audio + sync automatico.
 *
 * - Espone gli item vocali ancora da consegnare (filtrati per utente) per la
 *   sezione "Registrazioni in sospeso".
 * - Innesca il flush automatico al mount, al ritorno online, quando la tab
 *   torna in foreground e a intervalli leggeri. Mai con `sleep`/polling
 *   aggressivo: si appoggia agli eventi del browser.
 * - Espone azioni manuali: `retry`, `remove` (la cancellazione è l'UNICO
 *   canale per cui un audio sparisce → la UI chiede conferma), `flushAll`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getVoiceItems, flushVoiceOutbox, flushVoiceItem, removeVoiceItem, enrichVoiceItem,
} from '../lib/voiceOutbox'
import { onOutboxChange, isOutboxAvailable } from '../lib/outbox'

const AUTO_FLUSH_INTERVAL_MS = 60000

export function useVoiceOutbox(userId = null) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!isOutboxAvailable()) return
    try {
      const all = await getVoiceItems()
      const mine = userId ? all.filter((i) => !i.userId || i.userId === userId) : all
      if (mountedRef.current) setItems(mine)
    } catch {
      /* IndexedDB non leggibile: lista vuota */
    }
  }, [userId])

  const flushAll = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    setBusy(true)
    try {
      await flushVoiceOutbox()
    } finally {
      if (mountedRef.current) setBusy(false)
      refresh()
    }
  }, [refresh])

  const retry = useCallback(async (id) => {
    setBusy(true)
    try {
      await flushVoiceItem(id)
    } catch {
      /* resta in coda */
    } finally {
      if (mountedRef.current) setBusy(false)
      refresh()
    }
  }, [refresh])

  // Completa un item "needs_input" (nuovo ticket offline senza titolo):
  // imposta il titolo mancante (preservando l'eventuale payload già raccolto)
  // e ritenta la consegna.
  const completeWithTitle = useCallback(async (id, title) => {
    const clean = (title || '').trim()
    if (!clean) return
    const all = await getVoiceItems()
    const it = all.find((x) => x.id === id)
    if (!it) return
    const base = it.reportPayload || {
      status: 'aperta',
      severity: 'media',
      type: 'correttiva',
      is_quick: false,
      created_by: it.userId,
      created_by_name: it.userName,
      extra_data: { source: 'voice' },
    }
    await enrichVoiceItem(id, {
      reportPayload: { ...base, title: clean },
      status: 'pending',
    }).catch(() => {})
    await retry(id)
  }, [retry])

  const remove = useCallback(async (id) => {
    await removeVoiceItem(id).catch(() => {})
    refresh()
  }, [refresh])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    // primo tentativo di flush all'avvio
    flushVoiceOutbox().then(refresh).catch(() => {})

    const unsub = onOutboxChange(refresh)

    const onOnline = () => { flushVoiceOutbox().then(refresh).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') onOnline() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(onOnline, AUTO_FLUSH_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      unsub()
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [refresh])

  return { items, count: items.length, busy, refresh, flushAll, retry, remove, completeWithTitle }
}

export default useVoiceOutbox
