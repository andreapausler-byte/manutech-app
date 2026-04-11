import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { Button, Modal, Input, Textarea, Select, EmptyState, Spinner } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import { useToast } from '../../hooks/useToast'
import ReportDetailModal from './reports/ReportDetailModal'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import { avatarGradient } from '../../hooks/usePremiumUI'
import { Plus, Search, X, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react'

const NAV_ITEM = findNavItem('reports')

// ── StatusPill: badge bordato stile mockup (bg tint + border colored + text colored) ──
function StatusPill({ color, label }) {
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap"
      style={{
        background: `${color}1f`,
        borderColor: `${color}66`,
        color,
      }}
    >
      {label}
    </span>
  )
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

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />

      {/* Status filter pills — sempre visibili, colorate, con count */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS).map(([key, { label, color }]) => {
          const count = reports.filter(r => r.status === key).length
          const active = filterStatus === key
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? '' : key)}
              aria-pressed={active}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all press-scale"
              style={{
                background: active ? `${color}22` : `${color}0d`,
                border: `1px solid ${active ? color : `${color}40`}`,
                color: active ? '#ffffff' : color,
                boxShadow: active ? `0 0 16px ${color}33` : 'none',
              }}
            >
              {label}
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: active ? 'rgba(255,255,255,0.15)' : `${color}1a`,
                  color: active ? '#ffffff' : color,
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Toolbar: severity filter sinistra, search + nuova destra */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="rounded-lg px-4 py-2 text-sm focus:outline-none transition-colors"
            style={{
              background: 'var(--color-sidebar-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <option value="">Tutte le gravità</option>
            {Object.entries(SEVERITY).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
              className="text-sm px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Rimuovi filtri
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'segnalazione' : 'segnalazioni'}
            {activeFilters > 0 && ' (filtrate)'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              placeholder="Cerca"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9 pr-9 py-2 text-sm rounded-lg focus:outline-none transition-colors"
              style={{
                background: 'var(--color-sidebar-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Cancella ricerca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:text-white"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} /> Nuova
          </Button>
        </div>
      </div>

      {/* Data table */}
      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Nessuna segnalazione trovata"
          subtitle={activeFilters > 0 ? 'Prova a modificare i filtri' : undefined}
        />
      ) : (
        <div
          className="rounded-xl overflow-hidden shadow-lg"
          style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
          }}
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="text-[11px] uppercase tracking-wider"
                style={{
                  color: 'var(--color-text-muted)',
                  background: 'rgba(0,0,0,0.2)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {[
                  { label: 'Segnalazione', field: null,               w: 'w-[24%]' },
                  { label: 'Macchinario',  field: 'machine',          w: 'w-[14%]', hide: 'hidden lg:table-cell' },
                  { label: 'Gravità',      field: null,               w: 'w-[11%]', hide: 'hidden md:table-cell' },
                  { label: 'Tipo',         field: null,               w: 'w-[12%]', hide: 'hidden lg:table-cell' },
                  { label: 'Stato',        field: 'status',           w: 'w-[12%]' },
                  { label: 'Assegnato',    field: 'assigned_to_name', w: 'w-[16%]', hide: 'hidden lg:table-cell' },
                  { label: 'Data',         field: 'created_at',       w: 'w-[10%]', hide: 'hidden lg:table-cell' },
                  { label: '',             field: null,               w: 'w-10' },
                ].map((col, i) => (
                  <th
                    key={i}
                    className={`px-6 py-4 font-medium ${col.w} ${col.hide || ''} ${col.field ? 'cursor-pointer select-none hover:text-white' : ''}`}
                    onClick={col.field ? () => toggleSort(col.field) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
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
              {sorted.map(r => {
                const sts = STATUS[r.status] || STATUS.aperta
                const sev = SEVERITY[r.severity] || SEVERITY.media
                const typ = r.type && REPORT_TYPES[r.type] ? REPORT_TYPES[r.type] : null
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                  >
                    {/* Segnalazione: titolo + autore */}
                    <td className="px-6 py-4">
                      <p
                        className="font-medium group-hover:text-white transition-colors line-clamp-1"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {r.title}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {r.created_by_name || 'Sconosciuto'}
                      </p>
                    </td>

                    {/* Macchinario */}
                    <td className="px-6 py-4 hidden lg:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                      {r.machine || '—'}
                    </td>

                    {/* Gravità pill */}
                    <td className="px-6 py-4 hidden md:table-cell">
                      <StatusPill color={sev.color} label={sev.label} />
                    </td>

                    {/* Tipo pill */}
                    <td className="px-6 py-4 hidden lg:table-cell">
                      {typ ? (
                        <StatusPill color={typ.color} label={typ.label} />
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Stato pill */}
                    <td className="px-6 py-4">
                      <StatusPill color={sts.color} label={sts.label} />
                    </td>

                    {/* Assegnato: avatar + nome */}
                    <td className="px-6 py-4 hidden lg:table-cell">
                      {r.assigned_to_name ? (
                        <div className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: avatarGradient(r.assigned_to_name) }}
                          >
                            {r.assigned_to_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="truncate">{r.assigned_to_name}</span>
                        </div>
                      ) : (
                        <span
                          className="text-[11px] font-medium px-2 py-1 rounded-md inline-block"
                          style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)' }}
                        >
                          Da assegnare
                        </span>
                      )}
                    </td>

                    {/* Data */}
                    <td className="px-6 py-4 hidden lg:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                      {timeAgo(r.created_at)}
                    </td>

                    {/* Kebab menu (placeholder → apre detail) */}
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelected(r) }}
                        aria-label="Azioni"
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
