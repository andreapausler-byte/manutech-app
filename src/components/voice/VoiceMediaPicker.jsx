import { useState } from 'react'
import { Camera, Image as ImageIcon, FileText, X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

/**
 * VoiceMediaPicker — picker condiviso per allegare foto/file a un flow vocale.
 *
 * Apre la fotocamera (mobile) o il file picker per immagini/documenti.
 * Carica subito ogni file in Supabase Storage (bucket `attachments`)
 * e mostra una griglia preview con bottone × per rimuovere.
 *
 * Il consumer riceve `media` aggiornato come array `[{type, url, name}]`
 * compatibile con `reports.media` e `comments.media` JSONB.
 *
 * Props:
 *   media         — array { type: 'photo'|'document', url, name }
 *   setMedia      — setter
 *   uploadPath    — prefisso path in storage (es. 'voice-tickets/<userId>')
 *   disabled      — disabilita upload (es. durante submit finale)
 *   compact       — variante più piccola per slot ristretti
 */
export default function VoiceMediaPicker({
  media = [],
  setMedia,
  uploadPath = 'voice-attachments',
  disabled = false,
  compact = false,
}) {
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

  const pick = (kind) => {
    if (disabled || uploading) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (kind === 'camera') {
      input.accept = 'image/*'
      input.capture = 'environment'
    } else if (kind === 'gallery') {
      input.accept = 'image/*'
    } else {
      input.accept = '.pdf,.doc,.docx,image/*'
    }
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return
      setUploading(true)
      const uploaded = []
      for (const file of files) {
        try {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `${uploadPath}/${Date.now()}-${safe}`
          const url = await db.uploadFile('attachments', path, file)
          uploaded.push({
            type: file.type.startsWith('image/') ? 'photo' : 'document',
            name: file.name,
            url,
          })
        } catch (err) {
          console.warn('[VoiceMediaPicker] upload failed:', err?.message)
          toast.error(`Errore upload "${file.name}"`)
        }
      }
      if (uploaded.length > 0) {
        setMedia([...(media || []), ...uploaded])
        haptic.light()
      }
      setUploading(false)
    }
    input.click()
  }

  const remove = (idx) => {
    if (disabled) return
    setMedia(media.filter((_, i) => i !== idx))
    haptic.light()
  }

  const btnSize = compact ? 12 : 14
  const btnPad = compact ? '8px 10px' : '12px 14px'
  const btnFont = compact ? 12 : 13

  return (
    <div>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 700,
        color: 'var(--color-text)', marginBottom: 8,
      }}>
        Foto e allegati
      </label>

      <div style={{ display: 'flex', gap: 8, marginBottom: media.length > 0 || uploading ? 12 : 0 }}>
        <button
          type="button"
          onClick={() => pick('camera')}
          disabled={disabled || uploading}
          className="press-scale"
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: btnPad, borderRadius: 10,
            background: 'rgba(34, 197, 94, 0.10)',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            color: '#22c55e',
            fontSize: btnFont, fontWeight: 700,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            opacity: disabled || uploading ? 0.4 : 1,
          }}
        >
          <Camera size={btnSize + 2} /> Foto
        </button>
        <button
          type="button"
          onClick={() => pick('gallery')}
          disabled={disabled || uploading}
          className="press-scale"
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: btnPad, borderRadius: 10,
            background: 'rgba(124, 106, 255, 0.10)',
            border: '1px solid rgba(124, 106, 255, 0.35)',
            color: 'var(--color-primary, #7c6aff)',
            fontSize: btnFont, fontWeight: 700,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
            opacity: disabled || uploading ? 0.4 : 1,
          }}
        >
          <ImageIcon size={btnSize + 2} /> Galleria
        </button>
      </div>

      {uploading && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '8px 0', fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid rgba(124, 106, 255, 0.3)',
            borderTopColor: 'var(--color-primary, #7c6aff)',
            animation: 'spin 1s linear infinite',
          }} />
          Caricamento...
        </div>
      )}

      {media.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {media.map((m, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 10,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {m.type === 'photo' ? (
                  <img src={m.url} alt={m.name || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 4 }}>
                    <FileText size={20} style={{ color: 'var(--color-primary, #7c6aff)' }} />
                    <span style={{
                      display: 'block', fontSize: 8, marginTop: 2,
                      color: 'var(--color-text-muted)',
                      maxWidth: 56, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{m.name}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label={`Rimuovi ${m.name || 'allegato'}`}
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#ef4444', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <X size={12} style={{ color: '#fff' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
