/**
 * LogAttachmentsPicker — foto e PDF dentro un intervento registrato.
 *
 * Chiudendo una manutenzione programmata, o registrando un intervento sul
 * pezzo, il tecnico allega la foto del filtro cambiato o il foglio della
 * ditta. Sul telefono due tasti: Scatta apre subito la fotocamera (con i
 * guanti un passaggio in meno conta), "Foto o PDF" apre la scelta del file.
 * Sul desktop un riquadro solo, su cui si può anche trascinare il PDF
 * arrivato per email.
 *
 * I file si caricano subito, come in ClosureDocsPicker: il salvataggio
 * resta un tocco. La lista è [{ type: 'photo' | 'pdf', url, name }] e va
 * così com'è a `createMaintenanceLog({ media })`. `onChange` riceve una
 * funzione (prev => next), come un setState: un upload lento non resuscita
 * l'allegato tolto nel frattempo. Mentre carica `onBusyChange(true)`, così
 * il tasto Registra aspetta.
 *
 * Solo CSS vars: compare nei fogli mobile e nei modali admin.
 */
import { useState } from 'react'
import { Paperclip, Camera, X, Loader2, FileText } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

// Stesso tetto dei documenti di chiusura: un PDF scansionato a 600 dpi
// sulla rete di stabilimento non arriva.
const MAX_BYTES = 20 * 1024 * 1024

const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')

function pickFiles({ camera = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    if (camera) {
      input.accept = 'image/*'
      input.capture = 'environment'
    } else {
      input.multiple = true
      input.accept = 'application/pdf,image/*'
    }
    input.onchange = e => resolve(Array.from(e.target.files || []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export default function LogAttachmentsPicker({ machineId, media, onChange, onBusyChange, mobile = false }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const setBusy = (v) => { setUploading(v); onBusyChange?.(v) }

  const upload = async (files) => {
    if (uploading || !files.length) return
    setBusy(true)
    const added = []
    for (const file of files) {
      const pdf = isPdfFile(file)
      if (!pdf && !file.type.startsWith('image/')) {
        toast.error(`${file.name}: carica un PDF o una foto`)
        continue
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: troppo grande (max 20 MB)`)
        continue
      }
      try {
        const toUpload = pdf ? file : (await compress(file)).file
        const path = `maintenance/${machineId || 'senza-macchina'}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const url = await db.uploadFile('attachments', path, toUpload)
        added.push({ type: pdf ? 'pdf' : 'photo', url, name: file.name || (pdf ? 'Documento.pdf' : 'Foto') })
      } catch (err) {
        toast.error(`${file.name}: non caricato (${err?.message || 'riprova'})`)
      }
    }
    if (added.length) {
      onChange(prev => [...prev, ...added])
      haptic.success()
    }
    setBusy(false)
  }

  const pick = async (opts) => {
    if (uploading) return
    haptic.light()
    upload(await pickFiles(opts))
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    upload(Array.from(e.dataTransfer?.files || []))
  }

  const height = mobile ? 56 : 44
  const baseButton = {
    minHeight: height, padding: '10px 14px', borderRadius: mobile ? 14 : 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontSize: mobile ? 15 : 13, fontWeight: 600,
    cursor: uploading ? 'wait' : 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {mobile && (
          <button
            type="button"
            onClick={() => pick({ camera: true })}
            disabled={uploading}
            className="press-scale"
            style={{
              ...baseButton, flex: 1,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
            }}
          >
            <Camera size={18} /> Scatta
          </button>
        )}
        <button
          type="button"
          onClick={() => pick()}
          disabled={uploading}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="press-scale"
          style={{
            ...baseButton, flex: mobile ? 1 : undefined, width: mobile ? undefined : '100%',
            border: `1px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
            background: dragOver ? 'var(--color-surface-2)' : 'transparent',
            color: 'var(--color-text-secondary)',
          }}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          {uploading ? 'Carico…' : (mobile ? 'Foto o PDF' : 'Allega foto o PDF · anche trascinando')}
        </button>
      </div>

      {media.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {media.map(m => {
            const photo = m.type !== 'pdf'
            return (
              <div key={m.url} style={{
                position: 'relative', width: 72, height: 72, borderRadius: 12, flexShrink: 0,
                border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                {photo ? (
                  <img src={m.url} alt={m.name || 'Foto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <>
                    <FileText size={20} style={{ color: 'var(--color-red)' }} />
                    <span style={{
                      fontSize: 9, color: 'var(--color-text-muted)', maxWidth: 62,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {m.name}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onChange(prev => prev.filter(x => x.url !== m.url))}
                  aria-label={`Togli ${m.name || 'allegato'}`}
                  style={{
                    position: 'absolute', top: 3, right: 3,
                    width: 24, height: 24, borderRadius: 12,
                    background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={13} style={{ color: '#fff' }} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
