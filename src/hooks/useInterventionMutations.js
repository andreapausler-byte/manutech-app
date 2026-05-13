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
    { successMsg: 'Intervento riprogrammato', errorMsgPrefix: 'Errore riprogrammazione' },
  ), [wrap, user?.id, user?.name])

  const start = useCallback((id) => wrap(
    () => db.startIntervention(id, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Intervento avviato', errorMsgPrefix: 'Errore avvio' },
  ), [wrap, user?.id, user?.name])

  const complete = useCallback((id, { notes, media } = {}) => wrap(
    () => db.completeIntervention(id, { notes, media }, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Intervento completato', errorMsgPrefix: 'Errore completamento' },
  ), [wrap, user?.id, user?.name])

  const cancel = useCallback((id, reason) => wrap(
    () => db.cancelIntervention(id, reason, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Intervento annullato', errorMsgPrefix: 'Errore annullamento' },
  ), [wrap, user?.id, user?.name])

  const remindSupplier = useCallback((id) => wrap(
    () => db.sendSupplierReminder(id, { user_id: user?.id, user_name: user?.name }),
    { successMsg: 'Sollecito registrato', errorMsgPrefix: 'Errore sollecito' },
  ), [wrap, user?.id, user?.name])

  return { create, update, reschedule, start, complete, cancel, remindSupplier, loading }
}
