import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, Clock, User, ChevronDown, ChevronRight } from 'lucide-react'

// ── Status column order ──
const STATUSES = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso']

// ── Avatar with initials ──
function AvatarInitials({ name, color }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '??'
  return (
    <div className="avatar-initials" style={{ background: color || 'var(--color-primary)' }}>
      {initials}
    </div>
  )
}

// ── Compact report card for accordion ──
function AccordionReportCard({ report, onSelect, unread }) {
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = REPORT_TYPES[report.type] || REPORT_TYPES.correttiva

  return (
    <button
      onClick={() => onSelect(report)}
      className="kanban-card-enter w-full text-left press-scale"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${severity.color}`,
        borderRadius: 12,
        padding: '10px 12px 10px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Avatar */}
      {report.assigned_to_name ? (
        <AvatarInitials name={report.assigned_to_name} color={STATUS[report.status]?.color} />
      ) : (
        <div className="avatar-initials" style={{ background: 'var(--color-surface-3)', border: '1.5px dashed var(--color-border)' }}>
          <User size={14} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: Title + severity + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {report.title}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
            background: severity.bg, color: severity.color,
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: severity.color }} />
            {severity.label}
          </span>
        </div>

        {/* Row 2: Machine + type + assigned */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
          fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500,
        }}>
          {report.machine && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
              🏭 {report.machine}
            </span>
          )}
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 4,
            background: reportType.bg, color: reportType.color, fontWeight: 600, flexShrink: 0,
          }}>
            {reportType.icon} {reportType.label}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <Clock size={11} />
            {timeAgo(report.created_at)}
          </span>
        </div>
      </div>

      {/* Unread badge */}
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -2,
          minWidth: 18, height: 18, borderRadius: 9,
          background: 'var(--color-danger)',
          color: '#fff', fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
          boxShadow: '0 0 8px rgba(255, 92, 92, 0.4)',
        }}>
          {unread > 9 ? '9+' : unread}
        </span>
      )}

      {/* Chevron */}
      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: 0.5 }} />
    </button>
  )
}

// ── Collapsible accordion section ──
function AccordionSection({ statusKey, reports, onSelectReport, unreadByReport, isExpanded, onToggle }) {
  const st = STATUS[statusKey]
  const count = reports.length

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="press-scale"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '14px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        {/* Status dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: st.color,
          boxShadow: `0 0 8px ${st.color}60`,
          flexShrink: 0,
        }} />

        {/* Icon + label */}
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          {st.icon} {st.label}
        </span>

        {/* Count badge */}
        <span style={{
          fontSize: 12, fontWeight: 700,
          minWidth: 22, height: 22, borderRadius: 11,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: st.bg, color: st.color,
          padding: '0 6px',
        }}>
          {count}
        </span>

        {/* Chevron */}
        <ChevronDown
          size={18}
          style={{
            marginLeft: 'auto',
            color: 'var(--color-text-muted)',
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Content */}
      <div
        className="accordion-content"
        style={{ maxHeight: isExpanded ? `${count * 80 + 40}px` : '0' }}
      >
        {count === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '16px',
            color: 'var(--color-text-muted)', fontSize: 13,
          }}>
            <span style={{ opacity: 0.4, fontSize: 20 }}>{st.icon}</span>
            Nessuna segnalazione
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
            {reports.map(report => (
              <AccordionReportCard
                key={report.id}
                report={report}
                onSelect={onSelectReport}
                unread={unreadByReport[report.id] || 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──
// eslint-disable-next-line no-unused-vars
export default function ReportsList({ user, onSelectReport, unreadByReport = {} }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedSections, setExpandedSections] = useState(new Set())
  const [initialized, setInitialized] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await db.getReports({}); setReports(data) } catch {}
    setLoading(false)
  }, [])

  const handleRefresh = useCallback(async () => {
    const data = await db.getReports({})
    setReports(data)
  }, [])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)

  useEffect(() => { load() }, [load])

  // Filter by search
  const filtered = reports.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.title?.toLowerCase().includes(q) || r.machine?.toLowerCase().includes(q)
  })

  // Group by status
  const grouped = {}
  for (const s of STATUSES) {
    grouped[s] = filtered
      .filter(r => r.status === s)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  }

  // Sort sections: most recently updated first, empty sections last
  const sortedStatuses = [...STATUSES].sort((a, b) => {
    const aReports = grouped[a]
    const bReports = grouped[b]
    // Empty sections go to the bottom
    if (aReports.length === 0 && bReports.length > 0) return 1
    if (aReports.length > 0 && bReports.length === 0) return -1
    if (aReports.length === 0 && bReports.length === 0) return 0
    // Compare most recent report in each group
    const aLatest = new Date(aReports[0].updated_at || aReports[0].created_at)
    const bLatest = new Date(bReports[0].updated_at || bReports[0].created_at)
    return bLatest - aLatest
  })

  // Auto-expand sections with reports on first load
  useEffect(() => {
    if (!loading && !initialized) {
      const nonEmpty = STATUSES.filter(s => grouped[s]?.length > 0)
      setExpandedSections(new Set(nonEmpty))
      setInitialized(true)
    }
  }, [loading, initialized]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = useCallback((statusKey) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(statusKey)) next.delete(statusKey)
      else next.add(statusKey)
      return next
    })
  }, [])

  return (
    <div ref={pullRef} className="pb-4" style={{ minHeight: '60vh' }}>
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />

      <div className="px-[4vw] pt-0 space-y-[3vw]">
        {/* Search bar — pill style */}
        <div className="relative">
          <Search size={18} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: search ? 'var(--color-primary)' : 'var(--color-text-muted)',
            transition: 'color 0.2s',
          }} />
          <input
            type="text"
            placeholder="Cerca segnalazione..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--color-surface-2)',
              border: '1.5px solid var(--color-border)',
              borderRadius: 'var(--radius-full)',
              padding: '11px 40px 11px 40px',
              fontSize: 14,
              color: 'var(--color-text)',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--color-primary)'
              e.target.style.boxShadow = '0 0 0 3px var(--color-primary-glow)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--color-border)'
              e.target.style.boxShadow = 'none'
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              width: 24, height: 24, borderRadius: 12, background: 'var(--color-surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Accordion Sections */}
      {loading ? (
        <div className="px-[4vw] pt-[3vw]"><SkeletonReportsPage /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione" subtitle="Tocca + per crearne una" />
      ) : (
        <div className="px-[4vw] pt-[2vw]">
          {sortedStatuses.map(s => (
            <AccordionSection
              key={s}
              statusKey={s}
              reports={grouped[s]}
              onSelectReport={onSelectReport}
              unreadByReport={unreadByReport}
              isExpanded={expandedSections.has(s)}
              onToggle={() => toggleSection(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
