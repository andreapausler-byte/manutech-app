import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, ChevronRight, X, MessageCircle } from 'lucide-react'

// ── Status Chip — Design System ──
function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.aperta
  return (
    <span style={{
      fontSize: 13, padding: '4px 10px', borderRadius: 6, fontWeight: 600,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>
      {s.icon} {s.label}
    </span>
  )
}

// ── Priority Chip — Design System ──
function PriorityChip({ severity }) {
  const sv = SEVERITY[severity] || SEVERITY.media
  return (
    <span style={{ fontSize: 14, color: sv.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      ● {sv.label}
    </span>
  )
}

export default function ReportsList({ user, onSelectReport, unreadByReport = {} }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await db.getReports(filterStatus ? { status: filterStatus } : {}); setReports(data) } catch {}
    setLoading(false)
  }, [filterStatus])

  const handleRefresh = useCallback(async () => {
    const data = await db.getReports(filterStatus ? { status: filterStatus } : {})
    setReports(data)
  }, [filterStatus])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)

  useEffect(() => { load() }, [load])

  const filtered = reports.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.title?.toLowerCase().includes(q) || r.machine?.toLowerCase().includes(q)
  })

  return (
    <div ref={pullRef} className="px-[4vw] pt-0 pb-4 space-y-[3vw]">
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />
      {/* Search */}
      <div className="relative">
        <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          placeholder="Cerca..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: '10px 36px 10px 36px', fontSize: 14,
            color: 'var(--color-text)', outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 12, background: 'var(--color-surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters — 2x2 */}
      <div className="grid grid-cols-2 gap-[2.5vw]">
        <button
          onClick={() => setFilterStatus('')}
          className={`py-[3vw] rounded-2xl text-base font-bold text-center transition-all press-scale ${
            !filterStatus ? 'text-white' : 'btn-chip'
          }`}
          style={!filterStatus ? { background: '#7c6aff' } : {}}
        >
          Tutte ({reports.length})
        </button>
        {Object.entries(STATUS).filter(([k]) => k !== 'assegnata').map(([key, { label, color }]) => {
          const count = reports.filter(r => r.status === key).length
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              className={`py-[3vw] rounded-2xl text-base font-bold text-center transition-all press-scale ${
                filterStatus === key ? 'text-white' : 'btn-chip'
              }`}
              style={filterStatus === key ? { background: color } : {}}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {/* Reports */}
      {loading ? <SkeletonReportsPage /> : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione" subtitle="Tocca + per crearne una" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(report => {
            const severity = SEVERITY[report.severity] || SEVERITY.media
            const reportType = REPORT_TYPES[report.type] || REPORT_TYPES.correttiva
            const unread = unreadByReport[report.id] || 0
            return (
              <button
                key={report.id}
                onClick={() => onSelectReport(report)}
                className="w-full text-left press-scale"
                style={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  borderLeft: `3px solid ${severity.color}`,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-card-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.borderLeftColor = severity.color; e.currentTarget.style.background = 'var(--color-card)' }}
              >
                {/* Riga 1: titolo + status chip */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {report.title}
                  </span>
                  <StatusChip status={report.status} />
                </div>
                {/* Riga 2: macchina · codice */}
                {report.machine && (
                  <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 5 }}>
                    {report.machine}
                    {report.machine_code && <span style={{ fontFamily: "'JetBrains Mono', monospace" }}> · {report.machine_code}</span>}
                  </div>
                )}
                {/* Riga 3: tipo | priorità | tempo fa */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{reportType.icon} {reportType.label}</span>
                  <span style={{ color: 'var(--color-border)' }}>|</span>
                  <PriorityChip severity={report.severity} />
                  <span style={{ color: 'var(--color-border)' }}>|</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{timeAgo(report.created_at)}</span>
                  {unread > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      minWidth: 20, height: 20, borderRadius: 10,
                      background: 'var(--color-primary)',
                      color: '#fff', fontSize: 10, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px',
                    }}>
                      {unread}
                    </span>
                  )}
                </div>
                {/* Riga 4: assegnatario */}
                {report.assigned_to_name && (
                  <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 5 }}>
                    → {report.assigned_to_name}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
