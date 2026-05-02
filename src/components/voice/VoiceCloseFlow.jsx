import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceRecorder from './VoiceRecorder'
import VoiceReviewShell from './VoiceReviewShell'

const DEFAULT_FIELDS = {
  closure_hours: null,
  closure_parts: null,
  closure_root_cause: null,
  closure_action: null,
  test_eseguiti: null,
  confidence: 0,
}

/**
 * VoiceCloseFlow — chiusura ticket vocale con estrazione campi closure.
 * Imposta status='risolta' e popola closure_hours/parts/root_cause/action.
 */
export default function VoiceCloseFlow({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()

  const voice = useVoiceCapture({
    context: 'tech_close',
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

  if (voice.state === 'recording' || voice.state === 'transcribing') {
    return (
      <VoiceRecorder
        state={voice.state}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stopRecording}
        onCancel={onClose}
        title="Chiusura ticket"
        hint="Cause del guasto, azione correttiva, ricambi usati, tempo, test eseguiti."
      />
    )
  }

  if (voice.state === 'review') {
    return (
      <ReviewForm
        fields={voice.fields || DEFAULT_FIELDS}
        transcription={voice.transcription}
        setTranscription={voice.setTranscription}
        audioBlob={voice.audioBlob}
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

function ReviewForm({ fields, transcription, setTranscription, audioBlob, error, report, user, onCancel, onSubmitted, haptic, toast }) {
  const [form, setForm] = useState(() => ({
    closure_hours: fields?.closure_hours != null ? String(fields.closure_hours) : '',
    closure_parts: fields?.closure_parts || '',
    closure_root_cause: fields?.closure_root_cause || '',
    closure_action: fields?.closure_action || '',
    test_eseguiti: fields?.test_eseguiti || '',
  }))
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }))

  const isValid = form.closure_root_cause.trim() && form.closure_action.trim()

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('Causa radice e azione correttiva sono obbligatorie')
      return
    }
    setLoading(true)
    haptic.medium()
    try {
      const hoursNum = parseFloat(form.closure_hours)
      const closureData = {
        closure_hours: Number.isFinite(hoursNum) && hoursNum >= 0 ? hoursNum : null,
        closure_parts: form.closure_parts.trim() || null,
        closure_root_cause: form.closure_root_cause.trim(),
        closure_action: form.closure_action.trim(),
      }

      // 1. Update report → status='risolta' + closure data
      const oldStatus = report.status
      const updatedReport = await db.updateReport(report.id, {
        status: 'risolta',
        ...closureData,
        closed_at: new Date().toISOString(),
      })

      // 2. Activity status_change
      db.addActivity(report.id, {
        type: 'status_change',
        from_status: oldStatus,
        to_status: 'risolta',
        user_id: user.id,
        user_name: user.name,
        detail: closureData.closure_hours
          ? `Voce: chiuso in ${closureData.closure_hours}h — Causa: ${closureData.closure_root_cause}`
          : `Voce: chiuso — Causa: ${closureData.closure_root_cause}`,
      }).catch(e => console.warn('[voice_close] activity failed:', e?.message))

      // 3. Notifiche al creatore (se diverso dall'attuale tecnico)
      const recipients = new Set()
      if (report.created_by) recipients.add(report.created_by)
      if (report.assigned_to) recipients.add(report.assigned_to)
      recipients.delete(user.id)
      for (const targetId of recipients) {
        db.addNotification({
          type: 'status_change',
          title: `Risolto: ${report.title}`,
          body: `${user.name} ha chiuso il ticket (vocale)`,
          report_id: report.id,
          from_user: user.id,
          target_user: targetId,
        }).catch(e => console.warn('[voice_close] notif failed:', e?.message))
      }

      // 4. Upload audio + comment voice_close
      let audioUrl = null
      if (audioBlob) {
        try {
          audioUrl = await db.uploadVoiceAudio(audioBlob, report.id, user.id)
        } catch (e) {
          console.warn('[voice_close] audio upload failed:', e?.message)
        }
      }

      const commentText = `Chiusura vocale: ${closureData.closure_root_cause}\n${closureData.closure_action}`
      const allMedia = [
        ...media,
        ...(audioUrl ? [{ type: 'audio', url: audioUrl, name: 'voice-close.webm' }] : []),
      ]
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'voice_close',
        extra_data: {
          source: 'voice',
          ...closureData,
          test_eseguiti: form.test_eseguiti.trim() || null,
          transcription: transcription || null,
        },
        confidence: fields?.confidence ?? null,
        media: allMedia.length > 0 ? allMedia : null,
      })

      toast.success('Ticket chiuso')
      haptic.success?.()
      onSubmitted?.(updatedReport)
    } catch (err) {
      toast.error('Errore chiusura: ' + (err?.message || 'riprova'))
      setLoading(false)
    }
  }

  return (
    <VoiceReviewShell
      title="Chiusura ticket"
      transcription={transcription}
      setTranscription={setTranscription}
      error={error}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Chiudi ticket"
      submitDisabled={!isValid}
      confidence={fields?.confidence}
      media={media}
      setMedia={setMedia}
      mediaUploadPath={`voice-close/${report.id}`}
    >
      <Field label="Causa radice *" required>
        <textarea
          value={form.closure_root_cause}
          onChange={(e) => update({ closure_root_cause: e.target.value })}
          rows={2}
          placeholder="Es. cuscinetto rotto per usura, filtri sporchi a monte"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </Field>

      <Field label="Azione correttiva *" required>
        <textarea
          value={form.closure_action}
          onChange={(e) => update({ closure_action: e.target.value })}
          rows={2}
          placeholder="Es. sostituzione pistoncino e pulizia filtri"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <Field label="Ore lavoro">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={form.closure_hours}
            onChange={(e) => update({ closure_hours: e.target.value })}
            placeholder="2"
            style={inputStyle}
          />
        </Field>
        <Field label="Ricambi utilizzati">
          <input
            type="text"
            value={form.closure_parts}
            onChange={(e) => update({ closure_parts: e.target.value })}
            maxLength={500}
            placeholder="Es. kit guarnizioni DN65, cuscinetto SKF 6205"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Test eseguiti">
        <input
          type="text"
          value={form.test_eseguiti}
          onChange={(e) => update({ test_eseguiti: e.target.value })}
          maxLength={500}
          placeholder="Es. due cicli a vuoto, test pressione 6 bar"
          style={inputStyle}
        />
      </Field>
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

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 700,
        color: required ? 'var(--color-text)' : 'var(--color-text-secondary)',
        marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
