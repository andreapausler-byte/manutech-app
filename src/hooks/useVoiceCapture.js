import { useState, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'
import { enqueueVoiceCapture, enrichVoiceItem } from '../lib/voiceOutbox'
import {
  requestTranscription, applyCorrections, looksLikeHallucination, buildVocabulary,
  withTimeout, TRANSCRIPTION_TIMEOUT_MS, MIN_AUDIO_BYTES, MIN_AUDIO_MS,
} from '../lib/transcription'

/**
 * useVoiceCapture — pipeline vocale generica riusabile per ManuTech.
 *
 * Cattura audio + trascrizione (Whisper) + estrazione campi (Claude Haiku).
 *
 * RESILIENZA OFFLINE (contratto "l'audio non si perde"):
 *   - Appena la registrazione si ferma, il Blob viene salvato SUBITO su
 *     IndexedDB (`voiceOutbox`) con feedback immediato "Audio salvato". Da
 *     quel momento l'audio sopravvive a offline, chiusura e riavvio dell'app
 *     e resta finché non viene consegnato o eliminato esplicitamente.
 *   - La trascrizione è best-effort e NON blocca mai: offline non viene
 *     nemmeno tentata (niente attesa di 15s a vuoto), online gira in
 *     background e in caso di errore l'audio resta comunque al sicuro.
 *
 * Il consumer riceve `outboxId` e usa `submitVoice` (voiceOutbox) per la
 * consegna unificata: in primo piano se online, altrimenti il sync worker la
 * completa al ritorno della rete.
 *
 * Stati: idle | recording | review.
 *
 * Props:
 *   context          — operator_new_ticket | tech_new_ticket | tech_update |
 *                      tech_close | tech_note
 *   user             — utente corrente (id/name/role) per l'item durevole
 *   machines         — array macchine reali per prompt extract + vocabulary
 *   contextPayload   — payload addizionale (es. { ticket_id, ticket_title })
 *   defaultFields    — fields di partenza in modalità manuale o errore
 *   vocabularyHints  — array di stringhe extra per il vocabulary Whisper
 */
export function useVoiceCapture({
  context = 'operator_new_ticket',
  user = null,
  machines = [],
  contextPayload = null,
  defaultFields = null,
  vocabularyHints = null,
} = {}) {
  const toast = useToast()
  const haptic = useHaptic()

  const [state, setState] = useState('idle')
  const [transcription, setTranscription] = useState('')
  const [fields, setFields] = useState(null)
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [outboxId, setOutboxId] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const tickRef = useRef(null)
  const mimeTypeRef = useRef('audio/webm')

  const supportsMediaRecorder = typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'
    && !!navigator?.mediaDevices?.getUserMedia

  const reset = useCallback(() => {
    // NB: reset NON elimina l'item dall'outbox. L'audio sparisce solo per
    // consegna riuscita (flush) o eliminazione esplicita dell'utente. Un
    // "Annulla" in review lascia quindi l'audio in "Registrazioni in sospeso".
    setState('idle')
    setTranscription('')
    setFields(null)
    setError(null)
    setElapsedMs(0)
    setAudioBlob(null)
    setTranscribing(false)
    setOutboxId(null)
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
      // Firefox mobile preferisce audio/ogg;codecs=opus, Chrome/Safari audio/webm.
      let mimeType = ''
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ]
      for (const c of candidates) {
        if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c)) {
          mimeType = c
          break
        }
      }
      const recorderOptions = mimeType ? { mimeType } : {}
      const recorder = new MediaRecorder(stream, recorderOptions)
      mimeTypeRef.current = mimeType || recorder.mimeType || 'audio/webm'
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
      // Timeslice esplicito: alcuni browser (Firefox mobile) non emettono
      // dataavailable senza timeslice. 1s e' un buon compromesso.
      recorder.start(1000)
      console.info('[voice] recording started, mimeType=', mimeTypeRef.current)
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
    // Lo stato successivo lo decide handleStop.
  }, [])

  // Annulla la registrazione PRIMA dello stop: nessun item è ancora stato
  // creato (l'enqueue avviene in handleStop), quindi non c'è audio da
  // perdere. Scarta i chunks e torna a idle.
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    stopTicker()
    if (recorder) {
      try { recorder.onstop = null } catch { /* noop */ }
      try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* noop */ }
      try { recorder.stream?.getTracks().forEach(t => t.stop()) } catch { /* noop */ }
    }
    chunksRef.current = []
    mediaRecorderRef.current = null
    setAudioBlob(null)
    setTranscription('')
    setError(null)
    setTranscribing(false)
    setOutboxId(null)
    setState('idle')
  }, [])

  const handleStop = async () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
    setAudioBlob(blob)

    // Durata dall'orologio (ref sempre fresh) invece che dallo state React.
    const durationMs = startedAtRef.current > 0
      ? Date.now() - startedAtRef.current
      : elapsedMs
    console.info(`[voice] handleStop: durationMs=${durationMs} blob.size=${blob.size} mimeType=${mimeTypeRef.current} chunks=${chunksRef.current.length}`)

    if (blob.size < MIN_AUDIO_BYTES || durationMs < MIN_AUDIO_MS) {
      setError(durationMs < MIN_AUDIO_MS
        ? `Registrazione troppo breve (${(durationMs / 1000).toFixed(1)}s). Tieni premuto almeno ${MIN_AUDIO_MS / 1000}s.`
        : 'Audio troppo breve. Tieni premuto più a lungo.')
      setState('idle')
      setAudioBlob(null)
      chunksRef.current = []
      return
    }

    // ── 1. SALVATAGGIO DUREVOLE IMMEDIATO ──
    // Prima di qualsiasi rete: l'audio finisce su IndexedDB. Da qui in poi è
    // al sicuro qualunque cosa accada (offline, app chiusa, refresh).
    let newOutboxId = null
    try {
      const res = await enqueueVoiceCapture({
        blob,
        mimeType: mimeTypeRef.current,
        durationMs,
        context,
        reportId: contextPayload?.ticket_id || null,
        user,
      })
      newOutboxId = res?.id || null
      setOutboxId(newOutboxId)
      if (newOutboxId) {
        toast.success('Audio salvato')
        haptic.success?.()
      }
    } catch (e) {
      console.warn('[voice] enqueue durevole fallito:', e?.message)
    }

    // Demo mode: niente AI, consumer compila a mano (review già aperta).
    if (!isSupabaseConfigured()) {
      setTranscription('')
      setFields(defaultFields)
      setError('AI vocale disponibile solo con Supabase configurato. Compila manualmente.')
      setState('review')
      return
    }

    // Apri subito la review.
    setTranscription('')
    setFields(defaultFields)
    setError(null)
    setState('review')

    // ── 2. GATE OFFLINE ──
    // Senza rete NON tentiamo la trascrizione: niente attesa di 15s a vuoto.
    // L'audio è già salvato e verrà trascritto/inviato al ritorno della linea.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setTranscribing(false)
      setError('Sei offline: l\'audio è salvato e verrà inviato e trascritto appena torna la linea. Puoi compilare i campi a mano e inviare.')
      return
    }

    // ── 3. TRASCRIZIONE BEST-EFFORT (non blocca mai) ──
    setTranscribing(true)
    try {
      const vocabulary = buildVocabulary(machines, vocabularyHints)
      const rawText = await requestTranscription({ blob, mimeType: mimeTypeRef.current, vocabulary })
      const text = applyCorrections(rawText)

      if (looksLikeHallucination(text)) {
        console.warn('[voice] hallucination detected, raw text:', text.slice(0, 200))
        setError('Audio non chiaro: il sistema ha rilevato voci non riconoscibili. Compila manualmente o annulla e riprova.')
        setTranscribing(false)
        return
      }

      setTranscription(text)
      if (newOutboxId && text) {
        enrichVoiceItem(newOutboxId, { transcription: text, transcriptionStatus: 'done' })
          .catch(() => { /* l'audio resta comunque salvo */ })
      }

      if (!text) {
        setError('Non ho capito l\'audio. Compila manualmente o riprova.')
        setTranscribing(false)
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
        setError('AI non ha estratto i campi. Completa manualmente.')
      }
      setTranscribing(false)
    } catch (err) {
      // La trascrizione è fallita (rete instabile?). L'audio è GIÀ salvato:
      // nessuna perdita. Si potrà ritrascrivere/inviare in seguito.
      console.warn('[voice] transcription failed:', err?.message)
      setError('Trascrizione non riuscita: l\'audio è salvato. Compila a mano o riprova; verrà ritrascritto all\'invio.')
      if (newOutboxId) {
        enrichVoiceItem(newOutboxId, { transcriptionStatus: 'pending' }).catch(() => {})
      }
      setTranscribing(false)
    }
  }

  // Apre la review direttamente senza audio (fallback manuale)
  const openManual = useCallback(() => {
    setTranscription('')
    setFields(defaultFields)
    setError(null)
    setAudioBlob(null)
    setTranscribing(false)
    setOutboxId(null)
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
    transcribing,
    outboxId,
    supportsMediaRecorder,
    startRecording,
    stopRecording,
    cancelRecording,
    openManual,
    reset,
  }
}

export default useVoiceCapture
