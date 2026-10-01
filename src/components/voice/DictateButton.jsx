/**
 * DictateButton — detta invece di scrivere, dentro un campo di testo.
 *
 * Un tocco avvia la registrazione, un secondo tocco la ferma: il testo
 * trascritto (edge function `transcribe`, stesso vocabolario tecnico dei
 * flussi vocali) viene passato a `onText` e il chiamante lo accoda al
 * campo. Pensato per chi ha i guanti o le mani sporche: con il dito si
 * fa un tocco, non tre righe sulla tastiera.
 *
 * Volutamente più semplice dei flussi vocali (useVoiceCapture): niente
 * outbox né estrazione campi. È un aiuto alla scrittura — se manca la
 * rete il campo resta lì da scrivere a mano, e il pulsante lo dice prima
 * di registrare invece di perdere l'audio dopo.
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import {
  requestTranscription, applyCorrections, looksLikeHallucination, buildVocabulary,
  MIN_AUDIO_BYTES, MIN_AUDIO_MS,
} from '../../lib/transcription'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
// Una nota di chiusura non è un monologo: oltre due minuti si ferma da sola.
const MAX_MS = 120000
// Orologio fuori dal componente: il tempo si legge solo negli handler
// (start/stop), mai durante il render.
const clockNow = () => Date.now()

const supportsRecording = () => typeof window !== 'undefined'
  && typeof window.MediaRecorder !== 'undefined'
  && !!navigator?.mediaDevices?.getUserMedia

export default function DictateButton({ onText, hints = [], label = 'Detta', autoStart = false, size = 'md' }) {
  const toast = useToast()
  const haptic = useHaptic()
  const [state, setState] = useState('idle') // idle | recording | transcribing
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedRef = useRef(0)
  const tickRef = useRef(null)
  const mimeRef = useRef('audio/webm')
  const mountedRef = useRef(true)

  const cleanupTimer = () => {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
  }

  const finish = async () => {
    cleanupTimer()
    const durationMs = clockNow() - startedRef.current
    const blob = new Blob(chunksRef.current, { type: mimeRef.current })
    recorderRef.current?.stream?.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    if (blob.size < MIN_AUDIO_BYTES || durationMs < MIN_AUDIO_MS) {
      setState('idle')
      toast.info('Troppo breve: tieni acceso il microfono mentre parli')
      return
    }
    setState('transcribing')
    try {
      const raw = await requestTranscription({
        blob, mimeType: mimeRef.current, vocabulary: buildVocabulary([], hints),
      })
      const text = applyCorrections(raw)
      if (!text || looksLikeHallucination(text)) {
        toast.error('Non ho capito: riprova o scrivi a mano')
      } else {
        haptic.success()
        onText(text)
      }
    } catch (err) {
      console.warn('[DictateButton] transcription failed:', err?.message)
      toast.error('Trascrizione non riuscita: scrivi a mano o riprova')
    }
    setState('idle')
  }

  const start = async () => {
    if (!supportsRecording()) {
      toast.error('Questo dispositivo non registra audio dal browser')
      return
    }
    if (!isSupabaseConfigured()) {
      toast.info('La dettatura richiede il server: in demo scrivi a mano')
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.info('Senza rete la dettatura non funziona: scrivi a mano')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Foglio chiuso mentre il browser chiedeva il permesso: microfono spento.
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      const mime = MIME_CANDIDATES.find(c => MediaRecorder.isTypeSupported?.(c)) || ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {})
      mimeRef.current = mime || recorder.mimeType || 'audio/webm'
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = finish
      recorderRef.current = recorder
      startedRef.current = clockNow()
      setElapsed(0)
      tickRef.current = setInterval(() => {
        const ms = clockNow() - startedRef.current
        setElapsed(ms)
        if (ms >= MAX_MS) stop()
      }, 250)
      recorder.start(1000)
      haptic.medium()
      setState('recording')
    } catch (err) {
      console.warn('[DictateButton] getUserMedia failed:', err?.message)
      toast.error('Microfono non disponibile: controlla i permessi')
    }
  }

  const stop = () => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }

  // Avvio diretto (es. "Integra" dalla barra vocale): il gesto che apre il
  // foglio è già la richiesta di parlare.
  // Solo al montaggio: è l'apertura del foglio a valere come richiesta.
  // start() aspetta il permesso del microfono prima di toccare lo stato.
  // Il ref evita il doppio avvio del doppio montaggio di StrictMode.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Uscendo a metà registrazione si spegne il microfono.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanupTimer()
      const rec = recorderRef.current
      if (rec) {
        rec.onstop = null
        if (rec.state !== 'inactive') rec.stop()
        rec.stream?.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const recording = state === 'recording'
  const busy = state === 'transcribing'
  const secs = Math.floor(elapsed / 1000)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const h = size === 'sm' ? 32 : 40

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={busy}
      aria-pressed={recording}
      aria-label={recording ? 'Ferma la dettatura' : label}
      className="press-scale"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: h, padding: size === 'sm' ? '0 10px' : '0 14px', borderRadius: 10, flexShrink: 0,
        fontSize: size === 'sm' ? 12 : 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
        border: `1px solid ${recording ? 'rgba(239,68,68,0.6)' : 'rgba(167,139,250,0.45)'}`,
        background: recording ? 'rgba(239,68,68,0.16)' : 'rgba(167,139,250,0.12)',
        color: recording ? '#f87171' : '#a78bfa',
        animation: recording ? 'pulse 1.4s ease-in-out infinite' : undefined,
      }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" />
        : recording ? <Square size={13} fill="currentColor" />
        : <Mic size={15} />}
      {busy ? 'Trascrivo…' : recording ? `Stop · ${clock}` : label}
    </button>
  )
}
