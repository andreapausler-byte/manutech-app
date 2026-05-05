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
 *   machines         — array macchine reali per il prompt extract.
 *                      I nomi finiscono ANCHE nel vocabulary hint passato
 *                      a Whisper, migliorando la trascrizione di termini
 *                      tecnici di dominio.
 *   contextPayload   — payload addizionale per context update/close/note/spare
 *                      (es. { ticket_title, ticket_status, machine_name })
 *   defaultFields    — fields di partenza in modalità manuale o errore
 *   vocabularyHints  — array di stringhe extra da aggiungere al vocabulary
 *                      Whisper (es. ricambi specifici dell'org). Opzionale.
 */

const TRANSCRIPTION_TIMEOUT_MS = 15000
const MIN_AUDIO_BYTES = 5000
const MIN_AUDIO_MS = 1500     // sotto 1.5s consideriamo l'audio non utile
const MAX_VOCAB_CHARS = 800

// Detection di Whisper hallucination su silenzio o rumore. Il modello a volte
// inventa parole random in altre lingue ("Brandi naivowi, Nordili Rock
// Теперь...") quando l'audio non contiene voce comprensibile. Heuristic:
// - Caratteri non latini (cirillico, asiatico, ecc.) -> hallucination quasi certa
// - Tante parole MAIUSCOLE corte (sigle inventate tipo "ABplS, CBT15") -> sospetto
// - Frasi senza verbi italiani comuni e con molte virgole -> sospetto
function looksLikeHallucination(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 10) return false  // troppo corto per giudicare
  // Caratteri non latini (cirillico, kanji, ecc.)
  if (/[Ѐ-ӿ֐-׿؀-ۿ぀-ヿ一-鿿]/.test(t)) {
    return true
  }
  // Sigle MAIUSCOLE/MISTE corte separate da virgole tipo "ABplS, CBT15, HVB"
  const tokens = t.split(/[\s,.\-]+/).filter(Boolean)
  if (tokens.length >= 6) {
    const acronymish = tokens.filter(w =>
      w.length >= 3 && w.length <= 8 &&
      /[A-Z]/.test(w) && /[a-z0-9]/.test(w) &&
      !/^[A-Z][a-z]+$/.test(w)  // escludi capitalizzazione normale
    )
    if (acronymish.length / tokens.length > 0.35) return true
  }
  return false
}

// Vocabolario tecnico statico per il dominio manutenzione industriale
// (settore birrificio / linea imbottigliamento). Whisper accetta ~244 token
// come prompt: questo va concatenato ai nomi macchine reali, totale tronco
// a 800 caratteri.
//
// Aggiungere termini quando l'orecchio di Whisper sbaglia ricorrentemente
// nomi di dominio (es. "imbottigliatrice" → "imbobiliatrice", "Kosme" →
// "Cogna").
const STATIC_VOCAB_TECH = [
  'Trascrizione di un tecnico/operatore di manutenzione di birrificio.',
  'Macchine tipo: imbottigliatrice, riempitrice, tappatrice, etichettatrice, sciacquatrice, depalettizzatore, palettizzatore, capsulatrice, pasteurizzatrice tunnel.',
  'Componenti: valvola DN65, pistoncino, guarnizione OR, cuscinetto, encoder, sonda PT100, elettrovalvola, attuatore, premitreccia, rubinetto, ugello.',
  // Ripeti i brand "difficili" per Whisper (K iniziale viene italianizzata in C).
  'Brand: Kosme, Kosme, Kosme, GAI, Bertolaso, Sidel, KHS, Krones, Comac, GEA, Cimaer, Bardi, BBM, SKF, Festo, SMC, Burkert, Endress, Siemens.',
  'Termini: smontaggio, lubrificazione, sostituzione, taratura, calibrazione, lappatura, service line.',
].join(' ')

// Correzioni post-trascrizione per pattern noti di Whisper italiano.
// Whisper a volte italianizza nomi propri o inventa parole foneticamente
// vicine. Queste sostituzioni vengono applicate al testo PRIMA di passarlo
// a Claude e PRIMA di mostrarlo all'utente.
//
// Regola: aggiungere SOLO pattern dove il falso positivo e' improbabile
// (es. "Cogna" e "Cosme" non sono brand reali nel settore birrificio).
const TRANSCRIPTION_CORRECTIONS = [
  // Kosme: Whisper italianizza la K iniziale in C, oppure non riconosce
  // "Kosme" e cerca parole comuni (es. "Cogna").
  { pattern: /\b[ck]osm[ei]\b/gi, replacement: 'Kosme' },
  { pattern: /\bcogna\b/gi, replacement: 'Kosme' },
  // imbottigliatrice: parola lunga e tecnica, Whisper inventa varianti.
  { pattern: /\bimbo[bv][ie]l[ie]atric[ei]\b/gi, replacement: 'imbottigliatrice' },
]

function applyCorrections(text) {
  if (!text) return text
  let corrected = text
  for (const { pattern, replacement } of TRANSCRIPTION_CORRECTIONS) {
    corrected = corrected.replace(pattern, replacement)
  }
  return corrected
}

function buildVocabulary(machines, vocabularyHints) {
  const parts = [STATIC_VOCAB_TECH]
  if (Array.isArray(machines) && machines.length > 0) {
    const names = machines
      .map(m => m?.name)
      .filter(Boolean)
      .slice(0, 30) // hard cap per evitare overflow
      .join(', ')
    if (names) parts.push(`Macchine: ${names}.`)
  }
  if (Array.isArray(vocabularyHints) && vocabularyHints.length > 0) {
    parts.push(vocabularyHints.filter(Boolean).join(' '))
  }
  return parts.join(' ').slice(0, MAX_VOCAB_CHARS)
}

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
  vocabularyHints = null,
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
  const mimeTypeRef = useRef('audio/webm')

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
      // Firefox mobile preferisce audio/ogg;codecs=opus, Chrome/Safari audio/webm.
      // Selezione del mimeType piu' adatto fra quelli supportati dal browser.
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
    setState('transcribing')
  }, [])

  // Annulla la registrazione: ferma mediarecorder + tracks, scarta i chunks
  // raccolti, NON triggera trascrizione, resetta lo stato a idle. Usato
  // dal pulsante X dei flow vocali quando l'utente vuole desistere.
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    stopTicker()
    // Sgancia il listener onstop prima di fermare per evitare handleStop
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
    setState('idle')
  }, [])

  const handleStop = async () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' })
    setAudioBlob(blob)

    // Calcoliamo la durata DALL'OROLOGIO (ref, sempre fresh) invece che dallo
    // state React. Su Firefox mobile lo state elapsedMs puo' essere ancora 0
    // perche' setInterval scatta ogni 200ms e React batcha gli update,
    // mentre startedAtRef.current viene popolato sincrono in startRecording.
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
      // Estensione coerente con il mimeType usato dal MediaRecorder (utile
      // per Firefox mobile che produce ogg/opus).
      const ext = (mimeTypeRef.current || '').includes('ogg') ? 'ogg'
                : (mimeTypeRef.current || '').includes('mp4') ? 'mp4'
                : 'webm'
      form.append('audio', blob, `recording.${ext}`)
      // Vocabulary hint per Whisper: nomi macchine + termini tecnici.
      // Riduce drasticamente trascrizioni errate di parole di dominio
      // (es. "tappatrice" non diventa "tapatrice").
      const vocabulary = buildVocabulary(machines, vocabularyHints)
      if (vocabulary) form.append('vocabulary', vocabulary)
      const transcribeResp = await withTimeout(
        supabase.functions.invoke('transcribe', { body: form }),
        TRANSCRIPTION_TIMEOUT_MS,
        'trascrizione',
      )
      if (transcribeResp.error) throw transcribeResp.error
      const rawText = (transcribeResp.data?.text || '').toString().trim()
      // Post-processing: correggi sostituzioni note che Whisper italiano
      // sbaglia ricorrentemente (es. "Cosme" → "Kosme").
      const text = applyCorrections(rawText)

      // Hallucination check: se Whisper ha inventato parole random
      // (succede su silenzio o rumore), scarta e chiedi di riprovare.
      if (looksLikeHallucination(text)) {
        console.warn('[voice] hallucination detected, raw text:', text.slice(0, 200))
        setTranscription('')
        setFields(defaultFields)
        setAudioBlob(null)
        setError('Audio non chiaro: il sistema ha rilevato voci o parole non riconoscibili. Riprova parlando più vicino al microfono.')
        setState('idle')
        return
      }

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
    cancelRecording,
    openManual,
    reset,
  }
}

export default useVoiceCapture
