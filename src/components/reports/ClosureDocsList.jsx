/**
 * ClosureDocsList — i documenti dell'intervento, dentro la chiusura.
 *
 * Una riga per documento: cosa è, il nome del file, chi l'ha allegato e
 * quando. Il tocco lo apre (il PDF nel visore del telefono o in una scheda
 * del browser). Le fatture non le vede chi non integra le chiusure (vedi
 * `visibleClosureDocs`); toglie un documento chi l'ha allegato, o un admin.
 *
 * Solo CSS vars: compare sia nel dettaglio mobile sia nel modal admin.
 */
import { FileText, Image as ImageIcon, X } from 'lucide-react'
import { timeAgo } from '../../lib/constants'
import { getClosure, visibleClosureDocs, canRemoveClosureDoc, closureDocLabel, CLOSURE_DOC_KINDS } from '../../lib/closure'

export default function ClosureDocsList({ report, user, onRemove, busy = false, style }) {
  const docs = visibleClosureDocs(getClosure(report).docs, user)
  if (docs.length === 0) return null

  const remove = (doc) => {
    if (!confirm(`Togliere "${doc.name}" dalla chiusura?\n\nIn cronologia resta che c'era.`)) return
    onRemove?.(doc)
  }

  return (
    <div style={style}>
      <div style={{
        fontSize: 10, color: 'var(--color-text-faint)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>
        Documenti · {docs.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {docs.map(d => {
          const Icon = d.type === 'pdf' ? FileText : ImageIcon
          const color = (CLOSURE_DOC_KINDS[d.kind] || CLOSURE_DOC_KINDS.altro).color
          return (
            <div key={d.url} style={{
              display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
              borderRadius: 8, border: '1px solid var(--color-border)',
            }}>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="press-scale"
                style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', textDecoration: 'none', color: 'inherit',
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: `${color}1f`, color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>
                    {closureDocLabel(d.kind)}
                  </span>
                  <span style={{
                    display: 'block', fontSize: 11, color: 'var(--color-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {d.name} · {d.user_name || 'Utente'} · {timeAgo(d.created_at)}
                  </span>
                </span>
              </a>
              {onRemove && canRemoveClosureDoc(d, user) && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={busy}
                  aria-label={`Togli ${d.name}`}
                  title="Togli dalla chiusura"
                  style={{
                    width: 32, height: 32, marginRight: 4, borderRadius: 8, flexShrink: 0,
                    background: 'transparent', border: 'none', cursor: busy ? 'wait' : 'pointer',
                    color: 'var(--color-text-faint)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
