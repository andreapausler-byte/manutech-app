import { useState, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

/**
 * useVoiceCapture — pipeline vocale generica riusabile per ManuTech.
 *
 * Gestisce SOLO la cattura audio + trascrizione (Whisper) + estrazione
 * campi strutturati (Claude Haiku). NON sa nulla di submit/persistenza:
 * il consumer decide come usare i fields estratti e l'audioBlob.
 *
 * Stati:
 *   idle         — pronto a registrare
 *   recording    — MediaRecorder attivo
 *   transcribing — audio inviato a Whisper + Claude
 *   review       — campi estratti dall'AI, consumer mostra form
 *
 * Demo mode (Supabase non configurato): bypassa AI, salta a "review" con
 * campi vuoti così il consumer può compilare manualmente.
 *
 * Props:
 *   context          — contesto edge function (operator_new_ticket,
 *                      tech_new_ticket, tech_update, tech_close,
 *                      tech_note, tech_spare_request)
 *   machines         — array macchine reali per il prompt extract
 *   contextPayload   — payload addizionale per context update/close/note/spare
 *                      (es. { ticket_title, ticket_status, machine_name })
 *   defaultFields    — fields di partenza in modalità manuale o errore
 */

const TRANSCRIPTION_TIMEOUT_MS = 15000
const MIN_AUDIO_BYTES = 5000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ])
}

export function useVoiceCapture({
  context = 'operator_new_ticket',
  machines = [],
  contextPayload = null,
  defaultFields = null,
} = {}) {
  const [state, setState] = useState('idle')
  const [transcription, setTranscription] = useState('')
  const [fields, setFields] = useState(null)
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)

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
    setAudioBlob(null)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    if (!supportsMediaRecorder) {
      setError('Registrazione audio non supportata su questo browser.')
      setState('review')
      setTranscription('')
      setFields(defaultFields)
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
  }, [supportsMediaRecorder, context])

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
    setAudioBlob(blob)

    if (blob.size < MIN_AUDIO_BYTES) {
      setError('Audio troppo breve. Tieni premuto più a lungo.')
      setState('idle')
      setAudioBlob(null)
      return
    }

    // Demo mode: niente AI, consumer compila a mano
    if (!isSupabaseConfigured()) {
      setTranscription('')
      setFields(defaultFields)
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
        setFields(defaultFields)
        setError('Non ho capito l\'audio. Compila manualmente o riprova.')
        setState('review')
        return
      }

      const machinePayload = (machines || []).map(m => ({
        id: m.id,
        name: m.name,
        serial_number: m.serial_number || null,
        location: m.location || null,
      }))

      try {
        const extractResp = await withTimeout(
          supabase.functions.invoke('extract-ticket-fields', {
            body: {
              text,
              machines: machinePayload,
              context,
              context_payload: contextPayload || {},
            },
          }),
          TRANSCRIPTION_TIMEOUT_MS,
          'estrazione campi',
        )
        if (extractResp.error) throw extractResp.error
        setFields(extractResp.data || defaultFields)
      } catch (extractErr) {
        console.warn('[voice] extract failed:', extractErr)
        setFields(defaultFields)
        setError('AI non ha estratto i campi. Completa manualmente.')
      }
      setState('review')
    } catch (err) {
      console.error('[voice] transcription failed:', err)
      setError('Errore durante la trascrizione. Riprova o compila manualmente.')
      setFields(defaultFields)
      setTranscription('')
      setState('review')
    }
  }

  // Apre la review direttamente senza audio (fallback manuale)
  const openManual = useCallback(() => {
    setTranscription('')
    setFields(defaultFields)
    setError(null)
    setAudioBlob(null)
    setState('review')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    transcription,
    setTranscription,
    fields,
    setFields,
    error,
    elapsedMs,
    audioBlob,
    supportsMediaRecorder,
    startRecording,
    stopRecording,
    openManual,
    reset,
  }
}

export default useVoiceCapture
