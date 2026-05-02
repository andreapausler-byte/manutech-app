import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceRecorder from './VoiceRecorder'
import VoiceReviewShell from './VoiceReviewShell'

const DEFAULT_FIELDS = {
  articolo: '',
  quantita: 1,
  fornitore: null,
  urgenza: 'media',
  deadline_giorni: null,
  note: null,
  confidence: 0,
}

const URGENCY_OPTIONS = [
  { value: 'bassa', label: 'Bassa', color: '#9ca3af' },
  { value: 'media', label: 'Media', color: '#06b6d4' },
  { value: 'alta', label: 'Alta', color: '#f59e0b' },
  { value: 'urgente', label: 'Urgente', color: '#ef4444' },
]

/**
 * VoiceSpareRequestFlow — richiesta vocale di un ricambio.
 * Crea record in spare_part_orders + comment di tracking sul ticket.
 */
export default function VoiceSpareRequestFlow({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()

  const voice = useVoiceCapture({
    context: 'tech_spare_request',
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
        title="Richiesta ricambio"
        hint="Articolo, quantità, fornitore, urgenza, deadline."
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
    articolo: fields?.articolo || '',
    quantita: fields?.quantita || 1,
    fornitore: fields?.fornitore || '',
    urgenza: fields?.urgenza || 'media',
    deadline_giorni: fields?.deadline_giorni != null ? String(fields.deadline_giorni) : '',
    note: fields?.note || '',
  }))
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }))

  const isValid = form.articolo.trim().length > 0 && form.quantita >= 1

  const handleSubmit = async () => {
    if (!isValid) {
      toast.error('Articolo e quantità sono obbligatori')
      return
    }
    setLoading(true)
    haptic.medium()
    try {
      const dlNum = parseInt(form.deadline_giorni, 10)
      const deadlineGiorni = Number.isFinite(dlNum) && dlNum >= 0 ? dlNum : null
      const expectedAtIso = deadlineGiorni != null
        ? new Date(Date.now() + deadlineGiorni * 24 * 60 * 60 * 1000).toISOString()
        : null

      // Metadati extra annegati in notes (lo schema spare_part_orders
      // non ha extra_data). Le info complete restano nel comment voice_spare_request.
      const noteParts = []
      noteParts.push(`urgenza: ${form.urgenza}`)
      if (deadlineGiorni != null) noteParts.push(`entro ${deadlineGiorni}gg`)
      if (form.note.trim()) noteParts.push(form.note.trim())

      // 1. Crea ordine ricambio
      await db.createSparePartOrder({
        spare_part_id: null,
        spare_part_name: form.articolo.trim().slice(0, 200),
        quantity: form.quantita,
        report_id: report.id,
        machine_id: report.machine_id || null,
        supplier: form.fornitore.trim() || null,
        status: 'ordinato',
        notes: noteParts.join(' · ') || null,
        expected_at: expectedAtIso,
        ordered_by: user.id,
      })

      // 2. Aggiorna stato ticket a 'in_attesa_ricambi' (se non gia' in stato
      // terminale). L'admin lo trovera' nella sezione "Reports in attesa
      // ricambi" della pagina Ricambi.
      let updatedReport = null
      const oldStatus = report.status
      const TERMINAL_OR_WAITING = new Set(['in_attesa_ricambi', 'risolta', 'chiuso'])
      if (!TERMINAL_OR_WAITING.has(oldStatus)) {
        try {
          updatedReport = await db.updateReport(report.id, { status: 'in_attesa_ricambi' })
          db.addActivity(report.id, {
            type: 'status_change',
            from_status: oldStatus,
            to_status: 'in_attesa_ricambi',
            user_id: user.id,
            user_name: user.name,
            detail: `Voce: richiesta ${form.articolo} x${form.quantita}`,
          }).catch(e => console.warn('[voice_spare] activity status failed:', e?.message))
          // Notifiche al creatore + assegnatario diversi dal mittente
          const recipients = new Set()
          if (report.created_by) recipients.add(report.created_by)
          if (report.assigned_to) recipients.add(report.assigned_to)
          recipients.delete(user.id)
          for (const targetId of recipients) {
            db.addNotification({
              type: 'status_change',
              title: `In attesa ricambi: ${report.title}`,
              body: `${user.name} ha richiesto ${form.articolo} x${form.quantita}`,
              report_id: report.id,
              from_user: user.id,
              target_user: targetId,
            }).catch(e => console.warn('[voice_spare] notif failed:', e?.message))
          }
        } catch (e) {
          console.warn('[voice_spare] updateReport status failed:', e?.message)
        }
      }

      // 3. Activity sul ticket per la richiesta in se'
      db.addActivity(report.id, {
        type: 'spare_requested',
        user_id: user.id,
        user_name: user.name,
        detail: `Richiesta vocale: ${form.articolo} x${form.quantita} (${form.urgenza})`,
      }).catch(e => console.warn('[voice_spare] activity failed:', e?.message))

      // 4. Upload audio + comment di tracking
      let audioUrl = null
      if (audioBlob) {
        try {
          audioUrl = await db.uploadVoiceAudio(audioBlob, report.id, user.id)
        } catch (e) {
          console.warn('[voice_spare] audio upload failed:', e?.message)
        }
      }

      const commentText = `Richiesta ricambio: ${form.articolo} x${form.quantita}${form.fornitore ? ` (${form.fornitore})` : ''} — urgenza: ${form.urgenza}`
      const allMedia = [
        ...media,
        ...(audioUrl ? [{ type: 'audio', url: audioUrl, name: 'voice-spare.webm' }] : []),
      ]
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'voice_spare_request',
        extra_data: {
          source: 'voice',
          articolo: form.articolo.trim(),
          quantita: form.quantita,
          fornitore: form.fornitore.trim() || null,
          urgenza: form.urgenza,
          deadline_giorni: deadlineGiorni,
          expected_at: expectedAtIso,
          note: form.note.trim() || null,
          transcription: transcription || null,
        },
        confidence: fields?.confidence ?? null,
        media: allMedia.length > 0 ? allMedia : null,
      })

      toast.success(updatedReport ? 'Ricambio richiesto · ticket in attesa' : 'Ricambio richiesto')
      haptic.success?.()
      onSubmitted?.(updatedReport)
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setLoading(false)
    }
  }

  return (
    <VoiceReviewShell
      title="Richiesta ricambio"
      transcription={transcription}
      setTranscription={setTranscription}
      error={error}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Richiedi ricambio"
      submitDisabled={!isValid}
      confidence={fields?.confidence}
      media={media}
      setMedia={setMedia}
      mediaUploadPath={`voice-spare/${report.id}`}
    >
      <Field label="Articolo *">
        <input
          type="text"
          value={form.articolo}
          onChange={(e) => update({ articolo: e.target.value })}
          maxLength={200}
          placeholder="Es. kit guarnizioni DN65, cuscinetto SKF 6205"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <Field label="Quantità *">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={form.quantita}
            onChange={(e) => update({ quantita: parseInt(e.target.value, 10) || 1 })}
            style={inputStyle}
          />
        </Field>
        <Field label="Fornitore">
          <input
            type="text"
            value={form.fornitore}
            onChange={(e) => update({ fornitore: e.target.value })}
            maxLength={100}
            placeholder="Es. SKF, Comac, Festo"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Urgenza">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {URGENCY_OPTIONS.map(opt => {
            const active = form.urgenza === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ urgenza: opt.value })}
                className="press-scale"
                style={{
                  padding: '10px 6px', borderRadius: 10,
                  background: active ? `${opt.color}1f` : 'var(--color-surface-2)',
                  border: `1px solid ${active ? opt.color : 'var(--color-border)'}`,
                  color: active ? opt.color : 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Deadline (giorni)">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={form.deadline_giorni}
          onChange={(e) => update({ deadline_giorni: e.target.value })}
          placeholder="Es. 5 = entro 5 giorni"
          style={inputStyle}
        />
      </Field>

      <Field label="Note">
        <textarea
          value={form.note}
          onChange={(e) => update({ note: e.target.value })}
          rows={2}
          maxLength={500}
          placeholder="Compatibilità, alternative, …"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 700,
        color: 'var(--color-text)', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
