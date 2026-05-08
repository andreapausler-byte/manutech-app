import { Package, UserCog, X } from 'lucide-react'
import { REQUEST_KIND } from '../../lib/constants'

/**
 * RequestKindChooser — bottom sheet per scegliere il tipo di richiesta esterna
 * da aprire dal ticket: ricambio (parte fisica) o intervento (fornitore esterno
 * che viene in azienda).
 *
 * Tappato il chooser, il chiamante apre il modale specifico via onPick(kind).
 */
export default function RequestKindChooser({ onClose, onPick }) {
  const items = [
    {
      kind: 'ricambio',
      icon: Package,
      title: 'Ricambio',
      desc: 'Parte fisica da ordinare al fornitore',
    },
    {
      kind: 'intervento',
      icon: UserCog,
      title: 'Intervento esterno',
      desc: 'Tecnico/fornitore che viene in azienda',
    },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 65,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'var(--color-bg)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 8px',
        }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
              Cosa ti serve per chiudere?
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
              Tracciamo la richiesta fino al completamento
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="press-scale"
            style={{
              width: 32, height: 32, borderRadius: 16,
              background: 'var(--color-surface-2)', border: 'none',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '8px 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(it => {
            const meta = REQUEST_KIND[it.kind]
            const Icon = it.icon
            return (
              <button
                key={it.kind}
                onClick={() => onPick(it.kind)}
                className="press-scale"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 14,
                  background: 'var(--color-surface-2)',
                  border: `1px solid var(--color-border)`,
                  textAlign: 'left', cursor: 'pointer', width: '100%',
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: meta.color + '22',
                  color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                    {it.title}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                    {it.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
