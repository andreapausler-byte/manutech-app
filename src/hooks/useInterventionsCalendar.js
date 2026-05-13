// Hook calendario interventi: fetch iniziale + Realtime subscription.
// Pattern speculare a useChatRealtime: useState + useEffect + cleanup channel.
//
// Argomenti:
//   rangeStart, rangeEnd : Date — finestra temporale da caricare
//   scope                : 'all' | 'mine' | 'pending_supplier'
//   currentUserId        : string|undefined — necessario per scope='mine'
//   filters              : { types?, statuses?, severities? }
//
// Ritorna { interventions, loading, error, refetch }.
// Le INSERT/UPDATE/DELETE Realtime sono filtrate client-side sul range corrente.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, db } from '../lib/supabase'

export function useInterventionsCalendar({
  rangeStart,
  rangeEnd,
  scope = 'all',
  currentUserId,
  filters,
} = {}) {
  const [interventions, setInterventions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Stabilizziamo le dipendenze: una Date instanzia nuova ogni render se non
  // memoizzata, quindi prendiamo getTime(). filters può cambiare struttura,
  // serializziamo a stringa per il deps array.
  const startMs = rangeStart ? new Date(rangeStart).getTime() : null
  const endMs = rangeEnd ? new Date(rangeEnd).getTime() : null
  const filtersKey = useMemo(() => JSON.stringify(filters || {}), [filters])

  const fetchInterventions = useCallback(async () => {
    if (!startMs || !endMs) return
    setLoading(true)
    setError(null)
    try {
      const data = await db.getInterventionsCalendar({
        rangeStart: new Date(startMs),
        rangeEnd: new Date(endMs),
        scope,
        currentUserId,
        filters: filters || {},
      })
      setInterventions(data || [])
    } catch (err) {
      console.error('[useInterventionsCalendar] fetch failed', err)
      setError(err)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, scope, currentUserId, filtersKey])

  // Fetch iniziale + ricarica quando cambiano i parametri.
  useEffect(() => {
    fetchInterventions()
  }, [fetchInterventions])

  // Realtime subscription. Usiamo un ref sui filtri per applicare correttamente
  // il match anche dopo che il valore esterno cambia senza ri-subscribere.
  const filterRefForRT = useRef({ scope, currentUserId, filters, startMs, endMs })
  filterRefForRT.current = { scope, currentUserId, filters, startMs, endMs }

  useEffect(() => {
    if (!supabase) return undefined
    if (!startMs || !endMs) return undefined

    const matchesScope = (ev) => {
      const { scope, currentUserId, filters, startMs, endMs } = filterRefForRT.current
      if (!ev.scheduled_start_at) return false
      const t = new Date(ev.scheduled_start_at).getTime()
      if (t < startMs || t > endMs) return false
      if (scope === 'mine' && ev.assigned_to !== currentUserId) return false
      if (scope === 'pending_supplier') {
        if (ev.status !== 'pianificato') return false
        if (ev.assigned_to_role !== 'fornitore') return false
      }
      if (filters?.types?.length && !filters.types.includes(ev.type)) return false
      if (filters?.statuses?.length && !filters.statuses.includes(ev.status)) return false
      if (filters?.severities?.length && !filters.severities.includes(ev.severity)) return false
      return true
    }

    const channel = supabase
      .channel(`interventions:cal:${startMs}-${endMs}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' }, (payload) => {
        setInterventions(curr => {
          if (payload.eventType === 'INSERT') {
            if (!matchesScope(payload.new)) return curr
            return [...curr, payload.new]
          }
          if (payload.eventType === 'UPDATE') {
            const oldMatches = curr.some(i => i.id === payload.new.id)
            const newMatches = matchesScope(payload.new)
            if (oldMatches && !newMatches) return curr.filter(i => i.id !== payload.new.id)
            if (!oldMatches && newMatches) return [...curr, payload.new]
            return curr.map(i => i.id === payload.new.id ? payload.new : i)
          }
          if (payload.eventType === 'DELETE') {
            return curr.filter(i => i.id !== payload.old.id)
          }
          return curr
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [startMs, endMs])

  return { interventions, loading, error, refetch: fetchInterventions }
}
