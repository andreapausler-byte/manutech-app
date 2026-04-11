/**
 * StatusBar — Barra di stato inferiore per AdminLayout
 *
 * Mostra informazioni di sistema in tempo reale:
 *  - Stato connessione (navigator.onLine via useOnlineStatus)
 *  - Ora corrente (update ogni 30s)
 *  - Nome utente attivo
 *
 * Altezza fissa 32px, sticky in fondo al content area.
 */
import { useState, useEffect } from 'react'
import { Circle, Clock, Wifi, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function StatusBar({ userName, userRole }) {
  const { isOnline } = useOnlineStatus()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  const statusColor = isOnline ? 'var(--color-success)' : 'var(--color-danger)'
  const statusLabel = isOnline ? 'Online' : 'Offline'

  return (
    <footer
      className="h-8 flex items-center justify-between px-6 text-[11px] shrink-0"
      style={{
        background: '#101419',
        borderTop: '1px solid var(--color-sidebar-border)',
        color: 'var(--color-text-muted)',
      }}
      aria-label="Barra di stato"
    >
      <div className="flex items-center gap-2">
        <Circle
          size={8}
          fill={statusColor}
          color={statusColor}
          className={isOnline ? 'animate-pulse' : ''}
        />
        <span style={{ color: 'var(--color-text-secondary)' }}>
          {statusLabel} · {userName || 'Ospite'}
          {userRole && <span className="ml-1 opacity-60">({userRole})</span>}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          <Clock size={11} />
          <span>{dateStr} · {timeStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{isOnline ? 'Rete OK' : 'Nessuna rete'}</span>
        </div>
      </div>
    </footer>
  )
}
