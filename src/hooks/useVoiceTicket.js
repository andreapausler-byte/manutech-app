import { useState, useRef, useCallback } from 'react'
import { supabase, db, isSupabaseConfigured } from '../lib/supabase'

/**
 * useVoiceTicket — gestisce il flusso audio → Whisper → Claude → review → submit.
 *
 * Stati:
 *   idle         — home, pronto a registrare
 *   recording    — MediaRecorder attivo
 *   transcribing — audio inviato a Whisper + Claude
 *   review       — campi estratti dall'AI, operatore conferma/modifica
 *
 * In demo mode (Supabase non configurato) l'AI è disattivata: lo stop
 * salta direttamente a "review" con trascrizione vuota e campi null, così
 * l'operatore può compilare manualmente.
 *
 * Priority (AI) → severity (DB): alta→alta, media→media, bassa→bassa.
 * Category (AI) → type (DB): guasto/anomalia→correttiva, manutenzione→preventiva,
 * altro→ispezione.
 */

const PRIORITY_TO_SEVERITY = { alta: 'alta', media: 'media', bassa: 'bassa' }
const CATEGORY_TO_TYPE = {
  guasto: 'correttiva',
  anomalia: 'correttiva',
  manutenzione: 'preventiva',
  altro: 'ispezione',
}

const TRANSCRIPTION_TIMEOUT_MS = 15000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ])
}

function mapFieldsForDB(fields) {
  return {
    severity: fields.priority ? (PRIORITY_TO_SEVERITY[fields.priority] || 'media') : 'media',
    type: fields.category ? (CATEGORY_TO_TYPE[fields.category] || 'correttiva') : 'correttiva',
  }
}

export function useVoiceTicket(machines = []) {
  const [state, setState] = useState('idle')
  const [transcription, setTranscription] = useState('')
  const [fields, setFields] = useState(null)
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const tickRef = useRef(null)

  const supportsMediaRecorder = typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator?.mediaDevices?.getUserMedia

  const reset = useCallback(() => {
    setState('idle')
    setTranscription('')
    setFields(null)
    setError(null)
    setElapsedMs(0)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    if (!supportsMediaRecorder) {
      setError('Registrazione audio non supportata su questo browser.')
      setState('review')
      setTranscription('')
      setFields(null)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleStop
      mediaRecorderRef.current = recorder
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 200)
      recorder.start()
      setState('recording')
    } catch (err) {
      console.warn('[voice] getUserMedia failed:', err)
      setError('Microfono non disponibile. Controlla i permessi del browser.')
      setState('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsMediaRecorder])

  const stopTicker = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    stopTicker()
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch (err) {
      console.warn('[voice] recorder.stop failed:', err)
    }
    try {
      recorder.stream?.getTracks().forEach(t => t.stop())
    } catch (err) {
      console.warn('[voice] stop tracks failed:', err)
    }
    setState('transcribing')
  }, [])

  const handleStop = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

    if (blob.size < 5000) {
      setError('Audio troppo breve. Tieni premuto più a lungo.')
      setState('idle')
      return
    }

    // Demo mode: niente AI, l'operatore compila a mano.
    if (!isSupabaseConfigured()) {
      setTranscription('')
      setFields({
        machine_id: null, machine_name: null,
        priority: null, category: null,
        area: null, summary: '',
      })
      setError('AI vocale disponibile solo con Supabase configurato. Compila manualmente.')
      setState('review')
      return
    }

    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const transcribeResp = await withTimeout(
        supabase.functions.invoke('transcribe', { body: form }),
        TRANSCRIPTION_TIMEOUT_MS,
        'trascrizione',
      )
      if (transcribeResp.error) throw transcribeResp.error
      const text = (transcribeResp.data?.text || '').toString().trim()
      setTranscription(text)

      if (!text) {
        setFields({
          machine_id: null, machine_name: null,
          priority: null, category: null, area: null, summary: '',
        })
        setError('Non ho capito l\'audio. Compila manualmente o riprova.')
        setState('review')
        return
      }

      const machinePayload = machines.map(m => ({
        id: m.id,
        name: m.name,
        serial_number: m.serial_number || null,
        location: m.location || null,
      }))

      try {
        const extractResp = await withTimeout(
          supabase.functions.invoke('extract-ticket-fields', {
            body: { text, machines: machinePayload },
          }),
          TRANSCRIPTION_TIMEOUT_MS,
          'estrazione campi',
        )
        if (extractResp.error) throw extractResp.error
        setFields(extractResp.data || {
          machine_id: null, machine_name: null,
          priority: null, category: null, area: null,
          summary: text.slice(0, 80),
        })
      } catch (extractErr) {
        console.warn('[voice] extract failed:', extractErr)
        setFields({
          machine_id: null, machine_name: null,
          priority: null, category: null, area: null,
          summary: text.slice(0, 80),
        })
        setError('AI non ha estratto i campi. Completa manualmente.')
      }
      setState('review')
    } catch (err) {
      console.error('[voice] transcription failed:', err)
      setError('Errore durante la trascrizione. Riprova o compila manualmente.')
      setFields({
        machine_id: null, machine_name: null,
        priority: null, category: null, area: null, summary: '',
      })
      setTranscription('')
      setState('review')
    }
  }

  // Permette di aprire la review direttamente senza audio (fallback manuale)
  const openManual = useCallback(() => {
    setTranscription('')
    setFields({
      machine_id: null, machine_name: null,
      priority: null, category: null, area: null, summary: '',
    })
    setError(null)
    setState('review')
  }, [])

  const submitTicket = useCallback(async ({ finalFields, finalText, user }) => {
    if (!user) throw new Error('Utente non valido')
    if (!finalFields?.summary?.trim()) throw new Error('Titolo obbligatorio')

    const { severity, type } = mapFieldsForDB(finalFields)
    const machineRow = finalFields.machine_id
      ? machines.find(m => m.id === finalFields.machine_id)
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
      extra_data: {
        source: 'voice',
        ai_priority: finalFields.priority || null,
        ai_category: finalFields.category || null,
        area: finalFields.area || null,
      },
    }

    const created = await db.createReport(payload)

    // Side effects non bloccanti (coerenti con QuickReport)
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
  }, [machines])

  return {
    state,
    transcription,
    setTranscription,
    fields,
    setFields,
    error,
    elapsedMs,
    supportsMediaRecorder,
    startRecording,
    stopRecording,
    submitTicket,
    openManual,
    reset,
  }
}

export default useVoiceTicket
