/**
 * ClosurePhotoPicker — la foto del pezzo smontato, dentro la chiusura.
 *
 * Mesi dopo, "cuscinetto grippato" con la foto vale dieci volte il testo.
 * Le foto si caricano subito (compresse, con miniatura) e il foglio le
 * consegna al salvataggio: finiscono in `reports.media` con il flag
 * `closure`, e da lì nella galleria della macchina sotto il pezzo.
 *
 * Facoltativa sempre: chiudere senza foto resta un tocco.
 */
import { useState } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = e => resolve(e.target.files?.[0] || null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export default function ClosurePhotoPicker({ reportId, photos, onChange }) {
  const toast = useToast()
  const haptic = useHaptic()
  const { compress, makeThumbnail } = useImageCompressor()
  const [uploading, setUploading] = useState(false)

  const add = async () => {
    if (uploading) return
    haptic.light()
    const file = await pickPhoto()
    if (!file) return
    setUploading(true)
    try {
      const { file: small } = await compress(file)
      const stamp = `reports/${reportId}/closure-${Date.now()}`
      const url = await db.uploadFile('attachments', stamp, small)
      let thumbUrl = null
      try {
        const thumb = await makeThumbnail(small)
        if (thumb) thumbUrl = await db.uploadFile('attachments', `${stamp}-thumb`, thumb)
      } catch { /* la miniatura è facoltativa */ }
      onChange([...photos, {
        type: 'photo', url, thumb_url: thumbUrl,
        name: file.name || 'Foto del pezzo', closure: true,
      }])
      haptic.success()
    } catch (err) {
      toast.error('Foto non caricata: ' + (err?.message || 'riprova'))
    }
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {photos.map((p, i) => (
        <div key={p.url} style={{ position: 'relative', width: 56, height: 56 }}>
          <img src={p.thumb_url || p.url} alt={`Foto del pezzo ${i + 1}`}
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--color-border)' }} />
          <button
            type="button"
            onClick={() => onChange(photos.filter(x => x.url !== p.url))}
            aria-label="Togli la foto"
            style={{
              position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
              background: '#111827', border: '1px solid var(--color-border)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={uploading}
        className="press-scale"
        style={{
          height: 56, padding: '0 14px', borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px dashed var(--color-border)', background: 'transparent',
          color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 600,
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        {uploading ? 'Carico…' : photos.length ? 'Un\'altra' : 'Scatta il pezzo'}
      </button>
    </div>
  )
}
