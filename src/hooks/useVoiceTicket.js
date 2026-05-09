import { useCallback, useMemo } from 'react'
import { db } from '../lib/supabase'
import { useVoiceCapture } from './useVoiceCapture'

/**
 * useVoiceTicket — wrapper Operatore sopra useVoiceCapture.
 *
 * Mantiene l'API legacy per il flow Operatore:
 *   - context fissato a 'operator_new_ticket'
 *   - defaultFields preimpostati per il form review
 *   - submitTicket() che persiste su db.createReport + activity + notification
 *
 * La pipeline generica (recording, transcribe, extract) è in useVoiceCapture.
 *
 * Priority (AI) → severity (DB): alta→alta, media→media, bassa→bassa.
 * Category (AI) → type (DB): guasto/anomalia→correttiva,
 *                            manutenzione→preventiva, altro→ispezione.
 */

const PRIORITY_TO_SEVERITY = { alta: 'alta', media: 'media', bassa: 'bassa' }
const CATEGORY_TO_TYPE = {
  guasto: 'correttiva',
  anomalia: 'correttiva',
  manutenzione: 'preventiva',
  altro: 'ispezione',
}

const OPERATOR_DEFAULT_FIELDS = {
  machine_id: null,
  machine_name: null,
  priority: null,
  category: null,
  area: null,
  summary: '',
}

function mapFieldsForDB(fields) {
  return {
    severity: fields.priority ? (PRIORITY_TO_SEVERITY[fields.priority] || 'media') : 'media',
    type: fields.category ? (CATEGORY_TO_TYPE[fields.category] || 'correttiva') : 'correttiva',
  }
}

export function useVoiceTicket(machines = []) {
  const capture = useVoiceCapture({
    context: 'operator_new_ticket',
    machines,
    defaultFields: OPERATOR_DEFAULT_FIELDS,
  })

  const machinesMemo = useMemo(() => machines, [machines])

  const submitTicket = useCallback(async ({ finalFields, finalText, finalMedia, user }) => {
    if (!user) throw new Error('Utente non valido')
    if (!finalFields?.summary?.trim()) throw new Error('Titolo obbligatorio')

    const { severity, type } = mapFieldsForDB(finalFields)
    const machineRow = finalFields.machine_id
      ? machinesMemo.find(m => m.id === finalFields.machine_id)
      : null

    const payload = {
      title: finalFields.summary.trim().slice(0, 200),
      description: (finalText || '').trim(),
      severity,
      status: 'aperta',
      type,
      machine: machineRow?.name || finalFields.machine_name || null,
      machine_id: finalFields.machine_id || null,
      created_by: user.id,
      created_by_name: user.name,
      is_quick: false,
      media: Array.isArray(finalMedia) && finalMedia.length > 0 ? finalMedia : [],
      extra_data: {
        source: 'voice',
        ai_priority: finalFields.priority || null,
        ai_category: finalFields.category || null,
        area: finalFields.area || null,
      },
    }

    const created = await db.createReport(payload)

    db.addActivity(created.id, {
      type: 'voice_created',
      user_id: user.id,
      user_name: user.name,
      detail: `Ticket vocale: ${payload.title}${payload.machine ? ` · ${payload.machine}` : ''}`,
    }).catch(e => console.warn('[voice] addActivity failed:', e?.message))

    db.addNotification({
      type: 'new_report',
      title: `Nuovo ticket vocale: ${payload.title}`,
      body: `${user.name}${payload.machine ? ` — ${payload.machine}` : ''}`,
      report_id: created.id,
      from_user: user.id,
      target_user: null,
    }).catch(e => console.warn('[voice] addNotification failed:', e?.message))

    return created
  }, [machinesMemo])

  return {
    state: capture.state,
    transcription: capture.transcription,
    setTranscription: capture.setTranscription,
    fields: capture.fields,
    setFields: capture.setFields,
    error: capture.error,
    elapsedMs: capture.elapsedMs,
    audioBlob: capture.audioBlob,
    transcribing: capture.transcribing,
    supportsMediaRecorder: capture.supportsMediaRecorder,
    startRecording: capture.startRecording,
    stopRecording: capture.stopRecording,
    cancelRecording: capture.cancelRecording,
    submitTicket,
    openManual: capture.openManual,
    reset: capture.reset,
  }
}

export default useVoiceTicket
