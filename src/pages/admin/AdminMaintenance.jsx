/**
 * AdminMaintenance — Pannello di controllo manutenzioni programmate
 *
 * Vista unificata di tutti i piani e interventi su tutti i macchinari.
 * L'admin vede: semaforo globale, piani scaduti/in scadenza/ok,
 * può aggiungere piani, registrare interventi, importare CSV.
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { timeAgo } from '../../lib/constants'
import { Button, Modal, Input, Textarea, EmptyState, Spinner, Badge } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import {
  Shield, Wrench, AlertTriangle, CheckCircle, Cog, Clock,
  Plus, Edit, Trash2, Play, Search, X, Upload, ChevronRight,
  Filter, Calendar
} from 'lucide-react'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft, status: 'overdue' }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft, status: 'warning' }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft, status: 'ok' }
}

const FREQ_PRESETS = [
  { label: 'Settim.', days: 7 }, { label: 'Mensile', days: 30 }, { label: 'Trim.', days: 90 },
  { label: 'Sem.', days: 180 }, { label: 'Annuale', days: 365 },
]

export default function AdminMaintenance() {
  const { user } = useAuth()
  const toast = useToast()

  const [machines, setMachines] = useState([])
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([]) // { plan, machine, lastLog, light }
  const [allLogs, setAllLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '', 'overdue', 'warning', 'ok'
  const [filterMachine, setFilterMachine] = useState('')
  const [viewMode, setViewMode] = useState('plans') // 'plans' | 'logs'

  // Plan form
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [planForm, setPlanForm] = useState({ name: '', frequency_days: 30, assigned_to: '', instructions: '', machine_id: '' })

  // Log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ title: '', description: '', duration_minutes: '', parts_replaced: '', plan_id: '', machine_id: '' })

  // CSV
  const [showCSV, setShowCSV] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvMachine, setCsvMachine] = useState('')
  const [csvUser, setCsvUser] = useState('')

  const load = async () => {
    setLoading(true)
    const [m, u, plans, lastLogByPlan, paginatedLogs] = await Promise.all([
      db.getMachines(), db.getUsers(), db.getAllMaintenancePlansWithMachine(),
      db.getLastLogPerPlan(), db.getMaintenanceLogsPaginated(200)
    ])
    setMachines(m); setUsers(u)

    const allTasks = plans.map(plan => {
      const machine = plan.machine
      if (!machine) return null
      const lastLog = lastLogByPlan[plan.id] || null
      const light = getTrafficLight(plan, lastLog)
      return { plan, machine, lastLog, light }
    }).filter(Boolean)

    allTasks.sort((a, b) => a.light.daysLeft - b.light.daysLeft)
    setTasks(allTasks)
    setAllLogs(paginatedLogs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Stats
  const overdue = tasks.filter(t => t.light.status === 'overdue')
  const warning = tasks.filter(t => t.light.status === 'warning')
  const ok = tasks.filter(t => t.light.status === 'ok')

  // Filtered tasks
  const filteredTasks = tasks.filter(t => {
    if (filterStatus && t.light.status !== filterStatus) return false
    if (filterMachine && t.machine.id !== filterMachine) return false
    if (search) {
      const q = search.toLowerCase()
      return t.plan.name?.toLowerCase().includes(q) || t.machine.name?.toLowerCase().includes(q) || t.plan.assigned_to_name?.toLowerCase().includes(q)
    }
    return true
  })

  const filteredLogs = allLogs.filter(log => {
    if (filterMachine && log.machine_id !== filterMachine) return false
    if (search) {
      const q = search.toLowerCase()
      return log.title?.toLowerCase().includes(q) || log.performed_by_name?.toLowerCase().includes(q)
    }
    return true
  })

  // ── Plan CRUD ──
  const openPlanForm = (plan = null, machineId = '') => {
    setEditingPlan(plan)
    setPlanForm(plan
      ? { name: plan.name, frequency_days: plan.frequency_days, assigned_to: plan.assigned_to || '', instructions: plan.instructions || '', machine_id: plan.machine_id }
      : { name: '', frequency_days: 30, assigned_to: '', instructions: '', machine_id: machineId })
    setShowPlanForm(true)
  }

  const savePlan = async () => {
    if (!planForm.name.trim() || !planForm.machine_id) { toast.warning('Nome e macchinario obbligatori'); return }
    try {
      const assignee = users.find(u => u.id === planForm.assigned_to)
      const data = {
        name: planForm.name.trim(), frequency_days: parseInt(planForm.frequency_days) || 30,
        machine_id: planForm.machine_id, assigned_to: planForm.assigned_to || null,
        assigned_to_name: assignee?.name || null, instructions: planForm.instructions || null,
        org_id: user?.org_id || 'default',
      }
      if (editingPlan) { await db.updateMaintenancePlan(editingPlan.id, data); toast.success('Piano aggiornato') }
      else { await db.createMaintenancePlan(data); toast.success('Piano creato') }
      setShowPlanForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deletePlan = async (id) => {
    if (!confirm('Eliminare questo piano?')) return
    await db.deleteMaintenancePlan(id); toast.success('Eliminato'); load()
  }

  // ── Log ──
  const openLogForm = (task = null) => {
    setLogForm({
      title: task?.plan?.name || '', description: '', duration_minutes: '', parts_replaced: '',
      plan_id: task?.plan?.id || '', machine_id: task?.machine?.id || machines[0]?.id || '',
    })
    setShowLogForm(true)
  }

  const saveLog = async () => {
    if (!logForm.title.trim() || !logForm.machine_id) { toast.warning('Titolo e macchinario obbligatori'); return }
    try {
      await db.createMaintenanceLog({
        machine_id: logForm.machine_id, plan_id: logForm.plan_id || null,
        type: logForm.plan_id ? 'programmata' : 'straordinaria',
        title: logForm.title.trim(), description: logForm.description || null,
        performed_by: user?.id, performed_by_name: user?.name,
        duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null,
        parts_replaced: logForm.parts_replaced || null,
        performed_at: new Date().toISOString(), org_id: user?.org_id || 'default',
      })
      toast.success('Intervento registrato'); setShowLogForm(false); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  // ── CSV ──
  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const start = lines[0]?.toLowerCase().includes('attività') ? 1 : 0
      const parsed = []
      for (let i = start; i < lines.length; i++) {
        const p = lines[i].split(';').map(s => s.trim())
        if (p.length >= 2 && p[0] && parseInt(p[1])) parsed.push({ name: p[0], frequency_days: parseInt(p[1]), instructions: p[2] || '' })
      }
      setCsvData(parsed); setShowCSV(true)
    }
    reader.readAsText(file); e.target.value = ''
  }

  const importCSV = async () => {
    if (!csvData.length || !csvMachine) { toast.warning('Seleziona un macchinario'); return }
    const assignee = users.find(u => u.id === csvUser)
    try {
      await db.importMaintenancePlans(csvData.map(p => ({
        machine_id: csvMachine, name: p.name, frequency_days: p.frequency_days,
        assigned_to: csvUser || null, assigned_to_name: assignee?.name || null,
        instructions: p.instructions || null, org_id: user?.org_id || 'default',
      })))
      toast.success(`${csvData.length} piani importati!`); setShowCSV(false); setCsvData([]); load()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ═══ KPI Semaforo ═══ */}
      <div className="grid grid-cols-4 gap-5">
        {[
          { label: 'Totale Piani', value: tasks.length, icon: Shield, color: '#7c6aff', gradient: 'from-blue-500/15 to-blue-600/5' },
          { label: 'Scadute', value: overdue.length, icon: AlertTriangle, color: overdue.length > 0 ? '#ef4444' : '#22c55e', gradient: overdue.length > 0 ? 'from-red-500/15 to-red-600/5' : 'from-emerald-500/15 to-emerald-600/5' },
          { label: 'In Scadenza', value: warning.length, icon: Clock, color: warning.length > 0 ? '#f59e0b' : '#22c55e', gradient: warning.length > 0 ? 'from-amber-500/15 to-amber-600/5' : 'from-emerald-500/15 to-emerald-600/5' },
          { label: 'In Regola', value: ok.length, icon: CheckCircle, color: '#22c55e', gradient: 'from-emerald-500/15 to-emerald-600/5' },
        ].map(({ label, value, icon: Icon, color, gradient }) => (
          <div key={label} className={`bg-gradient-to-br ${gradient} border border-token rounded-2xl p-6`}>
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
                <Icon size={20} style={{ color }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-sm text-secondary mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══ Toolbar ═══ */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View toggle */}
        <div className="flex bg-surface-2 rounded-xl p-1">
          <button onClick={() => setViewMode('plans')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'plans' ? 'bg-violet-600 text-white' : 'text-muted hover:text-white'}`}>
            <Shield size={14} className="inline mr-1.5" />Piani
          </button>
          <button onClick={() => setViewMode('logs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'logs' ? 'bg-emerald-600 text-white' : 'text-muted hover:text-white'}`}>
            <Wrench size={14} className="inline mr-1.5" />Interventi
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full card-elevated rounded-xl pl-10 pr-4 py-2.5 text-sm text-themed placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white"><X size={14} /></button>}
        </div>

        {/* Filter machine */}
        <select value={filterMachine} onChange={e => setFilterMachine(e.target.value)}
          className="card-elevated rounded-xl px-3 py-2.5 text-sm text-themed focus:outline-none">
          <option value="">Tutti i macchinari</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        {/* Filter status */}
        {viewMode === 'plans' && (
          <div className="flex gap-1.5">
            {[
              { id: '', label: 'Tutti', color: null },
              { id: 'overdue', label: 'Scadute', color: '#ef4444' },
              { id: 'warning', label: 'In scadenza', color: '#f59e0b' },
              { id: 'ok', label: 'In regola', color: '#22c55e' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(filterStatus === f.id ? '' : f.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${filterStatus === f.id ? 'text-white' : 'bg-surface-2 text-muted hover:text-white'}`}
                style={filterStatus === f.id && f.color ? { background: f.color } : filterStatus === f.id ? { background: '#7c6aff' } : {}}>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <label className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-sm font-medium cursor-pointer transition-all">
          <Upload size={14} /> CSV
          <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSV} />
        </label>
        <Button size="sm" onClick={() => openPlanForm()}><Plus size={14} /> Nuovo Piano</Button>
        <Button size="sm" variant="outline" onClick={() => openLogForm()}><Wrench size={14} /> Registra</Button>
      </div>

      {/* ═══ PLANS VIEW ═══ */}
      {viewMode === 'plans' && (
        <>
          <p className="text-sm text-faint">{filteredTasks.length} piani {filterStatus || filterMachine || search ? '(filtrati)' : ''}</p>

          {filteredTasks.length === 0 ? (
            <EmptyState icon="🔧" title="Nessun piano trovato" subtitle={tasks.length > 0 ? 'Modifica i filtri' : 'Crea il primo piano di manutenzione'} />
          ) : (
            <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-token">
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Semaforo</th><th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Stato</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Attività</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Macchinario</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden md:table-cell">Frequenza</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Responsabile</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Scadenza</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Ultimo</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task, i) => (
                    <tr key={`${task.plan.id}-${i}`} className="border-b border-token/30 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <div className="w-4 h-4 rounded-full" style={{ background: task.light.color, boxShadow: `0 0 8px ${task.light.color}40` }} />
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const st = task.plan.current_status || 'da_eseguire'
                          const cfg = { da_eseguire: { label: 'Da eseguire', bg: '#f59e0b18', color: '#f59e0b' }, in_corso: { label: 'In corso', bg: '#7c6aff18', color: '#7c6aff' }, completata: { label: 'Completata', bg: '#22c55e18', color: '#22c55e' } }
                          const c = cfg[st] || cfg.da_eseguire
                          return (
                            <div>
                              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: c.bg, color: c.color }}>{c.label}</span>
                              {st === 'in_corso' && task.plan.taken_by_name && (
                                <p className="text-[10px] text-faint mt-1">👤 {task.plan.taken_by_name}</p>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-[15px] text-white font-medium">{task.plan.name}</p>
                        {task.plan.instructions && <p className="text-xs text-faint mt-0.5 truncate max-w-[200px]">{task.plan.instructions}</p>}
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-sm text-muted flex items-center gap-1.5"><Cog size={13} /> {task.machine.name}</span>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="text-sm text-muted">{task.plan.frequency_days}g</span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-sm text-secondary">{task.plan.assigned_to_name || <span className="text-faint">—</span>}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: task.light.color + '18', color: task.light.color }}>
                          {task.light.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-sm text-faint">{task.lastLog ? timeAgo(task.lastLog.performed_at) : 'Mai'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openLogForm(task)} className="p-2 rounded-lg hover:bg-emerald-500/20 text-faint hover:text-emerald-400 transition-all" title="Registra intervento">
                            <Play size={14} />
                          </button>
                          <button onClick={() => openPlanForm(task.plan)} className="p-2 rounded-lg hover:bg-white/10 text-faint hover:text-white transition-all" title="Modifica">
                            <Edit size={14} />
                          </button>
                          <button onClick={() => deletePlan(task.plan.id)} className="p-2 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400 transition-all" title="Elimina">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ LOGS VIEW ═══ */}
      {viewMode === 'logs' && (
        <>
          <p className="text-sm text-faint">{filteredLogs.length} interventi registrati</p>

          {filteredLogs.length === 0 ? (
            <EmptyState icon="🔧" title="Nessun intervento" subtitle="Registra il primo intervento" />
          ) : (
            <div className="bg-surface-1/60 border border-token rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-token">
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Tipo</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Intervento</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Macchinario</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden md:table-cell">Eseguito da</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider">Quando</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Durata</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-faint uppercase tracking-wider hidden lg:table-cell">Ricambi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.slice(0, 50).map(log => {
                    return (
                      <tr key={log.id} className="border-b border-token/30 hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${log.type === 'programmata' ? 'bg-violet-500/15 text-violet-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {log.type === 'programmata' ? 'Progr.' : 'Straord.'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-[15px] text-white font-medium">{log.title}</p>
                          {log.description && <p className="text-xs text-faint mt-0.5 truncate max-w-[200px]">{log.description}</p>}
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-sm text-muted">{log.machine?.name || '—'}</span>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="text-sm text-secondary">{log.performed_by_name || '—'}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm text-faint">{timeAgo(log.performed_at)}</span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-sm text-muted">{log.duration_minutes ? `${log.duration_minutes} min` : '—'}</span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-sm text-muted truncate max-w-[150px] block">{log.parts_replaced || '—'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══ Plan Form ═══ */}
      <Modal open={showPlanForm} onClose={() => setShowPlanForm(false)} title={editingPlan ? 'Modifica Piano' : 'Nuovo Piano'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
            <select value={planForm.machine_id} onChange={e => setPlanForm(f => ({ ...f, machine_id: e.target.value }))}
              className="w-full input-field rounded-xl px-3 py-2.5 text-sm" disabled={!!editingPlan}>
              <option value="">Seleziona macchinario</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}{m.department ? ` — ${m.department}` : ''}</option>)}
            </select>
          </div>
          <Input label="Attività *" placeholder="Lubrificazione cuscinetti" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Frequenza</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {FREQ_PRESETS.map(p => <button key={p.days} onClick={() => setPlanForm(f => ({ ...f, frequency_days: p.days }))}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${parseInt(planForm.frequency_days) === p.days ? 'bg-violet-600 text-white' : 'bg-surface-2 text-muted'}`}>{p.label}</button>)}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-faint">Ogni</span>
              <input type="number" value={planForm.frequency_days} onChange={e => setPlanForm(f => ({ ...f, frequency_days: e.target.value }))} className="w-20 input-field rounded-xl px-3 py-2 text-sm text-center" />
              <span className="text-sm text-faint">giorni</span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile</label>
            <select value={planForm.assigned_to} onChange={e => setPlanForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Non assegnato</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <Textarea label="Istruzioni" placeholder="Come eseguire..." value={planForm.instructions} onChange={e => setPlanForm(f => ({ ...f, instructions: e.target.value }))} />
          <Button onClick={savePlan} className="w-full" size="lg" disabled={!planForm.name.trim() || !planForm.machine_id}>{editingPlan ? 'Salva' : 'Crea Piano'}</Button>
        </div>
      </Modal>

      {/* ═══ Log Form ═══ */}
      <Modal open={showLogForm} onClose={() => setShowLogForm(false)} title="Registra Intervento" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
            <select value={logForm.machine_id} onChange={e => setLogForm(f => ({ ...f, machine_id: e.target.value }))} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Seleziona</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <Input label="Titolo *" placeholder="Lubrificazione completata" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Descrizione" placeholder="Cosa è stato fatto..." value={logForm.description} onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Durata (min)" placeholder="60" type="number" value={logForm.duration_minutes} onChange={e => setLogForm(f => ({ ...f, duration_minutes: e.target.value }))} />
            <Input label="Ricambi" placeholder="Filtro XF-420" value={logForm.parts_replaced} onChange={e => setLogForm(f => ({ ...f, parts_replaced: e.target.value }))} />
          </div>
          {logForm.plan_id ? <p className="text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">✓ Manutenzione programmata</p>
            : <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">⚡ Manutenzione straordinaria</p>}
          <Button onClick={saveLog} className="w-full" size="lg" disabled={!logForm.title.trim() || !logForm.machine_id}>Registra</Button>
        </div>
      </Modal>

      {/* ═══ CSV Import ═══ */}
      <Modal open={showCSV} onClose={() => setShowCSV(false)} title="Importa Piani da CSV" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted">Trovati <strong className="text-white">{csvData.length}</strong> piani.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Macchinario *</label>
              <select value={csvMachine} onChange={e => setCsvMachine(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Seleziona</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile default</label>
              <select value={csvUser} onChange={e => setCsvUser(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                <option value="">Non assegnato</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>
          </div>
          <div className="bg-surface-2 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full">
              <thead><tr className="border-b border-token"><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Attività</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Freq.</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Note</th></tr></thead>
              <tbody>{csvData.map((r, i) => <tr key={i} className="border-b border-token/30"><td className="px-4 py-2 text-sm text-themed">{r.name}</td><td className="px-4 py-2 text-sm text-muted">{r.frequency_days}g</td><td className="px-4 py-2 text-sm text-faint truncate max-w-[200px]">{r.instructions||'—'}</td></tr>)}</tbody>
            </table>
          </div>
          <Button onClick={importCSV} className="w-full" size="lg" disabled={!csvData.length || !csvMachine}><Upload size={16} /> Importa {csvData.length} piani</Button>
        </div>
      </Modal>
    </div>
  )
}
