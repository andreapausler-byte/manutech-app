import { useMemo, useRef, useState } from 'react'
import { Camera, X, Calendar as CalendarIcon, MapPin, Clock, Send } from 'lucide-react'
import { db } from '../../lib/supabase'
import { SPARE_URGENCY, SUPPLIER_SPECIALTIES } from '../../lib/constants'
import {
  URGENCY_TO_SEVERITY,
  defaultsForOrigin,
  quickDateChips,
  toDatetimeLocalString,
  buildDescriptionPrefill,
  buildReportPhotoSnapshot,
} from '../../lib/interventions'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

/**
 * InterventionForm — form puro per creazione/edit intervento.
 *
 * Sprint 1a-bis: il form ora supporta
 *   - chips quick-pick per scheduled_start_at + scheduled_end_at (B1 multi-day)
 *   - validazione inline end > start
 *   - foto snapshot dal report di origine (read-only) separate dalle nuove
 *   - description prefill strutturata da report.title + report.description
 *
 * Componente AGNOSTICO sulla shell. Al submit chiama `onSubmit(payload, ctx)`
 * con il payload pronto per `db.createIntervention`. La shell decide cosa
 * fare dopo (createIntervention, addComment, close modal, switch sidebar mode).
 *
 * Step 3b (prossimo) aggiungerà i picker enriched per supervised_by e
 * assigned_to. Per ora i campi non sono esposti in UI (vengono dai defaults
 * della shell).
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

  // ── State base ────────────────────────────────────────────────────────
  const [title, setTitle] = useState(defaults.title || '')
  const [notes, setNotes] = useState(
    defaults.description !== undefined
      ? defaults.description
      : (report ? buildDescriptionPrefill(report) : '')
  )
  const [specialty, setSpecialty] = useState(defaults.extra_data?.specialty || '')
  const [urgency, setUrgency] = useState(defaults.urgency || defaults.extra_data?.urgency || 'media')
  const [location, setLocation] = useState(defaults.location || report?.machine || '')

  // ── Schedule (start + end, ognuno con chips) ──────────────────────────
  const startChipsList = useMemo(() => quickDateChips(), [])
  const endChipsList = useMemo(() => quickDateChips(), [])

  const initialStart = toDatetimeLocalString(defaults.scheduled_start_at)
  const initialEnd = toDatetimeLocalString(defaults.scheduled_end_at)

  const [scheduledStart, setScheduledStart] = useState(initialStart)
  const [scheduledEnd, setScheduledEnd] = useState(initialEnd)
  const [startChipKey, setStartChipKey] = useState(initialStart ? 'custom' : null)
  const [endChipKey, setEndChipKey] = useState(initialEnd ? 'custom' : null)

  // ── Foto: snapshot del report (read-only) + nuove (uploader) ──────────
  // Snapshot iniziale da report.media: items con flag {from_report:true}
  // copiati in interventions.media al submit. Sono indipendenti dal report
  // (decisions doc §D1, variante 1d-snapshot).
  const [reportPhotos] = useState(() => buildReportPhotoSnapshot(report))
  const [newPhotos, setNewPhotos] = useState(() => {
    // defaults.media può contenere foto già presenti (edit mode) — filtra
    // via quelle marcate from_report (sono in reportPhotos invece)
    const media = Array.isArray(defaults.media) ? defaults.media : []
    return media.filter(m => !m?.from_report)
  })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // ── Validazione ──────────────────────────────────────────────────────
  const endError = useMemo(() => {
    if (!scheduledEnd || !scheduledStart) return null
    const s = new Date(scheduledStart)
    const e = new Date(scheduledEnd)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
    if (e.getTime() <= s.getTime()) {
      return "L'ora di fine deve essere successiva all'ora di inizio"
    }
    return null
  }, [scheduledStart, scheduledEnd])

  const isValid = title.trim().length > 0 && !endError

  // ── Handlers chips ───────────────────────────────────────────────────
  const handleStartChip = (chip) => {
    setStartChipKey(chip.key)
    if (chip.key === 'custom') return // mostra input nativo, no auto-fill
    setScheduledStart(toDatetimeLocalString(chip.value))
  }
  const handleEndChip = (chip) => {
    setEndChipKey(chip.key)
    if (chip.key === 'custom') return
    setScheduledEnd(toDatetimeLocalString(chip.value))
  }

  // ── Foto handler ─────────────────────────────────────────────────────
  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const additions = []
      for (const f of files) {
        const { file: compressed } = await compress(f)
        const reportId = report?.id || 'manual'
        const path = `spare-orders/${reportId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const url = await db.uploadFile('attachments', path, compressed)
        additions.push({ url, name: f.name, type: 'photo' })
      }
      setNewPhotos(prev => [...prev, ...additions])
      haptic.light?.()
    } catch (err) {
      toast.error('Errore upload foto: ' + (err?.message || ''))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeNewPhoto = (idx) => {
    setNewPhotos(p => p.filter((_, i) => i !== idx))
    haptic.light?.()
  }

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!isValid || submitting) return
    haptic.medium?.()

    const inherited = defaultsForOrigin({
      origin: defaults.origin || (report ? 'report' : 'manuale'),
      report,
    })
    const mappedSeverity = URGENCY_TO_SEVERITY[urgency] || inherited.severity

    const scheduledStartISO = scheduledStart ? new Date(scheduledStart).toISOString() : null
    const scheduledEndISO = scheduledEnd ? new Date(scheduledEnd).toISOString() : null

    // Calcola durata: priorità a (end - start) se entrambi presenti.
    let estimatedDurationMin = null
    if (scheduledStartISO && scheduledEndISO) {
      const diffMs = new Date(scheduledEndISO) - new Date(scheduledStartISO)
      if (diffMs > 0) estimatedDurationMin = Math.round(diffMs / 60000)
    }

    const payload = {
      type: defaults.type || inherited.type,
      severity: defaults.severity || mappedSeverity,
      status: scheduledStartISO ? 'pianificato' : 'bozza',
      title: title.trim().slice(0, 200),
      description: notes.trim() || '',
      machine_id: defaults.machine_id ?? report?.machine_id ?? null,
      machine_name: defaults.machine_name ?? report?.machine ?? null,
      report_id: defaults.report_id ?? report?.id ?? null,
      maintenance_plan_id: defaults.maintenance_plan_id ?? null,
      origin: defaults.origin || (report ? 'report' : 'manuale'),
      scheduled_start_at: scheduledStartISO,
      scheduled_end_at: scheduledEndISO,
      estimated_duration_min: estimatedDurationMin,
      location: location.trim() || null,
      // Merge foto: prima lo snapshot dal report (preservato), poi le nuove
      media: [...reportPhotos, ...newPhotos],
      extra_data: {
        ...(defaults.extra_data || {}),
        specialty: specialty || null,
        urgency,
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

        {/* Foto della segnalazione — snapshot read-only (sezione visibile solo se ci sono) */}
        {reportPhotos.length > 0 && (
          <>
            <FieldLabel>
              Foto della segnalazione
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}> · {reportPhotos.length}</span>
            </FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {reportPhotos.map((p, i) => (
                <div key={`r-${i}`} style={{
                  position: 'relative', width: 72, height: 72,
                  borderRadius: 12, overflow: 'hidden',
                  border: '1px solid var(--color-border)',
                }}>
                  <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{
                    position: 'absolute', bottom: 3, left: 3, right: 3,
                    padding: '1px 4px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.75)', color: '#facc15',
                    fontSize: 8, fontWeight: 800, letterSpacing: 0.4,
                    textAlign: 'center', textTransform: 'uppercase',
                  }}>dal report</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Foto intervento — uploader normale */}
        <FieldLabel>
          Foto intervento
          <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}> · opzionali</span>
        </FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {newPhotos.map((p, i) => (
            <div key={`n-${i}`} style={{
              position: 'relative', width: 72, height: 72,
              borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--color-border)',
            }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button onClick={() => removeNewPhoto(i)} aria-label="Rimuovi foto"
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

        {/* Note (description prefill da report se context.report) */}
        <FieldLabel>Note</FieldLabel>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={4} maxLength={2000}
          placeholder="Descrivi il problema, contesto, vincoli (es. orari, certificazioni richieste)..."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
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

        {/* Schedule INIZIO con chips + input nativo (custom) */}
        <FieldLabel>
          <CalendarIcon size={11} style={{ display: 'inline', marginRight: 4 }} />
          Inizio
        </FieldLabel>
        <ChipRow chips={startChipsList} selectedKey={startChipKey} onPick={handleStartChip} />
        {(startChipKey === 'custom' || initialStart) && (
          <input
            type="datetime-local"
            value={scheduledStart}
            onChange={e => { setScheduledStart(e.target.value); setStartChipKey('custom') }}
            style={{ ...inputStyle, marginTop: 6, marginBottom: 14 }}
          />
        )}
        {startChipKey !== 'custom' && !initialStart && (
          <div style={{ height: 14 }} />
        )}

        {/* Schedule FINE con chips + input nativo (opzionale) */}
        <FieldLabel>
          <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
          Fine <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· opzionale, per interventi che durano più ore/giorni</span>
        </FieldLabel>
        <ChipRow chips={endChipsList} selectedKey={endChipKey} onPick={handleEndChip} />
        {(endChipKey === 'custom' || initialEnd) && (
          <input
            type="datetime-local"
            value={scheduledEnd}
            onChange={e => { setScheduledEnd(e.target.value); setEndChipKey('custom') }}
            style={{ ...inputStyle, marginTop: 6, marginBottom: endError ? 4 : 14, borderColor: endError ? '#ef4444' : undefined }}
          />
        )}
        {endError && (
          <p style={{
            fontSize: 11, color: '#ef4444',
            margin: '0 0 14px',
            fontWeight: 600,
          }}>
            ⚠ {endError}
          </p>
        )}
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
        {!isValid && !endError && (
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

// Riga di chip date con stato selezionato
function ChipRow({ chips, selectedKey, onPick }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6,
      marginBottom: 0,
    }}>
      {chips.map(chip => {
        const active = selectedKey === chip.key
        return (
          <button key={chip.key} onClick={() => onPick(chip)} className="press-scale"
            style={{
              padding: '7px 11px', borderRadius: 999,
              background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
              color: active ? '#fff' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: chip.key === 'custom' ? 'inherit' : '"JetBrains Mono", monospace',
            }}>
            {chip.label}
          </button>
        )
      })}
    </div>
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
