import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { STATUS } from '../../lib/constants'
import VoiceRecorder from './VoiceRecorder'
import VoiceReviewShell from './VoiceReviewShell'

const DEFAULT_FIELDS = {
  diagnosi_confermata: null,
  azioni_eseguite: [],
  ricambi_ordinati: [],
  stato_proposto: null,
  note_tecniche: null,
  tempo_intervento_minuti: null,
  confidence: 0,
}

// Stati che ha senso proporre da un voice update (escludi 'aperta', 'chiuso', 'risolta')
const STATUS_OPTIONS = [
  { value: '', label: '— Non cambiare stato —' },
  { value: 'in_lavorazione', label: 'In lavorazione' },
  { value: 'in_attesa_ricambi', label: 'In attesa ricambi' },
  { value: 'risolta', label: 'Risolta' },
]

/**
 * VoiceUpdateFlow — aggiornamento avanzamento di un ticket esistente.
 * Estrae diagnosi, azioni, ricambi ordinati, stato proposto, tempo.
 * Aggiorna il ticket (se cambia stato) e crea un comment kind='voice_update'.
 */
export default function VoiceUpdateFlow({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()

  const voice = useVoiceCapture({
    context: 'tech_update',
    contextPayload: {
      ticket_id: report.id,
      ticket_title: report.title,
      ticket_status: report.status,
      machine_name: report.machine,
      current_assignee: report.assigned_to_name,
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
        title="Aggiornamento ticket"
        hint="Diagnosi, azioni eseguite, ricambi ordinati, stato attuale."
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
    diagnosi_confermata: fields?.diagnosi_confermata || '',
    azioni_eseguite: Array.isArray(fields?.azioni_eseguite) ? fields.azioni_eseguite : [],
    ricambi_ordinati: Array.isArray(fields?.ricambi_ordinati) ? fields.ricambi_ordinati : [],
    stato_proposto: fields?.stato_proposto || '',
    note_tecniche: fields?.note_tecniche || '',
    tempo_intervento_minuti: fields?.tempo_intervento_minuti != null ? String(fields.tempo_intervento_minuti) : '',
  }))
  const [loading, setLoading] = useState(false)

  const update = (patch) => setForm(prev => ({ ...prev, ...patch }))

  const removeAzione = (idx) => update({
    azioni_eseguite: form.azioni_eseguite.filter((_, i) => i !== idx),
  })

  const removeRicambio = (idx) => update({
    ricambi_ordinati: form.ricambi_ordinati.filter((_, i) => i !== idx),
  })

  const handleSubmit = async () => {
    setLoading(true)
    haptic.medium()
    try {
      const tempoNum = parseFloat(form.tempo_intervento_minuti)
      const tempoMinuti = Number.isFinite(tempoNum) && tempoNum >= 0 ? tempoNum : null

      const extractedSummary = {
        diagnosi_confermata: form.diagnosi_confermata.trim() || null,
        azioni_eseguite: form.azioni_eseguite,
        ricambi_ordinati: form.ricambi_ordinati,
        note_tecniche: form.note_tecniche.trim() || null,
        tempo_intervento_minuti: tempoMinuti,
      }

      // 1. Aggiorna stato se cambiato
      let updatedReport = null
      const oldStatus = report.status
      const wantsStatusChange = form.stato_proposto && form.stato_proposto !== oldStatus
      if (wantsStatusChange) {
        updatedReport = await db.updateReport(report.id, { status: form.stato_proposto })
        const lbl = STATUS[form.stato_proposto]?.label || form.stato_proposto
        db.addActivity(report.id, {
          type: 'status_change',
          from_status: oldStatus,
          to_status: form.stato_proposto,
          user_id: user.id,
          user_name: user.name,
          detail: `Voce: ${lbl}`,
        }).catch(e => console.warn('[voice_update] activity status failed:', e?.message))
        const recipients = new Set()
        if (report.created_by) recipients.add(report.created_by)
        if (report.assigned_to) recipients.add(report.assigned_to)
        recipients.delete(user.id)
        for (const targetId of recipients) {
          db.addNotification({
            type: 'status_change',
            title: `Stato aggiornato: ${report.title}`,
            body: `${user.name} ha cambiato lo stato a "${lbl}" (vocale)`,
            report_id: report.id,
            from_user: user.id,
            target_user: targetId,
          }).catch(e => console.warn('[voice_update] notif failed:', e?.message))
        }
      }

      // 2. Upload audio + comment voice_update
      let audioUrl = null
      if (audioBlob) {
        try {
          audioUrl = await db.uploadVoiceAudio(audioBlob, report.id, user.id)
        } catch (e) {
          console.warn('[voice_update] audio upload failed:', e?.message)
        }
      }

      const commentText = (form.note_tecniche.trim() || transcription || form.diagnosi_confermata || 'Aggiornamento vocale')
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'voice_update',
        extra_data: {
          source: 'voice',
          ...extractedSummary,
          stato_proposto: form.stato_proposto || null,
          transcription: transcription || null,
        },
        confidence: fields?.confidence ?? null,
        media: audioUrl ? [{ type: 'audio', url: audioUrl, name: 'voice-update.webm' }] : null,
      })

      // 3. Activity per l'update vocale (non solo status)
      db.addActivity(report.id, {
        type: 'voice_update',
        user_id: user.id,
        user_name: user.name,
        detail: tempoMinuti != null
          ? `Aggiornamento vocale (${tempoMinuti}min)`
          : 'Aggiornamento vocale',
      }).catch(e => console.warn('[voice_update] activity failed:', e?.message))

      toast.success(wantsStatusChange ? 'Aggiornamento + stato' : 'Aggiornamento aggiunto')
      haptic.success?.()
      onSubmitted?.(updatedReport)
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setLoading(false)
    }
  }

  return (
    <VoiceReviewShell
      title="Aggiornamento ticket"
      transcription={transcription}
      setTranscription={setTranscription}
      error={error}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Salva aggiornamento"
      confidence={fields?.confidence}
    >
      <Field label="Diagnosi confermata">
        <textarea
          value={form.diagnosi_confermata}
          onChange={(e) => update({ diagnosi_confermata: e.target.value })}
          rows={2}
          placeholder="Es. pistoncino rovinato, cuscinetto bloccato"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </Field>

      {form.azioni_eseguite.length > 0 && (
        <Field label="Azioni eseguite">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.azioni_eseguite.map((a, i) => (
              <div key={i} style={chipStyle}>
                <span style={{ flex: 1, fontSize: 13 }}>{a}</span>
                <button type="button" onClick={() => removeAzione(i)} style={chipRemove} aria-label={`Rimuovi ${a}`}>×</button>
              </div>
            ))}
          </div>
        </Field>
      )}

      {form.ricambi_ordinati.length > 0 && (
        <Field label="Ricambi ordinati">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.ricambi_ordinati.map((r, i) => (
              <div key={i} style={chipStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.articolo}</div>
                  {(r.fornitore || r.eta) && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {[r.fornitore, r.eta && `ETA: ${r.eta}`].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => removeRicambio(i)} style={chipRemove} aria-label={`Rimuovi ${r.articolo}`}>×</button>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label="Stato proposto">
        <select
          value={form.stato_proposto}
          onChange={(e) => update({ stato_proposto: e.target.value })}
          style={inputStyle}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label="Tempo intervento (minuti)">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={form.tempo_intervento_minuti}
          onChange={(e) => update({ tempo_intervento_minuti: e.target.value })}
          placeholder="Es. 30"
          style={inputStyle}
        />
      </Field>

      <Field label="Note tecniche">
        <textarea
          value={form.note_tecniche}
          onChange={(e) => update({ note_tecniche: e.target.value })}
          rows={3}
          placeholder="Osservazioni, raccomandazioni..."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
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

const chipStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderRadius: 10,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
}

const chipRemove = {
  width: 22, height: 22, borderRadius: '50%',
  background: 'transparent', border: 'none',
  color: 'var(--color-text-muted)',
  fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
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
