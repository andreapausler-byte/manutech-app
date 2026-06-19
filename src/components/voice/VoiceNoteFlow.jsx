import { useEffect, useRef, useState } from 'react'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { submitVoice } from '../../lib/voiceOutbox'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceRecorder from './VoiceRecorder'
import VoiceReviewShell from './VoiceReviewShell'

const DEFAULT_FIELDS = { nota_tecnica: '', tag: null, confidence: 0 }

/**
 * VoiceNoteFlow — nota rapida vocale a un ticket esistente.
 * Non cambia lo stato del ticket. Solo aggiunge un commento con
 * kind='voice_note' e l'audio originale.
 */
export default function VoiceNoteFlow({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()

  const voice = useVoiceCapture({
    context: 'tech_note',
    user,
    contextPayload: {
      ticket_id: report.id,
      ticket_title: report.title,
      machine_name: report.machine,
    },
    defaultFields: DEFAULT_FIELDS,
  })

  useEffect(() => {
    if (voice.state === 'idle' && voice.supportsMediaRecorder) {
      voice.startRecording()
    } else if (voice.state === 'idle' && !voice.supportsMediaRecorder) {
      voice.openManual()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (voice.state === 'idle' && voice.error) {
      toast.error(voice.error)
      onClose?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state, voice.error])

  if (voice.state === 'recording') {
    return (
      <VoiceRecorder
        state={voice.state}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stopRecording}
        onCancel={() => { voice.cancelRecording(); onClose?.() }}
        title="Nota vocale"
        hint="Aggiungi un'osservazione, un aggiornamento, una info."
      />
    )
  }

  if (voice.state === 'review') {
    return (
      <ReviewForm
        fields={voice.fields || DEFAULT_FIELDS}
        transcription={voice.transcription}
        setTranscription={voice.setTranscription}
        transcribing={voice.transcribing}
        audioBlob={voice.audioBlob}
        outboxId={voice.outboxId}
        error={voice.error}
        report={report}
        user={user}
        onCancel={onClose}
        onSubmitted={onApplied}
        haptic={haptic}
        toast={toast}
      />
    )
  }

  return null
}

function ReviewForm({ fields, transcription, setTranscription, transcribing, audioBlob, outboxId, error, report, user, onCancel, onSubmitted, haptic, toast }) {
  const [text, setText] = useState(() => fields?.nota_tecnica || transcription || '')
  const [tag, setTag] = useState(() => fields?.tag || '')
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)

  // Auto-popola i campi quando trascrizione/fields arrivano dopo l'apertura
  // della review (PR 3 Fase 0). Non sovrascriviamo input dell'utente.
  const textTouchedRef = useRef(false)
  const tagTouchedRef = useRef(false)

  useEffect(() => {
    if (textTouchedRef.current) return
    const next = fields?.nota_tecnica || transcription || ''
    if (next && next !== text) setText(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcription, fields?.nota_tecnica])

  useEffect(() => {
    if (tagTouchedRef.current) return
    if (fields?.tag && fields.tag !== tag) setTag(fields.tag)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields?.tag])

  const handleSubmit = async () => {
    const finalText = (text || '').trim()
    if (!finalText) {
      toast.error('La nota è vuota')
      return
    }
    setLoading(true)
    haptic.medium()
    try {
      await submitVoice({
        outboxId,
        blob: audioBlob,
        context: 'tech_note',
        reportId: report.id,
        user,
        text: finalText,
        extraData: { source: 'voice', tag: tag || null },
        media,
        confidence: fields?.confidence ?? null,
      })
      toast.success('Nota aggiunta')
      haptic.success?.()
      onSubmitted?.()
    } catch (err) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast.success('Offline: nota e audio salvati, invio automatico al ritorno della linea')
        haptic.success?.()
        onSubmitted?.()
      } else {
        toast.error('Invio non riuscito: l\'audio è salvato in sospeso. ' + (err?.message || ''))
        setLoading(false)
      }
    }
  }

  return (
    <VoiceReviewShell
      title="Nota vocale"
      transcription={transcription}
      setTranscription={setTranscription}
      transcribing={transcribing}
      error={error}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Aggiungi nota"
      submitDisabled={!text.trim()}
      confidence={fields?.confidence}
      media={media}
      setMedia={setMedia}
      mediaUploadPath={`voice-notes/${report.id}`}
    >
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Testo nota *</label>
        <textarea
          value={text}
          onChange={(e) => { textTouchedRef.current = true; setText(e.target.value) }}
          rows={4}
          maxLength={500}
          placeholder={transcribing ? 'In attesa della trascrizione…' : 'Es. Cliente richiede di intervenire dopo le 18'}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
        />
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right', marginTop: 4 }}>
          {text.length}/500
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Tag (opzionale)</label>
        <input
          type="text"
          value={tag}
          onChange={(e) => { tagTouchedRef.current = true; setTag(e.target.value) }}
          maxLength={50}
          placeholder="Es. fornitore, ricambio, pianificazione…"
          style={inputStyle}
        />
      </div>
    </VoiceReviewShell>
  )
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-text)',
  fontSize: 14,
  fontFamily: 'inherit',
}

const labelStyle = {
  display: 'block', fontSize: 13, fontWeight: 700,
  color: 'var(--color-text)', marginBottom: 6,
}
