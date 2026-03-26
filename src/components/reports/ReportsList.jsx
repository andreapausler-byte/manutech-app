import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, User, ChevronDown, ChevronRight, Clock, Layers, MessageCircle } from 'lucide-react'

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
// Short date helper — always compact (e.g. "2h fa", "5g fa", "12 mar")
function shortDate(dateStr) {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'ora'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}g`
  const d = new Date(dateStr)
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function AccordionReportCard({ report, onSelect, unread, lastMessage }) {
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = REPORT_TYPES[report.type] || REPORT_TYPES.correttiva
  const hasMsg = !!lastMessage

  // Build message preview text
  const msgPreview = hasMsg
    ? (lastMessage.text
      ? `${lastMessage.user_name?.split(' ')[0] || 'Utente'}: ${lastMessage.text}`
      : `${lastMessage.user_name?.split(' ')[0] || 'Utente'}: 📎 Media`)
    : null

  return (
    <button
      onClick={() => onSelect(report)}
      className="kanban-card-enter w-full text-left press-scale"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${severity.color}`,
        borderRadius: 10,
        padding: '8px 10px 8px 12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Avatar — smaller */}
      {report.assigned_to_name ? (
        <div className="avatar-initials" style={{
          background: STATUS[report.status]?.color || 'var(--color-primary)',
          width: 28, height: 28, fontSize: 10,
        }}>
          {report.assigned_to_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
      ) : (
        <div className="avatar-initials" style={{
          background: 'var(--color-surface-3)', border: '1.5px dashed var(--color-border)',
          width: 28, height: 28,
        }}>
          <User size={12} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: Title + severity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0, lineHeight: 1.2,
          }}>
            {report.title}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: severity.bg, color: severity.color,
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: severity.color }} />
            {severity.label}
          </span>
        </div>

        {/* Row 2: Machine + type + time — compact */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 2,
          fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500,
        }}>
          {report.machine && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '35%' }}>
              {report.machine}
            </span>
          )}
          <span style={{
            fontSize: 9, padding: '0px 4px', borderRadius: 3,
            background: reportType.bg, color: reportType.color, fontWeight: 600, flexShrink: 0,
          }}>
            {reportType.label}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, flexShrink: 0, opacity: 0.7 }}>
            {shortDate(report.updated_at || report.created_at)}
          </span>
        </div>

        {/* Row 3: Last chat message preview */}
        {msgPreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 3,
            fontSize: 11, color: unread > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
            fontWeight: unread > 0 ? 600 : 400,
          }}>
            <MessageCircle size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1, minWidth: 0,
            }}>
              {msgPreview}
            </span>
          </div>
        )}
      </div>

      {/* Unread badge */}
      {unread > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -2,
          minWidth: 16, height: 16, borderRadius: 8,
          background: 'var(--color-danger)',
          color: '#fff', fontSize: 9, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 3px',
          boxShadow: '0 0 6px rgba(255, 92, 92, 0.4)',
        }}>
          {unread > 9 ? '9+' : unread}
        </span>
      )}

      {/* Chevron */}
      <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0, opacity: 0.4 }} />
    </button>
  )
}

// ── Collapsible accordion section ──
function AccordionSection({ statusKey, reports, onSelectReport, unreadByReport, lastMessages = {}, isExpanded, onToggle }) {
  const st = STATUS[statusKey]
  const count = reports.length

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Header — compact */}
      <button
        onClick={onToggle}
        className="press-scale"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '10px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text)',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: st.color,
          boxShadow: `0 0 6px ${st.color}60`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {st.icon} {st.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700,
          minWidth: 20, height: 20, borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: count > 0 ? st.bg : 'var(--color-surface-2)',
          color: count > 0 ? st.color : 'var(--color-text-muted)',
          padding: '0 5px',
        }}>
          {count}
        </span>
        <ChevronDown
          size={16}
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
        style={{ maxHeight: isExpanded ? `${count * 76 + 20}px` : '0' }}
      >
        {count === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '10px',
            color: 'var(--color-text-muted)', fontSize: 12,
          }}>
            <span style={{ opacity: 0.3 }}>{st.icon}</span>
            Nessuna segnalazione
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10 }}>
            {reports.map(report => (
              <AccordionReportCard
                key={report.id}
                report={report}
                onSelect={onSelectReport}
                unread={unreadByReport[report.id] || 0}
                lastMessage={lastMessages[report.id]}
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('manutech_reports_view') || 'chrono')
  const [lastMessages, setLastMessages] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await db.getReports({})
      setReports(data)
      // Load last chat message for each report
      if (data.length > 0) {
        const ids = data.map(r => r.id)
        db.getLastCommentsByReports(ids).then(map => setLastMessages(map)).catch(() => {})
      }
    } catch {} // eslint-disable-line no-empty
    setLoading(false)
  }, [])

  const handleRefresh = useCallback(async () => {
    const data = await db.getReports({})
    setReports(data)
    if (data.length > 0) {
      db.getLastCommentsByReports(data.map(r => r.id)).then(map => setLastMessages(map)).catch(() => {})
    }
  }, [])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)

  useEffect(() => { load() }, [load])

  // Filter by search
  const filtered = reports.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.title?.toLowerCase().includes(q) || r.machine?.toLowerCase().includes(q)
  })

  // Chrono: flat list sorted by updated_at DESC
  const chronoSorted = [...filtered].sort((a, b) =>
    new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  )

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
    if (aReports.length === 0 && bReports.length > 0) return 1
    if (aReports.length > 0 && bReports.length === 0) return -1
    if (aReports.length === 0 && bReports.length === 0) return 0
    const aLatest = new Date(aReports[0].updated_at || aReports[0].created_at)
    const bLatest = new Date(bReports[0].updated_at || bReports[0].created_at)
    return bLatest - aLatest
  })

  const switchView = (mode) => {
    setViewMode(mode)
    localStorage.setItem('manutech_reports_view', mode)
  }

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

        {/* View toggle */}
        <div style={{
          display: 'flex', borderRadius: 10, overflow: 'hidden',
          background: 'var(--color-surface-2)', padding: 3,
        }}>
          {[
            { id: 'chrono', label: 'Recenti', icon: Clock },
            { id: 'grouped', label: 'Per stato', icon: Layers },
          ].map(v => (
            <button key={v.id} onClick={() => switchView(v.id)}
              className="press-scale"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: viewMode === v.id ? 'var(--color-card)' : 'transparent',
                color: viewMode === v.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                border: 'none', cursor: 'pointer',
                boxShadow: viewMode === v.id ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.2s',
              }}>
              <v.icon size={14} /> {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="px-[4vw] pt-[3vw]"><SkeletonReportsPage /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione" subtitle="Tocca + per crearne una" />
      ) : viewMode === 'chrono' ? (
        <div className="px-[4vw] pt-[2vw]">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chronoSorted.map(report => {
              const st = STATUS[report.status]
              return (
                <div key={report.id} style={{ position: 'relative' }}>
                  {/* Status indicator dot */}
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 6, height: 6, borderRadius: '50%',
                    background: st?.color || 'var(--color-text-muted)',
                    boxShadow: `0 0 4px ${st?.color || 'transparent'}60`,
                    zIndex: 1,
                  }} />
                  <div style={{ paddingLeft: 4 }}>
                    <AccordionReportCard
                      report={report}
                      onSelect={onSelectReport}
                      unread={unreadByReport[report.id] || 0}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-[4vw] pt-[2vw]">
          {sortedStatuses.map(s => (
            <AccordionSection
              key={s}
              statusKey={s}
              reports={grouped[s]}
              onSelectReport={onSelectReport}
              unreadByReport={unreadByReport}
              lastMessages={lastMessages}
              isExpanded={expandedSections.has(s)}
              onToggle={() => toggleSection(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
