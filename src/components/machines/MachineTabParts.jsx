/**
 * MachineTabParts — I pezzi ricorrenti dei tab della scheda macchina
 *
 * Intestazione di sezione e riga d'azione a piena larghezza: tornano in
 * tutti i tab con le stesse misure, e tenerle qui evita che si
 * allontanino una dall'altra. Per lo stato vuoto si usa `EmptyState` di
 * `components/ui`.
 *
 * Misure guanti: le righe d'azione sono da 68px, mai un link testuale.
 *
 * `CategorySheet` sta qui e non nel tab Doc da cui viene: la stessa
 * domanda ("in che cartella?") la fa ora anche il tab Pezzi, e due copie
 * della lista cartelle sarebbero due liste che divergono.
 */

import { X } from 'lucide-react'
import { FIELD_DOC_CATEGORIES } from '../../lib/machineDocCategories'
import { padX } from './machineTabs'

export function TabHeading({ children }) {
  return (
    <p
      className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint"
      style={{ padding: '4vw 4vw 2.5vw' }}
    >
      {children}
    </p>
  )
}

// Lo stato vuoto condiviso (`components/ui`) non ha margini laterali —
// senza cornice il titolo tocca i bordi dello schermo.
export function TabEmptyFrame({ children }) {
  return <div style={{ ...padX, paddingTop: '10vw' }}>{children}</div>
}

export function TabActionRow({ icon: Icon, label, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      className="w-full h-[68px] flex items-center justify-center gap-2.5 border-t border-b active:bg-surface-3 transition-colors"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-border-subtle)',
        color: tone || 'var(--color-primary)',
      }}
    >
      {Icon && <Icon size={20} strokeWidth={2} />}
      <span className="font-mono text-[12px] uppercase tracking-wider">{label}</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// CategorySheet — "in che cartella?" prima di aprire il picker
// ──────────────────────────────────────────────────────────────
export function CategorySheet({ onPick, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-category-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl animate-slide-up safe-area-bottom"
        style={{ maxHeight: '80vh', overflowY: 'auto', paddingBottom: '6vw' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-[3vw]" style={{ ...padX, paddingTop: '4vw', paddingBottom: '3vw' }}>
          <h3 id="doc-category-title" className="flex-1 text-xl font-bold text-themed">In che cartella?</h3>
          <button
            onClick={onClose}
            aria-label="Annulla"
            className="w-[56px] h-[56px] rounded-2xl bg-surface-2 flex items-center justify-center shrink-0 active:bg-surface-3"
          >
            <X size={22} className="text-muted" />
          </button>
        </div>

        {FIELD_DOC_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => onPick(cat.id)}
            className="w-full flex items-center gap-[3vw] border-t text-left active:bg-surface-2 transition-colors"
            style={{ ...padX, minHeight: 68, borderColor: 'var(--color-border-subtle)' }}
          >
            <span className="flex-1 min-w-0" style={{ paddingTop: '2.5vw', paddingBottom: '2.5vw' }}>
              <span className="block text-[18px] font-medium text-themed">{cat.label}</span>
              <span className="block font-mono text-[11px] text-faint truncate" style={{ marginTop: 4 }}>
                {cat.desc}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
