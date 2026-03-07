import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, timeAgo } from '../../lib/constants'
import { Badge, EmptyState, SkeletonReportsPage } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, ChevronRight, X, MessageCircle } from 'lucide-react'

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
        <Search size={22} className="absolute left-[4vw] top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          placeholder="Cerca..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface-2 border border-token rounded-2xl pl-[12vw] pr-[12vw] py-[3.5vw] text-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-[3vw] top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-surface-3 text-secondary">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Filters — 2x2 */}
      <div className="grid grid-cols-2 gap-[2.5vw]">
        <button
          onClick={() => setFilterStatus('')}
          className={`py-[3vw] rounded-2xl text-base font-bold text-center transition-all press-scale ${
            !filterStatus ? 'bg-blue-600 text-white' : 'btn-chip'
          }`}
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
        <div className="space-y-[2.5vw]">
          {filtered.map(report => {
            const status = STATUS[report.status] || STATUS.aperta
            const severity = SEVERITY[report.severity] || SEVERITY.media
            return (
              <button
                key={report.id}
                onClick={() => onSelectReport(report)}
                className="w-full text-left flex items-center gap-[3vw] card-interactive rounded-2xl px-[4vw] py-[3.5vw] active:bg-gray-800/60 transition-colors press-scale"
              >
                <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: severity.color + '15' }}>
                  <div className="w-3.5 h-3.5 rounded-full" style={{ background: status.color }} />
                </div>
                <div className="flex-1 min-w-0 mr-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-themed truncate">{report.title}</h3>
                    <span className="text-sm text-faint shrink-0">{timeAgo(report.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge {...severity} />
                    {report.assigned_to_name && (
                      <span className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg">
                        👤 {report.assigned_to_name}
                      </span>
                    )}
                    {report.media?.length > 0 && <span className="text-sm text-gray-500">📎 {report.media.length}</span>}
                  </div>
                </div>
                {/* Badge messaggi non letti oppure chevron */}
                {unreadByReport[report.id] > 0 ? (
                  <span className="min-w-[28px] h-[28px] bg-blue-500 rounded-full text-xs font-bold text-white flex items-center justify-center px-1.5 shrink-0 animate-scale-in"
                    style={{ boxShadow: '0 2px 8px rgba(59,130,246,0.4)' }}>
                    <MessageCircle size={12} className="mr-0.5" />
                    {unreadByReport[report.id]}
                  </span>
                ) : (
                  <ChevronRight size={22} className="text-faint shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
