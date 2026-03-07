import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { STATUS, SEVERITY, formatDate, timeAgo } from '../../lib/constants'
import { Badge, Button, Modal, Input, Textarea, Select, EmptyState, Spinner } from '../../components/ui'
import MediaCapture from '../../components/media/MediaCapture'
import ActivityTimeline from '../../components/reports/ActivityTimeline'
import ChatPanel from '../../components/chat/ChatPanel'
import { useToast } from '../../hooks/useToast'
import {
  Plus, Search, Eye, UserCheck, X, MessageCircle, Clock,
  Pencil, Trash2, Save, XCircle, AlertTriangle
} from 'lucide-react'

export default function AdminReports() {
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
  const [detailTab, setDetailTab] = useState('chat')

  // ── Edit mode state ──
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editMedia, setEditMedia] = useState([])
  const [saving, setSaving] = useState(false)

  // ── Delete confirmation state ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    const [r, u, m] = await Promise.all([db.getReports(), db.getUsers(), db.getMachines()])
    setReports(r); setUsers(u); setMachines(m); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const allAssignableUsers = users.filter(u => u.role === 'tecnico' || u.role === 'operatore' || u.role === 'admin')
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setEdit = (key, val) => setEditForm(f => ({ ...f, [key]: val }))

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
    await db.createReport({
      ...form, media,
      created_by: user?.id,
      created_by_name: user?.name || 'Admin',
      status: 'aperta',
    })
    setShowNew(false)
    setForm({ title: '', machine: '', severity: 'media', description: '' })
    setMedia([])
    load()
  }

  // ── Assign to any user ──
  const assignUser = async (reportId, userId) => {
    const assignee = users.find(u => u.id === userId)
    await db.updateReport(reportId, {
      assigned_to: userId, assigned_to_name: assignee?.name, status: 'assegnata',
    })
    db.addActivity(reportId, {
      type: 'assigned', detail: `${assignee?.name} (${assignee?.role})`,
      user_id: user?.id, user_name: user?.name,
    }).catch(() => {})
    load()
    setSelected(s => s ? { ...s, assigned_to: userId, assigned_to_name: assignee?.name, status: 'assegnata' } : null)
    toast.success(`Assegnato a ${assignee?.name}`)
  }

  const updateStatus = async (reportId, newStatus) => {
    const oldStatus = selected?.status
    await db.updateReport(reportId, { status: newStatus })
    db.addActivity(reportId, {
      type: 'status_change', from_status: oldStatus, to_status: newStatus,
      user_id: user?.id, user_name: user?.name,
    }).catch(() => {})
    if (selected?.created_by && selected.created_by !== user?.id) {
      db.addNotification({
        type: 'status_change',
        title: `Stato aggiornato: ${selected?.title}`,
        body: `${user?.name} ha cambiato lo stato a "${STATUS[newStatus]?.label || newStatus}"`,
        report_id: reportId, from_user: user?.id, target_user: selected.created_by,
      }).catch(() => {})
    }
    load()
    setSelected(s => s ? { ...s, status: newStatus } : null)
  }

  const selectReport = (report) => {
    setSelected(report)
    setDetailTab('chat')
    setEditing(false)
  }

  const closeDetail = () => {
    setSelected(null)
    setEditing(false)
    setShowDeleteConfirm(false)
  }

  // ── Edit functions ──
  const startEditing = () => {
    setEditForm({
      title: selected.title || '',
      description: selected.description || '',
      machine: selected.machine || '',
      severity: selected.severity || 'media',
    })
    setEditMedia(selected.media || [])
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setEditForm({})
    setEditMedia([])
  }

  const saveEdit = async () => {
    if (!editForm.title?.trim() || !editForm.description?.trim()) {
      toast.warning('Titolo e descrizione sono obbligatori')
      return
    }
    setSaving(true)
    try {
      const updates = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        machine: editForm.machine || null,
        severity: editForm.severity,
        media: editMedia,
      }
      const updated = await db.updateReport(selected.id, updates)
      
      // Log activity
      db.addActivity(selected.id, {
        type: 'edited',
        detail: `Segnalazione modificata da ${user?.name}`,
        user_id: user?.id,
        user_name: user?.name,
      }).catch(() => {})

      setSelected(s => ({ ...s, ...updated }))
      setEditing(false)
      toast.success('Segnalazione aggiornata')
      load()
    } catch (err) {
      toast.error('Errore salvataggio: ' + err.message)
    }
    setSaving(false)
  }

  // ── Delete function ──
  const deleteReport = async () => {
    setDeleting(true)
    try {
      await db.deleteReport(selected.id)
      toast.success('Segnalazione eliminata')
      setSelected(null)
      setShowDeleteConfirm(false)
      load()
    } catch (err) {
      toast.error('Errore eliminazione: ' + err.message)
    }
    setDeleting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ═══ Status filter bar ═══ */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(STATUS).map(([key, { label, color }]) => {
          const count = reports.filter(r => r.status === key).length
          return (
            <button key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                filterStatus === key
                  ? 'text-white shadow-lg'
                  : 'card-elevated text-muted hover:text-white hover:border-token'
              }`}
              style={filterStatus === key ? { background: color, boxShadow: `0 4px 14px ${color}33` } : {}}>
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              {label}
              <span className="font-bold text-white">{count}</span>
            </button>
          )
        })}
      </div>

      {/* ═══ Toolbar ═══ */}
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

      {/* ═══ Table ═══ */}
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
                  <tr key={r.id} onClick={() => selectReport(r)}
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

      {/* ═══ New Report Modal ═══ */}
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
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                      form.severity === key ? 'text-white' : 'bg-surface-2 text-muted'
                    }`}
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

      {/* ═══════════════════════════════════════════════════════ */}
      {/*  DETAIL MODAL — 3 columns: Info | Chat/Timeline | Act  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden"
            style={{ height: '82vh' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-token shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <Pencil size={16} className="text-amber-400" />
                    <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Modalità modifica</span>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-themed truncate">{selected.title}</h2>
                    <Badge {...(STATUS[selected.status] || STATUS.aperta)} />
                    <Badge {...(SEVERITY[selected.severity] || SEVERITY.media)} />
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!editing && (
                  <button onClick={startEditing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all">
                    <Pencil size={14} /> Modifica
                  </button>
                )}
                <button onClick={closeDetail}
                  className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0">
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* 3-column body */}
            <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(82vh - 65px)' }}>

              {/* ── COL 1: Report Info / Edit Form (3/12) ── */}
              <div className="col-span-3 border-r border-token overflow-y-auto p-5 space-y-4">
                {editing ? (
                  /* ═══ EDIT MODE ═══ */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Titolo *</label>
                      <input type="text" value={editForm.title}
                        onChange={e => setEdit('title', e.target.value)}
                        className="w-full input-field rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Descrizione *</label>
                      <textarea value={editForm.description}
                        onChange={e => setEdit('description', e.target.value)}
                        rows={6}
                        className="w-full input-field rounded-xl px-3 py-2.5 text-sm resize-none" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Macchinario</label>
                      <select value={editForm.machine}
                        onChange={e => setEdit('machine', e.target.value)}
                        className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                        <option value="">Nessuno</option>
                        {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Gravità</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(SEVERITY).map(([key, { label, color }]) => (
                          <button key={key} onClick={() => setEdit('severity', key)}
                            className={`py-2 rounded-lg text-xs font-bold transition-all ${
                              editForm.severity === key ? 'text-white' : 'bg-surface-2 text-muted'
                            }`}
                            style={editForm.severity === key ? { background: color } : {}}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Media</label>
                      <MediaCapture media={editMedia} onChange={setEditMedia} />
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex gap-2 pt-2">
                      <button onClick={saveEdit} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50">
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <><Save size={14} /> Salva</>}
                      </button>
                      <button onClick={cancelEditing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                        <XCircle size={14} /> Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ═══ VIEW MODE ═══ */
                  <>
                    {selected.machine && (
                      <div className="bg-surface-2 rounded-xl p-3 flex items-center gap-2">
                        <span className="text-lg">🏭</span>
                        <span className="text-sm text-themed font-medium">{selected.machine}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-faint uppercase tracking-wider mb-1">Descrizione</p>
                      <p className="text-[14px] text-secondary leading-relaxed">{selected.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <InfoCard label="Creato da" value={selected.created_by_name || '—'} />
                      <InfoCard label="Data" value={formatDate(selected.created_at)} />
                      {selected.assigned_to_name && <InfoCard label="Assegnato" value={selected.assigned_to_name} icon="🔧" />}
                      <InfoCard label="Aggiornato" value={timeAgo(selected.updated_at || selected.created_at)} />
                    </div>
                    {selected.media?.length > 0 && (
                      <div>
                        <p className="text-[11px] text-faint uppercase tracking-wider mb-2">Allegati ({selected.media.length})</p>
                        <div className="grid grid-cols-3 gap-2">
                          {selected.media.map((m, i) => (
                            <div key={i} className="aspect-square rounded-xl bg-surface-2 overflow-hidden border border-token flex items-center justify-center">
                              {m.type === 'photo'
                                ? <img src={m.url} alt="" className="w-full h-full object-cover" />
                                : <span className="text-2xl">{m.type === 'video' ? '🎥' : '🎤'}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.extra_data && Object.keys(selected.extra_data).length > 0 && (
                      <div>
                        <p className="text-[11px] text-faint uppercase tracking-wider mb-2">Dati aggiuntivi</p>
                        {Object.entries(selected.extra_data).map(([k, v]) => (
                          <div key={k} className="flex justify-between bg-surface-1 rounded-lg px-3 py-2 mb-1">
                            <span className="text-xs text-muted">{k}</span>
                            <span className="text-xs text-white font-medium">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="bg-surface-2/20 rounded-xl p-3 space-y-1.5 text-xs text-faint">
                      <p>ID: <span className="text-muted font-mono">{selected.id?.slice(0, 8)}…</span></p>
                      {selected.is_quick && <p>Tipo: <span className="text-amber-400 font-medium">⚡ Quick Report</span></p>}
                    </div>
                  </>
                )}
              </div>

              {/* ── COL 2: Chat + Timeline (6/12) ── */}
              <div className="col-span-6 border-r border-token flex flex-col overflow-hidden">
                <div className="flex border-b border-token shrink-0">
                  <button onClick={() => setDetailTab('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                      detailTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-faint hover:text-secondary'
                    }`}>
                    <MessageCircle size={16} /> Chat
                  </button>
                  <button onClick={() => setDetailTab('timeline')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                      detailTab === 'timeline' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5' : 'text-faint hover:text-secondary'
                    }`}>
                    <Clock size={16} /> Cronologia
                  </button>
                </div>
                {detailTab === 'chat' ? (
                  <ChatPanel reportId={selected.id} user={user} report={selected}
                    variant="desktop" className="flex-1 min-h-0" />
                ) : (
                  <div className="flex-1 overflow-y-auto p-4">
                    <ActivityTimeline reportId={selected.id} report={selected} />
                  </div>
                )}
              </div>

              {/* ── COL 3: Actions (3/12) ── */}
              <div className="col-span-3 overflow-y-auto p-4 space-y-4">
                {/* Assign — now all users, not just tecnici */}
                <div className="bg-surface-1 rounded-2xl p-4 space-y-3">
                  <p className="text-[11px] text-faint uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck size={13} /> Assegna a
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {allAssignableUsers.map(u => {
                      const roleIcon = u.role === 'tecnico' ? '🔧' : u.role === 'admin' ? '👔' : '👷'
                      const roleLabel = u.role === 'tecnico' ? 'Tecnico' : u.role === 'admin' ? 'Admin' : 'Operatore'
                      return (
                        <button key={u.id} onClick={() => assignUser(selected.id, u.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                            selected.assigned_to === u.id
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                              : 'bg-surface-2 hover:bg-surface-2 text-secondary border border-transparent'
                          }`}>
                          <span>{roleIcon}</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium block truncate">{u.name}</span>
                            <span className="text-[10px] text-faint">{roleLabel}</span>
                          </div>
                          {selected.assigned_to === u.id && (
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-emerald-400 shrink-0">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                    {allAssignableUsers.length === 0 && <p className="text-sm text-faint text-center py-3">Nessun utente registrato</p>}
                  </div>
                </div>

                {/* Status */}
                <div className="bg-surface-1 rounded-2xl p-4 space-y-3">
                  <p className="text-[11px] text-faint uppercase tracking-wider">Cambia Stato</p>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(STATUS).map(([key, { label, color }]) => (
                      <button key={key} onClick={() => updateStatus(selected.id, key)}
                        className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${
                          selected.status === key ? 'text-white' : 'bg-surface-2 text-muted hover:text-white'
                        }`}
                        style={selected.status === key ? { background: color } : {}}>
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ═══ Delete — with double confirmation ═══ */}
                <div className="bg-surface-1 rounded-2xl p-4">
                  {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 size={14} /> Elimina segnalazione
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-red-400">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-bold">Conferma eliminazione</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        Stai per eliminare "{selected.title}". Tutti i messaggi, allegati e la cronologia verranno rimossi. Questa azione è irreversibile.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={deleteReport} disabled={deleting}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-50">
                          {deleting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Trash2 size={14} /> Elimina</>}
                        </button>
                        <button onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value, icon }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="text-sm text-themed mt-0.5">{icon ? `${icon} ${value}` : value}</p>
    </div>
  )
}
