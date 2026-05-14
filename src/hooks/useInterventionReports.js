// Hook per la gestione dei link intervention ↔ reports (post-mig 055).
// Usato da InterventionDetailPanel per mostrare/aggiungere/rimuovere
// segnalazioni associate a un intervento.
//
// Ritorna { reports, loading, error, refetch, addLink, removeLink, toggleResolves }.
//
// Realtime: si sottoscrive ai cambi su intervention_reports filtrati per
// intervention_id, ricarica al cambio. Pattern speculare a useInterventionsCalendar.

import { useCallback, useEffect, useState } from 'react'
import { supabase, db } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './useToast'

export function useInterventionReports(interventionId) {
  const { user } = useAuth()
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    if (!interventionId) {
      setReports([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await db.getReportsForIntervention(interventionId)
      setReports(data || [])
    } catch (err) {
      console.error('[useInterventionReports] fetch failed', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [interventionId])

  useEffect(() => { refetch() }, [refetch])

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !interventionId) return undefined
    const channel = supabase
      .channel(`intervention_reports:${interventionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'intervention_reports',
        filter: `intervention_id=eq.${interventionId}`,
      }, () => refetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [interventionId, refetch])

  const actor = { user_id: user?.id, user_name: user?.name }

  const addLink = useCallback(async ({ reportId, isOrigin = false, resolvesReport = true }) => {
    try {
      await db.linkReportToIntervention({
        interventionId, reportId, isOrigin, resolvesReport, actor,
      })
      await refetch()
      toast.success('Segnalazione collegata')
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'collegamento fallito'))
      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId, user?.id, user?.name, refetch])

  const removeLink = useCallback(async (reportId) => {
    try {
      await db.unlinkReportFromIntervention(interventionId, reportId, actor)
      await refetch()
      toast.success('Collegamento rimosso')
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'rimozione fallita'))
      throw err
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId, user?.id, user?.name, refetch])

  const toggleResolves = useCallback(async (reportId, newValue) => {
    try {
      await db.setResolvesReport(interventionId, reportId, newValue)
      await refetch()
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'aggiornamento fallito'))
      throw err
    }
  }, [interventionId, refetch, toast])

  return { reports, loading, error, refetch, addLink, removeLink, toggleResolves }
}
