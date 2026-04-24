import { useEffect, useMemo, useState } from 'react'
import { Mic } from 'lucide-react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import TicketCard from '../../components/operator/TicketCard'

function nowHHMM() {
  const d = new Date()
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

// Deriva un "turno" A/B/C dall'ora: A 6-14, B 14-22, C 22-6
function currentShift() {
  const h = new Date().getHours()
  if (h >= 6 && h < 14) return 'A'
  if (h >= 14 && h < 22) return 'B'
  return 'C'
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function isSameWeek(d, now) {
  const diff = (now - d) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 7
}

export default function OperatorHome({ onStartRecording, onOpenTicket, onOpenList, disabled }) {
  const { user } = useAuth()
  const [clock, setClock] = useState(nowHHMM())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setClock(nowHHMM()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    db.getReports().then(list => {
      if (cancelled) return
      const mine = (list || []).filter(r => r.created_by === user?.id)
      setReports(mine)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id])

  const { assignedToMe, openedToday, closedThisWeek, inProgress } = useMemo(() => {
    const now = new Date()
    const open = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi']
    const closed = ['risolta', 'chiuso']

    const assignedToMe = reports.filter(r => r.assigned_to === user?.id && open.includes(r.status)).length
    const openedToday = reports.filter(r => {
      if (!r.created_at) return false
      return isSameDay(new Date(r.created_at), now)
    }).length
    const closedThisWeek = reports.filter(r => {
      if (!closed.includes(r.status)) return false
      const d = new Date(r.closed_at || r.updated_at || r.created_at)
      return isSameWeek(d, now)
    }).length

    const inProgress = reports
      .filter(r => open.includes(r.status))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 2)

    return { assignedToMe, openedToday, closedThisWeek, inProgress }
  }, [reports, user?.id])

  const shift = currentShift()

  return (
    <div className="op-screen">
      <div className="op-statusbar">
        <span className="op-mono">{clock}</span>
        <span className="op-mono">TURNO {shift}</span>
      </div>

      <h1 className="op-header-name">{user?.name || 'Operatore'}</h1>
      <span className="op-header-shift op-mono">● IN SERVIZIO</span>

      <div className="op-counters" role="list" aria-label="Riepilogo ticket">
        <div className="op-counter" role="listitem">
          <span className="op-counter__n">{assignedToMe}</span>
          <span className="op-counter__label">Assegnati<br/>a me</span>
        </div>
        <div className="op-counter" role="listitem">
          <span className="op-counter__n">{openedToday}</span>
          <span className="op-counter__label">Aperti<br/>oggi</span>
        </div>
        <div className="op-counter" role="listitem">
          <span className="op-counter__n">{closedThisWeek}</span>
          <span className="op-counter__label">Chiusi<br/>sett.</span>
        </div>
      </div>

      <div className="op-rec-wrap">
        <button
          type="button"
          className="op-rec-btn"
          onPointerDown={(e) => { e.preventDefault(); if (!disabled) onStartRecording?.() }}
          disabled={disabled}
          aria-label="Tieni premuto per segnalare un problema vocale"
        >
          <Mic size={56} strokeWidth={1.8} />
        </button>
        <span className="op-rec-label">Tieni premuto<br/>per segnalare</span>
      </div>

      <div className="op-section-title">
        <span>In corso</span>
        <button className="op-link" onClick={onOpenList}>Vedi tutti →</button>
      </div>
      <div className="op-preview-list">
        {loading && <div className="op-preview op-mono" style={{ color: 'var(--op-text-muted)' }}>Caricamento…</div>}
        {!loading && inProgress.length === 0 && (
          <div className="op-preview op-mono" style={{ color: 'var(--op-text-muted)' }}>
            Nessun ticket in corso
          </div>
        )}
        {!loading && inProgress.map(r => (
          <TicketCard key={r.id} report={r} onClick={onOpenTicket} />
        ))}
      </div>
    </div>
  )
}
