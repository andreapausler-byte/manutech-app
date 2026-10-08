/**
 * useMaintenanceLogEdit — aggiornare un intervento già registrato.
 *
 * Gli stessi gesti di useClosureEdit per le segnalazioni concluse:
 *   - `saveEdit`: correggere i campi (testo, durata, ricambi, data, ditta).
 *     In cronologia resta il prima → dopo di ogni campo toccato.
 *   - `addNote`: aggiungere dopo una nota e/o foto e PDF ("il filtro nuovo
 *     era della misura sbagliata", il foglio della ditta arrivato il giorno
 *     dopo). Non corregge niente, si accoda.
 *   - `removeMedia`: togliere un allegato messo per sbaglio.
 *
 * Nessuna notifica: è lavoro sullo storico. Quando cambia qualcosa che
 * l'assistente legge (testo, ricambi, una nota, un PDF) si rilancia
 * l'indicizzazione della macchina.
 *
 * Uso:
 *   const { saving, saveEdit, addNote, removeMedia } = useMaintenanceLogEdit(user)
 *   const updated = await saveEdit(log, fields)          // null se fallisce, `log` se non cambia nulla
 *   const updated = await addNote(log, 'testo', media)   // testo facoltativo se ci sono allegati
 */
import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import {
  describeLogChanges, describeLogMedia, newLogNote, newLogEntry, stampLogMedia, clipNote,
} from '../lib/maintenanceLog'
import { hasPdfMedia } from '../lib/logMedia'
import { useToast } from './useToast'

// Campi che finiscono nella biblioteca dell'assistente (ingest-knowledge).
const INDEXED = ['title', 'description', 'parts_replaced', 'contractor_name', 'contractor_reference']

const reindex = (log) => {
  if (!log?.machine_id) return
  db.queueMachineReindex(log.machine_id)
    .catch(e => console.warn('[useMaintenanceLogEdit] reindex failed:', e?.message))
}

export function useMaintenanceLogEdit(user) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const run = useCallback(async (work, success) => {
    setSaving(true)
    try {
      const updated = await work()
      if (success) toast.success(success)
      return updated
    } catch (err) {
      console.error('[useMaintenanceLogEdit] failed:', err)
      toast.error(`Errore: ${err?.message || 'sconosciuto'}`)
      return null
    } finally {
      setSaving(false)
    }
  }, [toast])

  const saveEdit = useCallback(async (log, fields, { componentName } = {}) => {
    const changes = describeLogChanges(log, fields, { componentName })
    if (changes.length === 0) {
      toast.info('Nessuna modifica')
      return log
    }
    return run(async () => {
      const updated = await db.correctMaintenanceLog(log, fields, newLogEntry(user, changes.join(' · ')))
      const touchesText = INDEXED.some(k => k in fields && (fields[k] || '') !== (log[k] || ''))
      const addsPdf = 'media' in fields && hasPdfMedia((fields.media || []).filter(m => !(log.media || []).some(x => x?.url === m?.url)))
      if (touchesText || addsPdf) reindex(log)
      return updated
    }, 'Intervento aggiornato')
  }, [run, toast, user])

  const addNote = useCallback(async (log, text, media = []) => {
    const clean = text?.trim() || ''
    if (!clean && !media.length) return null
    const stamped = stampLogMedia(user, media)
    const detail = [
      clean && `Nota: «${clipNote(clean)}»`,
      stamped.length && `Allegati aggiunti: ${describeLogMedia(stamped)}`,
    ].filter(Boolean).join(' · ')
    const what = [clean && 'nota', stamped.length && (stamped.length === 1 ? 'allegato' : `${stamped.length} allegati`)].filter(Boolean)
    return run(async () => {
      const updated = await db.addToMaintenanceLog(log, {
        note: clean ? newLogNote(user, clean) : null,
        media: stamped,
        entry: newLogEntry(user, detail),
      })
      // L'assistente legge anche le note aggiunte dopo (ingest-knowledge).
      if (clean || hasPdfMedia(stamped)) reindex(log)
      return updated
    }, `Aggiunto all'intervento: ${what.join(' e ')}`)
  }, [run, user])

  const removeMedia = useCallback((log, item) =>
    run(async () => {
      const updated = await db.removeMaintenanceLogMedia(log, item.url, newLogEntry(user, `Allegato tolto: ${describeLogMedia([item])}`))
      // Un PDF tolto non deve restare tra le fonti dell'assistente.
      if (hasPdfMedia([item])) reindex(log)
      return updated
    }, 'Allegato tolto'),
  [run, user])

  return { saving, saveEdit, addNote, removeMedia }
}
