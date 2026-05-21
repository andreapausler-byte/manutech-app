/**
 * useInterventionPeople — Sprint 1c
 *
 * Aggrega TUTTE le persone coinvolte in un intervento:
 *   - assignedTo  (denorm in interventions.assigned_to)
 *   - supervisor  (denorm in interventions.supervised_by, Sprint 1a-bis)
 *   - participants (riga in intervention_participants, mig 056)
 *
 * Espone allUserIds deduplicato per i casi a valle (es. fan-out di push
 * notification), e API add/remove sui participants. Le tre fonti sono
 * dedotte, MVP-style, senza role/status (additivo da ADR-008).
 *
 * Realtime: subscription su intervention_participants per il singolo
 * intervento, aggiorna i participants quando un altro device cambia la
 * partecipazione. assignedTo/supervisor non sono realtime qui (li
 * aggiorni passando un nuovo interventionId / chiamando refresh).
 *
 * @param {string|null} interventionId
 * @returns {{
 *   loading: boolean,
 *   error: Error|null,
 *   assignedTo: { id: string, name: string }|null,
 *   supervisor:  { id: string, name: string }|null,
 *   participants: Array<{
 *     id: string, userId: string, userName: string,
 *     addedAt: string, addedByName: string|null
 *   }>,
 *   allUserIds: string[],
 *   addParticipant: (userId: string) => Promise<object|null>,
 *   removeParticipant: (participantId: string) => Promise<object|null>,
 *   refresh: () => Promise<void>,
 * }}
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'

export function useInterventionPeople(interventionId) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assignedTo, setAssignedTo] = useState(null)
  const [supervisor, setSupervisor] = useState(null)
  const [participants, setParticipants] = useState([])

  // Refs stabili per le callback async di realtime (evita stale closure
  // sul valore di interventionId tra render).
  const interventionIdRef = useRef(interventionId)
  useEffect(() => { interventionIdRef.current = interventionId }, [interventionId])

  const fetchAll = useCallback(async () => {
    if (!interventionId) {
      setAssignedTo(null)
      setSupervisor(null)
      setParticipants([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const intv = await db.getIntervention(interventionId)
      if (interventionIdRef.current !== interventionId) return // race: nuovo id, abort
      const a = intv?.assigned_to
        ? { id: intv.assigned_to, name: intv.assigned_to_name || 'Tecnico' }
        : null
      const s = intv?.supervised_by
        ? { id: intv.supervised_by, name: intv.supervised_by_name || 'Supervisore' }
        : null
      const rows = await db.getInterventionParticipants(interventionId)
      if (interventionIdRef.current !== interventionId) return
      setAssignedTo(a)
      setSupervisor(s)
      setParticipants((rows || []).map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name_snapshot,
        addedAt: r.added_at,
        addedByName: r.added_by_name || null,
      })))
    } catch (e) {
      console.warn('[useInterventionPeople] fetch failed:', e?.message)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [interventionId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime: ricarica i participants quando arriva una mutation per
  // questo intervento. Niente patch fine-grained per ora (le righe sono
  // poche, 0-5 tipiche): un refetch è semplice e correct.
  useEffect(() => {
    if (!supabase || !interventionId) return
    const channel = supabase
      .channel(`participants-${interventionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intervention_participants',
          filter: `intervention_id=eq.${interventionId}`,
        },
        () => { fetchAll() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [interventionId, fetchAll])

  const allUserIds = useMemo(() => {
    const s = new Set()
    if (assignedTo?.id) s.add(assignedTo.id)
    if (supervisor?.id) s.add(supervisor.id)
    for (const p of participants) if (p.userId) s.add(p.userId)
    return Array.from(s)
  }, [assignedTo, supervisor, participants])

  const addParticipant = useCallback(async (userId) => {
    if (!interventionId || !userId) return null
    try {
      const created = await db.addInterventionParticipant({
        interventionId,
        userId,
        actor: { user_id: user?.id, user_name: user?.name },
      })
      haptic?.success?.()
      toast?.success?.('Utente coinvolto')
      // Refetch garantisce coerenza anche se il realtime non è attivo
      // (demo mode senza supabase).
      await fetchAll()
      return created
    } catch (e) {
      console.warn('[useInterventionPeople] add failed:', e?.message)
      toast?.error?.('Errore: impossibile coinvolgere l\'utente')
      throw e
    }
  }, [interventionId, user?.id, user?.name, fetchAll, toast, haptic])

  const removeParticipant = useCallback(async (participantId) => {
    if (!participantId) return null
    try {
      const removed = await db.removeInterventionParticipant({
        participantId,
        actor: { user_id: user?.id, user_name: user?.name },
      })
      haptic?.light?.()
      toast?.success?.('Utente rimosso')
      await fetchAll()
      return removed
    } catch (e) {
      console.warn('[useInterventionPeople] remove failed:', e?.message)
      toast?.error?.('Errore: impossibile rimuovere l\'utente')
      throw e
    }
  }, [user?.id, user?.name, fetchAll, toast, haptic])

  return {
    loading,
    error,
    assignedTo,
    supervisor,
    participants,
    allUserIds,
    addParticipant,
    removeParticipant,
    refresh: fetchAll,
  }
}
