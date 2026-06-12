/**
 * useMergeSegnalazione — merge/unmerge di segnalazioni duplicate.
 *
 * Wrappa db.mergeReports / db.unmergeReport (che internamente chiamano le RPC
 * SECURITY DEFINER merge_reports / unmerge_report, con fallback demo) aggiungendo
 * toast + feedback aptico. Il messaggio della RAISE EXCEPTION lato DB viene
 * propagato nel toast di errore. I componenti restano presentazionali.
 *
 * Nota UX: `merge` NON mostra un toast di successo — il successo è gestito dal
 * chiamante con un toast custom "Annulla" (undo). `unmerge` invece conferma con
 * un toast standard.
 *
 * Uso:
 *   const { merge, unmerge, isLoading } = useMergeSegnalazione()
 *   await merge(dupId, masterId, { onSuccess })
 *   await unmerge(dupId, { onSuccess })
 */
import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'

export function useMergeSegnalazione() {
  const toast = useToast()
  const haptic = useHaptic()
  const [isLoading, setIsLoading] = useState(false)

  const merge = useCallback(async (duplicateId, masterId, { onSuccess } = {}) => {
    setIsLoading(true)
    haptic.medium?.()
    try {
      const result = await db.mergeReports(duplicateId, masterId)
      haptic.success?.()
      onSuccess?.(result)
      return result
    } catch (err) {
      haptic.error?.()
      toast.error(err?.message || "Errore durante l'unione")
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [haptic, toast])

  const unmerge = useCallback(async (duplicateId, { onSuccess } = {}) => {
    setIsLoading(true)
    haptic.medium?.()
    try {
      const result = await db.unmergeReport(duplicateId)
      haptic.success?.()
      toast.success('Unione annullata')
      onSuccess?.(result)
      return result
    } catch (err) {
      haptic.error?.()
      toast.error(err?.message || "Errore durante l'annullamento")
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [haptic, toast])

  return { merge, unmerge, isLoading }
}
