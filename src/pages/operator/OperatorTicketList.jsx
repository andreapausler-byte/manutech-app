import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import TicketCard from '../../components/operator/TicketCard'

const FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'open', label: 'Aperti' },
  { id: 'progress', label: 'In corso' },
]

export default function OperatorTicketList({ onOpenTicket, refreshKey = 0 }) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    db.getReports().then(list => {
      if (cancelled) return
      const mine = (list || []).filter(r => r.created_by === user?.id)
      mine.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      setReports(mine)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id, refreshKey])

  const filtered = useMemo(() => {
    if (filter === 'all') return reports
    if (filter === 'open') {
      return reports.filter(r => ['aperta', 'assegnata'].includes(r.status))
    }
    if (filter === 'progress') {
      return reports.filter(r => ['in_lavorazione', 'in_attesa_ricambi'].includes(r.status))
    }
    return reports
  }, [reports, filter])

  return (
    <div className="op-screen">
      <div className="op-statusbar">
        <span className="op-mono">I MIEI TICKET</span>
        <span className="op-mono">{reports.length}</span>
      </div>
      <h1 className="op-header-name">Ticket</h1>

      <div className="op-filters" role="tablist" aria-label="Filtri ticket">
        {FILTERS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`op-filter ${filter === f.id ? 'op-filter--active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div className="op-mono" style={{ color: 'var(--op-text-muted)', padding: 20 }}>Caricamento…</div>}
        {!loading && filtered.length === 0 && (
          <div className="op-mono" style={{ color: 'var(--op-text-muted)', padding: 20, textAlign: 'center' }}>
            Nessun ticket in questa vista
          </div>
        )}
        {!loading && filtered.map(r => (
          <TicketCard key={r.id} report={r} onClick={onOpenTicket} />
        ))}
      </div>
    </div>
  )
}
