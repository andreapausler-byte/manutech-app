import { useEffect, useState, useRef } from 'react'
import { ChevronLeft, Camera, Mic, X, Plus, Minus, Send } from 'lucide-react'
import { db } from '../../lib/supabase'
import { SPARE_URGENCY } from '../../lib/constants'
import { useVoiceCapture } from '../../hooks/useVoiceCapture'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VoiceRecorder from '../voice/VoiceRecorder'

/**
 * SpareRequestModal — Form richiesta ricambio del Tecnico.
 *
 * Filosofia: massima resa col minimo sforzo. Il tecnico fa una foto della
 * targhetta, scrive un titolo breve, opzionalmente note, e invia. L'admin
 * elabora la richiesta dalla pagina Ricambi.
 *
 * Voice opzionale: tasto "Detta" in header pre-compila i campi (articolo,
 * quantità, urgenza, note) sfruttando useVoiceCapture context=tech_spare_request.
 */
export default function SpareRequestModal({ report, user, onClose, onApplied }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor({ maxWidth: 1600, quality: 0.82 })

  const [photos, setPhotos] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [urgency, setUrgency] = useState('media')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

  const voice = useVoiceCapture({
    context: 'tech_spare_request',
    contextPayload: {
      ticket_id: report.id,
      ticket_title: report.title,
      machine_name: report.machine,
    },
    defaultFields: {
      articolo: '', quantita: 1, fornitore: null,
      urgenza: 'media', deadline_giorni: null, note: null, confidence: 0,
    },
  })

  // Quando il flusso vocale arriva a 'review', popola i campi e torna al form.
  useEffect(() => {
    if (voice.state === 'review' && voice.fields) {
      const f = voice.fields
      if (f.articolo) setTitle(f.articolo)
      if (f.quantita) setQuantity(Math.max(1, parseInt(f.quantita, 10) || 1))
      if (f.urgenza && SPARE_URGENCY[f.urgenza]) setUrgency(f.urgenza)
      if (f.note) setNotes(prev => prev ? `${prev}\n${f.note}` : f.note)
      if (voice.error) toast.error(voice.error)
      else toast.success('Compilato dalla voce, controlla e conferma')
      voice.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state])

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

  const isValid = title.trim().length > 0 && photos.length > 0

  const handleSubmit = async () => {
    if (!isValid || submitting) return
    setSubmitting(true)
    haptic.medium?.()
    try {
      // 1. Crea ordine in stato 'richiesto'
      const order = await db.createSparePartOrder({
        spare_part_id: null,
        spare_part_name: title.trim().slice(0, 200),
        report_id: report.id,
        machine_id: report.machine_id || null,
        component_id: null,
        quantity: quantity || 1,
        unit_cost: 0,
        supplier: null,
        supplier_id: null,
        status: 'richiesto',
        notes: notes.trim() || null,
        urgency,
        images: photos,
        requested_by: user.id,
        ordered_by: user.id,
      })

      // 2. Sposta il report in 'in_attesa_ricambi' se non già terminale
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
            detail: `Richiesta ricambio: ${title} x${quantity}`,
          }).catch(e => console.warn('[spare] activity status failed:', e?.message))

          const recipients = new Set()
          if (report.created_by) recipients.add(report.created_by)
          if (report.assigned_to) recipients.add(report.assigned_to)
          recipients.delete(user.id)
          for (const targetId of recipients) {
            db.addNotification({
              type: 'status_change',
              title: `In attesa ricambi: ${report.title}`,
              body: `${user.name} ha richiesto ${title} x${quantity}`,
              report_id: report.id,
              from_user: user.id,
              target_user: targetId,
            }).catch(e => console.warn('[spare] notif failed:', e?.message))
          }
        } catch (e) {
          console.warn('[spare] updateReport failed:', e?.message)
        }
      }

      // 3. Activity sul ticket
      db.addActivity(report.id, {
        type: 'spare_requested',
        user_id: user.id,
        user_name: user.name,
        detail: `Richiesta ricambio: ${title} x${quantity} (${urgency})`,
      }).catch(e => console.warn('[spare] activity failed:', e?.message))

      // 4. Comment per tracking in chat con foto allegate
      const commentText = `Richiesta ricambio: ${title} x${quantity} — urgenza: ${urgency}`
      await db.addComment(report.id, {
        text: commentText,
        user_id: user.id,
        user_name: user.name,
        user_role: user.role,
        kind: 'spare_request',
        extra_data: {
          order_id: order?.id || null,
          articolo: title.trim(),
          quantita: quantity,
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

  // Schermata fullscreen registrazione vocale
  if (voice.state === 'recording' || voice.state === 'transcribing') {
    return (
      <VoiceRecorder
        state={voice.state}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stopRecording}
        onCancel={voice.cancelRecording}
        title="Detta richiesta ricambio"
        hint="Articolo, quantità, urgenza, note. Le foto si scattano dopo."
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 14px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <button onClick={onClose} className="press-scale" aria-label="Chiudi"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 4,
          }}>
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Richiesta ricambio
          </p>
          <p style={{
            fontSize: 11, margin: 0, color: 'var(--color-text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {report.title}
          </p>
        </div>
        {voice.supportsMediaRecorder && (
          <button onClick={voice.startRecording} className="press-scale" aria-label="Detta tutto"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(124,106,255,0.12)',
              border: '1px solid rgba(124,106,255,0.35)',
              color: '#a78bfa',
              padding: '8px 12px', borderRadius: 999,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
            <Mic size={14} /> Detta
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Foto */}
        <FieldLabel required>
          Foto <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)' }}>· la 1ª = targhetta</span>
        </FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {photos.map((p, i) => (
            <div key={i} style={{
              position: 'relative', width: 86, height: 86,
              borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--color-border)',
            }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {i === 0 && (
                <span style={{
                  position: 'absolute', bottom: 3, left: 3, right: 3,
                  fontSize: 8, fontWeight: 800, letterSpacing: 0.5,
                  background: 'rgba(0,0,0,0.75)', color: '#f59e0b',
                  padding: '2px 4px', borderRadius: 4, textAlign: 'center',
                }}>
                  TARGHETTA
                </span>
              )}
              <button onClick={() => removePhoto(i)} aria-label="Rimuovi foto"
                style={{
                  position: 'absolute', top: 3, right: 3,
                  width: 22, height: 22, borderRadius: 11,
                  background: 'rgba(0,0,0,0.7)', border: 'none',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={14} />
              </button>
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="press-scale" aria-label="Aggiungi foto"
            style={{
              width: 86, height: 86, borderRadius: 12,
              background: 'var(--color-surface-2)',
              border: '2px dashed var(--color-border)',
              color: 'var(--color-text-secondary)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              cursor: uploading ? 'wait' : 'pointer',
            }}>
            <Camera size={22} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{uploading ? '...' : photos.length === 0 ? 'Scatta' : 'Aggiungi'}</span>
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple
          onChange={handlePickPhotos} style={{ display: 'none' }} />

        {/* Titolo */}
        <FieldLabel required>Titolo</FieldLabel>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Es. Tubo lancia schiumatura, cuscinetto SKF..."
          style={inputStyle}
        />

        {/* Note */}
        <FieldLabel>Note</FieldLabel>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={3} maxLength={1000}
          placeholder="Tutto ciò che può servire all'admin: posizione, alternative, codice se non leggibile in foto…"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 86, fontFamily: 'inherit' }}
        />

        {/* Quantità + Urgenza */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <FieldLabel>Quantità</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="press-scale"
                style={qtyBtnStyle} aria-label="Diminuisci">
                <Minus size={16} />
              </button>
              <span style={{
                minWidth: 32, textAlign: 'center',
                fontSize: 18, fontWeight: 700, color: 'var(--color-text)',
                fontFamily: 'JetBrains Mono, monospace',
              }}>{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="press-scale"
                style={qtyBtnStyle} aria-label="Aumenta">
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div>
            <FieldLabel>Urgenza</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
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
          </div>
        </div>
      </div>

      {/* ── Footer submit ── */}
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
            {photos.length === 0 ? 'Aggiungi almeno una foto' : 'Inserisci il titolo'}
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

const qtyBtnStyle = {
  width: 38, height: 38, borderRadius: 10,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
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
