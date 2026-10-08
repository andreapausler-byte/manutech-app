/**
 * LogAttachmentsList — le foto e i PDF di un intervento.
 *
 * Le foto come miniature, i documenti come righe con il nome del file; il
 * tocco apre l'originale (il PDF nel visore del telefono o in una scheda
 * del browser). Senza allegati non rende niente.
 *
 * Con `mobile` i bersagli sono da guanti (56px); senza, compatti per le
 * tabelle e le schede admin. `large` è per la scheda dell'intervento, dove
 * gli allegati sono il contenuto e non un accenno.
 *
 * Con `onRemove` ogni allegato che `canRemove(item)` permette ha la sua X:
 * si toglie dopo una conferma, in cronologia resta.
 *
 * Il tocco su un allegato non arriva alla riga che lo contiene: nello
 * storico la riga apre la scheda, l'allegato apre il file.
 *
 * Solo CSS vars: compare nello storico mobile e nelle viste admin.
 */
import { FileText, X } from 'lucide-react'
import { isPdfMedia, isPhotoMedia, logMediaList } from '../../lib/logMedia'

const stop = (e) => e.stopPropagation()

function RemoveButton({ item, onRemove, overlay, size }) {
  const remove = (e) => {
    e.stopPropagation()
    if (!confirm(`Togliere "${item.name || 'questo allegato'}" dall'intervento?\n\nIn cronologia resta che c'era.`)) return
    onRemove(item)
  }
  return (
    <button
      type="button"
      onClick={remove}
      aria-label={`Togli ${item.name || 'allegato'}`}
      title="Togli dall'intervento"
      style={overlay ? {
        position: 'absolute', top: 3, right: 3, width: size, height: size, borderRadius: size / 2,
        background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      } : {
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--color-text-faint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <X size={overlay ? 13 : 14} style={overlay ? { color: '#fff' } : undefined} />
    </button>
  )
}

export default function LogAttachmentsList({ log, mobile = false, large = false, onRemove, canRemove, style }) {
  const media = logMediaList(log)
  if (media.length === 0) return null

  const photos = media.filter(isPhotoMedia)
  const files = media.filter(m => !isPhotoMedia(m))
  const thumb = large ? (mobile ? 76 : 64) : (mobile ? 56 : 40)
  const removable = (m) => !!onRemove && (!canRemove || canRemove(m))
  const xSize = mobile ? 28 : 24

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', ...style }}>
      {photos.map(m => (
        <div key={m.url} style={{ position: 'relative', flexShrink: 0 }}>
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            className="press-scale"
            title={m.name || 'Foto'}
            style={{
              display: 'block', width: thumb, height: thumb, borderRadius: mobile ? 10 : 8,
              overflow: 'hidden', border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
            }}
          >
            <img
              src={m.thumb_url || m.url}
              alt={m.name || 'Foto'}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </a>
          {removable(m) && <RemoveButton item={m} onRemove={onRemove} overlay size={xSize - 4} />}
        </div>
      ))}
      {files.map(m => (
        <div key={m.url} style={{
          display: 'flex', alignItems: 'center', maxWidth: '100%', minWidth: 0,
          borderRadius: mobile ? 10 : 8,
          border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
        }}>
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            className="press-scale"
            style={{
              minHeight: thumb > 56 ? 56 : thumb, minWidth: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: mobile ? '0 12px' : '0 10px',
              color: 'var(--color-text-secondary)', textDecoration: 'none',
              fontSize: mobile ? 13 : 12, fontWeight: 600,
            }}
          >
            <FileText size={mobile ? 16 : 14} style={{ color: isPdfMedia(m) ? 'var(--color-red)' : 'var(--color-text-muted)', flexShrink: 0 }} />
            <span style={{ minWidth: 0, maxWidth: mobile ? '55vw' : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.name || 'Documento'}
            </span>
          </a>
          {removable(m) && <RemoveButton item={m} onRemove={onRemove} size={xSize} />}
        </div>
      ))}
    </div>
  )
}
