/**
 * AdminMachines v4.2 — Refactored with extracted MachineDetailSheet
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { Button, Modal, Input, Textarea, EmptyState, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import MachineDetailSheet from './machines/MachineDetailSheet'
import ReportDetailModal from './reports/ReportDetailModal'
import QRCode from 'qrcode'
import {
  Plus, Edit, Trash2, FileText, Video, Cog, Search,
  GripVertical, ArrowUpDown, Check, ArrowUp, ArrowDown,
  X, QrCode, Camera, ChevronRight, Upload
} from 'lucide-react'

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
  const [detailTab, setDetailTab] = useState('overview')

  // Report detail
  const [selectedReport, setSelectedReport] = useState(null)

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
    setSel(machine); setDetailTab('overview')
    const [url, p, l] = await Promise.all([generateQR(machine), db.getMaintenancePlans(machine.id), db.getMaintenanceLogs(machine.id)])
    setQrDataUrl(url); setPlans(p); setLogs(l)
    const entries = await Promise.all(p.map(plan => db.getLastLogForPlan(plan.id).then(log => [plan.id, log])))
    setPlanLastLogs(Object.fromEntries(entries))
  }

  const refreshDetail = async () => {
    if (!sel) return
    const [p, l] = await Promise.all([db.getMaintenancePlans(sel.id), db.getMaintenanceLogs(sel.id)])
    setPlans(p); setLogs(l)
    const entries = await Promise.all(p.map(plan => db.getLastLogForPlan(plan.id).then(log => [plan.id, log])))
    setPlanLastLogs(Object.fromEntries(entries))
  }

  // ── Machine CRUD ──
  const openNew = () => { setEditing(null); setForm({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '' }); setAttachments([]); setPhotoUrl(''); setShowForm(true) }
  const openEdit = (m) => { setEditing(m); setForm({ name: m.name, department: m.department||'', description: m.description||'', notes: m.notes||'', model: m.model||'', serial_number: m.serial_number||'', manufacturer: m.manufacturer||'', year: m.year||'' }); setAttachments(m.attachments||[]); setPhotoUrl(m.photo_url||''); setShowForm(true); setSel(null) }

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
      const data = { name: planForm.name.trim(), frequency_days: parseInt(planForm.frequency_days) || 30, machine_id: sel.id, assigned_to: planForm.assigned_to || null, assigned_to_name: assignee?.name || null, instructions: planForm.instructions || null, org_id: 'default' }
      if (editingPlan) { await db.updateMaintenancePlan(editingPlan.id, data); toast.success('Piano aggiornato') }
      else { await db.createMaintenancePlan(data); toast.success('Piano creato') }
      setShowPlanForm(false); await refreshDetail()
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
      await db.createMaintenanceLog({ machine_id: sel.id, plan_id: logForm.plan_id || null, report_id: null, type: logForm.plan_id ? 'programmata' : 'straordinaria', title: logForm.title.trim(), description: logForm.description || null, performed_by: user?.id, performed_by_name: user?.name, duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null, parts_replaced: logForm.parts_replaced || null, performed_at: new Date().toISOString(), org_id: 'default' })
      toast.success('Intervento registrato'); setShowLogForm(false); await refreshDetail()
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
        if (parts.length >= 2 && parts[0] && parseInt(parts[1])) parsed.push({ name: parts[0], frequency_days: parseInt(parts[1]), instructions: parts[2] || '' })
      }
      setCsvData(parsed); setShowCSVImport(true)
    }
    reader.readAsText(file); e.target.value = ''
  }

  const importCSV = async () => {
    if (csvData.length === 0 || !sel) return
    const assignee = users.find(u => u.id === csvDefaultUser)
    try {
      await db.importMaintenancePlans(csvData.map(p => ({ machine_id: sel.id, name: p.name, frequency_days: p.frequency_days, assigned_to: csvDefaultUser || null, assigned_to_name: assignee?.name || null, instructions: p.instructions || null, org_id: 'default' })))
      toast.success(`${csvData.length} piani importati!`); setShowCSVImport(false); setCsvData([]); await refreshDetail()
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

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {!reorderMode ? (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input type="text" placeholder="Cerca macchinari..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
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
              <Cog size={18} className="text-violet-400" />
              <div className="flex-1 min-w-0"><h3 className="text-sm font-bold text-white truncate">{m.name}</h3></div>
              <div className="flex flex-col gap-0.5">
                <button onClick={e => { e.stopPropagation(); moveItem(i, -1) }} disabled={i === 0} className="p-1.5 rounded-lg text-faint hover:text-white disabled:cursor-not-allowed"><ArrowUp size={14} /></button>
                <button onClick={e => { e.stopPropagation(); moveItem(i, 1) }} disabled={i === machines.length - 1} className="p-1.5 rounded-lg text-faint hover:text-white disabled:cursor-not-allowed"><ArrowDown size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((m, i) => {
            const mr = getReportsForMachine(m.name); const active = mr.filter(r => r.status !== 'risolta').length
            return (
              <div key={m.id} onClick={() => openDetail(m)} className="card-elevated rounded-2xl p-6 hover:border-violet-500/30 transition-all group relative cursor-pointer">
                <div className="absolute top-3 left-3 w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center"><span className="text-[11px] font-bold text-amber-400">{m.sort_order || i + 1}</span></div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 pl-6">
                    {m.photo_url ? <div className="w-12 h-12 rounded-xl overflow-hidden border border-token shrink-0"><img src={m.photo_url} alt="" className="w-full h-full object-cover" /></div>
                      : <div className="w-12 h-12 bg-violet-600/15 rounded-xl flex items-center justify-center shrink-0"><Cog size={22} className="text-violet-400" /></div>}
                    <div><h3 className="text-base font-bold text-themed">{m.name}</h3>{m.department && <p className="text-sm text-faint">{m.department}</p>}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); openEdit(m) }} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white"><Edit size={15} /></button>
                    <button onClick={e => { e.stopPropagation(); downloadQR(m) }} className="p-2 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400"><QrCode size={15} /></button>
                  </div>
                </div>
                {(m.manufacturer || m.model) && <p className="text-sm text-muted mb-2 pl-6">{[m.manufacturer, m.model].filter(Boolean).join(' — ')}</p>}
                <div className="flex items-center gap-3 pt-3 border-t border-token/30">
                  {m.attachments?.length > 0 && <span className="text-xs text-faint flex items-center gap-1"><FileText size={12} /> {m.attachments.length}</span>}
                  {active > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{active} segnalaz.</span>}
                  <span className="ml-auto text-xs text-violet-400 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">Scheda <ChevronRight size={12} /></span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Sheet */}
      {sel && (
        <MachineDetailSheet
          sel={sel} qrDataUrl={qrDataUrl} plans={plans} logs={logs}
          planLastLogs={planLastLogs} reports={reports}
          detailTab={detailTab} setDetailTab={setDetailTab}
          onClose={() => setSel(null)} onEdit={openEdit} onDownloadQR={downloadQR}
          onOpenReport={(report) => setSelectedReport(report)}
          onOpenPlanForm={openPlanForm} onDeletePlan={deletePlan}
          onOpenLogForm={openLogForm} onHandleCSVFile={handleCSVFile}
        />
      )}

      {/* Report Detail Modal (from machine detail, z-index above detail sheet) */}
      {selectedReport && (
        <ReportDetailModal
          selected={selectedReport}
          user={user}
          users={users}
          machines={machines}
          onClose={() => { setSelectedReport(null); load() }}
          onUpdate={(updated) => { setSelectedReport(updated); load() }}
        />
      )}

      {/* Machine Form */}
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

      {/* Plan Form */}
      <Modal open={showPlanForm} onClose={() => setShowPlanForm(false)} title={editingPlan ? 'Modifica Piano' : 'Nuovo Piano'} size="md">
        <div className="space-y-4">
          <Input label="Attività *" placeholder="Lubrificazione cuscinetti" value={planForm.name} onChange={e => setPlanForm(f => ({ ...f, name: e.target.value }))} />
          <div>
            <label className="block text-sm text-muted mb-2 uppercase tracking-wider font-semibold">Frequenza</label>
            <div className="flex gap-2 mb-3 flex-wrap">
              {FREQ_PRESETS.map(p => <button key={p.days} onClick={() => setPlanForm(f => ({ ...f, frequency_days: p.days }))}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${parseInt(planForm.frequency_days) === p.days ? 'bg-violet-600 text-white' : 'bg-surface-2 text-muted'}`}>{p.label}</button>)}
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

      {/* Log Form */}
      <Modal open={showLogForm} onClose={() => setShowLogForm(false)} title="Registra Intervento" size="md">
        <div className="space-y-4">
          <Input label="Titolo *" placeholder="Lubrificazione completata" value={logForm.title} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea label="Descrizione" placeholder="Cosa è stato fatto..." value={logForm.description} onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Durata (minuti)" placeholder="60" type="number" value={logForm.duration_minutes} onChange={e => setLogForm(f => ({ ...f, duration_minutes: e.target.value }))} />
            <Input label="Ricambi" placeholder="Filtro XF-420" value={logForm.parts_replaced} onChange={e => setLogForm(f => ({ ...f, parts_replaced: e.target.value }))} />
          </div>
          {logForm.plan_id ? <p className="text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">✓ Piano: {plans.find(p => p.id === logForm.plan_id)?.name}</p>
            : <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">⚡ Manutenzione straordinaria</p>}
          <Button onClick={saveLog} className="w-full" size="lg" disabled={!logForm.title.trim()}>Registra</Button>
        </div>
      </Modal>

      {/* CSV Import */}
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
