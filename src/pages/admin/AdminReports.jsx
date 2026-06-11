import { useState, useEffect, useMemo } from 'react'
import hotToast from 'react-hot-toast'
import { db, supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo, formatDate, formatTicketId } from '../../lib/constants'
import { PLANNING_STATE } from '../../lib/interventions'
import { Button, Modal, Input, Textarea, Select, EmptyState, Spinner, TicketIdBadge } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import ReportDetailModal from './reports/ReportDetailModal'
import MergeReportModal from './reports/MergeReportModal'
import { useMergeSegnalazione } from '../../hooks/useMergeSegnalazione'
import { avatarGradient } from '../../hooks/usePremiumUI'
import { Plus, Search, X, ChevronUp, ChevronDown, ChevronRight, Star, GitMerge } from 'lucide-react'

const TERMINAL_STATUSES = ['risolta', 'chiuso']
const RECENT_COMPLETED_WINDOW_HOURS = 24

// ── CellBadge: piccolo badge bordato per celle tabella (gravità/tipo/stato) ──
function CellBadge({ color, label }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border whitespace-nowrap"
      style={{ background: `${color}15`, color, borderColor: `${color}30` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </span>
  )
}

// ── Glass panel style condiviso (header + tabella) ──
const glassPanelStyle = {
  background: 'rgba(30, 41, 59, 0.4)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
}

export default function AdminReports({ initialReportId }) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ title: '', machine: '', severity: 'media', type: 'correttiva', description: '' })
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])
  // Default: ordina per ultima attività (updated_at). Il trigger DB 050
  // propaga updated_at quando arriva un commento, quindi i ticket "vivi"
  // in chat salgono in cima — l'admin vede subito chi sta scrivendo.
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')
  const [archiveOpen, setArchiveOpen] = useState(false)
  // Set dei report_id stellati dall'admin loggato (preferiti personali).
  // Pinnati sempre in cima al sort, indipendentemente dal criterio.
  const [starred, setStarred] = useState(() => new Set())
  // Mappa reportId → { planning_state, active_count, next_at } dalla view
  // reports_with_planning (mig 053). Mostrato come chip accanto al titolo.
  const [planningMap, setPlanningMap] = useState({})
  // Merge duplicati (mig 057): segnalazione sorgente del modal "Unisci a…".
  const [mergeSource, setMergeSource] = useState(null)
  const { unmerge } = useMergeSegnalazione()
  const canMergeRole = ['tecnico', 'admin', 'super_admin'].includes(user?.role)

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const [r, u, m, s] = await Promise.all([
      db.getReports(),
      db.getUsers(),
      db.getMachines(),
      db.getStarredReportIds(user?.id),
    ])
    setReports(r); setUsers(u); setMachines(m); setStarred(s)
    if (!silent) setLoading(false)
    // Planning state in second pass — non bloccare il primo paint.
    if (r?.length) {
      db.getPlanningStateForReports(r.map(rep => rep.id))
        .then(map => setPlanningMap(map || {}))
        .catch(e => console.warn('[AdminReports] planning state load failed:', e?.message))
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh quando la pagina torna visibile (ritorno tab, app PWA da
  // background): allinea l'ordinamento "Ultima attività" per modifiche
  // server-side che non passano dalla subscription realtime sui commenti
  // (es. cambio status da altro device). Throttle 30s + silent (no spinner)
  // per evitare flicker.
  useEffect(() => {
    let lastVisibleLoadAt = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastVisibleLoadAt < 30_000) return
      lastVisibleLoadAt = now
      load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce 200ms: stesso pattern del mobile per coerenza UX.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  // Mappa machine_id → name per fallback quando lo snapshot `machine` è null.
  const machineNameById = useMemo(() => {
    const m = new Map()
    for (const machine of machines) m.set(machine.id, machine.name)
    return m
  }, [machines])

  // Conteggio duplicati per master (mig 057): calcolato client-side dal set già
  // caricato (i duplicati hanno duplicate_of_id valorizzato). Niente embedded
  // count PostgREST → nessun rischio di ambiguità self-join. Vedi corrections §10.
  const duplicateCountByMaster = useMemo(() => {
    const m = new Map()
    for (const r of reports) {
      if (r.duplicate_of_id) m.set(r.duplicate_of_id, (m.get(r.duplicate_of_id) || 0) + 1)
    }
    return m
  }, [reports])

  // Toggle stella con optimistic update. Se la chiamata DB fallisce,
  // rollback dello state per coerenza UI ↔ DB.
  const toggleStar = async (reportId, e) => {
    e?.stopPropagation()
    if (!user?.id) return
    const isStarred = starred.has(reportId)
    setStarred(prev => {
      const next = new Set(prev)
      if (isStarred) next.delete(reportId)
      else next.add(reportId)
      return next
    })
    try {
      await db.toggleReportStar(user.id, reportId, !isStarred)
    } catch (err) {
      console.warn('[ManuTech] toggleStar fallito, rollback:', err.message)
      setStarred(prev => {
        const next = new Set(prev)
        if (isStarred) next.add(reportId)
        else next.delete(reportId)
        return next
      })
    }
  }

  // ── Realtime: nuovo commento → bump updated_at della riga corrispondente.
  // Il trigger DB 050 fa lo stesso server-side; qui lo riflettiamo subito
  // in UI senza un fetch completo, così la riga risale in cima al sort
  // "Ultima attività" mentre l'admin sta guardando la lista.
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel('admin-reports-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => {
          const reportId = payload.new?.report_id
          const createdAt = payload.new?.created_at || new Date().toISOString()
          if (!reportId) return
          setReports(prev => prev.map(r =>
            r.id === reportId ? { ...r, updated_at: createdAt } : r
          ))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Deep link da email: apri report specifico ──
  useEffect(() => {
    if (initialReportId && !loading && !selected) {
      db.getReport(initialReportId).then(report => {
        if (report) setSelected(report)
      }).catch(() => console.warn('[ManuTech] Impossibile caricare report:', initialReportId))
    }
  }, [initialReportId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Search estesa per coerenza con la mobile (ReportsList.jsx): titolo,
  // descrizione, macchina (snapshot + fallback via machine_id), tecnico
  // assegnato, creatore, TK-id (normalizzato) e UUID raw.
  const filtered = reports.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterSeverity && r.severity !== filterSeverity) return false
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

  const activeFilters = [filterStatus, filterSeverity].filter(Boolean).length

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const sorted = [...filtered].sort((a, b) => {
    // Le stellate vincono sempre, qualunque sia il sort attivo: pin rigido
    // in cima alla GitHub. Tra due stellate (o due non stellate) si applica
    // il criterio scelto dall'utente.
    const aStar = starred.has(a.id) ? 1 : 0
    const bStar = starred.has(b.id) ? 1 : 0
    if (aStar !== bStar) return bStar - aStar
    let va, vb
    switch (sortBy) {
      case 'updated_at': va = a.updated_at || a.created_at || ''; vb = b.updated_at || b.created_at || ''; break
      case 'created_at': va = a.created_at || ''; vb = b.created_at || ''; break
      case 'machine': va = (a.machine || '').toLowerCase(); vb = (b.machine || '').toLowerCase(); break
      case 'status': va = a.status || ''; vb = b.status || ''; break
      case 'assigned_to_name': va = a.assigned_to_name || ''; vb = b.assigned_to_name || ''; break
      default: return 0
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  // Split in attive + archivio (risolta/chiuso).
  // I terminali aggiornati entro RECENT_COMPLETED_WINDOW_HOURS restano nella
  // lista attiva al loro posto per updated_at: così l'admin vede subito il
  // completamento appena avvenuto come conferma visiva, e scendono in Archivio
  // solo quando "raffreddano". Se l'utente filtra esplicitamente su uno stato
  // terminale, mostra lista piatta come prima.
  const isFilteringArchive = TERMINAL_STATUSES.includes(filterStatus)
  const recentWindowMs = RECENT_COMPLETED_WINDOW_HOURS * 3600 * 1000
  // Rinfresca quando il dataset cambia (load() dopo create/update o realtime
  // bump da nuovi commenti): coerente con la spec "ricalcolo al prossimo
  // load(), niente timer". `reports` qui è dep come invalidator del memo,
  // non letto nella closure.
  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps -- Date.now stabile dentro useMemo([reports])
  const nowMs = useMemo(() => Date.now(), [reports])
  const isRecentTerminal = (r) => {
    if (!TERMINAL_STATUSES.includes(r.status)) return false
    const ts = new Date(r.updated_at || r.created_at).getTime()
    return Number.isFinite(ts) && (nowMs - ts) < recentWindowMs
  }
  const activeReports = isFilteringArchive
    ? sorted
    : sorted.filter(r => !TERMINAL_STATUSES.includes(r.status) || isRecentTerminal(r))
  const archivedReports = isFilteringArchive
    ? []
    : sorted.filter(r => TERMINAL_STATUSES.includes(r.status) && !isRecentTerminal(r))
  const hasArchiveSeparator = !isFilteringArchive && archivedReports.length > 0
  const autoExpandArchive = !!search && archivedReports.length > 0
  const archiveVisible = archiveOpen || autoExpandArchive

  const createReport = async () => {
    if (!form.title.trim() || !form.description.trim()) return
    const created = await db.createReport({
      title: form.title.trim(), machine: form.machine || null,
      severity: form.severity, type: form.type, description: form.description.trim(),
      media,
      created_by: user?.id,
      created_by_name: user?.name || 'Admin',
      status: 'aperta',
    })
    if (created?.id) {
      db.addNotification({
        type: form.severity === 'critica' ? 'new_report_critical' : 'new_report',
        title: `${formatTicketId(created)} · ${form.title.trim()}`,
        body: `${user?.name || 'Admin'} ha creato una segnalazione ${form.severity}`,
        report_id: created.id,
        from_user: user?.id,
        target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
    }
    setShowNew(false)
    setForm({ title: '', machine: '', severity: 'media', type: 'correttiva', description: '' })
    setMedia([])
    load()
  }

  const handleDetailUpdate = (updates) => {
    setSelected(s => s ? { ...s, ...updates } : null)
    load()
  }

  const handleDetailClose = (deleted) => {
    setSelected(null)
    if (deleted) load()
  }

  // Apre il dettaglio di un report dato l'id (navigazione banner/figli del merge).
  const openReportById = (id) => {
    const inList = reports.find(r => r.id === id)
    if (inList) { setSelected(inList); return }
    db.getReport(id).then(r => { if (r) setSelected(r) }).catch(() => {})
  }

  // Successo merge: chiudi il modal, aggiorna l'eventuale dettaglio aperto sul
  // duplicato, refetch, e mostra un toast "Annulla" (undo, ~8s) che invoca unmerge.
  const handleMerged = (result, meta) => {
    setMergeSource(null)
    setSelected(s => (s && s.id === meta.duplicateId ? { ...s, ...result } : s))
    load()
    hotToast.custom((t) => (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 12, maxWidth: 380,
        background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-xl)',
      }}>
        <GitMerge size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--color-text)' }}>
          Unita a <strong>{formatTicketId(meta.masterReport)}</strong>
        </span>
        <button
          onClick={() => { hotToast.dismiss(t.id); unmerge(meta.duplicateId, { onSuccess: () => load() }) }}
          style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
        >
          Annulla
        </button>
        <button onClick={() => hotToast.dismiss(t.id)} aria-label="Chiudi"
          style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
          <X size={14} />
        </button>
      </div>
    ), { duration: 8000 })
  }

  const renderReportRow = (r, archived) => {
    const sts = STATUS[r.status] || STATUS.aperta
    const sev = SEVERITY[r.severity] || SEVERITY.media
    const typ = r.type && REPORT_TYPES[r.type] ? REPORT_TYPES[r.type] : null
    const isStarred = starred.has(r.id)
    const dupCount = duplicateCountByMaster.get(r.id) || 0
    const canMergeRow = canMergeRole && !r.duplicate_of_id && dupCount === 0 && !TERMINAL_STATUSES.includes(r.status)
    const planning = planningMap[r.id]
    const planningMeta = planning && PLANNING_STATE[planning.planning_state]
    // Mostra il chip solo per gli stati informativi (da_pianificare, pianificato,
    // in_corso). risolta/altro restano impliciti dal status badge esistente.
    const showPlanningChip = planningMeta
      && ['da_pianificare', 'pianificato', 'in_corso'].includes(planning.planning_state)
    return (
      <tr
        key={r.id}
        onClick={() => setSelected(r)}
        className="hover:bg-indigo-500/5 transition-colors duration-200 group cursor-pointer"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          opacity: archived ? 0.75 : 1,
        }}
      >
        <td className="pl-5 pr-1 py-5 align-middle text-center w-[44px]">
          <button
            onClick={(e) => toggleStar(r.id, e)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/5 transition-colors"
            aria-label={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            aria-pressed={isStarred}
            title={isStarred ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
          >
            <Star
              size={16}
              fill={isStarred ? '#facc15' : 'none'}
              color={isStarred ? '#facc15' : 'var(--color-text-muted)'}
              strokeWidth={isStarred ? 1.5 : 1.8}
            />
          </button>
        </td>
        <td className="px-8 py-5 align-middle">
          <TicketIdBadge report={r} className="text-[10px] font-bold mb-1" style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            letterSpacing: 1,
            fontFamily: '"JetBrains Mono", monospace',
            background: 'var(--color-primary-glow)',
            color: 'var(--color-primary)',
          }} />
          {dupCount > 0 && (
            <span
              className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded align-middle"
              title={`${dupCount} ${dupCount === 1 ? 'segnalazione unita' : 'segnalazioni unite'}`}
              style={{ background: 'rgba(124,106,255,0.14)', color: 'var(--color-primary)' }}
            >
              ×{dupCount}
            </span>
          )}
          <div
            className="font-semibold mb-0.5 group-hover:text-indigo-300 transition-colors truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {r.title}
          </div>
          <div className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text-muted)' }}>
            {r.created_by_name || 'Sconosciuto'}
          </div>
          {showPlanningChip && (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1"
              style={{ background: planningMeta.bg, color: planningMeta.color }}
              title={planning.next_at ? `Prossimo: ${formatDate(planning.next_at)}` : undefined}
            >
              <span>{planningMeta.icon}</span> {planningMeta.label}
            </span>
          )}
        </td>
        <td className="px-6 py-5 align-middle hidden lg:table-cell">
          <span className="italic font-medium truncate block" style={{ color: 'var(--color-text-muted)' }}>
            {r.machine || '—'}
          </span>
        </td>
        <td className="px-6 py-5 align-middle text-center hidden md:table-cell">
          <CellBadge color={sev.color} label={sev.label} />
        </td>
        <td className="px-6 py-5 align-middle text-center hidden lg:table-cell">
          {typ ? (
            <CellBadge color={typ.color} label={typ.label} />
          ) : (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>—</span>
          )}
        </td>
        <td className="px-6 py-5 align-middle text-center">
          <CellBadge color={sts.color} label={sts.label} />
        </td>
        <td className="px-6 py-5 align-middle hidden lg:table-cell">
          {r.assigned_to_name ? (
            <div className="flex items-center min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
              <div
                className="h-7 w-7 rounded-full mr-3 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm"
                style={{ background: avatarGradient(r.assigned_to_name) }}
              >
                {r.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="font-medium truncate">{r.assigned_to_name}</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
              Da assegnare
            </span>
          )}
        </td>
        <td
          className="px-8 py-5 align-middle text-right font-medium whitespace-nowrap"
          style={{ color: 'var(--color-text-muted)' }}
          title={r.created_at ? `Creata: ${formatDate(r.created_at)}` : undefined}
        >
          <div className="inline-flex items-center gap-2 justify-end">
            {canMergeRow && (
              <button
                onClick={(e) => { e.stopPropagation(); setMergeSource(r) }}
                aria-label="Unisci a un'altra segnalazione"
                title="Unisci a…"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-violet-500/10 text-muted hover:text-violet-400"
              >
                <GitMerge size={15} />
              </button>
            )}
            <span>{timeAgo(r.updated_at || r.created_at)}</span>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ═══ PREMIUM HEADER ═══ */}
      <header>
        {/* Breadcrumb */}
        <nav className="flex text-[11px] font-medium uppercase tracking-widest mb-2 gap-2" style={{ color: 'var(--color-text-muted)' }}>
          <span>Gestione</span>
          <span>/</span>
          <span style={{ color: 'var(--color-primary, #7c6aff)' }}>Segnalazioni</span>
        </nav>

        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight flex items-center" style={{ color: 'var(--color-text)' }}>
            Segnalazioni
            <span
              className="ml-4 px-2.5 py-0.5 text-sm font-medium rounded-md border"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-muted)',
                borderColor: 'var(--color-border)',
              }}
            >
              {reports.length}
            </span>
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative group">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                type="text"
                placeholder="Cerca per titolo, macchinario o autore..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-72 text-sm rounded-full pl-10 pr-9 py-2.5 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                style={{
                  background: 'var(--color-sidebar-bg)',
                  color: 'var(--color-text)',
                }}
                aria-label="Cerca segnalazioni"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Cancella ricerca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full bg-linear-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all press-scale"
            >
              <Plus size={16} /> Nuova
            </button>
          </div>
        </div>

        {/* Glass filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tutte */}
          <button
            onClick={() => setFilterStatus('')}
            aria-pressed={filterStatus === ''}
            className="text-sm px-4 py-2 rounded-full border flex items-center transition-all press-scale"
            style={filterStatus === ''
              ? { ...glassPanelStyle, background: 'rgba(124,106,255,0.10)', borderColor: 'rgba(124,106,255,0.6)', color: '#a594ff' }
              : { ...glassPanelStyle, color: 'var(--color-text-muted)' }}
          >
            Tutte <span className="ml-2 opacity-60 font-normal">{reports.length}</span>
          </button>

          <div className="h-4 w-px mx-1" style={{ background: 'var(--color-border)' }} />

          {Object.entries(STATUS).map(([key, { label, color }]) => {
            const count = reports.filter(r => r.status === key).length
            const isActive = filterStatus === key
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                aria-pressed={isActive}
                className="text-sm px-4 py-2 rounded-full border flex items-center transition-all press-scale"
                style={isActive
                  ? { ...glassPanelStyle, background: `${color}15`, borderColor: `${color}99`, color }
                  : { ...glassPanelStyle, color: 'var(--color-text-muted)' }}
              >
                <span className="h-2 w-2 rounded-full mr-2.5" style={{ background: color }} />
                {label}
                <span className="ml-2 text-xs opacity-60">{count}</span>
              </button>
            )
          })}

          {/* Severity filter (compact, right-aligned) */}
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="ml-auto text-xs rounded-full px-4 py-2 focus:outline-none"
            style={{
              background: 'var(--color-sidebar-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
            aria-label="Filtra per gravità"
          >
            <option value="">Tutte le gravità</option>
            {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
              className="text-xs px-3 py-2 rounded-full transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Rimuovi filtri
            </button>
          )}
        </div>
      </header>

      {/* ═══ MAIN DATA AREA ═══ */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione trovata"
          subtitle={activeFilters > 0 ? 'Prova a modificare i filtri' : undefined} />
      ) : (
        <div className="rounded-2xl overflow-hidden shadow-2xl" style={glassPanelStyle}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr
                  className="text-[11px] uppercase bg-slate-900/40 backdrop-blur-md"
                  style={{
                    color: 'var(--color-text-muted)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  {[
                    { label: '', field: null, className: 'pl-5 pr-1 py-5 w-[44px]' },
                    { label: 'Segnalazione', field: null, className: 'px-8 py-5 w-[26%]' },
                    { label: 'Macchinario', field: 'machine', className: 'px-6 py-5 w-[14%] hidden lg:table-cell' },
                    { label: 'Gravità', field: null, className: 'px-6 py-5 w-[10%] text-center hidden md:table-cell' },
                    { label: 'Tipo', field: null, className: 'px-6 py-5 w-[10%] text-center hidden lg:table-cell' },
                    { label: 'Stato', field: 'status', className: 'px-6 py-5 w-[12%] text-center' },
                    { label: 'Assegnato', field: 'assigned_to_name', className: 'px-6 py-5 w-[14%] hidden lg:table-cell' },
                    { label: 'Ultima attività', field: 'updated_at', className: 'px-8 py-5 text-right' },
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`font-bold tracking-widest ${col.className} ${col.field ? 'cursor-pointer select-none hover:text-white' : ''}`}
                      onClick={col.field ? () => toggleSort(col.field) : undefined}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.className.includes('text-center') ? 'justify-center w-full' : ''} ${col.className.includes('text-right') ? 'justify-end w-full' : ''}`}>
                        {col.label}
                        {col.field && sortBy === col.field && (
                          sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {activeReports.map(r => renderReportRow(r, false))}

                {hasArchiveSeparator && (
                  <tr
                    onClick={() => setArchiveOpen(o => !o)}
                    className="cursor-pointer select-none hover:bg-white/5 transition-colors"
                    style={{
                      background: 'var(--color-surface-2)',
                      borderTop: '1px solid var(--color-border)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                    aria-expanded={archiveVisible}
                  >
                    <td colSpan={8} className="px-8 py-3">
                      <div
                        className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {archiveVisible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Archivio
                        <span
                          className="px-2 py-0.5 rounded-md"
                          style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
                        >
                          {archivedReports.length}
                        </span>
                        <span className="font-normal normal-case tracking-normal opacity-60">
                          segnalazioni completate o chiuse
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {hasArchiveSeparator && archiveVisible && archivedReports.map(r => renderReportRow(r, true))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Report Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuova Segnalazione" size="lg">
        <div className="space-y-4">
          <Input label="Titolo *" placeholder="Descrivi il problema"
            value={form.title} onChange={e => set('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Macchinario" value={form.machine} onChange={e => set('machine', e.target.value)}
              options={[{ value: '', label: 'Seleziona...' }, ...machines.map(m => ({ value: m.name, label: m.name }))]} />
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Gravità</label>
              <div className="flex gap-2">
                {Object.entries(SEVERITY).map(([key, { label, color }]) => (
                  <button key={key} onClick={() => set('severity', key)}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${form.severity === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                    style={form.severity === key ? { background: color } : {}}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Tipo Intervento</label>
            <div className="flex gap-2">
              {Object.entries(REPORT_TYPES).map(([key, { label, color, icon }]) => (
                <button key={key} onClick={() => set('type', key)}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${form.type === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                  style={form.type === key ? { background: color } : {}}>{icon} {label}</button>
              ))}
            </div>
          </div>
          <Textarea label="Descrizione *" placeholder="Dettagli..."
            value={form.description} onChange={e => set('description', e.target.value)} />
          <MediaCapture media={media} onChange={setMedia} />
          <Button onClick={createReport} className="w-full" size="lg"
            disabled={!form.title.trim() || !form.description.trim()}>
            Crea Segnalazione
          </Button>
        </div>
      </Modal>

      {/* Detail Modal */}
      {selected && (
        <ReportDetailModal
          selected={selected}
          user={user}
          users={users}
          machines={machines}
          allReports={reports}
          onClose={handleDetailClose}
          onUpdate={handleDetailUpdate}
          onRequestMerge={() => setMergeSource(selected)}
          onOpenReport={openReportById}
        />
      )}

      {/* Merge duplicati Modal */}
      {mergeSource && (
        <MergeReportModal
          sourceReport={mergeSource}
          onClose={() => setMergeSource(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  )
}
