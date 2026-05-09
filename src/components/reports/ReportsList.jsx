import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, formatTicketId } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage } from '../ui'
import { useRipple } from '../../hooks/useMobileEffects'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, ChevronDown, Clock, Layers, MessageCircle } from 'lucide-react'

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
  const rippleRef = useRipple()
  const isCritical = report.severity === 'critica'
  const isAlta = report.severity === 'alta'
  const hasMsg = !!lastMessage

  // Build message preview text
  const msgPreview = hasMsg
    ? (lastMessage.text
      ? `${lastMessage.user_name?.split(' ')[0] || 'Utente'}: ${lastMessage.text}`
      : `${lastMessage.user_name?.split(' ')[0] || 'Utente'}: 📎 Media`)
    : null

  return (
    <button
      ref={rippleRef}
      onClick={() => onSelect(report)}
      className="kanban-card-enter w-full text-left press-scale ripple-container"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        padding: '11px 12px 11px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        display: 'grid',
        gridTemplateColumns: '3px 1fr auto',
        gap: 10,
        alignItems: 'center',
      }}
    >
      {/* Priority strip — full height stretch */}
      <span aria-hidden="true" style={{
        alignSelf: 'stretch', background: severity.color, borderRadius: 2,
      }} />

      {/* Body */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Meta row: TK-id + tag pill + severity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: 'var(--color-primary-glow)', color: 'var(--color-primary)',
            fontWeight: 700, letterSpacing: 0.8,
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {formatTicketId(report)}
          </span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 3,
            background: reportType.color, color: '#fff',
            fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            {reportType.label}
          </span>
          <span className={isCritical ? 'badge-critical-pulse' : isAlta ? 'badge-alta-pulse' : ''} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, color: severity.color, letterSpacing: 0.2,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: severity.color }} />
            {severity.label}
          </span>
        </div>

        {/* Title — up to 2 lines */}
        <div style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.1,
          color: 'var(--color-text)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {report.title}
        </div>

        {/* Machine */}
        {report.machine && (
          <div style={{
            fontSize: 11, color: 'var(--color-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {report.machine}
          </div>
        )}

        {/* Last chat message preview */}
        {msgPreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: unread > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
            fontWeight: unread > 0 ? 600 : 400,
            minWidth: 0,
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

      {/* Right column — notif + age, no collision */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        minWidth: 30,
      }}>
        {unread > 0 ? (
          <span style={{
            minWidth: 22, height: 22, padding: '0 6px', borderRadius: 22,
            background: 'var(--color-danger)', color: '#fff',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px rgba(255, 92, 92, 0.5)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        ) : (
          <span aria-hidden="true" style={{ width: 22, height: 22 }} />
        )}
        <span style={{
          fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 500,
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          {shortDate(report.updated_at || report.created_at)}
        </span>
      </div>
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
        style={{ maxHeight: isExpanded ? `${count * 130 + 20}px` : '0' }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 12 }}>
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
        db.getLastCommentsByReports(ids).then(map => setLastMessages(map)).catch(e => console.error('[ReportsList] getLastCommentsByReports failed:', e))
      }
    } catch (e) { console.error('[ReportsList] load failed:', e) }
    setLoading(false)
  }, [])

  const handleRefresh = useCallback(async () => {
    const data = await db.getReports({})
    setReports(data)
    if (data.length > 0) {
      db.getLastCommentsByReports(data.map(r => r.id)).then(map => setLastMessages(map)).catch(e => console.error('[ReportsList] getLastCommentsByReports refresh failed:', e))
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
        {/* Search bar — card style */}
        <div className="relative">
          <Search size={16} style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: search ? 'var(--color-primary)' : 'var(--color-text-muted)',
            transition: 'color 0.2s',
          }} />
          <input
            type="text"
            placeholder="Cerca segnalazione…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: '12px 40px 12px 38px',
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
            <button onClick={() => setSearch('')} aria-label="Cancella ricerca" style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              width: 24, height: 24, borderRadius: 12, background: 'var(--color-surface-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* View toggle — segmented */}
        <div style={{
          display: 'flex', borderRadius: 12, padding: 4,
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        }}>
          {[
            { id: 'chrono', label: 'Recenti', icon: Clock, count: filtered.length },
            { id: 'grouped', label: 'Per stato', icon: Layers, count: null },
          ].map(v => {
            const active = viewMode === v.id
            return (
              <button key={v.id} onClick={() => switchView(v.id)}
                className="press-scale"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: active ? 'var(--color-card)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  border: 'none', cursor: 'pointer',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 0.2s',
                }}>
                <v.icon size={13} /> {v.label}
                {v.count !== null && (
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: active ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
                  }}>
                    {v.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="px-[4vw] pt-[3vw]"><SkeletonReportsPage /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione" subtitle="Tocca + per crearne una" />
      ) : viewMode === 'chrono' ? (
        <div className="px-[4vw] pt-[2vw]">
          <div className="stagger-enter" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chronoSorted.map(report => (
              <div key={report.id}>
                <AccordionReportCard
                  report={report}
                  onSelect={onSelectReport}
                  unread={unreadByReport[report.id] || 0}
                  lastMessage={lastMessages[report.id]}
                />
              </div>
            ))}
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
