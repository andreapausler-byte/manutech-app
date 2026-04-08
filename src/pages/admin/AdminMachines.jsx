/**
 * AdminMachines v5.0 — Con aree impianto e componenti
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { Button, EmptyState, Spinner } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import MachineDetailSheet from './machines/MachineDetailSheet'
import ReportDetailModal from './reports/ReportDetailModal'
import MachineFormModal from './machines/MachineFormModal'
import PlanFormModal from './machines/PlanFormModal'
import LogFormModal from './machines/LogFormModal'
import CSVImportModal from './machines/CSVImportModal'
import ComponentFormModal from './machines/ComponentFormModal'
import AreaManagerModal from './machines/AreaManagerModal'
import QRCode from 'qrcode'
import {
  Plus, Edit, FileText, Cog, Search,
  GripVertical, ArrowUpDown, Check, ArrowUp, ArrowDown,
  QrCode, ChevronRight, MapPin, ChevronDown
} from 'lucide-react'

export default function AdminMachines() {
  const { user } = useAuth()
  const toast = useToast()
  const [machines, setMachines] = useState([])
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState([])
  const [showAreaManager, setShowAreaManager] = useState(false)
  const [collapsedAreas, setCollapsedAreas] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '', area_id: '' })
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

  // Components
  const [components, setComponents] = useState([])
  const [showComponentForm, setShowComponentForm] = useState(false)
  const [editingComponent, setEditingComponent] = useState(null)
  const [componentForm, setComponentForm] = useState({ name: '', type: '', manufacturer: '', model: '', serial_number: '', year: '', notes: '' })

  // Reorder
  const [reorderMode, setReorderMode] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [m, r, u, a] = await Promise.all([db.getMachines(), db.getReports(), db.getUsers(), db.getAreas()])
    setMachines(m); setReports(r); setUsers(u); setAreas(a); setLoading(false)
  }
  useEffect(() => { load() }, [])

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
    const [url, p, l, comp] = await Promise.all([generateQR(machine), db.getMaintenancePlans(machine.id), db.getMaintenanceLogs(machine.id), db.getMachineComponents(machine.id)])
    setQrDataUrl(url); setPlans(p); setLogs(l); setComponents(comp)
    const entries = await Promise.all(p.map(plan => db.getLastLogForPlan(plan.id).then(log => [plan.id, log])))
    setPlanLastLogs(Object.fromEntries(entries))
  }

  const refreshDetail = async () => {
    if (!sel) return
    const [p, l, comp] = await Promise.all([db.getMaintenancePlans(sel.id), db.getMaintenanceLogs(sel.id), db.getMachineComponents(sel.id)])
    setPlans(p); setLogs(l); setComponents(comp)
    const entries = await Promise.all(p.map(plan => db.getLastLogForPlan(plan.id).then(log => [plan.id, log])))
    setPlanLastLogs(Object.fromEntries(entries))
  }

  // ── Machine CRUD ──
  const openNew = () => { setEditing(null); setForm({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '', area_id: '' }); setAttachments([]); setPhotoUrl(''); setShowForm(true) }
  const openEdit = (m) => { setEditing(m); setForm({ name: m.name, department: m.department||'', description: m.description||'', notes: m.notes||'', model: m.model||'', serial_number: m.serial_number||'', manufacturer: m.manufacturer||'', year: m.year||'', area_id: m.area_id||'' }); setAttachments(m.attachments||[]); setPhotoUrl(m.photo_url||''); setShowForm(true); setSel(null) }

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
      const data = { ...form, year: form.year ? parseInt(form.year) : null, area_id: form.area_id || null, attachments, photo_url: photoUrl || null }
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
      await db.createMaintenanceLog({ machine_id: sel.id, plan_id: logForm.plan_id || null, report_id: null, type: logForm.plan_id ? 'programmata' : 'straordinaria', title: logForm.title.trim(), description: logForm.description || null, performed_by: user?.id, performed_by_name: user?.name, duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null, parts_replaced: logForm.parts_replaced || null, performed_at: new Date().toISOString(), org_id: user?.org_id || 'default' })
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

  // ── Components ──
  const openComponentForm = (comp = null) => {
    setEditingComponent(comp)
    setComponentForm(comp ? { name: comp.name, type: comp.type || '', manufacturer: comp.manufacturer || '', model: comp.model || '', serial_number: comp.serial_number || '', year: comp.year || '', notes: comp.notes || '' }
      : { name: '', type: '', manufacturer: '', model: '', serial_number: '', year: '', notes: '' })
    setShowComponentForm(true)
  }

  const saveComponent = async () => {
    if (!componentForm.name.trim() || !sel) return
    try {
      const data = { ...componentForm, year: componentForm.year ? parseInt(componentForm.year) : null, machine_id: sel.id }
      if (editingComponent) { await db.updateMachineComponent(editingComponent.id, data); toast.success('Componente aggiornato') }
      else { await db.createMachineComponent(data); toast.success('Componente aggiunto') }
      setShowComponentForm(false); await refreshDetail()
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deleteComponent = async (id) => {
    await db.deleteMachineComponent(id)
    toast.success('Componente eliminato')
    refreshDetail()
  }

  // ── Areas ──
  const saveArea = async (id, data) => {
    try {
      if (id) { await db.updateArea(id, data); toast.success('Area aggiornata') }
      else { await db.createArea(data); toast.success('Area creata') }
      const a = await db.getAreas(); setAreas(a)
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const deleteArea = async (id) => {
    try {
      await db.deleteArea(id); toast.success('Area eliminata')
      const a = await db.getAreas(); setAreas(a)
    } catch (e) { toast.error('Errore: ' + e.message) }
  }

  const toggleArea = (areaId) => setCollapsedAreas(prev => ({ ...prev, [areaId]: !prev[areaId] }))

  // ── Drag & drop machines between areas ──
  const [dragMachine, setDragMachine] = useState(null)
  const [dropTargetArea, setDropTargetArea] = useState(null)
  const dragCounterRef = { current: {} } // track enter/leave per area to handle bubbling

  const handleMachineDragStart = (e, machine) => {
    setDragMachine(machine)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', machine.id) // required for Firefox
  }
  const handleAreaDragEnter = (e, areaId) => {
    e.preventDefault()
    dragCounterRef.current[areaId] = (dragCounterRef.current[areaId] || 0) + 1
    setDropTargetArea(areaId)
  }
  const handleAreaDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleAreaDragLeave = (areaId) => {
    dragCounterRef.current[areaId] = (dragCounterRef.current[areaId] || 0) - 1
    if (dragCounterRef.current[areaId] <= 0) {
      dragCounterRef.current[areaId] = 0
      setDropTargetArea(prev => prev === areaId ? null : prev)
    }
  }
  const handleAreaDrop = async (e, targetAreaId) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = {}
    setDropTargetArea(null)
    if (!dragMachine) return
    const newAreaId = targetAreaId === '__unassigned' ? null : targetAreaId
    if ((dragMachine.area_id || null) === newAreaId) { setDragMachine(null); return }
    try {
      await db.updateMachine(dragMachine.id, { area_id: newAreaId })
      setMachines(prev => prev.map(m => m.id === dragMachine.id ? { ...m, area_id: newAreaId } : m))
      const areaName = newAreaId ? areas.find(a => a.id === newAreaId)?.name : 'Non assegnate'
      toast.success(`${dragMachine.name} spostato in ${areaName}`)
    } catch { toast.error('Errore spostamento') }
    setDragMachine(null)
  }
  const handleMachineDragEnd = () => { setDragMachine(null); setDropTargetArea(null); dragCounterRef.current = {} }

  // ── Grouped machines ──
  const groupedMachines = useMemo(() => {
    const f = machines.filter(m => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.department?.toLowerCase().includes(search.toLowerCase()))
    const groups = []
    for (const area of areas) {
      const areaMs = f.filter(m => m.area_id === area.id)
      if (areaMs.length > 0 || !search) groups.push({ area, machines: areaMs })
    }
    const unassigned = f.filter(m => !m.area_id || !areas.find(a => a.id === m.area_id))
    if (unassigned.length > 0 || (!search && areas.length > 0)) {
      groups.push({ area: null, machines: unassigned })
    }
    return groups
  }, [machines, areas, search])

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
  const hasAreas = areas.length > 0

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
            <Button variant="outline" onClick={() => setShowAreaManager(true)}><MapPin size={16} /> Aree</Button>
            {machines.length >= 2 && !hasAreas && <Button variant="outline" onClick={() => { setReorderMode(true); setSearch('') }}><ArrowUpDown size={16} /> Ordina</Button>}
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
      ) : hasAreas ? (
        /* ═══ GROUPED BY AREA ═══ */
        <div className="space-y-6">
          {groupedMachines.map(({ area, machines: areaMachines }) => {
            const areaId = area?.id || '__unassigned'
            const isCollapsed = collapsedAreas[areaId]
            const areaColor = area?.color || '#6b7280'
            return (
              <div key={areaId} className="animate-fade-in"
                onDragEnter={e => handleAreaDragEnter(e, areaId)}
                onDragOver={handleAreaDragOver}
                onDragLeave={() => handleAreaDragLeave(areaId)}
                onDrop={e => handleAreaDrop(e, areaId)}>
                {/* Area header */}
                <div
                  onClick={() => { if (!dragMachine) toggleArea(areaId) }}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all duration-200 mb-3 cursor-pointer ${dropTargetArea === areaId && dragMachine ? 'bg-violet-500/15 border-violet-500/50 ring-2 ring-violet-500/30 shadow-lg shadow-violet-500/10' : 'bg-surface-1 border-token/50 hover:border-token'}`}>
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background: areaColor, boxShadow: `0 0 8px ${areaColor}40` }} />
                  <span className="text-sm font-bold text-themed flex-1 text-left">
                    {area?.name || 'Non assegnate'}
                  </span>
                  {dropTargetArea === areaId && dragMachine
                    ? <span className="text-xs text-violet-400 font-bold animate-pulse">Rilascia qui</span>
                    : <span className="text-xs text-faint">{areaMachines.length} macchinar{areaMachines.length === 1 ? 'io' : 'i'}</span>
                  }
                  <ChevronDown size={16} className={`text-faint transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                </div>

                {/* Machines grid */}
                {!isCollapsed && (
                  areaMachines.length === 0 ? (
                    <div className={`text-xs text-faint text-center py-8 rounded-xl border border-dashed transition-all duration-200 ${dropTargetArea === areaId && dragMachine ? 'border-violet-500/50 bg-violet-500/5 text-violet-400' : 'border-token/30'}`}>
                      {dropTargetArea === areaId && dragMachine ? 'Rilascia qui per spostare' : 'Nessun macchinario in quest\'area — trascina qui'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pl-2" style={{ borderLeft: `3px solid ${areaColor}30` }}>
                      {areaMachines.map((m) => {
                        const active = getReportsForMachine(m.name).filter(r => r.status !== 'risolta').length
                        const isDragging = dragMachine?.id === m.id
                        return (
                          <div key={m.id} draggable={true} onDragStart={e => handleMachineDragStart(e, m)} onDragEnd={handleMachineDragEnd}
                            onClick={() => { if (!dragMachine) openDetail(m) }}
                            className={`card-elevated rounded-2xl p-5 hover:border-violet-500/30 transition-all group cursor-pointer ${isDragging ? 'opacity-20 scale-95 ring-2 ring-violet-500/30' : ''}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="cursor-grab active:cursor-grabbing shrink-0">
                                  <GripVertical size={16} className="text-faint/50 group-hover:text-faint transition-opacity" />
                                </div>
                                {m.photo_url ? <div className="w-11 h-11 rounded-xl overflow-hidden border border-token shrink-0"><img src={m.photo_url} alt="" className="w-full h-full object-cover" /></div>
                                  : <div className="w-11 h-11 bg-violet-600/15 rounded-xl flex items-center justify-center shrink-0"><Cog size={20} className="text-violet-400" /></div>}
                                <div><h3 className="text-sm font-bold text-themed">{m.name}</h3>{m.department && <p className="text-xs text-faint">{m.department}</p>}</div>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={e => { e.stopPropagation(); openEdit(m) }} className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-white"><Edit size={14} /></button>
                                <button onClick={e => { e.stopPropagation(); downloadQR(m) }} className="p-1.5 rounded-lg hover:bg-violet-500/20 text-muted hover:text-violet-400"><QrCode size={14} /></button>
                              </div>
                            </div>
                            {(m.manufacturer || m.model) && <p className="text-xs text-muted mb-2">{[m.manufacturer, m.model].filter(Boolean).join(' — ')}</p>}
                            <div className="flex items-center gap-3 pt-2.5 border-t border-token/30">
                              {m.attachments?.length > 0 && <span className="text-xs text-faint flex items-center gap-1"><FileText size={11} /> {m.attachments.length}</span>}
                              {active > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{active} segnalaz.</span>}
                              <span className="ml-auto text-xs text-violet-400 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">Scheda <ChevronRight size={12} /></span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ═══ FLAT VIEW (no areas) ═══ */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((m, i) => {
            const active = getReportsForMachine(m.name).filter(r => r.status !== 'risolta').length
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
          components={components}
          detailTab={detailTab} setDetailTab={setDetailTab}
          onClose={() => setSel(null)} onEdit={openEdit} onDelete={(id) => { remove(id) }} onDownloadQR={downloadQR}
          onOpenReport={(report) => setSelectedReport(report)}
          onOpenPlanForm={openPlanForm} onDeletePlan={deletePlan}
          onOpenLogForm={openLogForm} onHandleCSVFile={handleCSVFile}
          onOpenComponentForm={openComponentForm} onDeleteComponent={deleteComponent}
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

      <MachineFormModal
        open={showForm} onClose={() => setShowForm(false)} editing={editing}
        form={form} setForm={setForm} photoUrl={photoUrl} setPhotoUrl={setPhotoUrl}
        attachments={attachments} setAttachments={setAttachments}
        areas={areas}
        onSave={saveMachine} onUploadPhoto={uploadPhoto} onAddAttachment={addAttachment}
      />

      <AreaManagerModal
        open={showAreaManager} onClose={() => setShowAreaManager(false)}
        areas={areas} onSave={saveArea} onDelete={deleteArea}
      />

      <PlanFormModal
        open={showPlanForm} onClose={() => setShowPlanForm(false)} editing={editingPlan}
        form={planForm} setForm={setPlanForm} users={users} onSave={savePlan}
      />

      <LogFormModal
        open={showLogForm} onClose={() => setShowLogForm(false)}
        form={logForm} setForm={setLogForm} plans={plans} onSave={saveLog}
      />

      <CSVImportModal
        open={showCSVImport} onClose={() => setShowCSVImport(false)}
        csvData={csvData} users={users} defaultUser={csvDefaultUser}
        onDefaultUserChange={setCsvDefaultUser} onImport={importCSV}
      />

      <ComponentFormModal
        open={showComponentForm} onClose={() => setShowComponentForm(false)}
        editing={editingComponent} form={componentForm} setForm={setComponentForm}
        onSave={saveComponent}
      />
    </div>
  )
}
