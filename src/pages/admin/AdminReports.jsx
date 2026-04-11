import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { Badge, Button, Modal, Input, Textarea, Select, EmptyState, Spinner } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import { useToast } from '../../hooks/useToast'
import ReportDetailModal from './reports/ReportDetailModal'
import { Plus, Search, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

const PER_PAGE = 15

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function avatarColorFromName(name) {
  if (!name) return '#7c6aff'
  const palette = ['#7c6aff', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return palette[Math.abs(hash) % palette.length]
}

export default function AdminReports({ initialReportId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ title: '', machine: '', severity: 'media', type: 'correttiva', description: '' })
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  // Wrappers che resettano la paginazione quando cambia un filtro
  const updateSearch = (v) => { setSearch(v); setPage(1) }
  const updateFilterStatus = (v) => { setFilterStatus(v); setPage(1) }
  const updateFilterSeverity = (v) => { setFilterSeverity(v); setPage(1) }

  const load = async () => {
    setLoading(true)
    const [r, u, m] = await Promise.all([db.getReports(), db.getUsers(), db.getMachines()])
    setReports(r); setUsers(u); setMachines(m); setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Deep link da email: apri report specifico ──
  useEffect(() => {
    if (initialReportId && !loading && !selected) {
      db.getReport(initialReportId).then(report => {
        if (report) setSelected(report)
      }).catch(() => console.warn('[ManuTech] Impossibile caricare report:', initialReportId))
    }
  }, [initialReportId, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const filtered = reports.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterSeverity && r.severity !== filterSeverity) return false
    if (search) {
      const q = search.toLowerCase()
      return r.title?.toLowerCase().includes(q) || r.machine?.toLowerCase().includes(q) || r.created_by_name?.toLowerCase().includes(q)
    }
    return true
  })

  const activeFilters = [filterStatus, filterSeverity].filter(Boolean).length

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    switch (sortBy) {
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * PER_PAGE
  const endIdx = Math.min(startIdx + PER_PAGE, sorted.length)
  const paginated = sorted.slice(startIdx, endIdx)

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
        type: 'new_report',
        title: `Nuova segnalazione: ${form.title.trim()}`,
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

  const glassPanelStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  }

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ═══ PREMIUM HEADER ═══ */}
      <header>
        {/* Breadcrumb */}
        <nav className="flex text-[11px] font-medium text-faint uppercase tracking-widest mb-2 gap-2">
          <span>Gestione</span>
          <span>/</span>
          <span style={{ color: 'var(--color-primary, #7c6aff)' }}>Segnalazioni</span>
        </nav>

        {/* Title row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <h1 className="text-3xl lg:text-4xl font-extrabold text-themed tracking-tight flex items-center">
            Segnalazioni
            <span className="ml-4 px-2.5 py-0.5 bg-surface-2 text-faint text-sm font-medium rounded-md border border-token">
              {reports.length}
            </span>
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative group">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint group-focus-within:text-violet-400 transition-colors pointer-events-none" />
              <input
                type="text"
                placeholder="Cerca per titolo, macchinario o autore..."
                value={search}
                onChange={e => updateSearch(e.target.value)}
                className="w-72 bg-surface-1/60 border border-token text-themed text-sm rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 placeholder-gray-600 transition-all"
              />
              {search && (
                <button onClick={() => updateSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>
            <Button onClick={() => setShowNew(true)}><Plus size={16} /> Nuova</Button>
          </div>
        </div>

        {/* Glass filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tutte */}
          <button
            onClick={() => updateFilterStatus('')}
            className="filter-chip text-sm px-4 py-2 rounded-full border flex items-center transition-all"
            style={filterStatus === ''
              ? { ...glassPanelStyle, background: 'rgba(124,106,255,0.10)', borderColor: 'rgba(124,106,255,0.6)', color: '#a594ff' }
              : { ...glassPanelStyle, color: 'var(--color-text-muted)' }}
          >
            Tutte <span className="ml-2 opacity-60 font-normal">{reports.length}</span>
          </button>

          <div className="h-4 w-[1px] bg-token mx-1" />

          {Object.entries(STATUS).map(([key, { label, color }]) => {
            const count = reports.filter(r => r.status === key).length
            const isActive = filterStatus === key
            return (
              <button
                key={key}
                onClick={() => updateFilterStatus(filterStatus === key ? '' : key)}
                className="filter-chip text-sm px-4 py-2 rounded-full border flex items-center transition-all"
                style={isActive
                  ? { ...glassPanelStyle, background: color + '15', borderColor: color + '99', color }
                  : { ...glassPanelStyle, color: 'var(--color-text-muted)' }}
              >
                <span className="h-2 w-2 rounded-full mr-2.5" style={{ background: color }} />
                {label}
                <span className="ml-2 text-xs opacity-60">{count}</span>
              </button>
            )
          })}

          {/* Severity filter (compact) */}
          <select
            value={filterSeverity}
            onChange={e => updateFilterSeverity(e.target.value)}
            className="ml-auto bg-surface-1/60 border border-token text-themed text-xs rounded-full px-4 py-2 focus:outline-none focus:border-violet-500/50"
          >
            <option value="">Tutte le gravità</option>
            {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
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
                <tr className="text-[11px] uppercase text-faint border-b border-token bg-surface-1/30">
                  {[
                    { label: 'Segnalazione', field: null, className: 'px-8 py-5 w-[28%]' },
                    { label: 'Macchinario', field: 'machine', className: 'px-6 py-5 w-[14%] hidden lg:table-cell' },
                    { label: 'Gravità', field: null, className: 'px-6 py-5 w-[10%] text-center hidden md:table-cell' },
                    { label: 'Tipo', field: null, className: 'px-6 py-5 w-[10%] text-center hidden lg:table-cell' },
                    { label: 'Stato', field: 'status', className: 'px-6 py-5 w-[12%] text-center' },
                    { label: 'Assegnato', field: 'assigned_to_name', className: 'px-6 py-5 w-[14%] hidden lg:table-cell' },
                    { label: 'Data', field: 'created_at', className: 'px-8 py-5 text-right' },
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`font-bold tracking-widest ${col.className} ${col.field ? 'cursor-pointer select-none hover:text-themed' : ''}`}
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
              <tbody className="divide-y divide-token/40 text-[13px]">
                {paginated.map(r => {
                  const sts = STATUS[r.status] || STATUS.aperta
                  const sev = SEVERITY[r.severity] || SEVERITY.media
                  const typ = r.type && REPORT_TYPES[r.type] ? REPORT_TYPES[r.type] : null
                  const initials = getInitials(r.assigned_to_name)
                  const avatarBg = avatarColorFromName(r.assigned_to_name)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="hover:bg-violet-500/[0.03] transition-colors group cursor-pointer"
                    >
                      <td className="px-8 py-5">
                        <div className="font-semibold text-themed mb-0.5 group-hover:text-violet-300 transition-colors truncate">{r.title}</div>
                        <div className="text-[11px] text-faint font-medium truncate">{r.created_by_name || 'Sconosciuto'}</div>
                      </td>
                      <td className="px-6 py-5 hidden lg:table-cell">
                        <span className="text-faint italic font-medium truncate block">{r.machine || '—'}</span>
                      </td>
                      <td className="px-6 py-5 text-center hidden md:table-cell">
                        <span
                          className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border"
                          style={{ background: sev.color + '15', color: sev.color, borderColor: sev.color + '30' }}
                        >
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center hidden lg:table-cell">
                        {typ ? (
                          <span
                            className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border"
                            style={{ background: typ.color + '15', color: typ.color, borderColor: typ.color + '30' }}
                          >
                            {typ.label}
                          </span>
                        ) : <span className="text-xs text-faint">—</span>}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span
                          className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border"
                          style={{ background: sts.color + '15', color: sts.color, borderColor: sts.color + '30' }}
                        >
                          {sts.label}
                        </span>
                      </td>
                      <td className="px-6 py-5 hidden lg:table-cell">
                        {r.assigned_to_name ? (
                          <div className="flex items-center text-secondary min-w-0">
                            <div
                              className="h-7 w-7 rounded-full mr-3 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm"
                              style={{ background: avatarBg, boxShadow: `0 0 0 1px ${avatarBg}40` }}
                            >
                              {initials}
                            </div>
                            <span className="font-medium truncate">{r.assigned_to_name}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Da assegnare</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right text-faint font-medium whitespace-nowrap">{timeAgo(r.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="px-8 py-5 bg-surface-1/30 border-t border-token flex items-center justify-between">
            <p className="text-[11px] text-faint font-medium uppercase tracking-widest">
              Mostrando {sorted.length === 0 ? 0 : startIdx + 1}-{endIdx} di {sorted.length} segnalazioni
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-faint font-medium mr-2">Pagina {safePage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-2 rounded-lg border border-token text-faint hover:bg-surface-2 hover:text-themed transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Pagina precedente"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-2 rounded-lg border border-token text-faint hover:bg-surface-2 hover:text-themed transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Pagina successiva"
              >
                <ChevronRight size={16} />
              </button>
            </div>
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
          onClose={handleDetailClose}
          onUpdate={handleDetailUpdate}
        />
      )}
    </div>
  )
}
