import { useState, useRef } from 'react'
import { ChevronLeft, Camera, X, Send, Calendar, MapPin, Clock } from 'lucide-react'
import { db } from '../../lib/supabase'
import { SPARE_URGENCY, SUPPLIER_SPECIALTIES } from '../../lib/constants'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

/**
 * InterventionRequestModal — il tecnico richiede un intervento esterno.
 *
 * A differenza del ricambio, l'intervento ha:
 *   - specialty (chip elettrico/meccanico/...) per matching fornitori
 *   - location (dove avviene l'intervento, es. "linea 3")
 *   - scheduled_at opzionale (data/ora desiderata)
 *   - duration_h opzionale (stima durata)
 *
 * Foto opzionali (utili a contestualizzare il problema), titolo e note libere.
 */
export default function InterventionRequestModal({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor({ maxWidth: 1600, quality: 0.82 })

  const [photos, setPhotos] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [urgency, setUrgency] = useState('media')
  const [location, setLocation] = useState(report?.machine || '')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationH, setDurationH] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const newPhotos = []
      for (const f of files) {
        const { file: compressed } = await compress(f)
        const path = `spare-orders/${report.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
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

  const isValid = title.trim().length > 0

  const handleSubmit = async () => {
    if (!isValid || submitting) return
    setSubmitting(true)
    haptic.medium?.()
    try {
      const order = await db.createSparePartOrder({
        kind: 'intervento',
        spare_part_id: null,
        spare_part_name: title.trim().slice(0, 200),
        report_id: report.id,
        machine_id: report.machine_id || null,
        component_id: null,
        quantity: 1,
        unit_cost: 0,
        supplier: null,
        supplier_id: null,
        status: 'richiesto',
        notes: notes.trim() || null,
        urgency,
        specialty: specialty || null,
        location: location.trim() || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        duration_h: durationH ? parseFloat(durationH) : null,
        images: photos,
        requested_by: user.id,
        ordered_by: user.id,
      })

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
            detail: `Richiesta intervento: ${title}`,
            spare_order_id: order?.id || null,
          }).catch(() => {})

          const recipients = new Set()
          if (report.created_by) recipients.add(report.created_by)
          if (report.assigned_to) recipients.add(report.assigned_to)
          recipients.delete(user.id)
          for (const targetId of recipients) {
            db.addNotification({
              type: 'status_change',
              title: `In attesa intervento: ${report.title}`,
              body: `${user.name} ha richiesto: ${title}`,
              report_id: report.id,
              from_user: user.id,
              target_user: targetId,
            }).catch(() => {})
          }
        } catch (e) {
          console.warn('[intervento] updateReport failed:', e?.message)
        }
      }

      // Activity sul ticket + sulla richiesta
      db.addActivity(report.id, {
        type: 'intervention_requested',
        user_id: user.id,
        user_name: user.name,
        detail: `Richiesta intervento: ${title}${specialty ? ` (${specialty})` : ''}`,
        spare_order_id: order?.id || null,
      }).catch(() => {})

      // Comment di tracking nella chat ticket
      const commentText = `🛠️ Intervento richiesto: ${title}${specialty ? ` · ${specialty}` : ''} — urgenza: ${urgency}`
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'spare_request',
        extra_data: {
          order_id: order?.id || null,
          kind: 'intervento',
          articolo: title.trim(),
          specialty,
          urgenza: urgency,
          note: notes.trim() || null,
        },
        media: photos.length > 0 ? photos : null,
      })

      toast.success('Richiesta inviata · in attesa elaborazione')
      haptic.success?.()
      onApplied?.(updatedReport)
    } catch (err) {
      toast.error('Errore: ' + (err?.message || 'riprova'))
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 14px', borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={onClose} className="press-scale" aria-label="Chiudi"
          style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Richiesta intervento
          </p>
          <p style={{
            fontSize: 11, margin: 0, color: 'var(--color-text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {report.title}
          </p>
        </div>
      </div>

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

        {/* Foto contesto (opzionali) */}
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

        {/* Schedule (opzionali) */}
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
          {submitting ? 'Invio…' : 'Invia richiesta'}
        </button>
        {!isValid && (
          <p style={{
            fontSize: 11, color: 'var(--color-text-secondary)',
            textAlign: 'center', margin: '6px 0 0', fontStyle: 'italic',
          }}>
            Inserisci una breve descrizione di cosa serve
          </p>
        )}
      </div>
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
