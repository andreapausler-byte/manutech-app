/**
 * ClosureDocsPicker — allegare alla chiusura i documenti dell'intervento.
 *
 * Il foglio firmato dalla ditta esterna, la fattura, un DDT: PDF o foto.
 * Prima si sceglie cosa è (decide dove finisce: il foglio va anche nella
 * cartella della macchina, la fattura resta sul ticket), poi il file. Sul
 * telefono il tasto apre fotocamera o file; sul desktop il PDF arrivato per
 * email si può anche trascinare sul riquadro.
 *
 * I file si caricano subito, come le foto del pezzo: il salvataggio del
 * foglio o del modulo resta un tocco. Chi chiama riceve
 * [{ kind, type, url, name }]; autore e data li mette useClosureEdit.
 *
 * Solo CSS vars: compare sia nel dettaglio mobile sia nel modal admin.
 */
import { useState } from 'react'
import { Paperclip, X, Loader2, FileText, Image as ImageIcon } from 'lucide-react'
import { db } from '../../lib/supabase'
import { CLOSURE_DOC_KINDS, closureDocLabel } from '../../lib/closure'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

// Un PDF scansionato a 600 dpi supera facilmente i 20 MB: meglio dirlo
// subito che lasciar girare un upload che sulla rete di stabilimento non
// arriverà mai.
const MAX_BYTES = 20 * 1024 * 1024

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')

function pickFiles() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'application/pdf,image/*'
    input.onchange = e => resolve(Array.from(e.target.files || []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export default function ClosureDocsPicker({ reportId, docs, onChange, defaultKind = 'foglio' }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress } = useImageCompressor()
  const [kind, setKind] = useState(defaultKind)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const upload = async (files) => {
    if (uploading || !files.length) return
    setUploading(true)
    const added = []
    for (const file of files) {
      const pdf = isPdf(file)
      if (!pdf && !file.type.startsWith('image/')) {
        toast.error(`${file.name}: carica un PDF o una foto`)
        continue
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: troppo grande (max 20 MB)`)
        continue
      }
      try {
        // Una foto del foglio compressa a 1920 px resta leggibile e pesa
        // un decimo; i PDF partono come sono.
        const toUpload = pdf ? file : (await compress(file)).file
        const path = `reports/${reportId}/doc-${kind}-${Date.now()}`
        const url = await db.uploadFile('attachments', path, toUpload)
        added.push({ kind, type: pdf ? 'pdf' : 'photo', url, name: file.name || closureDocLabel(kind) })
      } catch (err) {
        toast.error(`${file.name}: non caricato (${err?.message || 'riprova'})`)
      }
    }
    if (added.length) {
      onChange([...docs, ...added])
      haptic.success()
    }
    setUploading(false)
  }

  const pick = async () => {
    if (uploading) return
    haptic.light()
    upload(await pickFiles())
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    upload(Array.from(e.dataTransfer?.files || []))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div role="radiogroup" aria-label="Tipo di documento" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(CLOSURE_DOC_KINDS).map(([id, k]) => {
          const active = kind === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(id)}
              className="press-scale"
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${active ? k.color : 'var(--color-border)'}`,
                background: active ? `${k.color}22` : 'transparent',
                color: active ? k.color : 'var(--color-text-secondary)',
              }}
            >
              {k.label}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={pick}
        disabled={uploading}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="press-scale"
        style={{
          minHeight: 48, padding: '10px 14px', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          border: `1px dashed ${dragOver ? CLOSURE_DOC_KINDS[kind].color : 'var(--color-border)'}`,
          background: dragOver ? `${CLOSURE_DOC_KINDS[kind].color}14` : 'transparent',
          color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600,
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        {uploading ? 'Carico…' : `Allega ${closureDocLabel(kind).toLowerCase()} · PDF o foto`}
      </button>

      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => {
            const Icon = d.type === 'pdf' ? FileText : ImageIcon
            return (
              <div key={d.url} style={{
                display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                padding: '7px 8px 7px 10px', borderRadius: 8,
                border: '1px solid var(--color-border)',
              }}>
                <Icon size={15} style={{ color: CLOSURE_DOC_KINDS[d.kind]?.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: CLOSURE_DOC_KINDS[d.kind]?.color, flexShrink: 0 }}>
                  {closureDocLabel(d.kind)}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12, color: 'var(--color-text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {d.name}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(docs.filter(x => x.url !== d.url))}
                  aria-label={`Togli ${d.name}`}
                  style={{
                    width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
