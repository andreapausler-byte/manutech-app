import { useState, useRef } from 'react'
import { Camera, X, Calendar, MapPin, Clock, Send } from 'lucide-react'
import { db } from '../../lib/supabase'
import { SPARE_URGENCY, SUPPLIER_SPECIALTIES } from '../../lib/constants'
import { URGENCY_TO_SEVERITY, defaultsForOrigin } from '../../lib/interventions'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

/**
 * InterventionForm — form puro per creazione/edit intervento.
 *
 * Componente AGNOSTICO sulla shell: rendering del form, validazione, upload
 * foto interno; al submit chiama `onSubmit(payload)` con un payload pronto
 * per `db.createIntervention`. La shell decide cosa fare dopo (creare in DB,
 * chiudere modal, cambiare modalità sidebar, scrivere comment tracking, …).
 *
 * Shell wrapper:
 *   - InterventionRequestModal     (mobile + admin ReportDetail, fullscreen)
 *   - InterventionRequestSidePanel (calendario admin, sidebar destra)
 *
 * Props
 *   defaults: oggetto valori iniziali dei campi. Tutti opzionali.
 *     { title, description (notes), type, severity, machine_id, machine_name,
 *       report_id, maintenance_plan_id, origin, scheduled_start_at,
 *       scheduled_end_at, estimated_duration_min, location, media, extra_data,
 *       urgency (UI only, mappa a severity al submit) }
 *   context.report: opzionale, usato in fase di ereditarietà type/severity
 *     (defaultsForOrigin) e per uploadFile path. In Step 3 verrà anche usato
 *     per foto snapshot e description prefill.
 *   submitting: boolean, la shell forza disabled del bottone durante l'invio.
 *   submitButtonLabel: stringa, default "Pianifica intervento".
 *   onSubmit(payload, formContext): callback con il payload pronto.
 *   onCancel(): callback chiusura (la shell decide cosa fare).
 *
 * NOTE: questo Step 1 conserva la UX esistente (urgency picker, datetime-local
 * tradizionale, sezione foto singola). Le upgrade (chips, picker enriched,
 * foto snapshot, description prefill, supervised_by, end < start validation)
 * arrivano in Step 3.
 */
export default function InterventionForm({
  defaults = {},
  context = {},
  submitting = false,
  submitButtonLabel = 'Pianifica intervento',
  onSubmit,
  onCancel,
}) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor({ maxWidth: 1600, quality: 0.82 })

  const report = context.report || null

  const [title, setTitle] = useState(defaults.title || '')
  const [notes, setNotes] = useState(defaults.description || '')
  const [specialty, setSpecialty] = useState(defaults.extra_data?.specialty || '')
  const [urgency, setUrgency] = useState(defaults.urgency || defaults.extra_data?.urgency || 'media')
  const [location, setLocation] = useState(defaults.location || report?.machine || '')
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocalValue(defaults.scheduled_start_at))
  const [durationH, setDurationH] = useState(
    defaults.estimated_duration_min ? String(defaults.estimated_duration_min / 60) : ''
  )
  const [photos, setPhotos] = useState(Array.isArray(defaults.media) ? defaults.media : [])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const isValid = title.trim().length > 0

  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const newPhotos = []
      for (const f of files) {
        const { file: compressed } = await compress(f)
        const reportId = report?.id || 'manual'
        const path = `spare-orders/${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const url = await db.uploadFile('attachments', path, compressed)
        newPhotos.push({ url, name: f.name, type: 'photo' })
      }
      setPhotos(prev => [...prev, ...newPhotos])
      haptic.light?.()
    } catch (err) {
      toast.error('Errore upload foto: ' + (err?.message || ''))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = (idx) => {
    setPhotos(p => p.filter((_, i) => i !== idx))
    haptic.light?.()
  }

  const handleSubmit = () => {
    if (!isValid || submitting) return
    haptic.medium?.()

    // Ereditarietà type/severity dal report (se origin='report' nei defaults).
    const inherited = defaultsForOrigin({
      origin: defaults.origin || (report ? 'report' : 'manuale'),
      report,
    })
    const mappedSeverity = URGENCY_TO_SEVERITY[urgency] || inherited.severity

    const scheduledISO = scheduledAt ? new Date(scheduledAt).toISOString() : null
    const durationMin = durationH ? Math.round(parseFloat(durationH) * 60) : null

    const payload = {
      type: defaults.type || inherited.type,
      severity: defaults.severity || mappedSeverity,
      status: scheduledISO ? 'pianificato' : 'bozza',
      title: title.trim().slice(0, 200),
      description: notes.trim() || '',
      machine_id: defaults.machine_id ?? report?.machine_id ?? null,
      machine_name: defaults.machine_name ?? report?.machine ?? null,
      report_id: defaults.report_id ?? report?.id ?? null,
      maintenance_plan_id: defaults.maintenance_plan_id ?? null,
      origin: defaults.origin || (report ? 'report' : 'manuale'),
      scheduled_start_at: scheduledISO,
      scheduled_end_at: defaults.scheduled_end_at || null,
      estimated_duration_min: durationMin,
      location: location.trim() || null,
      media: photos,
      extra_data: {
        ...(defaults.extra_data || {}),
        specialty: specialty || null,
        urgency, // valore originale UI per audit
      },
    }

    onSubmit?.(payload, { urgency, specialty })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Titolo */}
        <FieldLabel required>Cosa serve</FieldLabel>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Es. Intervento elettricista, controllo perdita olio..."
          style={inputStyle}
        />

        {/* Specialty chips */}
        <FieldLabel>Specialità richiesta</FieldLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 6, marginBottom: 14,
        }}>
          {Object.entries(SUPPLIER_SPECIALTIES).map(([key, opt]) => {
            const active = specialty === key
            return (
              <button key={key} onClick={() => setSpecialty(active ? '' : key)} className="press-scale"
                style={{
                  padding: '8px 6px', borderRadius: 10,
                  background: active ? opt.color + '1f' : 'var(--color-surface-2)',
                  border: `1px solid ${active ? opt.color : 'var(--color-border)'}`,
                  color: active ? opt.color : 'var(--color-text-secondary)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                <span>{opt.icon}</span> {opt.label}
              </button>
            )
          })}
        </div>

        {/* Foto contesto */}
        <FieldLabel>Foto del contesto <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· opzionali</span></FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {photos.map((p, i) => (
            <div key={i} style={{
              position: 'relative', width: 72, height: 72,
              borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--color-border)',
            }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removePhoto(i)} aria-label="Rimuovi foto"
                style={{
                  position: 'absolute', top: 3, right: 3,
                  width: 22, height: 22, borderRadius: 11,
                  background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="press-scale" aria-label="Aggiungi foto"
            style={{
              width: 72, height: 72, borderRadius: 12,
              background: 'var(--color-surface-2)',
              border: '2px dashed var(--color-border)',
              color: 'var(--color-text-secondary)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              cursor: uploading ? 'wait' : 'pointer',
            }}>
            <Camera size={20} />
            <span style={{ fontSize: 9, fontWeight: 600 }}>{uploading ? '...' : 'Aggiungi'}</span>
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple
          onChange={handlePickPhotos} style={{ display: 'none' }} />

        {/* Note */}
        <FieldLabel>Note</FieldLabel>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={3} maxLength={1000}
          placeholder="Descrivi il problema, contesto, vincoli (es. orari, certificazioni richieste)..."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 86, fontFamily: 'inherit' }}
        />

        {/* Location */}
        <FieldLabel>Dove</FieldLabel>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <MapPin size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            value={location} onChange={e => setLocation(e.target.value)}
            maxLength={200}
            placeholder="Es. Linea 3, sala compressori, KEG-Filler..."
            style={{ ...inputStyle, paddingLeft: 36, marginBottom: 0 }}
          />
        </div>

        {/* Urgenza */}
        <FieldLabel>Urgenza</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 14 }}>
          {Object.entries(SPARE_URGENCY).map(([key, opt]) => {
            const active = urgency === key
            return (
              <button key={key} onClick={() => setUrgency(key)} className="press-scale"
                style={{
                  padding: '9px 4px', borderRadius: 10,
                  background: active ? opt.bg : 'var(--color-surface-2)',
                  border: `1px solid ${active ? opt.color : 'var(--color-border)'}`,
                  color: active ? opt.color : 'var(--color-text-secondary)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Schedule */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <div>
            <FieldLabel><Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />Data desiderata</FieldLabel>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0 }}
            />
          </div>
          <div>
            <FieldLabel><Clock size={11} style={{ display: 'inline', marginRight: 4 }} />Durata (h)</FieldLabel>
            <input
              type="number" min="0" step="0.5"
              value={durationH}
              onChange={e => setDurationH(e.target.value)}
              placeholder="es. 2"
              style={{ ...inputStyle, marginBottom: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div style={{
        flexShrink: 0,
        padding: '12px 16px env(safe-area-inset-bottom, 12px)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}>
        <button onClick={handleSubmit} disabled={!isValid || submitting} className="press-scale"
          style={{
            width: '100%', padding: 14,
            background: isValid && !submitting ? 'var(--color-primary)' : 'var(--color-surface-2)',
            color: isValid && !submitting ? '#fff' : 'var(--color-text-secondary)',
            border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
          }}>
          <Send size={16} />
          {submitting ? 'Pianificazione…' : submitButtonLabel}
        </button>
        {!isValid && (
          <p style={{
            fontSize: 11, color: 'var(--color-text-secondary)',
            textAlign: 'center', margin: '6px 0 0', fontStyle: 'italic',
          }}>
            Inserisci una breve descrizione di cosa serve
          </p>
        )}
        {onCancel && (
          <button onClick={onCancel} className="press-scale"
            style={{
              width: '100%', padding: 10, marginTop: 8,
              background: 'transparent', border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
            Annulla
          </button>
        )}
      </div>
    </div>
  )
}

// `datetime-local` vuole il formato "YYYY-MM-DDTHH:MM" in LOCAL time, no Z.
// Se defaults.scheduled_start_at è un ISO string UTC, lo converte.
function toDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-text)',
  fontSize: 14,
  outline: 'none',
  marginBottom: 14,
  boxSizing: 'border-box',
}

function FieldLabel({ children, required }) {
  return (
    <label style={{
      display: 'block', fontSize: 13, fontWeight: 700,
      color: 'var(--color-text)', marginBottom: 6,
    }}>
      {children}{required && <span style={{ color: '#ef4444' }}> *</span>}
    </label>
  )
}
