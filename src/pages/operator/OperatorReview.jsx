import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceMediaPicker from '../../components/voice/VoiceMediaPicker'

const PRIORITY_OPTIONS = [
  { value: '', label: '— Priorità —' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'bassa', label: 'Bassa' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: '— Categoria —' },
  { value: 'guasto', label: 'Guasto' },
  { value: 'manutenzione', label: 'Manutenzione' },
  { value: 'anomalia', label: 'Anomalia' },
  { value: 'altro', label: 'Altro' },
]

function buildFormFromFields(fields) {
  return {
    summary: fields?.summary || '',
    machine_id: fields?.machine_id || '',
    priority: fields?.priority || '',
    category: fields?.category || '',
    area: fields?.area || '',
  }
}

export default function OperatorReview({
  machines,
  fields,
  transcription,
  transcribing = false,
  error,
  onSubmit,
  onCancel,
}) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [form, setForm] = useState(() => buildFormFromFields(fields))
  const [text, setText] = useState(transcription || '')
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)

  // PR 3 Fase 0: la review si apre subito, transcription/fields arrivano
  // dopo dal background. Auto-popoliamo form/text se l'utente non ha
  // ancora toccato. Una volta toccati, niente rehydrate.
  const formTouchedRef = useRef(false)
  const textTouchedRef = useRef(false)

  useEffect(() => {
    if (formTouchedRef.current) return
    setForm(buildFormFromFields(fields))
  }, [fields])

  useEffect(() => {
    if (textTouchedRef.current) return
    if (transcription) setText(transcription)
  }, [transcription])

  const update = (patch) => {
    formTouchedRef.current = true
    setForm(prev => ({ ...prev, ...patch }))
  }

  const handleSubmit = async () => {
    if (!form.summary.trim()) {
      toast.error('Aggiungi un titolo al ticket')
      return
    }
    setLoading(true)
    haptic.medium()
    try {
      await onSubmit({
        finalFields: {
          machine_id: form.machine_id || null,
          machine_name: machines.find(m => m.id === form.machine_id)?.name || null,
          priority: form.priority || null,
          category: form.category || null,
          area: form.area.trim() || null,
          summary: form.summary.trim(),
        },
        finalText: text.trim(),
        finalMedia: media,
        user,
      })
      toast.success('Ticket inviato')
    } catch (err) {
      toast.error('Errore invio: ' + (err?.message || 'riprova'))
      setLoading(false)
    }
  }

  return (
    <div className="op-screen" aria-live="polite">
      <button className="op-back" onClick={onCancel} aria-label="Torna indietro">← ANNULLA</button>

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {transcribing ? (
          <span className="op-badge" role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Trascrivendo audio…
          </span>
        ) : (
          <span className="op-badge" role="status">
            <span className="op-badge__dot" aria-hidden="true" />
            {transcription ? 'AI Whisper · Trascritto' : 'Compilazione manuale'}
          </span>
        )}
      </div>

      {error && <div className="op-info" role="status">{error}</div>}

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-transcript">Trascrizione</label>
        <textarea
          id="op-transcript"
          className="op-review-textarea"
          value={text}
          onChange={(e) => { textTouchedRef.current = true; setText(e.target.value) }}
          placeholder={transcribing ? 'In attesa della trascrizione…' : 'Descrivi il problema…'}
          aria-label="Trascrizione audio"
        />
      </div>

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-summary">Titolo ticket</label>
        <input
          id="op-summary"
          className="op-input"
          type="text"
          value={form.summary}
          onChange={(e) => update({ summary: e.target.value })}
          maxLength={120}
          placeholder="Es. Perdita olio pompa CIP"
        />
      </div>

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-machine">Macchina</label>
        <select
          id="op-machine"
          className="op-select"
          value={form.machine_id}
          onChange={(e) => update({ machine_id: e.target.value })}
        >
          <option value="">— Seleziona macchina —</option>
          {machines.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}{m.serial_number ? ` · ${m.serial_number}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-priority">Priorità</label>
        <select
          id="op-priority"
          className="op-select"
          value={form.priority}
          onChange={(e) => update({ priority: e.target.value })}
        >
          {PRIORITY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-category">Categoria</label>
        <select
          id="op-category"
          className="op-select"
          value={form.category}
          onChange={(e) => update({ category: e.target.value })}
        >
          {CATEGORY_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="op-field">
        <label className="op-field__label" htmlFor="op-area">Area / Reparto</label>
        <input
          id="op-area"
          className="op-input"
          type="text"
          value={form.area}
          onChange={(e) => update({ area: e.target.value })}
          maxLength={80}
          placeholder="Es. Linea 2, imbottigliamento"
        />
      </div>

      <div className="op-field">
        <VoiceMediaPicker
          media={media}
          setMedia={setMedia}
          uploadPath={`voice-tickets/${user?.id || 'op'}`}
          disabled={loading}
        />
      </div>

      <div className="op-action-row">
        <button
          type="button"
          className="op-btn op-btn--ghost"
          onClick={onCancel}
          disabled={loading}
        >
          Annulla
        </button>
        <button
          type="button"
          className="op-btn op-btn--primary"
          onClick={handleSubmit}
          disabled={loading || !form.summary.trim()}
        >
          {loading ? 'Invio…' : 'Invia ticket →'}
        </button>
      </div>
    </div>
  )
}
