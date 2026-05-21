// Wrapper sopra db.*Intervention con toast + haptic feedback.
// Centralizza l'UX (success/error messaggi standard) per evitare duplicazione
// nelle pagine/componenti.

import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'
import { useAuth } from '../contexts/AuthContext'

export function useInterventionMutations() {
  const toast = useToast()
  const haptic = useHaptic()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  const wrap = useCallback(async (fn, { successMsg, errorMsgPrefix } = {}) => {
    setLoading(true)
    haptic.medium?.()
    try {
      const result = await fn()
      haptic.success?.()
      if (successMsg) toast.success(successMsg)
      return result
    } catch (err) {
      haptic.error?.()
      const msg = errorMsgPrefix
        ? `${errorMsgPrefix}: ${err?.message || 'riprova'}`
        : (err?.message || 'Errore imprevisto')
      toast.error(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [haptic, toast])

  const create = useCallback((data) => wrap(
    () => db.createIntervention({
      ...data,
      created_by: data.created_by || user?.id,
      created_by_name: data.created_by_name || user?.name,
    }),
    { successMsg: 'Intervento creato', errorMsgPrefix: 'Errore creazione intervento' },
  ), [wrap, user?.id, user?.name])

  const update = useCallback((id, patch) => wrap(
    () => db.updateIntervention(id, {
      ...patch,
      updated_by_user_id: user?.id,
      updated_by_user_name: user?.name,
    }),
    { successMsg: 'Intervento aggiornato', errorMsgPrefix: 'Errore aggiornamento' },
  ), [wrap, user?.id, user?.name])

  const reschedule = useCallback((id, newStart, newEnd, reason) => wrap(
    () => db.rescheduleIntervention(id, newStart, newEnd, reason, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Intervento modificato', errorMsgPrefix: 'Errore modifica' },
  ), [wrap, user?.id, user?.name])

  // Sprint 1c — fan-out push 'intervention_status_change' a tutti i
  // coinvolti (assigned + supervised + participants), best-effort.
  // Eseguito post-mutation, non blocca la UI in caso di errore.
  const notifyStatusChange = useCallback(async (interventionId, newStatusLabel) => {
    if (!interventionId) return
    try {
      const intv = await db.getIntervention(interventionId)
      if (!intv) return
      const participants = await db.getInterventionParticipants(interventionId)
      const allIds = [
        intv.assigned_to,
        intv.supervised_by,
        ...((participants || []).map(p => p.user_id)),
      ].filter(Boolean)
      await db.notifyInterventionEvent({
        intervention_id: interventionId,
        target_user_ids: allIds,
        from_user: user?.id,
        type: 'intervention_status_change',
        title: 'Stato intervento aggiornato',
        body: `${intv.title || 'Intervento'}: ${newStatusLabel}`,
        org_id: intv.org_id,
      })
    } catch (e) {
      console.warn('[mutations] notifyStatusChange failed:', e?.message)
    }
  }, [user?.id])

  const start = useCallback(async (id) => {
    const r = await wrap(
      () => db.startIntervention(id, { user_id: user?.id, user_name: user?.name }),
      { successMsg: 'Intervento avviato', errorMsgPrefix: 'Errore avvio' },
    )
    notifyStatusChange(id, 'avviato')
    return r
  }, [wrap, user?.id, user?.name, notifyStatusChange])

  const complete = useCallback(async (id, { notes, media } = {}) => {
    const r = await wrap(
      () => db.completeIntervention(id, { notes, media }, { user_id: user?.id, user_name: user?.name }),
      { successMsg: 'Intervento completato', errorMsgPrefix: 'Errore completamento' },
    )
    notifyStatusChange(id, 'completato')
    return r
  }, [wrap, user?.id, user?.name, notifyStatusChange])

  const cancel = useCallback(async (id, reason) => {
    const r = await wrap(
      () => db.cancelIntervention(id, reason, { user_id: user?.id, user_name: user?.name }),
      { successMsg: 'Intervento annullato', errorMsgPrefix: 'Errore annullamento' },
    )
    notifyStatusChange(id, 'annullato')
    return r
  }, [wrap, user?.id, user?.name, notifyStatusChange])

  const remindSupplier = useCallback((id) => wrap(
    () => db.sendSupplierReminder(id, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Sollecito registrato', errorMsgPrefix: 'Errore sollecito' },
  ), [wrap, user?.id, user?.name])

  return { create, update, reschedule, start, complete, cancel, remindSupplier, loading }
}
