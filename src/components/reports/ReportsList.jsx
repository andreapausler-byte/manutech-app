import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, REACTIONS, formatTicketId } from '../../lib/constants'
import { EmptyState, SkeletonReportsPage, TicketIdBadge } from '../ui'
import { useRipple } from '../../hooks/useMobileEffects'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, ChevronDown, Clock, Layers, MessageCircle, Archive, Cog } from 'lucide-react'

// Convenzione schema reports: il nome del macchinario è salvato come snapshot
// denormalizzato nel campo `machine` (TEXT) — NON `machine_name`. Asimmetrico
// con `assigned_to_name` (debito tecnico noto). Il FK è `machine_id` (UUID).
// La ricerca client-side cerca su `machine` (snapshot) con fallback a lookup
// via `machine_id` contro lo state `machines` caricato da db.getMachines().

// ── Status column order ──
const STATUSES = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso']
const ARCHIVED_STATUSES = ['risolta', 'chiuso']
const RECENT_COMPLETED_WINDOW_HOURS = 24
const isArchived = (r) => ARCHIVED_STATUSES.includes(r.status)
// Terminale aggiornato entro la finestra recente: resta visibile nelle viste
// "attive" (chrono / grouped) per dare conferma del completamento appena fatto.
// Esce dall'Archivio per evitare doppio conteggio.
const isRecentTerminal = (r, nowMs) => {
  if (!ARCHIVED_STATUSES.includes(r.status)) return false
  const ts = new Date(r.updated_at || r.created_at).getTime()
  return Number.isFinite(ts) && (nowMs - ts) < RECENT_COMPLETED_WINDOW_HOURS * 3600 * 1000
}

// Distanza di edit tra due stringhe corte (usata sui gruppi di cifre dei
// TK-id per i suggerimenti "forse cercavi": 1 = un errore di battitura).
function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[m][n]
}

// Migliore distanza tra la query numerica e una finestra scorrevole delle
// cifre del TK-id (lunghezze q-1..q+1 per coprire inserzioni/cancellazioni).
function bestDigitsDistance(query, digits) {
  if (digits.includes(query)) return 0
  let best = Infinity
  for (const len of [query.length - 1, query.length, query.length + 1]) {
    if (len < 1) continue
    for (let i = 0; i + len <= digits.length; i++) {
      best = Math.min(best, editDistance(digits.slice(i, i + len), query))
      if (best === 0) return 0
    }
  }
  return best
}

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

// Card in stile "1A — Compatta ad alto contrasto" (design Lista Ticket
// Operatore): priorità dominante in testata, titolo grande, riga macchina
// con icona, anteprima chat con chip conteggio, reazioni a pillola.
function AccordionReportCard({ report, onSelect, unread, lastMessage, activity }) {
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = REPORT_TYPES[report.type] || REPORT_TYPES.correttiva
  const rippleRef = useRipple()
  const isCritical = report.severity === 'critica'
  const isAlta = report.severity === 'alta'
  const hasMsg = !!lastMessage
  const msgAuthor = hasMsg ? (lastMessage.user_name?.split(' ')[0] || 'Utente') : null
  const hasReactions = activity && Object.values(activity.reactions).some(n => n > 0)

  return (
    <button
      ref={rippleRef}
      onClick={() => onSelect(report)}
      className="kanban-card-enter w-full text-left press-scale ripple-container"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: 0,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}
    >
      {/* Priority rail — full height */}
      <span aria-hidden="true" style={{ width: 5, flexShrink: 0, background: severity.color }} />

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, padding: '13px 14px' }}>
        {/* Meta row: pillola priorità + pillola tipo + unread/TK-id */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <span className={isCritical ? 'badge-critical-pulse' : isAlta ? 'badge-alta-pulse' : ''} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 26, padding: '0 10px', borderRadius: 8,
            background: `${severity.color}29`, border: `1px solid ${severity.color}8C`,
            color: severity.color, fontSize: 12, fontWeight: 700,
            letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: severity.color }} />
            {severity.label}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            height: 26, padding: '0 9px', borderRadius: 8,
            background: `${reportType.color}1F`, border: `1px solid ${reportType.color}66`,
            color: reportType.color, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {reportType.label}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {unread > 0 && (
              <span style={{
                minWidth: 20, height: 20, padding: '0 6px', borderRadius: 20,
                background: 'var(--color-primary)', color: '#fff',
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 8px var(--color-primary-glow)',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
            <TicketIdBadge report={report} style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
              color: 'var(--color-text-muted)',
              fontFamily: '"JetBrains Mono", monospace',
            }} />
          </span>
        </div>

        {/* Title — grande, fino a 2 righe */}
        <div style={{
          fontSize: 20, fontWeight: 600, lineHeight: 1.16, letterSpacing: -0.2,
          color: 'var(--color-text)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {report.title}
        </div>

        {/* Machine + tempo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, minWidth: 0 }}>
          {report.machine && (
            <>
              <Cog size={15} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
              <span style={{
                fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {report.machine}
              </span>
            </>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>
            {shortDate(report.updated_at || report.created_at)}
          </span>
        </div>

        {/* Last chat message preview — chip conteggio + autore in evidenza */}
        {hasMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11, minWidth: 0 }}>
            {activity?.comment_count > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 24, padding: '0 9px', borderRadius: 8,
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-secondary)',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                <MessageCircle size={13} />
                {activity.comment_count}
              </span>
            )}
            <span style={{
              fontSize: 13.5,
              color: unread > 0 ? 'var(--color-text)' : 'var(--color-text-secondary)',
              fontWeight: unread > 0 ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1, minWidth: 0,
            }}>
              <span style={{ fontWeight: 700 }}>{msgAuthor}: </span>
              {lastMessage.text || '📎 Media'}
            </span>
          </div>
        )}

        {/* Feedback sui messaggi (utenti distinti): più ✅ = problema
            confermato da più persone, segnale di importanza del ticket */}
        {hasReactions && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid var(--color-border-subtle)',
          }}>
            {Object.entries(REACTIONS).map(([type, { emoji, label }]) => {
              const n = activity.reactions[type] || 0
              if (!n) return null
              return (
                <span key={type} title={`${label}: ${n} ${n === 1 ? 'persona' : 'persone'}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 36, padding: '0 13px', borderRadius: 20,
                  background: 'var(--color-surface-3)',
                  border: '1px solid var(--color-border-hover)',
                }}>
                  <span style={{ fontSize: 17, lineHeight: 1 }}>{emoji}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{n}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Collapsible accordion section ──
function AccordionSection({ statusKey, reports, onSelectReport, unreadByReport, lastMessages = {}, activityMap = {}, isExpanded, onToggle }) {
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
        style={{ maxHeight: isExpanded ? `${count * 230 + 20}px` : '0' }}
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
                activity={activityMap[report.id]}
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
// Ranking per sort 'severity' e 'status' (workflow desc).
const SEVERITY_RANK = { critica: 4, alta: 3, media: 2, bassa: 1 }
const STATUS_RANK = {
  in_lavorazione: 6, assegnata: 5, aperta: 4,
  in_attesa_ricambi: 3, risolta: 2, chiuso: 1,
}

export default function ReportsList({ user, onSelectReport, unreadByReport = {} }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedSections, setExpandedSections] = useState(new Set())
  const [initialized, setInitialized] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('manutech_reports_view') || 'chrono')
  const [lastMessages, setLastMessages] = useState({})
  // reportId → { comment_count, reactions } per i chip feedback in card.
  // I non letti restano di competenza di unreadByReport (hook realtime).
  const [activityMap, setActivityMap] = useState({})
  const [machines, setMachines] = useState([])

  // Filtri + ordinamento personalizzati per tecnico, persistiti in localStorage.
  // Default: 'updated' (ultimo aggiornamento, dal più recente) — coerente
  // con la vista admin: i ticket "vivi" (commenti nuovi o cambio stato)
  // salgono in cima naturalmente.
  const filtersKey = `manutech_reports_filters_${user?.id || 'anon'}`
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(filtersKey) || '{}')
      return {
        onlyMine: !!saved.onlyMine,
        machineFilter: saved.machineFilter || '',
        sortBy: saved.sortBy || 'updated',
      }
    } catch {
      return { onlyMine: false, machineFilter: '', sortBy: 'updated' }
    }
  })
  const updateFilters = (patch) => {
    setFilters(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(filtersKey, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }

  useEffect(() => {
    db.getMachines()
      .then(list => setMachines(list || []))
      .catch(e => console.warn('[ReportsList] getMachines:', e?.message))
  }, [])

  // Debounce 200ms: evita re-render eccessivi mentre il manutentore digita.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  // Mappa machine_id → name per fallback quando lo snapshot `machine` è null
  // (es. record storici creati prima dell'enforcement del pattern snapshot).
  const machineNameById = useMemo(() => {
    const m = new Map()
    for (const machine of machines) m.set(machine.id, machine.name)
    return m
  }, [machines])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await db.getReports({})
      setReports(data)
      // Load last chat message for each report
      if (data.length > 0) {
        const ids = data.map(r => r.id)
        db.getLastCommentsByReports(ids).then(map => setLastMessages(map)).catch(e => console.error('[ReportsList] getLastCommentsByReports failed:', e))
        db.getReportsActivity(ids, user?.id).then(map => setActivityMap(map || {})).catch(e => console.warn('[ReportsList] getReportsActivity failed:', e?.message))
      }
    } catch (e) { console.error('[ReportsList] load failed:', e) }
    setLoading(false)
  }, [user?.id])

  const handleRefresh = useCallback(async () => {
    const data = await db.getReports({})
    setReports(data)
    if (data.length > 0) {
      const ids = data.map(r => r.id)
      db.getLastCommentsByReports(ids).then(map => setLastMessages(map)).catch(e => console.error('[ReportsList] getLastCommentsByReports refresh failed:', e))
      db.getReportsActivity(ids, user?.id).then(map => setActivityMap(map || {})).catch(e => console.warn('[ReportsList] getReportsActivity refresh failed:', e?.message))
    }
  }, [user?.id])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)

  useEffect(() => { load() }, [load])

  // Auto-refresh quando la pagina torna visibile (ritorno tab, app PWA da
  // background): senza subscription realtime su reports l'utente vedrebbe
  // dati stantii al rientro. Throttle 30s + handleRefresh (no setLoading,
  // niente flicker dello skeleton).
  useEffect(() => {
    let lastVisibleLoadAt = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastVisibleLoadAt < 30_000) return
      lastVisibleLoadAt = now
      handleRefresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [handleRefresh])

  // Filter di base: search testuale + onlyMine + macchina.
  // Search supporta TK-id senza trattini/prefissi (vedi qNorm) e cerca su tutti
  // i campi che il manutentore vede nella card (titolo, descrizione, macchina,
  // tecnico assegnato, creatore, ID raw). Fallback su machine_id→name per
  // record con snapshot `machine` null.
  const baseFiltered = reports.filter(r => {
    if (filters.onlyMine && r.assigned_to !== user?.id) return false
    if (filters.machineFilter && r.machine_id !== filters.machineFilter) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase().trim()
      if (!q) return true
      const qNorm = q.replace(/[^a-z0-9]/g, '')
      const tk = formatTicketId(r).toLowerCase()
      const tkNorm = tk.replace(/[^a-z0-9]/g, '')
      const machineFromLookup = r.machine_id ? machineNameById.get(r.machine_id) : null
      const searchable = [
        r.title,
        r.description,
        r.machine,
        r.machine_name,
        machineFromLookup,
        r.assigned_to_name,
        r.created_by_name,
        r.id,
      ]
      const textMatch = searchable.some(f =>
        f?.toString().toLowerCase().includes(q)
      )
      const tkMatch = tk.includes(q) || (qNorm.length > 0 && tkNorm.includes(qNorm))
      if (!textMatch && !tkMatch) return false
    }
    return true
  })

  // Conteggi per i chip del segmented control.
  // I terminali freschi (< RECENT_COMPLETED_WINDOW_HOURS) restano in "Recenti"
  // e sono esclusi da "Archivio": coerenza counter ↔ contenuto della vista,
  // zero doppio conteggio.
  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps -- Date.now stabile dentro useMemo([reports])
  const nowMs = useMemo(() => Date.now(), [reports])
  const activeCount = baseFiltered.filter(r => !isArchived(r) || isRecentTerminal(r, nowMs)).length
  const archivedCount = baseFiltered.filter(r => isArchived(r) && !isRecentTerminal(r, nowMs)).length

  // viewMode='archive' mostra solo terminali "vecchi" (fuori finestra recente);
  // gli altri (chrono, grouped) mostrano attivi + terminali recenti.
  const filtered = viewMode === 'archive'
    ? baseFiltered.filter(r => isArchived(r) && !isRecentTerminal(r, nowMs))
    : baseFiltered.filter(r => !isArchived(r) || isRecentTerminal(r, nowMs))

  // Sort logic in base a filters.sortBy. Tiebreak comune: created_at desc
  // (più stabile di updated_at, che cambia con i commenti/eventi).
  const sortFn = (a, b) => {
    if (filters.sortBy === 'severity') {
      const diff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
      if (diff !== 0) return diff
      return new Date(b.created_at) - new Date(a.created_at)
    }
    if (filters.sortBy === 'status') {
      const diff = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0)
      if (diff !== 0) return diff
      return new Date(b.created_at) - new Date(a.created_at)
    }
    if (filters.sortBy === 'updated') {
      // I non letti restano in cima finché l'utente non apre il ticket.
      // Dentro ogni gruppo (non letti, letti) ordina per updated_at desc:
      // i messaggi più nuovi salgono.
      const aUnread = (unreadByReport[a.id] || 0) > 0
      const bUnread = (unreadByReport[b.id] || 0) > 0
      if (aUnread !== bUnread) return aUnread ? -1 : 1
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    }
    // default 'created'
    return new Date(b.created_at) - new Date(a.created_at)
  }
  const chronoSorted = [...filtered].sort(sortFn)

  // Group by status (la sortFn applicata anche dentro le sezioni)
  const grouped = {}
  for (const s of STATUSES) {
    grouped[s] = filtered.filter(r => r.status === s).sort(sortFn)
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

  // "Forse cercavi": quando la ricerca non trova nulla e la query contiene
  // cifre (ID copiato a mano), propone i TK-id più vicini (max 1 errore di
  // battitura). Calcolato su TUTTI i report ignorando i filtri attivi, così
  // un ID esatto nascosto da "Solo i miei" o dal filtro macchina riemerge qui.
  const hasActiveFilters = filters.onlyMine || !!filters.machineFilter
  const searchSuggestions = useMemo(() => {
    if (!debouncedSearch) return []
    const q = debouncedSearch.replace(/\D/g, '')
    if (q.length < 4) return []
    const scored = []
    for (const r of reports) {
      const digits = formatTicketId(r).replace(/\D/g, '')
      const d = bestDigitsDistance(q, digits)
      if (d <= 1) scored.push({ r, d })
    }
    return scored
      .sort((a, b) => a.d - b.d
        || new Date(b.r.updated_at || b.r.created_at) - new Date(a.r.updated_at || a.r.created_at))
      .slice(0, 3)
      .map(x => x.r)
  }, [debouncedSearch, reports])
  // Suggerimenti mostrati solo a lista vuota; se la lista ha risultati la
  // ricerca ha già funzionato e il blocco non compare.

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
            placeholder="Cerca: titolo, macchina, tecnico, ID…"
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

        {/* Filtri rapidi: Solo i miei + Macchina + Ordina */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center',
        }}>
          <button
            type="button"
            onClick={() => updateFilters({ onlyMine: !filters.onlyMine })}
            className="press-scale"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              border: filters.onlyMine ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: filters.onlyMine ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
              color: filters.onlyMine ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
            {filters.onlyMine ? '✓ ' : ''}Solo i miei
          </button>

          <select
            value={filters.machineFilter}
            onChange={(e) => updateFilters({ machineFilter: e.target.value })}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              border: filters.machineFilter ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: filters.machineFilter ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
              color: filters.machineFilter ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              maxWidth: 180,
            }}>
            <option value="">Tutte le macchine</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => updateFilters({ sortBy: e.target.value })}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              border: filters.sortBy !== 'updated' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: filters.sortBy !== 'updated' ? 'var(--color-primary-glow)' : 'var(--color-surface-2)',
              color: filters.sortBy !== 'updated' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>
            <option value="updated">Ordina: ultimo aggiornamento</option>
            <option value="created">Ordina: data creazione</option>
            <option value="severity">Ordina: severità</option>
            <option value="status">Ordina: workflow</option>
          </select>
        </div>

        {/* View toggle — segmented */}
        <div style={{
          display: 'flex', borderRadius: 12, padding: 4,
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
        }}>
          {[
            { id: 'chrono', label: 'Recenti', icon: Clock, count: activeCount },
            { id: 'grouped', label: 'Per stato', icon: Layers, count: null },
            { id: 'archive', label: 'Archivio', icon: Archive, count: archivedCount },
          ].map(v => {
            const active = viewMode === v.id
            return (
              <button key={v.id} onClick={() => switchView(v.id)}
                className="press-scale"
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  background: active ? 'var(--color-card)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
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
        debouncedSearch ? (
          /* Empty state di ricerca: dice cosa non è stato trovato, avvisa dei
             filtri attivi e propone i TK-id più simili (typo su una cifra). */
          <div className="px-[4vw]" style={{ paddingTop: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
              Nessun risultato per “{debouncedSearch}”
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.45 }}>
              Controlla l'ID oppure prova con titolo, macchina o tecnico
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => updateFilters({ onlyMine: false, machineFilter: '' })}
                className="press-scale"
                style={{
                  marginTop: 14, padding: '9px 16px', borderRadius: 12,
                  background: 'var(--color-primary-glow)', border: '1px solid var(--color-primary)',
                  color: 'var(--color-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Hai filtri attivi che possono nascondere risultati — Rimuovi filtri
              </button>
            )}
            {searchSuggestions.length > 0 && (
              <div style={{ marginTop: 22, textAlign: 'left' }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                  color: 'var(--color-text-muted)', marginBottom: 8,
                }}>
                  Forse cercavi
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchSuggestions.map(r => (
                    <button
                      key={r.id}
                      onClick={() => onSelectReport(r)}
                      className="press-scale"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left', padding: '12px 14px',
                        background: 'var(--color-card)', border: '1px solid var(--color-border)',
                        borderRadius: 14, cursor: 'pointer', minWidth: 0,
                      }}
                    >
                      <span style={{
                        fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 700,
                        color: 'var(--color-primary)', flexShrink: 0, letterSpacing: 0.5,
                      }}>
                        {formatTicketId(r)}
                      </span>
                      <span style={{
                        fontSize: 13.5, fontWeight: 500, color: 'var(--color-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        flex: 1, minWidth: 0,
                      }}>
                        {r.title}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={viewMode === 'archive' ? '📦' : '📋'}
            title={viewMode === 'archive' ? 'Archivio vuoto' : 'Nessuna segnalazione'}
            subtitle={viewMode === 'archive' ? 'Niente di completato o chiuso al momento' : 'Tocca + per crearne una'}
          />
        )
      ) : (viewMode === 'chrono' || viewMode === 'archive') ? (
        <div className="px-[4vw] pt-[2vw]">
          <div className="stagger-enter" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chronoSorted.map(report => (
              <div key={report.id}>
                <AccordionReportCard
                  report={report}
                  onSelect={onSelectReport}
                  unread={unreadByReport[report.id] || 0}
                  lastMessage={lastMessages[report.id]}
                  activity={activityMap[report.id]}
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
              activityMap={activityMap}
              isExpanded={expandedSections.has(s)}
              onToggle={() => toggleSection(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
