import { useState, useEffect, useMemo } from 'react'
import { useDraggable } from '../../../hooks/useDraggable'
import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { db } from '../../../lib/supabase'
import { Badge } from '../../../components/ui'
import {
  Edit, Trash2, FileText, Video, Cog, X, QrCode, Download, Camera,
  Calendar, Hash, Factory, Building, ClipboardList, ChevronRight,
  Wrench, Shield, Plus, Play, Upload, Activity, LayoutDashboard,
  AlertTriangle, Clock, Filter
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
  detailTab, setDetailTab,
  onClose, onEdit, onDownloadQR, onOpenReport,
  onOpenPlanForm, onDeletePlan, onOpenLogForm,
  onHandleCSVFile,
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

  const lastLog = useMemo(() => logs.length > 0 ? logs[0] : null, [logs])

  const healthColor = assessment ? (healthColors[assessment.status]?.bg || '#6b7280') : '#6b7280'
  const { position, dragProps } = useDraggable()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden"
        style={{ height: '85vh', transform: `translate(${position.x}px, ${position.y}px)` }} onClick={e => e.stopPropagation()}>

        {/* ═══ HEADER — drag handle ═══ */}
        <div {...dragProps} className="flex items-center justify-between px-6 py-3.5 border-b border-token bg-surface-0/50"
          style={{ ...dragProps.style }}>
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
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-all">
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(85vh - 57px)' }}>

          {/* ═══ SIDEBAR LEFT ═══ */}
          <div className="col-span-3 border-r border-token overflow-y-auto p-4 space-y-3">

            {/* Photo */}
            {sel.photo_url ? (
              <div className="rounded-xl overflow-hidden border border-token aspect-video">
                <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <button onClick={() => onEdit(sel)} className="rounded-xl border border-dashed border-token/50 bg-surface-2/30 aspect-video flex flex-col items-center justify-center text-faint hover:border-violet-500/30 hover:text-violet-400 transition-all cursor-pointer">
                <Camera size={24} className="mb-1 opacity-40" />
                <span className="text-xs">Aggiungi foto</span>
              </button>
            )}

            {/* Health Score - Prominent */}
            <div className="bg-surface-2 rounded-xl p-4">
              <p className="text-[10px] text-faint uppercase tracking-wider mb-3 flex items-center gap-1.5 font-semibold">
                <Activity size={11} /> Stato Salute
              </p>
              {assessmentLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-6 h-6 border-2 border-violet-400/30 border-t-blue-400 rounded-full animate-spin" />
                </div>
              ) : assessment ? (
                <div className="flex flex-col items-center">
                  <div className="relative w-20 h-20 mb-2">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                        strokeDasharray={`${assessment.health_score} ${100 - assessment.health_score}`}
                        strokeLinecap="round" style={{ stroke: healthColor, filter: `drop-shadow(0 0 4px ${healthColor}40)` }} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-themed">
                      {assessment.health_score}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg capitalize"
                    style={{ background: healthColor + '18', color: healthColor }}>
                    {healthLabels[assessment.status] || assessment.status}
                  </span>
                  {assessment.factors?.length > 0 && (
                    <div className="mt-2 w-full space-y-0.5">
                      {assessment.factors.slice(0, 3).map((f, i) => (
                        <p key={i} className="text-[10px] text-faint text-center truncate">{f}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-faint text-center py-3">Non disponibile</p>
              )}
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDetailTab('reports')} className="bg-surface-2 rounded-xl p-3 text-center hover:bg-surface-3 transition-all cursor-pointer group">
                <p className={`text-xl font-bold ${activeReports.length > 0 ? (criticalReports.length > 0 ? 'text-red-400' : 'text-amber-400') : 'text-emerald-400'}`}>
                  {activeReports.length}
                </p>
                <p className="text-[9px] text-faint uppercase tracking-wider group-hover:text-secondary transition-colors">Segnalazioni</p>
              </button>
              <button onClick={() => setDetailTab('plans')} className="bg-surface-2 rounded-xl p-3 text-center hover:bg-surface-3 transition-all cursor-pointer group">
                <p className="text-xl font-bold text-violet-400">{plans.length}</p>
                <p className="text-[9px] text-faint uppercase tracking-wider group-hover:text-secondary transition-colors">Piani</p>
              </button>
              <div className="bg-surface-2 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-themed truncate">
                  {lastLog ? timeAgo(lastLog.performed_at) : '—'}
                </p>
                <p className="text-[9px] text-faint uppercase tracking-wider">Ultimo Interv.</p>
              </div>
              <div className="bg-surface-2 rounded-xl p-3 text-center">
                {nextMaintenance ? (
                  <>
                    <p className="text-sm font-bold truncate" style={{ color: nextMaintenance.color }}>
                      {nextMaintenance.label}
                    </p>
                    <p className="text-[9px] text-faint uppercase tracking-wider truncate">Prossima Scad.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-faint">—</p>
                    <p className="text-[9px] text-faint uppercase tracking-wider">Prossima Scad.</p>
                  </>
                )}
              </div>
            </div>

            {/* Tech Specs */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold px-1">Scheda Tecnica</p>
              {[
                { icon: Factory, label: 'Costruttore', value: sel.manufacturer },
                { icon: Cog, label: 'Modello', value: sel.model },
                { icon: Hash, label: 'Matricola', value: sel.serial_number },
                { icon: Calendar, label: 'Anno', value: sel.year },
                { icon: Building, label: 'Reparto', value: sel.department },
              ].filter(f => f.value).map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2.5 p-2 bg-surface-2 rounded-lg">
                  <Icon size={13} className="text-faint shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-faint uppercase tracking-wider">{label}</p>
                    <p className="text-xs text-themed font-medium truncate">{value}</p>
                  </div>
                </div>
              ))}
              {![sel.manufacturer, sel.model, sel.serial_number, sel.year].some(Boolean) && (
                <p className="text-xs text-faint text-center py-2">Nessun dato tecnico. <button onClick={() => onEdit(sel)} className="text-violet-400 underline">Compila scheda</button></p>
              )}
            </div>

            {sel.description && (
              <div>
                <p className="text-[10px] text-faint uppercase tracking-wider mb-1 font-semibold">Descrizione</p>
                <p className="text-xs text-secondary leading-relaxed">{sel.description}</p>
              </div>
            )}

            {/* Documents */}
            {sel.attachments?.length > 0 && (
              <div>
                <p className="text-[10px] text-faint uppercase tracking-wider mb-1.5 font-semibold">Documenti ({sel.attachments.length})</p>
                {sel.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener" className="flex items-center gap-2 p-2 bg-surface-2 rounded-lg text-xs hover:bg-surface-3 transition-colors mb-1">
                    {a.type === 'pdf' ? <FileText size={13} className="text-red-400" /> : <Video size={13} className="text-emerald-400" />}
                    <span className="text-secondary flex-1 truncate">{a.name}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* ═══ RIGHT: TABS ═══ */}
          <div className="col-span-9 flex flex-col overflow-hidden">

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
              <button onClick={() => setDetailTab('reports')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'reports' ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5' : 'text-faint hover:text-secondary'}`}>
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
                  {/* Top row: Health + Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* Health Score Card */}
                    <div className="bg-surface-2 rounded-xl p-5 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-faint uppercase tracking-wider mb-3 font-semibold">Stato Salute</p>
                      {assessmentLoading ? (
                        <div className="w-6 h-6 border-2 border-violet-400/30 border-t-blue-400 rounded-full animate-spin" />
                      ) : assessment ? (
                        <>
                          <div className="relative w-24 h-24 mb-2">
                            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="2" />
                              <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="2.5"
                                strokeDasharray={`${assessment.health_score} ${100 - assessment.health_score}`}
                                strokeLinecap="round" style={{ stroke: healthColor, filter: `drop-shadow(0 0 6px ${healthColor}50)` }} />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-themed">{assessment.health_score}</span>
                          </div>
                          <span className="text-sm font-bold px-3 py-1 rounded-lg capitalize"
                            style={{ background: healthColor + '18', color: healthColor }}>
                            {healthLabels[assessment.status] || assessment.status}
                          </span>
                        </>
                      ) : (
                        <p className="text-sm text-faint">Non disponibile</p>
                      )}
                    </div>

                    {/* Active Reports Summary */}
                    <div className="bg-surface-2 rounded-xl p-5">
                      <p className="text-[10px] text-faint uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
                        <AlertTriangle size={11} /> Segnalazioni Attive
                      </p>
                      {activeReports.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4">
                          <p className="text-2xl font-bold text-emerald-400">0</p>
                          <p className="text-xs text-faint mt-1">Nessun problema</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Severity breakdown */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {['critica', 'alta', 'media', 'bassa'].map(sev => {
                              const count = activeReports.filter(r => r.severity === sev).length
                              if (count === 0) return null
                              const sv = SEVERITY[sev]
                              return (
                                <span key={sev} className="text-xs font-bold px-2 py-0.5 rounded-lg"
                                  style={{ background: sv.bg, color: sv.color }}>
                                  {count} {sv.label}
                                </span>
                              )
                            })}
                          </div>
                          <p className="text-2xl font-bold text-amber-400">{activeReports.length}</p>
                          <p className="text-xs text-faint">segnalazioni da gestire</p>
                        </div>
                      )}
                    </div>

                    {/* Maintenance Status */}
                    <div className="bg-surface-2 rounded-xl p-5">
                      <p className="text-[10px] text-faint uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
                        <Shield size={11} /> Manutenzione
                      </p>
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] text-faint">Piani attivi</p>
                          <p className="text-xl font-bold text-violet-400">{plans.length}</p>
                        </div>
                        {nextMaintenance && (
                          <div>
                            <p className="text-[10px] text-faint">Prossima scadenza</p>
                            <p className="text-sm font-bold" style={{ color: nextMaintenance.color }}>{nextMaintenance.label}</p>
                            <p className="text-[10px] text-faint truncate">{nextMaintenance.name}</p>
                          </div>
                        )}
                        {lastLog && (
                          <div>
                            <p className="text-[10px] text-faint">Ultimo intervento</p>
                            <p className="text-sm font-medium text-themed truncate">{lastLog.title}</p>
                            <p className="text-[10px] text-faint">{timeAgo(lastLog.performed_at)}</p>
                          </div>
                        )}
                      </div>
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
                              className={`flex items-center gap-3 p-3 bg-surface-2 rounded-xl cursor-pointer hover:bg-surface-3 transition-all group ${isCritical ? 'ring-1 ring-red-500/30' : ''}`}>
                              <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: sv.color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-themed font-medium truncate">{r.title}</p>
                                {r.description && <p className="text-[11px] text-faint mt-0.5 line-clamp-1">{r.description}</p>}
                                <p className="text-[10px] text-faint mt-0.5">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge {...s} />
                                <Badge {...sv} />
                                <ChevronRight size={14} className="text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
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
