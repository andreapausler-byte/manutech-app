import { useCallback, useMemo } from 'react'
import { db } from '../lib/supabase'
import { useVoiceCapture } from './useVoiceCapture'
import { submitVoice } from '../lib/voiceOutbox'

/**
 * useVoiceTicket — wrapper Operatore sopra useVoiceCapture.
 *
 * Mantiene l'API legacy per il flow Operatore, ma la consegna passa ora dalla
 * coda durevole (`submitVoice`): l'audio dell'operatore viene SEMPRE allegato
 * al ticket (prima veniva scartato) e, se offline, il ticket+audio restano in
 * "Registrazioni in sospeso" e partono da soli al ritorno della rete.
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

export function useVoiceTicket(machines = [], user = null) {
  const capture = useVoiceCapture({
    context: 'operator_new_ticket',
    user,
    machines,
    defaultFields: OPERATOR_DEFAULT_FIELDS,
  })

  const machinesMemo = useMemo(() => machines, [machines])

  const submitTicket = useCallback(async ({ finalFields, finalText, finalMedia, user: submitUser }) => {
    const u = submitUser || user
    if (!u) throw new Error('Utente non valido')
    if (!finalFields?.summary?.trim()) throw new Error('Titolo obbligatorio')

    const { severity, type } = mapFieldsForDB(finalFields)
    const machineRow = finalFields.machine_id
      ? machinesMemo.find(m => m.id === finalFields.machine_id)
      : null

    // Le foto vanno sul report; l'audio sarà allegato come commento vocale.
    const reportPayload = {
      title: finalFields.summary.trim().slice(0, 200),
      description: (finalText || '').trim(),
      severity,
      status: 'aperta',
      type,
      machine: machineRow?.name || finalFields.machine_name || null,
      machine_id: finalFields.machine_id || null,
      created_by: u.id,
      created_by_name: u.name,
      is_quick: false,
      media: Array.isArray(finalMedia) && finalMedia.length > 0 ? finalMedia : [],
      extra_data: {
        source: 'voice',
        ai_priority: finalFields.priority || null,
        ai_category: finalFields.category || null,
        area: finalFields.area || null,
      },
    }

    try {
      const res = await submitVoice({
        outboxId: capture.outboxId,
        blob: capture.audioBlob,
        context: 'operator_new_ticket',
        reportId: null,
        user: u,
        text: reportPayload.description || reportPayload.title,
        extraData: { source: 'voice' },
        media: [], // le foto sono già su reportPayload.media
        reportPayload,
        confidence: null,
      })
      const created = res?.report || null

      if (created) {
        db.addActivity(created.id, {
          type: 'voice_created',
          user_id: u.id,
          user_name: u.name,
          detail: `Ticket vocale: ${reportPayload.title}${reportPayload.machine ? ` · ${reportPayload.machine}` : ''}`,
        }).catch(e => console.warn('[voice] addActivity failed:', e?.message))

        db.addNotification({
          type: reportPayload.severity === 'critica' ? 'new_report_critical' : 'new_report',
          title: `Nuovo ticket vocale: ${reportPayload.title}`,
          body: `${u.name}${reportPayload.machine ? ` — ${reportPayload.machine}` : ''}`,
          report_id: created.id,
          from_user: u.id,
          target_user: null,
        }).catch(e => console.warn('[voice] addNotification failed:', e?.message))
      }

      return { created, queued: !created }
    } catch (err) {
      // Offline: il ticket+audio sono al sicuro in coda, partiranno da soli.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { created: null, queued: true }
      }
      throw err
    }
  }, [machinesMemo, user, capture.outboxId, capture.audioBlob])

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
    outboxId: capture.outboxId,
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
