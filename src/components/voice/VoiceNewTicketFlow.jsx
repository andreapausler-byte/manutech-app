import { useEffect, useRef, useState } from 'react'
import { db } from '../../lib/supabase'
import { useMachines } from '../../hooks/useMachines'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceRecorder from './VoiceRecorder'
import VoiceReviewShell from './VoiceReviewShell'

const SEVERITY_TO_DB = { alta: 'alta', media: 'media', bassa: 'bassa' }
const CATEGORY_TO_TYPE = {
  guasto: 'correttiva',
  anomalia: 'correttiva',
  manutenzione: 'preventiva',
  altro: 'ispezione',
}

const SEVERITY_OPTIONS = [
  { value: '', label: '— Priorità —' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'bassa', label: 'Bassa' },
]

const INTERVENTION_OPTIONS = [
  { value: '', label: '— Tipo intervento —' },
  { value: 'emergenza', label: 'Emergenza' },
  { value: 'correttivo', label: 'Correttivo' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'predittivo', label: 'Predittivo' },
  { value: 'programmato', label: 'Programmato' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: '— Categoria —' },
  { value: 'guasto', label: 'Guasto' },
  { value: 'manutenzione', label: 'Manutenzione' },
  { value: 'anomalia', label: 'Anomalia' },
  { value: 'altro', label: 'Altro' },
]

const DEFAULT_FIELDS = {
  machine_id: null,
  machine_name: null,
  componente: null,
  tipo_guasto: null,
  summary: '',
  diagnosi_iniziale: null,
  priority: null,
  motivazione_priorita: null,
  tipo_intervento: null,
  category: null,
  auto_assegnazione: false,
  ricambi_potenziali: [],
  note_tecniche: null,
  confidence: 0,
}

/**
 * VoiceNewTicketFlow — flow vocale di creazione ticket da Tecnico.
 *
 * Differenze chiave rispetto a Operatore:
 *  - input più tecnico (componente, diagnosi iniziale, motivazione priorità)
 *  - auto-assegnazione opzionale (status iniziale 'in_lavorazione')
 *  - ricambi potenziali pre-compilati
 */
export default function VoiceNewTicketFlow({ user, onBack, onCreated }) {
  const { machines } = useMachines()
  const toast = useToast()
  const haptic = useHaptic()

  const voice = useVoiceCapture({
    context: 'tech_new_ticket',
    machines,
    contextPayload: {
      technician_id: user?.id,
      technician_name: user?.name,
    },
    defaultFields: DEFAULT_FIELDS,
  })

  // Avvia auto-recording quando il componente monta
  useEffect(() => {
    if (voice.state === 'idle' && voice.supportsMediaRecorder) {
      voice.startRecording()
    } else if (voice.state === 'idle' && !voice.supportsMediaRecorder) {
      voice.openManual()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toast errori non bloccanti
  useEffect(() => {
    if (voice.state === 'idle' && voice.error) {
      toast.error(voice.error)
      onBack?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state, voice.error])

  if (voice.state === 'recording') {
    return (
      <VoiceRecorder
        state={voice.state}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stopRecording}
        onCancel={() => { voice.cancelRecording(); onBack?.() }}
        title="Nuovo ticket vocale"
        hint="Descrivi cosa hai notato: macchina, componente, problema, urgenza."
      />
    )
  }

  if (voice.state === 'review') {
    return (
      <ReviewForm
        machines={machines}
        fields={voice.fields || DEFAULT_FIELDS}
        transcription={voice.transcription}
        setTranscription={voice.setTranscription}
        transcribing={voice.transcribing}
        audioBlob={voice.audioBlob}
        error={voice.error}
        user={user}
        onCancel={onBack}
        onSubmitted={onCreated}
        haptic={haptic}
        toast={toast}
      />
    )
  }

  return null
}

function buildFormFromFields(fields) {
  return {
    summary: fields?.summary || '',
    machine_id: fields?.machine_id || '',
    componente: fields?.componente || '',
    diagnosi_iniziale: fields?.diagnosi_iniziale || '',
    priority: fields?.priority || '',
    motivazione_priorita: fields?.motivazione_priorita || '',
    tipo_intervento: fields?.tipo_intervento || '',
    category: fields?.category || '',
    auto_assegnazione: !!fields?.auto_assegnazione,
    ricambi_potenziali: Array.isArray(fields?.ricambi_potenziali) ? fields.ricambi_potenziali : [],
    note_tecniche: fields?.note_tecniche || '',
  }
}

function ReviewForm({ machines, fields, transcription, setTranscription, transcribing, audioBlob, error, user, onCancel, onSubmitted, haptic, toast }) {
  const [form, setForm] = useState(() => buildFormFromFields(fields))
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)

  // Auto-popola il form quando fields arrivano dopo l'apertura della review
  // (PR 3 Fase 0). Una volta toccato dall'utente, non si rehydrata più.
  const formTouchedRef = useRef(false)
  useEffect(() => {
    if (formTouchedRef.current) return
    setForm(buildFormFromFields(fields))
  }, [fields])

  const update = (patch) => {
    formTouchedRef.current = true
    setForm(prev => ({ ...prev, ...patch }))
  }

  const removeRicambio = (idx) => {
    formTouchedRef.current = true
    setForm(prev => ({
      ...prev,
      ricambi_potenziali: prev.ricambi_potenziali.filter((_, i) => i !== idx),
    }))
  }

  const handleSubmit = async () => {
    if (!form.summary.trim()) {
      toast.error('Aggiungi un titolo al ticket')
      return
    }
    setLoading(true)
    haptic.medium()
    try {
      const machineRow = form.machine_id ? machines.find(m => m.id === form.machine_id) : null
      const severity = form.priority ? (SEVERITY_TO_DB[form.priority] || 'media') : 'media'
      const type = form.category ? (CATEGORY_TO_TYPE[form.category] || 'correttiva') : 'correttiva'

      const payload = {
        title: form.summary.trim().slice(0, 200),
        description: (transcription || '').trim(),
        severity,
        status: form.auto_assegnazione ? 'in_lavorazione' : 'aperta',
        type,
        machine: machineRow?.name || fields?.machine_name || null,
        machine_id: form.machine_id || null,
        created_by: user.id,
        created_by_name: user.name,
        is_quick: false,
        media: media.length > 0 ? media : [],
        extra_data: {
          source: 'voice_tech',
          ai_priority: form.priority || null,
          ai_category: form.category || null,
          componente: form.componente || null,
          diagnosi_iniziale: form.diagnosi_iniziale || null,
          motivazione_priorita: form.motivazione_priorita || null,
          tipo_intervento: form.tipo_intervento || null,
          ricambi_potenziali: form.ricambi_potenziali,
          note_tecniche: form.note_tecniche || null,
          confidence: fields?.confidence ?? null,
        },
        ...(form.auto_assegnazione ? {
          assigned_to: user.id,
          assigned_to_name: user.name,
        } : {}),
      }

      const created = await db.createReport(payload)

      // Upload audio + comment voice_new_ticket (best effort)
      try {
        let audioUrl = null
        if (audioBlob) {
          audioUrl = await db.uploadVoiceAudio(audioBlob, created.id, user.id)
        }
        await db.addComment(created.id, {
          text: transcription || form.summary,
          user_id: user.id,
          user_name: user.name,
          user_role: user.role,
          kind: 'voice_new_ticket',
          extra_data: payload.extra_data,
          confidence: fields?.confidence ?? null,
          media: audioUrl ? [{ type: 'audio', url: audioUrl, name: 'voice-new-ticket.webm' }] : null,
        })
      } catch (e) {
        console.warn('[voice_new_ticket] audio/comment failed:', e?.message)
      }

      // Activity + notification (best effort, non bloccanti)
      db.addActivity(created.id, {
        type: 'voice_created',
        user_id: user.id,
        user_name: user.name,
        detail: `Ticket vocale (Tecnico): ${payload.title}${payload.machine ? ` · ${payload.machine}` : ''}`,
      }).catch(e => console.warn('[voice] addActivity failed:', e?.message))

      db.addNotification({
        type: 'new_report',
        title: `Nuovo ticket vocale (Tecnico): ${payload.title}`,
        body: `${user.name}${payload.machine ? ` — ${payload.machine}` : ''}`,
        report_id: created.id,
        from_user: user.id,
        target_user: null,
      }).catch(e => console.warn('[voice] addNotification failed:', e?.message))

      toast.success('Ticket creato')
      haptic.success?.()
      onSubmitted?.(created)
    } catch (err) {
      toast.error('Errore creazione: ' + (err?.message || 'riprova'))
      setLoading(false)
    }
  }

  return (
    <VoiceReviewShell
      title="Nuovo ticket vocale"
      transcription={transcription}
      setTranscription={setTranscription}
      transcribing={transcribing}
      error={error}
      loading={loading}
      onCancel={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Crea ticket"
      submitDisabled={!form.summary.trim()}
      confidence={fields?.confidence}
      media={media}
      setMedia={setMedia}
      mediaUploadPath={`voice-tickets/${user?.id || 'tech'}`}
    >
      {/* Titolo */}
      <Field label="Titolo ticket *">
        <input
          type="text"
          value={form.summary}
          onChange={(e) => update({ summary: e.target.value })}
          maxLength={200}
          placeholder="Es. Rumore anomalo pompa ricircolo pasteurizzatrice"
          style={inputStyle}
        />
      </Field>

      {/* Macchina */}
      <Field label="Macchina">
        <select
          value={form.machine_id}
          onChange={(e) => update({ machine_id: e.target.value })}
          style={inputStyle}
        >
          <option value="">— Seleziona macchina —</option>
          {machines.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}{m.serial_number ? ` · ${m.serial_number}` : ''}
            </option>
          ))}
        </select>
      </Field>

      {/* Componente */}
      <Field label="Componente">
        <input
          type="text"
          value={form.componente}
          onChange={(e) => update({ componente: e.target.value })}
          maxLength={100}
          placeholder="Es. pompa ricircolo, valvola DN65, cuscinetto…"
          style={inputStyle}
        />
      </Field>

      {/* Diagnosi iniziale */}
      <Field label="Diagnosi iniziale (opzionale)">
        <textarea
          value={form.diagnosi_iniziale}
          onChange={(e) => update({ diagnosi_iniziale: e.target.value })}
          rows={2}
          placeholder="Es. cuscinetto in degrado, sospetto inizio cedimento"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </Field>

      {/* Priorità + Categoria */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Priorità">
          <select
            value={form.priority}
            onChange={(e) => update({ priority: e.target.value })}
            style={inputStyle}
          >
            {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Categoria">
          <select
            value={form.category}
            onChange={(e) => update({ category: e.target.value })}
            style={inputStyle}
          >
            {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>

      {/* Motivazione priorità */}
      <Field label="Motivazione priorità">
        <input
          type="text"
          value={form.motivazione_priorita}
          onChange={(e) => update({ motivazione_priorita: e.target.value })}
          maxLength={200}
          placeholder="Es. blocca linea 1, perdita prodotto…"
          style={inputStyle}
        />
      </Field>

      {/* Tipo intervento */}
      <Field label="Tipo intervento">
        <select
          value={form.tipo_intervento}
          onChange={(e) => update({ tipo_intervento: e.target.value })}
          style={inputStyle}
        >
          {INTERVENTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {/* Ricambi potenziali */}
      {form.ricambi_potenziali.length > 0 && (
        <Field label="Ricambi potenziali">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {form.ricambi_potenziali.map((r, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 8,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                fontSize: 13, color: 'var(--color-text)',
              }}>
                {r}
                <button
                  type="button"
                  onClick={() => removeRicambio(i)}
                  aria-label={`Rimuovi ${r}`}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)', padding: 0, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </Field>
      )}

      {/* Note tecniche */}
      <Field label="Note tecniche">
        <textarea
          value={form.note_tecniche}
          onChange={(e) => update({ note_tecniche: e.target.value })}
          rows={2}
          placeholder="Note aggiuntive, raccomandazioni…"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
        />
      </Field>

      {/* Auto-assegnazione */}
      <Field label="">
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 12,
            background: form.auto_assegnazione ? 'rgba(124, 106, 255, 0.12)' : 'var(--color-surface-2)',
            border: form.auto_assegnazione ? '1px solid rgba(124, 106, 255, 0.4)' : '1px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'background 0.15s, border 0.15s',
          }}
        >
          <input
            type="checkbox"
            checked={form.auto_assegnazione}
            onChange={(e) => update({ auto_assegnazione: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
            Mi auto-assegno il ticket (status: in lavorazione)
          </span>
        </label>
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
      {label && (
        <label style={{
          display: 'block', fontSize: 13, fontWeight: 700,
          color: 'var(--color-text)', marginBottom: 6,
        }}>
          {label}
        </label>
      )}
      {children}
    </div>
  )
}
