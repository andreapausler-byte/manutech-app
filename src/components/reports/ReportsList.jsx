import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, MessageCircle, Clock, User, ChevronRight } from 'lucide-react'

// ── Kanban Status Columns Order ──
const KANBAN_STATUSES = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso']

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

// ── Status Progress Dots ──
function StatusDots({ currentStatus }) {
  const currentIdx = KANBAN_STATUSES.indexOf(currentStatus)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {KANBAN_STATUSES.slice(0, 5).map((s, i) => {
        const st = STATUS[s]
        const isPast = i < currentIdx
        const isCurrent = i === currentIdx
        return (
          <div
            key={s}
            style={{
              width: isCurrent ? 12 : 6,
              height: 6,
              borderRadius: 3,
              background: isPast || isCurrent ? st.color : 'var(--color-border)',
              opacity: isPast ? 0.5 : 1,
              transition: 'all 0.2s ease',
            }}
          />
        )
      })}
    </div>
  )
}

// ── Kanban Card ──
function KanbanCard({ report, onSelect, unread }) {
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = REPORT_TYPES[report.type] || REPORT_TYPES.correttiva

  return (
    <button
      onClick={() => onSelect(report)}
      className="kanban-card-enter w-full text-left press-scale"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = severity.color + '60'
        e.currentTarget.style.boxShadow = `0 4px 20px ${severity.color}15`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${severity.color}, ${severity.color}40)`,
        borderRadius: '16px 16px 0 0',
      }} />

      {/* Row 1: Avatar + Title + Unread */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 2 }}>
        {report.assigned_to_name ? (
          <AvatarInitials name={report.assigned_to_name} color={STATUS[report.status]?.color} />
        ) : (
          <div className="avatar-initials" style={{ background: 'var(--color-surface-3)', border: '1.5px dashed var(--color-border)' }}>
            <User size={14} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: 'var(--color-text)',
            lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {report.title}
          </span>
          {report.machine && (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3, fontWeight: 500 }}>
              {report.machine}
              {report.machine_code && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", opacity: 0.6, fontSize: 11 }}> · {report.machine_code}</span>
              )}
            </div>
          )}
        </div>
        {unread > 0 && (
          <span style={{
            minWidth: 20, height: 20, borderRadius: 10,
            background: 'var(--color-danger)',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px', flexShrink: 0,
            boxShadow: '0 0 8px rgba(255, 92, 92, 0.4)',
          }}>
            {unread}
          </span>
        )}
      </div>

      {/* Row 2: Metadata chips */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: '5px 8px', marginTop: 10,
      }}>
        {/* Severity badge */}
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
          background: severity.bg, color: severity.color,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: severity.color,
            boxShadow: `0 0 6px ${severity.color}80`,
          }} />
          {severity.label}
        </span>

        {/* Type chip */}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
          background: reportType.bg, color: reportType.color,
        }}>
          {reportType.icon} {reportType.label}
        </span>

        {/* Time */}
        <span style={{
          fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          <Clock size={11} />
          {timeAgo(report.created_at)}
        </span>
      </div>

      {/* Row 3: Status progress dots */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusDots currentStatus={report.status} />
        {report.assigned_to_name && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
            → {report.assigned_to_name.split(' ')[0]}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Kanban Column ──
function KanbanColumn({ statusKey, reports, onSelectReport, unreadByReport }) {
  const st = STATUS[statusKey]
  const count = reports.length

  return (
    <div className="kanban-column">
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 4px 12px',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: st.color,
          boxShadow: `0 0 8px ${st.color}60`,
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
          {st.label}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          minWidth: 22, height: 22, borderRadius: 11,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: st.bg, color: st.color,
          padding: '0 6px',
        }}>
          {count}
        </span>
      </div>

      {/* Cards */}
      {count === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 16px',
          background: 'var(--color-surface-2)',
          borderRadius: 16,
          border: '1.5px dashed var(--color-border)',
        }}>
          <span style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{st.icon}</span>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 500 }}>
            Nessuna segnalazione
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map(report => (
            <KanbanCard
              key={report.id}
              report={report}
              onSelect={onSelectReport}
              unread={unreadByReport[report.id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──
// eslint-disable-next-line no-unused-vars
export default function ReportsList({ user, onSelectReport, unreadByReport = {} }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState(null) // null = show all columns
  const boardRef = useRef(null)
  const tabsRef = useRef(null)

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
  for (const s of KANBAN_STATUSES) {
    grouped[s] = filtered
      .filter(r => r.status === s)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  }

  // Scroll to column when tab clicked
  const scrollToColumn = (statusKey) => {
    if (activeTab === statusKey) {
      setActiveTab(null)
      return
    }
    setActiveTab(statusKey)
    const idx = KANBAN_STATUSES.indexOf(statusKey)
    if (boardRef.current) {
      const col = boardRef.current.children[idx]
      if (col) {
        boardRef.current.scrollTo({
          left: col.offsetLeft - 16,
          behavior: 'smooth',
        })
      }
    }
  }

  // Track active column on scroll
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const handleScroll = () => {
      const scrollLeft = board.scrollLeft
      const colWidth = board.firstChild?.offsetWidth || 300
      const gap = 12
      const idx = Math.round(scrollLeft / (colWidth + gap))
      const clamped = Math.max(0, Math.min(idx, KANBAN_STATUSES.length - 1))
      setActiveTab(KANBAN_STATUSES[clamped])
    }
    board.addEventListener('scroll', handleScroll, { passive: true })
    return () => board.removeEventListener('scroll', handleScroll)
  }, [loading])

  return (
    <div ref={pullRef} className="pb-4" style={{ minHeight: '60vh', overflowX: 'hidden' }}>
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

        {/* Kanban tab pills — horizontal scroll */}
        <div
          ref={tabsRef}
          className="no-scrollbar"
          style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {KANBAN_STATUSES.map(s => {
            const st = STATUS[s]
            const count = grouped[s]?.length || 0
            const isActive = activeTab === s
            return (
              <button
                key={s}
                onClick={() => scrollToColumn(s)}
                className="kanban-tab"
                style={{
                  background: isActive ? st.color + '20' : 'var(--color-surface-2)',
                  color: isActive ? st.color : 'var(--color-text-muted)',
                  borderColor: isActive ? st.color + '50' : 'transparent',
                }}
              >
                {st.icon} {st.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="px-[4vw] pt-[3vw]"><SkeletonReportsPage /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione" subtitle="Tocca + per crearne una" />
      ) : (
        <div
          ref={boardRef}
          className="kanban-board"
          style={{ padding: '12px 4vw 20px' }}
        >
          {KANBAN_STATUSES.map(s => (
            <KanbanColumn
              key={s}
              statusKey={s}
              reports={grouped[s]}
              onSelectReport={onSelectReport}
              unreadByReport={unreadByReport}
            />
          ))}
        </div>
      )}
    </div>
  )
}
