/**
 * LogAttachmentsList — le foto e i PDF di un intervento, nello storico.
 *
 * Le foto come miniature, i documenti come righe con il nome del file; il
 * tocco apre l'originale (il PDF nel visore del telefono o in una scheda
 * del browser). Senza allegati non rende niente.
 *
 * Con `mobile` i bersagli sono da guanti (56px); senza, compatti per le
 * tabelle e le schede admin.
 *
 * Solo CSS vars: compare nello storico mobile e nelle viste admin.
 */
import { FileText } from 'lucide-react'
import { isPdfMedia, isPhotoMedia, logMediaList } from '../../lib/logMedia'

export default function LogAttachmentsList({ log, mobile = false, style }) {
  const media = logMediaList(log)
  if (media.length === 0) return null

  const photos = media.filter(isPhotoMedia)
  const files = media.filter(m => !isPhotoMedia(m))
  const thumb = mobile ? 56 : 40

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', ...style }}>
      {photos.map(m => (
        <a
          key={m.url}
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="press-scale"
          title={m.name || 'Foto'}
          style={{
            width: thumb, height: thumb, borderRadius: mobile ? 10 : 8, flexShrink: 0,
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
      ))}
      {files.map(m => (
        <a
          key={m.url}
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="press-scale"
          style={{
            minHeight: thumb, maxWidth: '100%', minWidth: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: mobile ? '0 12px' : '0 10px', borderRadius: mobile ? 10 : 8,
            border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
            color: 'var(--color-text-secondary)', textDecoration: 'none',
            fontSize: mobile ? 13 : 12, fontWeight: 600,
          }}
        >
          <FileText size={mobile ? 16 : 14} style={{ color: isPdfMedia(m) ? 'var(--color-red)' : 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ minWidth: 0, maxWidth: mobile ? '60vw' : 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.name || 'Documento'}
          </span>
        </a>
      ))}
    </div>
  )
}
