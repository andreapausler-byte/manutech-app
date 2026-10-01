/**
 * useClosureEdit — integrare una chiusura dopo che è stata fatta.
 *
 * Due gesti distinti, perché sono due cose diverse per chi legge lo storico:
 *   - `saveEdit`: correggere i campi della chiusura (ore, causa, azione,
 *     ricambi, pezzo). Lo stato non cambia, `closed_at` nemmeno; in
 *     cronologia resta il prima → dopo di ogni campo toccato.
 *   - `addNote`: aggiungere un'informazione arrivata dopo ("si è
 *     ripresentato", il codice esatto del ricambio). Non corregge niente,
 *     si accoda.
 *
 * Nessuna notifica: come per l'attribuzione del pezzo, è lavoro sullo
 * storico, non un evento per cui svegliare il reparto. In compenso si
 * rilancia l'indicizzazione della macchina, così assistente e "casi
 * simili" imparano la versione corretta.
 *
 * Uso:
 *   const { saving, saveEdit, addNote } = useClosureEdit(user)
 *   const updated = await saveEdit(report, closureData)  // null se fallisce, `report` se non cambia nulla
 *   const updated = await addNote(report, 'testo')
 */
import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { describeClosureChanges, newClosureNote } from '../lib/closure'
import { useToast } from './useToast'

const reindex = (report) => {
  if (!report?.machine_id) return
  db.queueMachineReindex(report.machine_id)
    .catch(e => console.warn('[useClosureEdit] reindex failed:', e?.message))
}

export function useClosureEdit(user) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const saveEdit = useCallback(async (report, data) => {
    // Il pezzo è facoltativo nel payload: se chi chiama non lo passa,
    // resta quello attuale.
    const touchesComponent = 'component_id' in data
    const next = {
      closure_hours: data.closure_hours ?? null,
      closure_parts: data.closure_parts || null,
      closure_root_cause: data.closure_root_cause || null,
      closure_action: data.closure_action || null,
      component_id: touchesComponent ? (data.component_id || null) : (report.component_id || null),
      component_name: touchesComponent ? (data.component_name || null) : (report.component_name || null),
    }
    const changes = describeClosureChanges(report, next)
    // Foto del pezzo aggiunte correggendo: si accodano al ticket.
    const photos = data.closure_photos || []
    if (photos.length) {
      next.media = [...(report.media || []), ...photos]
      changes.push(`Foto del pezzo: +${photos.length}`)
    }
    // Niente da salvare: restituisce il report com'è, così chi chiama
    // chiude il foglio senza scrivere una riga vuota in cronologia.
    if (changes.length === 0) {
      toast.info('Nessuna modifica')
      return report
    }
    setSaving(true)
    try {
      const updated = await db.updateReport(report.id, next)
      db.addActivity(report.id, {
        type: 'closure_edit',
        user_id: user?.id, user_name: user?.name,
        detail: changes.join(' · '),
      }).catch(e => console.warn('Side effect failed:', e.message))
      reindex(report)
      if (photos.length) {
        db.addClosurePhotosToMachine(report.machine_id, photos, {
          componentId: next.component_id,
          componentName: next.component_name,
          label: report.display_id || report.title,
          uploadedByName: user?.name,
        })
      }
      toast.success('Chiusura aggiornata')
      return updated
    } catch (err) {
      console.error('[useClosureEdit] saveEdit failed:', err)
      toast.error(`Errore: ${err?.message || 'sconosciuto'}`)
      return null
    } finally {
      setSaving(false)
    }
  }, [toast, user?.id, user?.name])

  const addNote = useCallback(async (report, text) => {
    if (!text?.trim()) return null
    setSaving(true)
    try {
      const updated = await db.addClosureNote(report.id, newClosureNote(user, text))
      db.addActivity(report.id, {
        type: 'closure_note',
        user_id: user?.id, user_name: user?.name,
        detail: text.trim().length > 120 ? `${text.trim().slice(0, 119)}…` : text.trim(),
      }).catch(e => console.warn('Side effect failed:', e.message))
      reindex(report)
      toast.success('Nota aggiunta alla chiusura')
      return updated
    } catch (err) {
      console.error('[useClosureEdit] addNote failed:', err)
      toast.error(`Errore: ${err?.message || 'sconosciuto'}`)
      return null
    } finally {
      setSaving(false)
    }
  }, [toast, user])

  return { saving, saveEdit, addNote }
}
