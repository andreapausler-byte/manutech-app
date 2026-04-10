import { useState, useEffect, useMemo } from 'react'
import { useDraggable } from '../../../hooks/useDraggable'
import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { db } from '../../../lib/supabase'
import { Badge } from '../../../components/ui'
import {
  Edit, Trash2, FileText, Video, Cog, X, QrCode, Download, Camera,
  Calendar, Hash, Factory, Building, ClipboardList, ChevronRight,
  Wrench, Shield, Plus, Play, Upload, Activity, LayoutDashboard,
  AlertTriangle, Clock, Filter, Package, FolderOpen
} from 'lucide-react'
import MachineDocumentationTab from './MachineDocumentationTab'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft }
}

const healthColors = {
  ottimo: { bg: '#22c55e', ring: '#22c55e40' },
  buono: { bg: '#7c6aff', ring: '#7c6aff40' },
  attenzione: { bg: '#f59e0b', ring: '#f59e0b40' },
  critico: { bg: '#ef4444', ring: '#ef444440' },
}

const healthLabels = {
  ottimo: 'Ottimo',
  buono: 'Buono',
  attenzione: 'Attenzione',
  critico: 'Critico',
}

export default function MachineDetailSheet({
  sel, qrDataUrl, plans, logs, planLastLogs, reports,
  components = [],
  detailTab, setDetailTab,
  onClose, onEdit, onDelete, onDownloadQR, onOpenReport,
  onOpenPlanForm, onDeletePlan, onOpenLogForm,
  onHandleCSVFile,
  onOpenComponentForm, onDeleteComponent,
  onUploadToMachine, onRemoveAttachment, onSaveField,
}) {
  const machineReports = useMemo(() =>
    reports.filter(r => r.machine === sel.name).sort((a, b) => {
      const aActive = a.status !== 'risolta' ? 0 : 1
      const bActive = b.status !== 'risolta' ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return new Date(b.created_at) - new Date(a.created_at)
    }),
    [reports, sel.name]
  )

  const activeReports = useMemo(() => machineReports.filter(r => r.status !== 'risolta'), [machineReports])
  const criticalReports = useMemo(() => activeReports.filter(r => r.severity === 'critica' || r.severity === 'alta'), [activeReports])

  // Health score assessment
  const [assessment, setAssessment] = useState(null)
  const [assessmentLoading, setAssessmentLoading] = useState(true)

  useEffect(() => {
    if (!sel?.id) return
    setAssessmentLoading(true)
    db.fetchMachineAssessments(sel.org_id || 'default', sel.id)
      .then(result => {
        const a = result?.assessments?.find(a => a.machine_id === sel.id)
        setAssessment(a || null)
      })
      .catch(() => setAssessment(null))
      .finally(() => setAssessmentLoading(false))
  }, [sel?.id])

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Report status filter
  const [reportFilter, setReportFilter] = useState('all')
  const filteredReports = useMemo(() => {
    if (reportFilter === 'all') return machineReports
    return machineReports.filter(r => r.status === reportFilter)
  }, [machineReports, reportFilter])

  // Quick stats
  const nextMaintenance = useMemo(() => {
    if (plans.length === 0) return null
    let closest = null
    for (const plan of plans) {
      const light = getTrafficLight(plan, planLastLogs[plan.id])
      if (!closest || light.daysLeft < closest.daysLeft) {
        closest = { ...light, name: plan.name }
      }
    }
    return closest
  }, [plans, planLastLogs])

  const healthColor = assessment ? (healthColors[assessment.status]?.bg || '#6b7280') : '#6b7280'
  const { position, dragProps } = useDraggable()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '5vh' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }} />
      <div {...dragProps} className="relative bg-surface-1 border border-token rounded-2xl w-full animate-fade-in shadow-2xl overflow-hidden"
        style={{ ...dragProps.style, maxWidth: 1200, height: '85vh', transform: `translate(${position.x}px, ${position.y}px)` }} onClick={e => e.stopPropagation()}>

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-token bg-surface-0/50">
          <div className="flex items-center gap-3 min-w-0">
            {/* Health dot */}
            {assessment && (
              <div className="w-3 h-3 rounded-full shrink-0 animate-pulse" style={{ background: healthColor, boxShadow: `0 0 8px ${healthColor}60` }} />
            )}
            <Cog size={20} className="text-violet-400 shrink-0" />
            <h2 className="text-lg font-bold text-themed truncate">{sel.name}</h2>
            {sel.department && (
              <span className="text-xs text-faint px-2.5 py-1 bg-surface-2 rounded-lg shrink-0 font-medium">{sel.department}</span>
            )}
            {sel.manufacturer && (
              <span className="text-xs text-muted shrink-0">{sel.manufacturer}</span>
            )}
            {activeReports.length > 0 && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${criticalReports.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {activeReports.length} segnalaz. attive
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onDownloadQR(sel)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-violet-400 hover:bg-violet-400/10 transition-all" title="Scarica QR Code">
              <QrCode size={15} />
            </button>
            <button onClick={() => onEdit(sel)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all">
              <Edit size={14} /> Modifica
            </button>
            {onDelete && (
              <button onClick={() => { if (confirm(`Eliminare il macchinario "${sel.name}"? Questa azione è irreversibile.`)) onDelete(sel.id) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Elimina macchinario">
                <Trash2 size={14} /> Elimina
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(85vh - 57px)' }}>

          {/* ═══ SIDEBAR LEFT ═══ */}
          <div className="col-span-3 border-r border-token overflow-y-auto p-4 space-y-3">

            {/* Photo with Live badge */}
            <div className="relative rounded-2xl overflow-hidden border border-violet-500/30 aspect-[4/3] shadow-lg">
              {sel.photo_url ? (
                <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <button onClick={() => onEdit(sel)} className="w-full h-full bg-surface-2/30 flex flex-col items-center justify-center text-faint hover:text-violet-400 transition-all">
                  <Camera size={28} className="mb-1 opacity-40" />
                  <span className="text-xs">Aggiungi foto</span>
                </button>
              )}
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 backdrop-blur-md border border-emerald-400/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Live</span>
              </div>
            </div>

            {/* STATO SALUTE — 2 mini circular charts */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #10b98180' }} />
                <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">Stato Salute</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Segnalazioni mini chart */}
                <button
                  onClick={() => setDetailTab('reports')}
                  className="bg-surface-2/50 rounded-2xl p-3 flex flex-col items-center hover:bg-surface-3 transition-all border border-token press-scale"
                >
                  <div className="relative w-16 h-16 mb-1">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${Math.min(activeReports.length * 25, 100)} 100`}
                        style={{
                          stroke: criticalReports.length > 0 ? '#ef4444' : activeReports.length > 0 ? '#f59e0b' : '#10b981',
                          filter: `drop-shadow(0 0 6px ${criticalReports.length > 0 ? '#ef4444' : activeReports.length > 0 ? '#f59e0b' : '#10b981'}60)`,
                        }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-themed">{activeReports.length}</span>
                  </div>
                  <p className="text-[9px] text-faint uppercase tracking-wider font-semibold truncate w-full text-center">Segnalazioni</p>
                  <p className="text-[9px] text-faint uppercase tracking-wider mt-1 opacity-60 truncate w-full text-center">Ultimo Interv.</p>
                </button>

                {/* Piani mini chart */}
                <button
                  onClick={() => setDetailTab('plans')}
                  className="bg-surface-2/50 rounded-2xl p-3 flex flex-col items-center hover:bg-surface-3 transition-all border border-token press-scale"
                >
                  <div className="relative w-16 h-16 mb-1">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${plans.length > 0 ? 75 : 0} 100`}
                        style={{
                          stroke: nextMaintenance?.color || '#ef4444',
                          filter: `drop-shadow(0 0 6px ${nextMaintenance?.color || '#ef4444'}60)`,
                        }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-themed">{plans.length}</span>
                  </div>
                  <p className="text-[9px] text-faint uppercase tracking-wider font-semibold truncate w-full text-center">Piani</p>
                  <p className="text-[9px] text-faint uppercase tracking-wider mt-1 opacity-60 truncate w-full text-center">Prossima Scad.</p>
                </button>
              </div>
            </div>

            {/* Scheda Tecnica */}
            <div className="space-y-2">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold px-1">Scheda Tecnica</p>
              <div className="bg-surface-2/50 rounded-2xl border border-token overflow-hidden">
                {(() => {
                  const rows = [
                    { icon: Factory, label: 'Costruttore', value: sel.manufacturer },
                    { icon: Cog, label: 'Modello', value: sel.model },
                    { icon: Hash, label: 'Serial', value: sel.serial_number },
                    { icon: Calendar, label: 'Anno', value: sel.year },
                    { icon: Building, label: 'Reparto', value: sel.department },
                  ].filter(f => f.value)
                  if (rows.length === 0) {
                    return <p className="text-xs text-faint text-center py-3">Nessun dato tecnico. <button onClick={() => onEdit(sel)} className="text-violet-400 underline">Compila</button></p>
                  }
                  return rows.map(({ icon: Icon, label, value }, i) => (
                    <div key={label} className={`flex items-center justify-between px-3 py-2.5 ${i < rows.length - 1 ? 'border-b border-token' : ''}`}>
                      <div className="flex items-center gap-2 text-faint">
                        <Icon size={13} />
                        <span className="text-xs">{label}</span>
                      </div>
                      <span className="text-xs text-themed font-semibold truncate ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Documentazione */}
            <div className="space-y-2">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold px-1">Documentazione</p>
              <button
                onClick={() => setDetailTab('docs')}
                className="w-full flex items-center gap-2.5 p-3 bg-surface-2/50 rounded-2xl border border-token text-left hover:bg-surface-3 transition-all group"
              >
                <FolderOpen size={16} className="text-amber-400 shrink-0" />
                <span className="text-xs font-bold text-themed flex-1">Documentazione</span>
                <span className="text-[10px] text-faint">{sel.attachments?.length || 0}</span>
              </button>
            </div>
          </div>

          {/* ═══ RIGHT: TABS ═══ */}
          <div className="col-span-9 flex flex-col overflow-hidden">

            {/* Title block */}
            <div className="px-5 pt-4 pb-2 shrink-0 min-w-0">
              <h1 className="text-xl font-bold text-themed truncate">{sel.name}</h1>
              <p className="text-xs text-faint mt-0.5 truncate">
                {[sel.manufacturer, sel.model].filter(Boolean).join(' ')}
                {sel.serial_number && <> · Serial <span className="text-secondary font-medium">{sel.serial_number}</span></>}
                {sel.year && <> · Year <span className="text-secondary font-medium">{sel.year}</span></>}
              </p>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b border-token shrink-0">
              <button onClick={() => setDetailTab('overview')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'overview' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <LayoutDashboard size={16} /> Panoramica
              </button>
              <button onClick={() => setDetailTab('plans')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'plans' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <Shield size={16} /> Piani Manutenzione
                {plans.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{plans.length}</span>}
              </button>
              <button onClick={() => setDetailTab('logs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'logs' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5' : 'text-faint hover:text-secondary'}`}>
                <Wrench size={16} /> Registro Interventi
                {logs.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{logs.length}</span>}
              </button>
              <button onClick={() => setDetailTab('components')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'components' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5' : 'text-faint hover:text-secondary'}`}>
                <Package size={16} /> Componenti
                {components.length > 0 && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{components.length}</span>}
              </button>
              <button onClick={() => setDetailTab('docs')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'docs' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-faint hover:text-secondary'}`}>
                <FolderOpen size={16} /> Documentazione
                {(sel.attachments?.length > 0) && <span className="text-xs bg-surface-2 rounded-full px-2 py-0.5">{sel.attachments.length}</span>}
              </button>
              <button onClick={() => setDetailTab('reports')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'reports' ? 'text-red-400 border-b-2 border-red-400 bg-red-400/5' : 'text-faint hover:text-secondary'}`}>
                <ClipboardList size={16} /> Segnalazioni
                {activeReports.length > 0 && (
                  <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${criticalReports.length > 0 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {activeReports.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">

              {/* ═══ OVERVIEW TAB ═══ */}
              {detailTab === 'overview' && (
                <div className="space-y-5 animate-fade-in">
                  {/* Top row: 3 KPI cards */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* STATO SALUTE */}
                    <div className="bg-surface-2 rounded-2xl p-4 border border-token">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-[10px] text-faint uppercase tracking-wider font-semibold leading-tight pt-1.5 min-w-0">Stato Salute</p>
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                          <Activity size={16} className="text-cyan-400" />
                        </div>
                      </div>
                      {assessmentLoading ? (
                        <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                      ) : assessment ? (
                        <>
                          <p className="text-3xl font-bold text-themed leading-none">{assessment.health_score}</p>
                          <p className="text-xs text-faint mt-1.5 capitalize truncate">{healthLabels[assessment.status] || assessment.status}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-bold text-faint leading-tight">Non Disponibile</p>
                          <p className="text-xs text-faint mt-1 opacity-60 truncate">Nessun assessment</p>
                        </>
                      )}
                    </div>

                    {/* SEGNALAZIONI ATTIVE */}
                    <div
                      className={`bg-surface-2 rounded-2xl p-4 border transition-all ${
                        criticalReports.length > 0
                          ? 'border-red-500/40'
                          : activeReports.length > 0
                            ? 'border-amber-500/40'
                            : 'border-token'
                      }`}
                      style={criticalReports.length > 0 ? { boxShadow: '0 0 24px rgba(239,68,68,0.15), inset 0 0 24px rgba(239,68,68,0.05)' } : {}}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-[10px] text-faint uppercase tracking-wider font-semibold leading-tight pt-1.5 min-w-0">Segnalazioni Attive</p>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          criticalReports.length > 0 ? 'bg-red-500/15' : activeReports.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                        }`}>
                          <AlertTriangle size={16} className={criticalReports.length > 0 ? 'text-red-400' : activeReports.length > 0 ? 'text-amber-400' : 'text-emerald-400'} />
                        </div>
                      </div>
                      <p className={`text-3xl font-bold leading-none ${criticalReports.length > 0 ? 'text-red-400' : activeReports.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {activeReports.length}
                      </p>
                      <p className="text-xs text-faint mt-1.5 truncate">
                        {activeReports.length === 0 ? 'tutto ok' : 'segnalazioni da gestire'}
                      </p>
                    </div>

                    {/* MANUTENZIONE */}
                    <div className="bg-surface-2 rounded-2xl p-4 border border-token">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-[10px] text-faint uppercase tracking-wider font-semibold leading-tight pt-1.5 min-w-0">Manutenzione</p>
                        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                          <Wrench size={16} className="text-violet-400" />
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-violet-400 leading-none">{plans.length}</p>
                      <p className="text-xs text-faint mt-1.5 truncate">Piani attivi</p>
                    </div>
                  </div>

                  {/* Recent active reports */}
                  {activeReports.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-muted flex items-center gap-2">
                          <ClipboardList size={15} /> Segnalazioni attive recenti
                        </p>
                        {activeReports.length > 3 && (
                          <button onClick={() => setDetailTab('reports')} className="text-xs text-violet-400 hover:underline flex items-center gap-1">
                            Vedi tutte ({activeReports.length}) <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {activeReports.slice(0, 3).map(r => {
                          const s = STATUS[r.status] || STATUS.aperta
                          const sv = SEVERITY[r.severity] || SEVERITY.media
                          const isCritical = r.severity === 'critica'
                          return (
                            <div key={r.id} onClick={() => onOpenReport?.(r)}
                              className={`flex items-start gap-4 p-4 bg-surface-2 rounded-2xl cursor-pointer hover:bg-surface-3 transition-all border ${isCritical ? 'border-red-500/30' : 'border-token'}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-themed font-bold mb-1">{r.title}</p>
                                {r.description && <p className="text-xs text-faint line-clamp-2 leading-relaxed mb-2">{r.description}</p>}
                                <p className="text-[11px] text-faint">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: s.color + '18', color: s.color }}>
                                  {s.icon} {s.label}
                                </span>
                                <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: sv.color + '18', color: sv.color }}>
                                  {sv.label}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upcoming maintenance plans */}
                  {plans.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-muted flex items-center gap-2">
                          <Shield size={15} /> Piani manutenzione
                        </p>
                        <button onClick={() => setDetailTab('plans')} className="text-xs text-violet-400 hover:underline flex items-center gap-1">
                          Gestisci <ChevronRight size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {plans.slice(0, 4).map(plan => {
                          const light = getTrafficLight(plan, planLastLogs[plan.id])
                          return (
                            <div key={plan.id} className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl">
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 6px ${light.color}40` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-themed truncate">{plan.name}</p>
                                <p className="text-[10px] text-faint">Ogni {plan.frequency_days}g</p>
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0"
                                style={{ background: light.color + '18', color: light.color }}>
                                {light.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ PLANS TAB ═══ */}
              {detailTab === 'plans' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{plans.length} piani</p>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-xl text-sm font-medium cursor-pointer transition-all">
                        <Upload size={14} /> CSV
                        <input type="file" accept=".csv,.txt" className="hidden" onChange={onHandleCSVFile} />
                      </label>
                      <button onClick={() => onOpenPlanForm()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Nuovo Piano</button>
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
                                <button onClick={() => onOpenLogForm(plan.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-faint hover:text-emerald-400" title="Registra intervento"><Play size={14} /></button>
                                <button onClick={() => onOpenPlanForm(plan)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                                <button onClick={() => onDeletePlan(plan.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
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

              {/* ═══ LOGS TAB ═══ */}
              {detailTab === 'logs' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{logs.length} interventi</p>
                    <button onClick={() => onOpenLogForm()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all"><Plus size={14} /> Registra</button>
                  </div>
                  {logs.length === 0 ? (
                    <div className="text-center py-16"><Wrench size={48} className="mx-auto text-faint opacity-15 mb-3" /><p className="text-sm text-faint">Nessun intervento</p></div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map(log => (
                        <div key={log.id} className="flex items-start gap-3 p-4 bg-surface-2 rounded-xl">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}>
                            {log.type === 'programmata' ? <Shield size={14} className="text-violet-400" /> : <Wrench size={14} className="text-amber-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-white">{log.title}</p>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${log.type === 'programmata' ? 'bg-violet-500/15 text-violet-400' : 'bg-amber-500/15 text-amber-400'}`}>
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

              {/* ═══ COMPONENTS TAB ═══ */}
              {detailTab === 'components' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-muted">{components.length} componenti</p>
                    <button onClick={() => onOpenComponentForm?.()} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all">
                      <Plus size={14} /> Nuovo Componente
                    </button>
                  </div>

                  {components.length === 0 ? (
                    <div className="text-center py-16">
                      <Package size={48} className="mx-auto text-faint opacity-15 mb-3" />
                      <p className="text-sm text-faint">Nessun componente registrato</p>
                      <p className="text-xs text-faint mt-1">Aggiungi sotto-macchine e componenti per tracciare guasti specifici</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {components.map(comp => (
                        <div key={comp.id} className="bg-surface-2 rounded-xl p-4 group hover:bg-surface-3 transition-all">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                              <Package size={18} className="text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-themed truncate">{comp.name}</p>
                              {comp.type && (
                                <span className="text-[10px] font-medium text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded inline-block mt-0.5">{comp.type}</span>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-faint flex-wrap">
                                {comp.manufacturer && <span className="flex items-center gap-1"><Factory size={10} /> {comp.manufacturer}</span>}
                                {comp.model && <span className="flex items-center gap-1"><Cog size={10} /> {comp.model}</span>}
                                {comp.serial_number && <span className="flex items-center gap-1"><Hash size={10} /> {comp.serial_number}</span>}
                                {comp.year && <span className="flex items-center gap-1"><Calendar size={10} /> {comp.year}</span>}
                              </div>
                              {comp.notes && <p className="text-[11px] text-faint mt-1.5 line-clamp-2">{comp.notes}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => onOpenComponentForm?.(comp)} className="p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-white"><Edit size={13} /></button>
                              <button onClick={() => { if (confirm(`Eliminare "${comp.name}"?`)) onDeleteComponent?.(comp.id) }}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-faint hover:text-red-400"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ DOCUMENTATION TAB ═══ */}
              {detailTab === 'docs' && (
                <MachineDocumentationTab
                  sel={sel}
                  onUpload={onUploadToMachine}
                  onRemoveAttachment={onRemoveAttachment}
                  onSaveField={onSaveField}
                />
              )}

              {/* ═══ REPORTS TAB ═══ */}
              {detailTab === 'reports' && (
                <div className="space-y-4 animate-fade-in">
                  {/* Filter bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { key: 'all', label: 'Tutte', count: machineReports.length, color: 'text-themed' },
                      { key: 'aperta', label: 'Aperte', count: machineReports.filter(r => r.status === 'aperta').length, color: 'text-amber-400' },
                      { key: 'assegnata', label: 'Assegnate', count: machineReports.filter(r => r.status === 'assegnata').length, color: 'text-violet-400' },
                      { key: 'in_lavorazione', label: 'In Lavorazione', count: machineReports.filter(r => r.status === 'in_lavorazione').length, color: 'text-purple-400' },
                      { key: 'risolta', label: 'Risolte', count: machineReports.filter(r => r.status === 'risolta').length, color: 'text-emerald-400' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setReportFilter(f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${reportFilter === f.key ? 'bg-surface-3 ' + f.color + ' ring-1 ring-current/20' : 'bg-surface-2 text-faint hover:text-secondary'}`}>
                        {f.label}
                        {f.count > 0 && <span className="text-[10px] font-bold opacity-70">{f.count}</span>}
                      </button>
                    ))}
                  </div>

                  {/* Reports list */}
                  {filteredReports.length === 0 ? (
                    <div className="text-center py-16">
                      <ClipboardList size={48} className="mx-auto text-faint opacity-15 mb-3" />
                      <p className="text-sm text-faint">
                        {machineReports.length === 0 ? 'Nessuna segnalazione' : 'Nessuna segnalazione con questo filtro'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredReports.map(r => {
                        const s = STATUS[r.status] || STATUS.aperta
                        const sv = SEVERITY[r.severity] || SEVERITY.media
                        const isCritical = r.severity === 'critica'
                        const isActive = r.status !== 'risolta'
                        return (
                          <div key={r.id} onClick={() => onOpenReport?.(r)}
                            className={`flex items-center gap-3 p-3.5 bg-surface-2 rounded-xl transition-all cursor-pointer hover:bg-surface-3 group ${isCritical && isActive ? 'ring-1 ring-red-500/30 hover:ring-red-500/50' : ''}`}>
                            {/* Severity bar */}
                            <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: sv.color }} />
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm text-themed font-medium truncate">{r.title}</p>
                              </div>
                              {r.description && (
                                <p className="text-[11px] text-faint line-clamp-2 leading-relaxed">{r.description}</p>
                              )}
                              <p className="text-[10px] text-faint mt-1">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                            </div>
                            {/* Badges + Arrow */}
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge {...s} />
                              <Badge {...sv} />
                              <ChevronRight size={14} className="text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
