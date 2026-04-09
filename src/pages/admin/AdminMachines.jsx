/**
 * AdminMachines v6.0 — Premium area view con quick actions
 */

import { useState, useEffect, useMemo } from 'react'
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
  Plus, Edit, FileText, Cog, Search, Package,
  ArrowUp, ArrowDown, ChevronRight, MapPin, ChevronDown,
  QrCode, AlertTriangle, Activity, MoveRight
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
  const [logForm, setLogForm] = useState({ title: '', description: '', duration_minutes: '', parts_replaced: '', plan_id: '', component_id: '' })

  // CSV
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvDefaultUser, setCsvDefaultUser] = useState('')

  // Components
  const [components, setComponents] = useState([])
  const [showComponentForm, setShowComponentForm] = useState(false)
  const [editingComponent, setEditingComponent] = useState(null)
  const [componentForm, setComponentForm] = useState({ name: '', type: '', manufacturer: '', model: '', serial_number: '', year: '', notes: '' })

  // Components cache per machine (for card preview)
  const [machineComponents, setMachineComponents] = useState({})
  const [moveMenuId, setMoveMenuId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [m, r, u, a] = await Promise.all([db.getMachines(), db.getReports(), db.getUsers(), db.getAreas()])
    setMachines(m); setReports(r); setUsers(u); setAreas(a)
    // Preload components for all machines (for card preview)
    const comps = {}
    await Promise.all(m.map(async (machine) => {
      try { comps[machine.id] = await db.getMachineComponents(machine.id) } catch { comps[machine.id] = [] }
    }))
    setMachineComponents(comps)
    setLoading(false)
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
  const openNew = () => { setEditing(null); setForm({ name: '', department: '', description: '', notes: '', model: '', serial_number: '', manufacturer: '', year: '', area_id: '', usage_instructions: '', maintenance_instructions: '' }); setAttachments([]); setPhotoUrl(''); setShowForm(true) }
  const openEdit = (m) => { setEditing(m); setForm({ name: m.name, department: m.department||'', description: m.description||'', notes: m.notes||'', model: m.model||'', serial_number: m.serial_number||'', manufacturer: m.manufacturer||'', year: m.year||'', area_id: m.area_id||'', usage_instructions: m.usage_instructions||'', maintenance_instructions: m.maintenance_instructions||'' }); setAttachments(m.attachments||[]); setPhotoUrl(m.photo_url||''); setShowForm(true); setSel(null) }

  const uploadPhoto = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
    input.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await db.uploadFile('attachments', `photo-${Date.now()}`, f); setPhotoUrl(url); toast.success('Foto caricata') } catch (err) { toast.error('Errore upload: ' + (err.message || 'riprova')) } }
    input.click()
  }
  const addAttachment = (type, category = null) => {
    const accept = type === 'pdf' ? '.pdf' : type === 'image' ? 'image/*' : 'video/*'
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept
    input.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await db.uploadFile('attachments', `${Date.now()}`, f); setAttachments(a => [...a, { type, category: category || type, name: f.name, url }]); toast.success('File caricato') } catch (err) { toast.error('Errore upload: ' + (err.message || 'riprova')) } }
    input.click()
  }

  // ── Inline doc updates from detail sheet ──
  const updateMachineField = async (field, value) => {
    if (!sel) return
    try {
      const updated = await db.updateMachine(sel.id, { [field]: value })
      setSel(prev => ({ ...prev, ...updated }))
      toast.success('Salvato')
    } catch (err) { toast.error('Errore: ' + (err.message || 'riprova')) }
  }

  const uploadToMachine = (type, category) => {
    const accept = type === 'image' ? 'image/*' : '.pdf'
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept
    input.onchange = async (e) => {
      const f = e.target.files[0]; if (!f || !sel) return
      try {
        const url = await db.uploadFile('attachments', `${sel.id}/${category}-${Date.now()}`, f)
        const newAttachments = [...(sel.attachments || []), { type, category, name: f.name, url }]
        const updated = await db.updateMachine(sel.id, { attachments: newAttachments })
        setSel(prev => ({ ...prev, ...updated }))
        toast.success('File caricato')
      } catch (err) { toast.error('Errore upload: ' + (err.message || 'riprova')) }
    }
    input.click()
  }

  const removeAttachment = async (index) => {
    if (!sel) return
    const newAttachments = (sel.attachments || []).filter((_, i) => i !== index)
    try {
      const updated = await db.updateMachine(sel.id, { attachments: newAttachments })
      setSel(prev => ({ ...prev, ...updated }))
    } catch (err) { toast.error('Errore: ' + (err.message || 'riprova')) }
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
    setLogForm({ title: plan?.name || '', description: '', duration_minutes: '', parts_replaced: '', plan_id: planId || '', component_id: '' })
    setShowLogForm(true)
  }

  const saveLog = async () => {
    if (!logForm.title.trim() || !sel) return
    try {
      await db.createMaintenanceLog({ machine_id: sel.id, plan_id: logForm.plan_id || null, report_id: null, component_id: logForm.component_id || null, type: logForm.plan_id ? 'programmata' : 'straordinaria', title: logForm.title.trim(), description: logForm.description || null, performed_by: user?.id, performed_by_name: user?.name, duration_minutes: logForm.duration_minutes ? parseInt(logForm.duration_minutes) : null, parts_replaced: logForm.parts_replaced || null, performed_at: new Date().toISOString(), org_id: user?.org_id || 'default' })
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

  // ── Quick actions: move to area ──
  const moveMachineToArea = async (machine, targetAreaId) => {
    setMoveMenuId(null)
    const newAreaId = targetAreaId || null
    if ((machine.area_id || null) === newAreaId) return
    try {
      await db.updateMachine(machine.id, { area_id: newAreaId })
      setMachines(prev => prev.map(m => m.id === machine.id ? { ...m, area_id: newAreaId } : m))
      const areaName = newAreaId ? areas.find(a => a.id === newAreaId)?.name : 'Non assegnate'
      toast.success(`${machine.name} → ${areaName}`)
    } catch { toast.error('Errore spostamento') }
  }

  // ── Quick actions: reorder within area ──
  const reorderInArea = async (machine, direction) => {
    const areaId = machine.area_id || null
    const areaMachines = machines.filter(m => (m.area_id || null) === areaId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const idx = areaMachines.findIndex(m => m.id === machine.id)
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= areaMachines.length) return
    // Swap sort_order
    const a = areaMachines[idx]
    const b = areaMachines[targetIdx]
    const orderA = a.sort_order ?? idx
    const orderB = b.sort_order ?? targetIdx
    try {
      await Promise.all([
        db.updateMachine(a.id, { sort_order: orderB }),
        db.updateMachine(b.id, { sort_order: orderA }),
      ])
      setMachines(prev => prev.map(m => {
        if (m.id === a.id) return { ...m, sort_order: orderB }
        if (m.id === b.id) return { ...m, sort_order: orderA }
        return m
      }))
    } catch { toast.error('Errore riordino') }
  }

  // ── Grouped machines ──
  const filtered = machines.filter(m => !search || m.name?.toLowerCase().includes(search.toLowerCase()) || m.department?.toLowerCase().includes(search.toLowerCase()))
  const getReportsForMachine = (name) => reports.filter(r => r.machine === name)
  const hasAreas = areas.length > 0

  const groupedMachines = useMemo(() => {
    const f = filtered
    const groups = []
    for (const area of areas) {
      const areaMs = f.filter(m => m.area_id === area.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      if (areaMs.length > 0 || !search) groups.push({ area, machines: areaMs })
    }
    const unassigned = f.filter(m => !m.area_id || !areas.find(a => a.id === m.area_id)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    if (unassigned.length > 0 || (!search && areas.length > 0)) {
      groups.push({ area: null, machines: unassigned })
    }
    return groups
  }, [filtered, areas, search])

  // ── Health score helper ──
  const getHealthColor = (activeCount, criticalCount) => {
    if (criticalCount > 0) return '#ef4444'
    if (activeCount > 2) return '#f59e0b'
    if (activeCount > 0) return '#ffaa2c'
    return '#22c55e'
  }
  const getHealthPercent = (activeCount) => Math.max(0, 100 - activeCount * 20)

  // ── Premium Machine Card ──
  const MachineCard = ({ m, idx, totalInArea }) => {
    const activeReports = getReportsForMachine(m.name).filter(r => r.status !== 'risolta')
    const active = activeReports.length
    const critical = activeReports.filter(r => r.severity === 'critica' || r.severity === 'alta').length
    const healthColor = getHealthColor(active, critical)
    const healthPct = getHealthPercent(active)
    const comps = machineComponents[m.id] || []
    const isMoving = moveMenuId === m.id

    return (
      <div className="card-elevated card-3d rounded-2xl overflow-hidden relative"
        style={{ minHeight: 220 }}>

        {/* ── Health bar top ── */}
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${healthColor} ${healthPct}%, var(--color-surface-3) ${healthPct}%)` }} />

        {/* ── Main area — clickable ── */}
        <div className="p-6 pb-3 cursor-pointer" onClick={() => { if (!isMoving) openDetail(m) }}>

          {/* ── Header: photo + name + status dot ── */}
          <div className="flex items-start gap-4 mb-4">
            {m.photo_url ? (
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-token shrink-0 shadow-md">
                <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${healthColor}12` }}>
                <Cog size={26} style={{ color: healthColor }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-themed truncate">{m.name}</h3>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: healthColor, boxShadow: `0 0 10px ${healthColor}60` }} />
              </div>
              {(m.manufacturer || m.model) && (
                <p className="text-xs text-muted mt-0.5 truncate">{[m.manufacturer, m.model].filter(Boolean).join(' — ')}</p>
              )}
              {m.department && <p className="text-[11px] text-faint mt-0.5">{m.department}</p>}
            </div>
          </div>

          {/* ── Status badges ── */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {active === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                <Activity size={12} /> Operativo
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/15">
                  <AlertTriangle size={12} /> {active} segnalazioni
                </span>
                {critical > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/15">
                    {critical} critiche
                  </span>
                )}
              </>
            )}
            {m.attachments?.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-faint bg-surface-2">
                <FileText size={10} /> {m.attachments.length} doc
              </span>
            )}
          </div>

          {/* ── Components chips ── */}
          {comps.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {comps.slice(0, 5).map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/8 text-cyan-400 border border-cyan-500/10">
                  <Package size={10} /> {c.name}
                </span>
              ))}
              {comps.length > 5 && (
                <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-surface-2 text-faint border border-token/30">
                  +{comps.length - 5} altri
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Action bar — ALWAYS VISIBLE ── */}
        <div className="flex items-center gap-2 px-6 py-3 border-t border-token/20 bg-surface-0/30">
          {/* Reorder arrows */}
          {hasAreas && totalInArea > 1 && (
            <div className="flex gap-1 mr-1">
              <button onClick={e => { e.stopPropagation(); reorderInArea(m, -1) }} disabled={idx === 0}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-white hover:bg-white/10 disabled:opacity-15 disabled:cursor-not-allowed transition-all" title="Sposta su">
                <ArrowUp size={15} />
              </button>
              <button onClick={e => { e.stopPropagation(); reorderInArea(m, 1) }} disabled={idx === totalInArea - 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-white hover:bg-white/10 disabled:opacity-15 disabled:cursor-not-allowed transition-all" title="Sposta giù">
                <ArrowDown size={15} />
              </button>
            </div>
          )}
          {/* Move to area */}
          {hasAreas && (
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setMoveMenuId(isMoving ? null : m.id) }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isMoving ? 'bg-violet-500/15 text-violet-400' : 'text-muted hover:text-violet-400 hover:bg-violet-500/10'}`}>
                <MoveRight size={14} /> Sposta
              </button>
              {isMoving && (
                <div className="absolute bottom-full left-0 mb-2 bg-surface-1 border border-token rounded-xl shadow-2xl py-2 min-w-[180px] z-50 animate-fade-in"
                  onClick={e => e.stopPropagation()}>
                  <p className="px-3 py-1 text-[10px] text-faint uppercase tracking-wider font-semibold">Sposta in...</p>
                  {areas.filter(a => a.id !== m.area_id).map(a => (
                    <button key={a.id} onClick={() => moveMachineToArea(m, a.id)}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-secondary hover:bg-violet-500/10 hover:text-violet-400 transition-colors text-left">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: a.color }} />
                      {a.name}
                    </button>
                  ))}
                  {m.area_id && (
                    <button onClick={() => moveMachineToArea(m, null)}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-faint hover:bg-surface-2 transition-colors text-left border-t border-token/30 mt-1">
                      <div className="w-3 h-3 rounded-full shrink-0 bg-gray-500/50" />
                      Non assegnata
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Right actions */}
          <div className="flex gap-1 ml-auto">
            <button onClick={e => { e.stopPropagation(); openEdit(m) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-all" title="Modifica">
              <Edit size={15} />
            </button>
            <button onClick={e => { e.stopPropagation(); downloadQR(m) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-violet-400 hover:bg-violet-500/10 transition-all" title="QR Code">
              <QrCode size={15} />
            </button>
            <button onClick={e => { e.stopPropagation(); openDetail(m) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-violet-400 hover:bg-violet-500/10 transition-all" title="Apri scheda">
              Scheda <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in" onClick={() => setMoveMenuId(null)}>
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input type="text" placeholder="Cerca macchinari..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full card-elevated rounded-xl pl-11 pr-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50" />
        </div>
        <p className="text-sm text-faint shrink-0">{filtered.length} macchinari</p>
        <Button variant="outline" onClick={() => setShowAreaManager(true)}><MapPin size={16} /> Aree</Button>
        <Button onClick={openNew}><Plus size={18} /> Nuovo</Button>
      </div>

      {loading ? <Spinner /> : machines.length === 0 ? (
        <EmptyState icon="⚙️" title="Nessun macchinario" subtitle="Aggiungi i macchinari" />
      ) : hasAreas ? (
        /* ═══ GROUPED BY AREA — PREMIUM ═══ */
        <div className="space-y-8">
          {groupedMachines.map(({ area, machines: areaMachines }) => {
            const areaId = area?.id || '__unassigned'
            const isCollapsed = collapsedAreas[areaId]
            const areaColor = area?.color || '#6b7280'
            const areaActive = areaMachines.reduce((sum, m) => sum + getReportsForMachine(m.name).filter(r => r.status !== 'risolta').length, 0)
            return (
              <div key={areaId}>
                {/* ── Area Header Premium ── */}
                <button onClick={() => toggleArea(areaId)}
                  className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl border border-token/30 hover:border-token/60 transition-all duration-300 mb-4 group/area"
                  style={{ background: `linear-gradient(135deg, ${areaColor}08, transparent 60%)` }}>
                  <div className="w-5 h-5 rounded-full shrink-0 ring-2 ring-white/10" style={{ background: areaColor, boxShadow: `0 0 16px ${areaColor}40` }} />
                  <div className="flex-1 text-left">
                    <span className="text-base font-bold text-themed">{area?.name || 'Non assegnate'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-faint bg-surface-2 px-2.5 py-1 rounded-lg">
                      {areaMachines.length} macchinar{areaMachines.length === 1 ? 'io' : 'i'}
                    </span>
                    {areaActive > 0 && (
                      <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400">
                        {areaActive} segnalaz.
                      </span>
                    )}
                    <ChevronDown size={18} className={`text-faint transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} />
                  </div>
                </button>

                {/* ── Machines Grid ── */}
                {!isCollapsed && (
                  areaMachines.length === 0 ? (
                    <div className="text-center py-10 rounded-xl border border-dashed border-token/20">
                      <Cog size={32} className="mx-auto text-faint/20 mb-2" />
                      <p className="text-xs text-faint">Nessun macchinario in quest'area</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 stagger-enter"
                      style={{ paddingLeft: 8, borderLeft: `3px solid ${areaColor}20` }}>
                      {areaMachines.map((m, idx) => (
                        <MachineCard key={m.id} m={m} idx={idx} totalInArea={areaMachines.length}  />
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ═══ FLAT VIEW (no areas) ═══ */
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 stagger-enter">
          {filtered.map((m, i) => (
            <MachineCard key={m.id} m={m} idx={i} totalInArea={filtered.length} areaId={null} />
          ))}
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
          onUploadToMachine={uploadToMachine} onRemoveAttachment={removeAttachment} onSaveField={updateMachineField}
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
          onUpdate={(updates) => { setSelectedReport(s => s ? { ...s, ...updates } : null); load() }}
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
        form={logForm} setForm={setLogForm} plans={plans} components={components} onSave={saveLog}
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
