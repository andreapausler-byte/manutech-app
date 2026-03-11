import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, timeAgo } from '../../lib/constants'
import { Badge, Button, Modal, Input, Textarea, Select, EmptyState, Spinner } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import { useToast } from '../../hooks/useToast'
import ReportDetailModal from './reports/ReportDetailModal'
import { Plus, Search, Eye, X } from 'lucide-react'

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
  const [form, setForm] = useState({ title: '', machine: '', severity: 'media', description: '' })
  const [media, setMedia] = useState([])
  const [machines, setMachines] = useState([])

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
      }).catch(() => {})
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

  const createReport = async () => {
    if (!form.title.trim() || !form.description.trim()) return
    const created = await db.createReport({
      ...form, media,
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
    setForm({ title: '', machine: '', severity: 'media', description: '' })
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
    <div className="space-y-5 animate-fade-in">

      {/* Status filter bar */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS).map(([key, { label, color }]) => {
          const count = reports.filter(r => r.status === key).length
          return (
            <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                filterStatus === key ? 'text-white shadow-lg' : 'card-elevated text-muted hover:text-white hover:border-token'
              }`}
              style={filterStatus === key ? { background: color, boxShadow: `0 4px 14px ${color}33` } : {}}>
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              {label}
              <span className="font-bold text-white">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input type="text" placeholder="Cerca per titolo, macchinario o autore..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white">
              <X size={16} />
            </button>
          )}
        </div>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
          className="card-elevated rounded-xl px-4 py-3 text-sm text-themed focus:outline-none focus:border-blue-500/50">
          <option value="">Tutte le gravità</option>
          {Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {activeFilters > 0 && (
          <button onClick={() => { setFilterStatus(''); setFilterSeverity('') }}
            className="text-sm text-muted hover:text-white px-3 py-2 rounded-lg hover:bg-white/5">
            Rimuovi filtri
          </button>
        )}
        <Button onClick={() => setShowNew(true)}><Plus size={18} /> Nuova</Button>
      </div>

      <p className="text-sm text-faint">{filtered.length} segnalazioni {activeFilters > 0 ? '(filtrate)' : ''}</p>

      {/* Table */}
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="📋" title="Nessuna segnalazione trovata"
          subtitle={activeFilters > 0 ? 'Prova a modificare i filtri' : undefined} />
      ) : (
        <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-token">
                {['Segnalazione', 'Macchinario', 'Gravità', 'Stato', 'Assegnato a', 'Data', ''].map((h, i) => (
                  <th key={i} className={`text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider
                    ${i === 1 || i === 4 || i === 5 ? 'hidden lg:table-cell' : ''}
                    ${i === 2 ? 'hidden md:table-cell' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const sts = STATUS[r.status] || STATUS.aperta
                const sev = SEVERITY[r.severity] || SEVERITY.media
                return (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className="border-b border-token/30 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <td className="px-5 py-4">
                      <p className="text-[15px] text-white font-medium group-hover:text-blue-300 transition-colors">{r.title}</p>
                      <p className="text-xs text-faint mt-0.5">{r.created_by_name || 'Sconosciuto'}</p>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell"><span className="text-sm text-muted">{r.machine || '—'}</span></td>
                    <td className="px-5 py-4 hidden md:table-cell"><Badge {...sev} /></td>
                    <td className="px-5 py-4"><Badge {...sts} /></td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {r.assigned_to_name
                        ? <span className="text-sm text-secondary">🔧 {r.assigned_to_name}</span>
                        : <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md font-medium">Da assegnare</span>}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell"><span className="text-sm text-faint">{timeAgo(r.created_at)}</span></td>
                    <td className="px-5 py-4">
                      <button className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white opacity-0 group-hover:opacity-100 transition-all">
                        <Eye size={16} />
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
