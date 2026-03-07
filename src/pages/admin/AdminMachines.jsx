/**
 * AdminMachines v4.1 — Fascicolo Macchina Completo (Bugfix)
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, timeAgo } from '../../lib/constants'
import { Button, Modal, Input, Textarea, EmptyState, Spinner, Badge } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import QRCode from 'qrcode'
import {
  Plus, Edit, Trash2, FileText, Video, Cog, Search,
  GripVertical, ArrowUpDown, Check, ArrowUp, ArrowDown,
  X, QrCode, Download, Camera, Image, Calendar, Hash,
  Factory, Building, ClipboardList, ChevronRight,
  Wrench, Clock, AlertTriangle, CheckCircle, Upload,
  Play, Shield
} from 'lucide-react'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft }
}

const FREQ_PRESETS = [
  { label: 'Settim.', days: 7 }, { label: 'Mensile', days: 30 }, { label: 'Trim.', days: 90 },
  { label: 'Sem.', days: 180 }, { label: 'Annuale', days: 365 },
]

export default function AdminMachines() {
  const { user } = useAuth()
  const toast = useToast()
  const [machines, setMachines] = useState([])
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '' })
  const [attachments, setAttachments] = useState([])
  const [photoUrl, setPhotoUrl] = useState('')

  // Detail
  const [sel, setSel] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [plans, setPlans] = useState([])
  const [logs, setLogs] = useState([])
  const [planLastLogs, setPlanLastLogs] = useState({})
  const [detailTab, setDetailTab] = useState('plans')

  // Plan form
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [planForm, setPlanForm] = useState({ name: '', frequency_days: 30, assigned_to: '', instructions: '' })

  // Log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ title: '', description: '', duration_minutes: '', parts_replaced: '', plan_id: '' })

  // CSV
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvDefaultUser, setCsvDefaultUser] = useState('')

  // Reorder
  const [reorderMode, setReorderMode] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [m, r, u] = await Promise.all([db.getMachines(), db.getReports(), db.getUsers()])
    setMachines(m); setReports(r); setUsers(u); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // ── QR ──
  const generateQR = async (machine) => {
    try { return await QRCode.toDataURL(JSON.stringify({ id: machine.id, name: machine.name }), { width: 400, margin: 2, errorCorrectionLevel: 'H' }) }
    catch { return null }
  }

  const downloadQR = async (machine) => {
    const url = await generateQR(machine)
    if (!url) return toast.error('Errore QR')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = 500; canvas.height = 580
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 580)
    const img = new window.Image()
    img.onload = () => {
      ctx.drawImage(img, 50, 20, 400, 400)
      ctx.fillStyle = '#000'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'
      ctx.fillText(machine.name, 250, 460)
      if (machine.serial_number) { ctx.font = '16px Arial'; ctx.fillStyle = '#666'; ctx.fillText(`S/N: ${machine.serial_number}`, 250, 490) }
      ctx.font = '14px Arial'; ctx.fillStyle = '#999'; ctx.fillText('ManuTech — Scansiona per scheda tecnica', 250, 530)
      const link = document.createElement('a'); link.download = `QR-${machine.name.replace(/\s+/g, '-')}.png`; link.href = canvas.toDataURL('image/png'); link.click()
      toast.success('QR scaricato!')
    }
    img.src = url
  }

  // ── Detail ──
  const openDetail = async (machine) => {
    setSel(machine); setDetailTab('plans')
    const [url, p, l] = await Promise.all([generateQR(machine), db.getMaintenancePlans(machine.id), db.getMaintenanceLogs(machine.id)])
    setQrDataUrl(url); setPlans(p); setLogs(l)
    const ll = {}
    for (const plan of p) { ll[plan.id] = await db.getLastLogForPlan(plan.id) }
    setPlanLastLogs(ll)
  }

  const refreshDetail = async () => {
    if (!sel) return
    const [p, l] = await Promise.all([db.getMaintenancePlans(sel.id), db.getMaintenanceLogs(sel.id)])
    setPlans(p); setLogs(l)
    const ll = {}
    for (const plan of p) { ll[plan.id] = await db.getLastLogForPlan(plan.id) }
    setPlanLastLogs(ll)
  }

  // ── Machine CRUD ──
  const openNew = () => { setEditing(null); setForm({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '' }); setAttachments([]); setPhotoUrl(''); setShowForm(true) }
  const openEdit = (m) => { setEditing(m); setForm({ name: m.name, department: m.department||'', description: m.description||'', notes: m.notes||'', model: m.model||'', serial_number: m.serial_number||'', manufacturer: m.manufacturer||'', year: m.year||'' }); setAttachments(m.attachments||[]); setPhotoUrl(m.photo_url||''); setShowForm(true) }

  const uploadPhoto = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
    input.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await db.uploadFile('machines', `photo-${Date.now()}-${f.name}`, f); setPhotoUrl(url); toast.success('Foto caricata') } catch { toast.error('Errore upload') } }
    input.click()
  }
  const addAttachment = (type) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = type === 'pdf' ? '.pdf' : 'video/*'
    input.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const url = await db.uploadFile('machines', `${Date.now()}-${f.name}`, f); setAttachments(a => [...a, { type, name: f.name, url }]) }
    input.click()
  }

  const saveMachine = async () => {
    if (!form.name.trim()) return
    try {
      const data = { ...form, year: form.year ? parseInt(form.year) : null, attachments, photo_url: photoUrl || null }
      if (editing) { const updated = await db.updateMachine(editing.id, data); toast.success('Aggiornato'); if (sel?.id === editing.id) setSel(prev => ({ ...prev, ...updated })) }
      else { await db.createMachine({ ...data, sort_order: machines.length + 1 }); toast.success('Creato') }
      setShowForm(false); load()
    } catch { toast.error('Errore') }
  }

  const remove = async (id) => { if (!confirm('Eliminare?')) return; await db.deleteMachine(id); toast.success('Eliminato'); load(); if (sel?.id === id) setSel(null) }

  // ── Plans ──
  const openPlanForm = (plan = null) => {
    setEditingPlan(plan)
    setPlanForm(plan ? { name: plan.name, frequency_days: plan.frequency_days, assigned_to: plan.assigned_to || '', instructions: plan.instructions || '' }
      : { name: '', frequency_days: 30, assigned_to: '', instructions: '' })
    setShowPlanForm(true)
  }

  const savePlan = async () => {
    if (!planForm.name.trim() || !sel) return
    try {
      const assignee = users.find(u => u.id === planForm.assigned_to)
      const data = {
        name: planForm.name.trim(),
        frequency_days: parseInt(planForm.frequency_days) || 30,
        machine_id: sel.id,
        assigned_to: planForm.assigned_to || null,
        assigned_to_name: assignee?.name || null,
        instructions: planForm.instructions || null,
        org_id: 'default',
      }
      if (editingPlan) { await db.updateMaintenancePlan(editingPlan.id, data); toast.success('Piano aggiornato') }
      else { await db.createMaintenancePlan(data); toast.success('Piano creato') }
      setShowPlanForm(false)
      await refreshDetail()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deletePlan = async (id) => { if (!confirm('Eliminare questo piano?')) return; await db.deleteMaintenancePlan(id); toast.success('Eliminato'); refreshDetail() }

  // ── Logs ──
  const openLogForm = (planId = null) => {
    const plan = planId ? plans.find(p => p.id === planId) : null
    setLogForm({ title: plan?.name || '', description: '', duration_minutes: '', parts_replaced: '', plan_id: planId || '' })
    setShowLogForm(true)
  }

  const saveLog = async () => {
    if (!logForm.title.trim() || !sel) return
    try {
      await db.createMaintenanceLog({
        machine_id: sel.id,
        plan_id: logForm.plan_id || null,
        report_id: null,
        type: logForm.plan_id ? 'programmata' : 'straordinaria',
        title: logForm.title.trim(),
        description: logForm.description || null,
        performed_by: user?.id,
        performed_by_name: user?.name,
        duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null,
        parts_replaced: logForm.parts_replaced || null,
        performed_at: new Date().toISOString(),
        org_id: 'default',
      })
      toast.success('Intervento registrato')
      setShowLogForm(false)
      await refreshDetail()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  // ── CSV ──
  const handleCSVFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const start = lines[0]?.toLowerCase().includes('attività') || lines[0]?.toLowerCase().includes('frequenza') ? 1 : 0
      const parsed = []
      for (let i = start; i < lines.length; i++) {
        const parts = lines[i].split(';').map(s => s.trim())
        if (parts.length >= 2 && parts[0] && parseInt(parts[1])) {
          parsed.push({ name: parts[0], frequency_days: parseInt(parts[1]), instructions: parts[2] || '' })
        }
      }
      setCsvData(parsed); setShowCSVImport(true)
    }
    reader.readAsText(file)
    e.target.value = '' // reset input
  }

  const importCSV = async () => {
    if (csvData.length === 0 || !sel) return
    const assignee = users.find(u => u.id === csvDefaultUser)
    const plansToImport = csvData.map(p => ({
      machine_id: sel.id, name: p.name, frequency_days: p.frequency_days,
      assigned_to: csvDefaultUser || null, assigned_to_name: assignee?.name || null,
      instructions: p.instructions || null, org_id: 'default',
    }))
    try {
      await db.importMaintenancePlans(plansToImport)
      toast.success(`${plansToImport.length} piani importati!`)
      setShowCSVImport(false); setCsvData([])
      await refreshDetail()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  // ── Drag ──
  const handleDragStart = useCallback((e, i) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move' }, [])
  const handleDragOver = useCallback((e, i) => { e.preventDefault(); setOverIndex(i) }, [])
  const handleDragLeave = useCallback(() => setOverIndex(null), [])
  const handleDrop = useCallback((e, di) => { e.preventDefault(); setOverIndex(null); if (dragIndex === null || dragIndex === di) { setDragIndex(null); return }; setMachines(p => { const u = [...p]; const [m] = u.splice(dragIndex, 1); u.splice(di, 0, m); return u }); setDragIndex(null) }, [dragIndex])
  const handleDragEnd = useCallback(() => { setDragIndex(null); setOverIndex(null) }, [])
  const moveItem = useCallback((i, d) => { const n = i + d; if (n < 0 || n >= machines.length) return; setMachines(p => { const u = [...p]; const [m] = u.splice(i, 1); u.splice(n, 0, m); return u }) }, [machines.length])
  const saveOrder = async () => { setSaving(true); try { await db.reorderMachines(machines.map(m => m.id)); toast.success('Ordine salvato!'); setReorderMode(false) } catch { toast.error('Errore') }; setSaving(false) }

  const filtered = machines.filter(m => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.department?.toLowerCase().includes(search.toLowerCase()))
  const getReportsForMachine = (name) => reports.filter(r => r.machine === name)

  // ═══ RENDER ═══
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {!reorderMode ? (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input type="text" placeholder="Cerca macchinari..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
            </div>
            <p className="text-sm text-faint shrink-0">{filtered.length} macchinari</p>
            {machines.length >= 2 && <Button variant="outline" onClick={() => { setReorderMode(true); setSearch('') }}><ArrowUpDown size={16} /> Ordina</Button>}
            <Button onClick={openNew}><Plus size={18} /> Nuovo</Button>
          </>
        ) : (
          <>
            <div className="flex-1"><h3 className="text-base font-bold text-themed">Ordina Catena</h3><p className="text-sm text-faint">Trascina o usa frecce</p></div>
            <Button variant="outline" onClick={() => { setReorderMode(false); load() }}>Annulla</Button>
            <Button onClick={saveOrder} disabled={saving}><Check size={18} /> Salva</Button>
          </>
        )}
      </div>

      {loading ? <Spinner /> : machines.length === 0 ? (
        <EmptyState icon="⚙️" title="Nessun macchinario" subtitle="Aggiungi i macchinari" />
      ) : reorderMode ? (
        <div className="space-y-1">
          {machines.map((m, i) => (
            <div key={m.id} draggable onDragStart={e => handleDragStart(e, i)} onDragOver={e => handleDragOver(e, i)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, i)} onDragEnd={handleDragEnd}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all select-none cursor-grab ${dragIndex === i ? 'opacity-30' : overIndex === i ? 'border-amber-400/60 bg-amber-500/10' : 'bg-surface-1/80 border-token'}`}>
              <GripVertical size={20} className="text-faint" />
              <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-sm font-bold text-amber-400">{i + 1}</span>
              <Cog size={18} className="text-blue-400" />
              <div className="flex-1 min-w-0"><h3 className="text-sm font-bold text-white truncate">{m.name}</h3></div>
              <div className="flex flex-col gap-0.5">
                <button onClick={e => { e.stopPropagation(); moveItem(i, -1) }} disabled={i === 0} className="p-1.5 rounded-lg text-faint hover:text-white disabled:cursor-not-allowed"><ArrowUp size={14} /></button>
                <button onClick={e => { e.stopPropagation(); moveItem(i, 1) }} disabled={i === machines.length - 1} className="p-1.5 rounded-lg text-faint hover:text-white disabled:cursor-not-allowed"><ArrowDown size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((m, i) => {
            const mr = getReportsForMachine(m.name); const active = mr.filter(r => r.status !== 'risolta').length
            return (
              <div key={m.id} onClick={() => openDetail(m)} className="card-elevated rounded-2xl p-6 hover:border-blue-500/30 transition-all group relative cursor-pointer">
                <div className="absolute top-3 left-3 w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center"><span className="text-[11px] font-bold text-amber-400">{m.sort_order || i + 1}</span></div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 pl-6">
                    {m.photo_url ? <div className="w-12 h-12 rounded-xl overflow-hidden border border-token shrink-0"><img src={m.photo_url} alt="" className="w-full h-full object-cover" /></div>
                      : <div className="w-12 h-12 bg-blue-600/15 rounded-xl flex items-center justify-center shrink-0"><Cog size={22} className="text-blue-400" /></div>}
                    <div><h3 className="text-base font-bold text-themed">{m.name}</h3>{m.department && <p className="text-sm text-faint">{m.department}</p>}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); openEdit(m) }} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white"><Edit size={15} /></button>
                    <button onClick={e => { e.stopPropagation(); downloadQR(m) }} className="p-2 rounded-lg hover:bg-blue-500/20 text-muted hover:text-blue-400"><QrCode size={15} /></button>
                  </div>
                </div>
                {(m.manufacturer || m.model) && <p className="text-sm text-muted mb-2 pl-6">{[m.manufacturer, m.model].filter(Boolean).join(' — ')}</p>}
                <div className="flex items-center gap-3 pt-3 border-t border-token/30">
                  {m.attachments?.length > 0 && <span className="text-xs text-faint flex items-center gap-1"><FileText size={12} /> {m.attachments.length}</span>}
                  {active > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{active} segnalaz.</span>}
                  <span className="ml-auto text-xs text-blue-400 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">Scheda <ChevronRight size={12} /></span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ DETAIL SHEET ═══ */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSel(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-token">
              <div className="flex items-center gap-3 min-w-0">
                <Cog size={20} className="text-blue-400 shrink-0" />
                <h2 className="text-lg font-bold text-themed truncate">{sel.name}</h2>
                {sel.department && <span className="text-sm text-faint px-2 py-0.5 bg-surface-2 rounded-lg shrink-0">{sel.department}</span>}
                {sel.manufacturer && <span className="text-xs text-muted shrink-0">{sel.manufacturer}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { openEdit(sel); setSel(null) }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all"><Edit size={14} /> Modifica</button>
                <button onClick={() => setSel(null)} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white"><X size={22} /></button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(85vh - 65px)' }}>
              {/* COL LEFT: Info + QR (3 col) */}
              <div className="col-span-3 border-r border-token overflow-y-auto p-4 space-y-3">
                {/* Photo */}
                {sel.photo_url ? (
                  <div className="rounded-xl overflow-hidden border border-token aspect-video"><img src={sel.photo_url} alt="" className="w-full h-full object-cover" /></div>
                ) : (
                  <button onClick={() => { openEdit(sel); setSel(null) }} className="rounded-xl border border-dashed border-token/50 bg-surface-2/30 aspect-video flex flex-col items-center justify-center text-faint hover:border-blue-500/30 hover:text-blue-400 transition-all cursor-pointer">
                    <Camera size={24} className="mb-1 opacity-40" />
                    <span className="text-xs">Aggiungi foto</span>
                  </button>
                )}

                {/* Technical data */}
                <div className="space-y-1.5">
                  {[
                    { icon: Factory, label: 'Costruttore', value: sel.manufacturer },
                    { icon: Cog, label: 'Modello', value: sel.model },
                    { icon: Hash, label: 'Matricola', value: sel.serial_number },
                    { icon: Calendar, label: 'Anno', value: sel.year },
                    { icon: Building, label: 'Reparto', value: sel.department },
                  ].filter(f => f.value).map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-2.5 p-2.5 bg-surface-2 rounded-xl">
                      <Icon size={14} className="text-faint shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[9px] text-faint uppercase tracking-wider">{label}</p>
                        <p className="text-sm text-themed font-medium truncate">{value}</p>
                      </div>
                    </div>
                  ))}
                  {![sel.manufacturer, sel.model, sel.serial_number, sel.year].some(Boolean) && (
                    <p className="text-xs text-faint text-center py-3">Nessun dato tecnico. <button onClick={() => { openEdit(sel); setSel(null) }} className="text-blue-400 underline">Compila scheda</button></p>
                  )}
                </div>

                {sel.description && <div><p className="text-[10px] text-faint uppercase tracking-wider mb-1">Descrizione</p><p className="text-xs text-secondary leading-relaxed">{sel.description}</p></div>}

                {/* QR */}
                <div className="bg-white rounded-xl p-3 flex flex-col items-center">
                  {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-28 h-28" /> : <div className="w-28 h-28 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" /></div>}
                  <p className="text-black font-bold text-xs mt-1.5">{sel.name}</p>
                </div>
                <button onClick={() => downloadQR(sel)} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all"><Download size={14} /> Scarica QR</button>

                {/* Docs */}
                {sel.attachments?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-faint uppercase tracking-wider mb-1.5">Documenti ({sel.attachments.length})</p>
                    {sel.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noopener" className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg text-xs hover:bg-surface-3 transition-colors mb-1">
                        {a.type === 'pdf' ? <FileText size={13} className="text-red-400" /> : <Video size={13} className="text-emerald-400" />}
                        <span className="text-secondary flex-1 truncate">{a.name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* COL RIGHT: Tabs (9 col) */}
              <div className="col-span-9 flex flex-col overflow-hidden">
                {/* Tab bar — fixed colors, no dynamic Tailwind */}
                <div className="flex border-b border-token shrink-0">
                  <button onClick={() => setDetailTab('plans')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'plans' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-faint hover:text-secondary'}`}>
                    <Shield size={16} /> Piani Manutenzione
                    {plans.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{plans.length}</span>}
                  </button>
                  <button onClick={() => setDetailTab('logs')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'logs' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-faint hover:text-secondary'}`}>
                    <Wrench size={16} /> Registro Interventi
                    {logs.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{logs.length}</span>}
                  </button>
                  <button onClick={() => setDetailTab('reports')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'reports' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-faint hover:text-secondary'}`}>
                    <ClipboardList size={16} /> Segnalazioni
                    {getReportsForMachine(sel.name).length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{getReportsForMachine(sel.name).length}</span>}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {/* ═══ PLANS ═══ */}
                  {detailTab === 'plans' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-muted">{plans.length} piani</p>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-sm font-medium cursor-pointer transition-all">
                            <Upload size={14} /> CSV
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFile} />
                          </label>
                          <Button size="sm" onClick={() => openPlanForm()}><Plus size={14} /> Nuovo Piano</Button>
                        </div>
                      </div>

                      {plans.length === 0 ? (
                        <div className="text-center py-16"><Shield size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun piano configurato</p><p className="text-xs text-faint mt-1">Crea un piano o importa da CSV</p></div>
                      ) : (
                        <div className="space-y-3">
                          {plans.map(plan => {
                            const light = getTrafficLight(plan, planLastLogs[plan.id])
                            return (
                              <div key={plan.id} className="bg-surface-2 rounded-xl p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 8px ${light.color}40` }} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white">{plan.name}</p>
                                    <p className="text-xs text-faint mt-0.5">Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}</p>
                                  </div>
                                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0" style={{ background: light.color + '18', color: light.color }}>{light.label}</span>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openLogForm(plan.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-faint hover:text-emerald-400" title="Registra intervento"><Play size={14} /></button>
                                    <button onClick={() => openPlanForm(plan)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                                    <button onClick={() => deletePlan(plan.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                                  </div>
                                </div>
                                {plan.instructions && <p className="text-xs text-muted mt-2 pl-7 leading-relaxed">{plan.instructions}</p>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ LOGS ═══ */}
                  {detailTab === 'logs' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-muted">{logs.length} interventi</p>
                        <Button size="sm" onClick={() => openLogForm()}><Plus size={14} /> Registra</Button>
                      </div>
                      {logs.length === 0 ? (
                        <div className="text-center py-16"><Wrench size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun intervento</p></div>
                      ) : (
                        <div className="space-y-2">
                          {logs.map(log => (
                            <div key={log.id} className="flex items-start gap-3 p-4 bg-surface-2 rounded-xl">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-blue-500/15' : 'bg-amber-500/15'}`}>
                                {log.type === 'programmata' ? <Shield size={14} className="text-blue-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-white">{log.title}</p>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${log.type === 'programmata' ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                    {log.type === 'programmata' ? 'Programmata' : 'Straordinaria'}
                                  </span>
                                </div>
                                {log.description && <p className="text-xs text-muted mt-1">{log.description}</p>}
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-faint flex-wrap">
                                  <span>{log.performed_by_name || '—'}</span>
                                  <span>{timeAgo(log.performed_at)}</span>
                                  {log.duration_minutes && <span>⏱ {log.duration_minutes} min</span>}
                                  {log.parts_replaced && <span>🔩 {log.parts_replaced}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ REPORTS ═══ */}
                  {detailTab === 'reports' && (() => {
                    const mr = getReportsForMachine(sel.name)
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-white">{mr.length}</p><p className="text-[11px] text-faint">Totali</p></div>
                          <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-amber-400">{mr.filter(r => r.status !== 'risolta').length}</p><p className="text-[11px] text-faint">Attive</p></div>
                          <div className="bg-surface-2 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-emerald-400">{mr.filter(r => r.status === 'risolta').length}</p><p className="text-[11px] text-faint">Risolte</p></div>
                        </div>
                        {mr.length === 0 ? <div className="text-center py-16"><ClipboardList size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessuna segnalazione</p></div>
                        : <div className="space-y-2">{mr.map(r => { const s = STATUS[r.status]||STATUS.aperta; const sv = SEVERITY[r.severity]||SEVERITY.media; return (
                          <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                            <div className="flex-1 min-w-0"><p className="text-sm text-themed font-medium truncate">{r.title}</p><p className="text-[11px] text-faint">{r.created_by_name} · {timeAgo(r.created_at)}</p></div>
                            <Badge {...sv} />
                          </div>) })}</div>}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Machine Form ═══ */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Modifica Macchinario' : 'Nuovo Macchinario'} size="lg">
        <div className="space-y-4">
          <Input label="Nome *" placeholder="Es. Pressa idraulica #3" value={form.name} onChange={e => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Costruttore" placeholder="Siemens" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
            <Input label="Modello" placeholder="XR-500" value={form.model} onChange={e => set('model', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Matricola" placeholder="SN-2024-0042" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
            <Input label="Anno" placeholder="2022" type="number" value={form.year} onChange={e => set('year', e.target.value)} />
            <Input label="Reparto" placeholder="Linea 1" value={form.department} onChange={e => set('department', e.target.value)} />
          </div>
          <Textarea label="Descrizione" placeholder="Note..." value={form.description} onChange={e => set('description', e.target.value)} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Foto</label>
            {photoUrl ? <div className="relative w-32 h-24 rounded-xl overflow-hidden border border-token"><img src={photoUrl} alt="" className="w-full h-full object-cover" /><button onClick={() => setPhotoUrl('')} className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"><X size={12} className="text-white" /></button></div>
              : <button onClick={uploadPhoto} className="flex items-center gap-2 px-4 py-3 bg-surface-2 border border-token rounded-xl text-sm text-muted hover:text-white transition-all"><Camera size={16} /> Carica foto</button>}
          </div>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Documentazione ({attachments.length})</label>
            <div className="flex gap-2 mb-3">
              <Button size="sm" variant="outline" onClick={() => addAttachment('pdf')}><FileText size={14} className="text-red-400" /> PDF</Button>
              <Button size="sm" variant="outline" onClick={() => addAttachment('video')}><Video size={14} className="text-emerald-400" /> Video</Button>
            </div>
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-2 bg-surface-2 rounded-lg p-2.5 mb-1.5">
                {a.type === 'pdf' ? <FileText size={14} className="text-red-400" /> : <Video size={14} className="text-emerald-400" />}
                <span className="text-sm text-secondary flex-1 truncate">{a.name}</span>
                <button onClick={() => setAttachments(at => at.filter((_, j) => j !== i))} className="text-faint hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <Button onClick={saveMachine} className="w-full" size="lg" disabled={!form.name.trim()}>{editing ? 'Salva' : 'Crea'}</Button>
        </div>
      </Modal>

      {/* ═══ Plan Form ═══ */}
      <Modal open={showPlanForm} onClose={() => setShowPlanForm(false)} title={editingPlan ? 'Modifica Piano' : 'Nuovo Piano'} size="md">
        <div className="space-y-4">
          <Input label="Attività *" placeholder="Lubrificazione cuscinetti" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Frequenza</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {FREQ_PRESETS.map(p => <button key={p.days} onClick={() => setPlanForm(f => ({ ...f, frequency_days: p.days }))}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${parseInt(planForm.frequency_days) === p.days ? 'bg-blue-600 text-white' : 'bg-surface-2 text-muted'}`}>{p.label}</button>)}
            </div>
            <div className="flex items-center gap-2"><span className="text-sm text-faint">Ogni</span>
              <input type="number" value={planForm.frequency_days} onChange={e => setPlanForm(f => ({ ...f, frequency_days: e.target.value }))} className="w-20 input-field rounded-xl px-3 py-2 text-sm text-center" />
              <span className="text-sm text-faint">giorni</span></div>
          </div>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile</label>
            <select value={planForm.assigned_to} onChange={e => setPlanForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Non assegnato</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <Textarea label="Istruzioni" placeholder="Come eseguire..." value={planForm.instructions} onChange={e => setPlanForm(f => ({ ...f, instructions: e.target.value }))} />
          <Button onClick={savePlan} className="w-full" size="lg" disabled={!planForm.name.trim()}>{editingPlan ? 'Salva' : 'Crea Piano'}</Button>
        </div>
      </Modal>

      {/* ═══ Log Form ═══ */}
      <Modal open={showLogForm} onClose={() => setShowLogForm(false)} title="Registra Intervento" size="md">
        <div className="space-y-4">
          <Input label="Titolo *" placeholder="Lubrificazione completata" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Descrizione" placeholder="Cosa è stato fatto..." value={logForm.description} onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Durata (minuti)" placeholder="60" type="number" value={logForm.duration_minutes} onChange={e => setLogForm(f => ({ ...f, duration_minutes: e.target.value }))} />
            <Input label="Ricambi" placeholder="Filtro XF-420" value={logForm.parts_replaced} onChange={e => setLogForm(f => ({ ...f, parts_replaced: e.target.value }))} />
          </div>
          {logForm.plan_id ? <p className="text-xs text-blue-400 bg-blue-500/10 rounded-xl px-3 py-2">✓ Piano: {plans.find(p => p.id === logForm.plan_id)?.name}</p>
            : <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">⚡ Manutenzione straordinaria</p>}
          <Button onClick={saveLog} className="w-full" size="lg" disabled={!logForm.title.trim()}>Registra</Button>
        </div>
      </Modal>

      {/* ═══ CSV Import ═══ */}
      <Modal open={showCSVImport} onClose={() => setShowCSVImport(false)} title="Importa Piani da CSV" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted">Trovati <strong className="text-white">{csvData.length}</strong> piani.</p>
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Responsabile default</label>
            <select value={csvDefaultUser} onChange={e => setCsvDefaultUser(e.target.value)} className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
              <option value="">Non assegnato</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="bg-surface-2 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full">
              <thead><tr className="border-b border-token"><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Attività</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Freq.</th><th className="text-left px-4 py-2 text-[11px] text-faint uppercase">Note</th></tr></thead>
              <tbody>{csvData.map((r, i) => <tr key={i} className="border-b border-token/30"><td className="px-4 py-2.5 text-sm text-themed">{r.name}</td><td className="px-4 py-2.5 text-sm text-muted">{r.frequency_days}g</td><td className="px-4 py-2.5 text-sm text-faint truncate max-w-[200px]">{r.instructions||'—'}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Button onClick={importCSV} className="flex-1" size="lg"><Upload size={16} /> Importa {csvData.length} piani</Button>
            <Button variant="outline" onClick={() => setShowCSVImport(false)} className="flex-1" size="lg">Annulla</Button>
          </div>
          <div className="bg-surface-2/50 rounded-xl p-3">
            <p className="text-[11px] text-faint uppercase tracking-wider mb-1">Formato CSV</p>
            <code className="text-xs text-muted block">attività;frequenza_giorni;note</code>
          </div>
        </div>
      </Modal>
    </div>
  )
}
