/**
 * MachineTabParts — I pezzi ricorrenti dei tab della scheda macchina
 *
 * Intestazione di sezione e riga d'azione a piena larghezza: tornano in
 * tutti e cinque i tab con le stesse misure, e tenerle qui evita che si
 * allontanino una dall'altra. Per lo stato vuoto si usa `EmptyState` di
 * `components/ui`.
 *
 * Misure guanti: le righe d'azione sono da 68px, mai un link testuale.
 */

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
