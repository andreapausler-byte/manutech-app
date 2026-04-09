/**
 * MobileMachineDetail v3.0 — Punto di controllo operativo
 *
 * Layout: Fixed header (nome + dati tecnici + stato) → Scrollable content → Fixed FAB
 * Design: compatto, spazi ottimizzati, severity accent bars, bordi uniformi
 */

import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, timeAgo } from '../../lib/constants'
import { Badge } from '../ui'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import {
  ArrowLeft, Cog, Factory, Hash, Calendar, Building,
  FileText, Video, Shield, Wrench, ClipboardList,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, X, Send, Clock, Zap, Activity, Trash2
} from 'lucide-react'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', urgent: true }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', urgent: true }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', urgent: false }
}

export default function MobileMachineDetail({ machine, onBack, onViewReport, onQuickReport, onNewReport, onDelete }) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [plans, setPlans] = useState([])
  const [logs, setLogs] = useState([])
  const [reports, setReports] = useState([])
  const [planLastLogs, setPlanLastLogs] = useState({})
  const [loading, setLoading] = useState(true)

  const [showDocs, setShowDocs] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const [confirmPlan, setConfirmPlan] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmDuration, setConfirmDuration] = useState('')
  const [confirming, setConfirming] = useState(false)

  const [resolveReport, setResolveReport] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveDuration, setResolveDuration] = useState('')
  const [resolveParts, setResolveParts] = useState('')
  const [resolving, setResolving] = useState(false)

  const [assessment, setAssessment] = useState(null)

  useEffect(() => { loadData() }, [machine.id])

  useEffect(() => {
    db.fetchMachineAssessments(machine.org_id || user?.org_id || 'default', machine.id)
      .then(result => {
        const a = result?.assessments?.find(a => a.machine_id === machine.id)
        setAssessment(a || null)
      })
      .catch(() => {})
  }, [machine.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, l, r] = await Promise.all([
        db.getMaintenancePlans(machine.id),
        db.getMaintenanceLogs(machine.id),
        db.getReports(),
      ])
      setPlans(p)
      setLogs(l)
      setReports(r.filter(rep => rep.machine === machine.name))
      const ll = {}
      for (const plan of p) { ll[plan.id] = await db.getLastLogForPlan(plan.id) }
      setPlanLastLogs(ll)
    } catch {}
    setLoading(false)
  }

  const toggle = (setter) => { haptic.light(); setter(prev => !prev) }

  const handleConfirmMaintenance = async () => {
    if (!confirmPlan) return
    setConfirming(true)
    try {
      await db.createMaintenanceLog({
        machine_id: machine.id, plan_id: confirmPlan.id, type: 'programmata',
        title: confirmPlan.name, description: confirmNote.trim() || null,
        performed_by: user?.id, performed_by_name: user?.name,
        duration_minutes: confirmDuration ? parseInt(confirmDuration) : null,
        performed_at: new Date().toISOString(), org_id: user?.org_id || 'default',
      })
      haptic.success()
      toast.success('Manutenzione registrata!')
      db.addNotification({
        type: 'maintenance_completed', title: `Manutenzione registrata`,
        body: `${user?.name} ha completato "${confirmPlan.name}" su ${machine.name}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      setConfirmPlan(null); setConfirmNote(''); setConfirmDuration('')
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setConfirming(false)
  }

  const handleResolveAndLog = async () => {
    if (!resolveReport) return
    setResolving(true)
    try {
      await db.updateReport(resolveReport.id, { status: 'risolta' })
      db.addActivity(resolveReport.id, {
        type: 'status_change', from_status: resolveReport.status, to_status: 'risolta',
        user_id: user?.id, user_name: user?.name,
      }).catch(e => console.warn('Side effect failed:', e.message))
      await db.createMaintenanceLog({
        machine_id: machine.id, report_id: resolveReport.id, type: 'straordinaria',
        title: `Risolto: ${resolveReport.title}`, description: resolveNote.trim() || null,
        performed_by: user?.id, performed_by_name: user?.name,
        duration_minutes: resolveDuration ? parseInt(resolveDuration) : null,
        parts_replaced: resolveParts.trim() || null,
        performed_at: new Date().toISOString(), org_id: user?.org_id || 'default',
      })
      haptic.success()
      toast.success('Segnalazione risolta e intervento registrato!')
      db.addNotification({
        type: 'status_change', title: `Segnalazione risolta: ${resolveReport.title}`,
        body: `${user?.name} ha risolto e registrato l'intervento su ${machine.name}`,
        report_id: resolveReport.id, from_user: user?.id,
        target_user: resolveReport.created_by !== user?.id ? resolveReport.created_by : null,
      }).catch(e => console.warn('Side effect failed:', e.message))
      setResolveReport(null); setResolveNote(''); setResolveDuration(''); setResolveParts('')
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setResolving(false)
  }

  const activeReports = reports.filter(r => r.status !== 'risolta')
  const resolvedReports = reports.filter(r => r.status === 'risolta')
  const urgentPlans = plans.filter(p => getTrafficLight(p, planLastLogs[p.id]).urgent)
  const okPlans = plans.filter(p => !getTrafficLight(p, planLastLogs[p.id]).urgent)

  // Stile bordo uniforme
  const cardStyle = { background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }

  return (
    <div className="h-screen h-[100dvh] bg-base flex flex-col overflow-hidden">

      {/* ═══ FIXED TOP ═══ */}
      <div className="shrink-0" style={{ background: 'var(--color-bg)' }}>
        {/* Header */}
        <header className="flex items-center gap-3 px-4 pt-2 pb-1.5">
          <button onClick={onBack} className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-2 active:bg-white/10 text-muted press-scale">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-themed truncate leading-tight">{machine.name}</h1>
            {machine.department && <p className="text-[11px] text-faint">{machine.department}</p>}
          </div>
          {assessment && (() => {
            const colors = { ottimo: '#22c55e', buono: '#7c6aff', attenzione: '#f59e0b', critico: '#ef4444' }
            const c = colors[assessment.status] || '#6b7280'
            return (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg shrink-0" style={{ background: c + '12' }}>
                <div className="relative w-6 h-6">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-surface-3" strokeWidth="4" />
                    <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="4" strokeDasharray={`${assessment.health_score} ${100 - assessment.health_score}`} strokeLinecap="round" style={{ stroke: c }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-themed">{assessment.health_score}</span>
                </div>
              </div>
            )
          })()}
          {onDelete && (
            <button onClick={onDelete} className="w-11 h-11 rounded-xl bg-red-500/8 flex items-center justify-center press-scale">
              <Trash2 size={17} style={{ color: '#ef4444' }} />
            </button>
          )}
        </header>

        {/* Machine identity card */}
        <div className="px-4 pb-2.5">
          <div className="rounded-xl overflow-hidden" style={cardStyle}>
            {/* Tech specs */}
            {(machine.manufacturer || machine.model || machine.serial_number || machine.year) && (
              <div className="px-3.5 py-2.5 flex items-center gap-2 flex-wrap">
                {[
                  { icon: Factory, value: machine.manufacturer, color: '#7c6aff' },
                  { icon: Cog, value: machine.model, color: '#8b5cf6' },
                  { icon: Hash, value: machine.serial_number, color: '#06b6d4' },
                  { icon: Calendar, value: machine.year, color: '#f59e0b' },
                ].filter(f => f.value).map((spec, i, arr) => (
                  <div key={i} className="flex items-center gap-1">
                    <spec.icon size={11} style={{ color: spec.color }} />
                    <span className="text-xs font-bold text-themed">{spec.value}</span>
                    {i < arr.length - 1 && <span className="text-faint/30 text-[10px]">|</span>}
                  </div>
                ))}
              </div>
            )}
            {/* Status bar */}
            <div className="flex border-t border-token">
              {urgentPlans.length > 0 && (
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2 border-r border-token" style={{ background: '#ef444406' }}>
                  <AlertTriangle size={12} className="text-red-400" />
                  <span className="text-[11px] font-bold text-red-400">{urgentPlans.length} scadute</span>
                </div>
              )}
              <div className="flex-1 flex items-center justify-center gap-1.5 py-2"
                style={{ background: activeReports.length > 0 ? '#f59e0b06' : '#22c55e06' }}>
                {activeReports.length > 0 ? (
                  <>
                    <ClipboardList size={12} className="text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-400">{activeReports.length} segnalaz.</span>
                    <div className="flex gap-0.5 ml-0.5">
                      {['critica', 'alta', 'media', 'bassa'].map(sev => {
                        const count = activeReports.filter(r => r.severity === sev).length
                        if (!count) return null
                        const sv = SEVERITY[sev]
                        return <span key={sev} className="text-[8px] font-bold px-1 rounded" style={{ background: sv.color + '20', color: sv.color }}>{count}</span>
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle size={12} className="text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-400">Tutto ok</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pt-2 pb-28 space-y-3">

        {machine.photo_url && (
          <div className="rounded-xl overflow-hidden border border-token aspect-[16/9]">
            <img src={machine.photo_url} alt={machine.name} className="w-full h-full object-cover" />
          </div>
        )}

        {machine.description && (
          <p className="text-[13px] text-secondary leading-relaxed rounded-xl px-3.5 py-3" style={cardStyle}>{machine.description}</p>
        )}

        {/* ═══ URGENT MAINTENANCE ═══ */}
        {urgentPlans.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1 px-0.5">
              <AlertTriangle size={11} /> Manutenzioni da fare
            </p>
            {urgentPlans.map(plan => {
              const light = getTrafficLight(plan, planLastLogs[plan.id])
              return (
                <div key={plan.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #ef444420' }}>
                  <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ background: '#ef444406' }}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 8px ${light.color}50` }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-themed truncate">{plan.name}</p>
                      <p className="text-[10px] text-faint">Ogni {plan.frequency_days}g · <span style={{ color: light.color }}>{light.label}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => { haptic.medium(); setConfirmPlan(plan) }}
                    className="w-full py-3.5 text-[14px] font-bold text-white flex items-center justify-center gap-2 press-scale active:scale-[0.98] transition-all"
                    style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}
                  >
                    <CheckCircle size={18} /> Fatto — Registra
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ ACTIVE REPORTS ═══ */}
        {activeReports.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-1 px-0.5">
              <ClipboardList size={11} /> Segnalazioni attive
            </p>
            {activeReports.map(r => {
              const sev = SEVERITY[r.severity] || SEVERITY.media
              return (
                <div key={r.id} className="rounded-xl flex items-stretch overflow-hidden" style={cardStyle}>
                  <div className="w-[3px] shrink-0" style={{ background: sev.color }} />
                  <button
                    onClick={() => onViewReport?.(r)}
                    className="flex-1 flex items-center gap-2.5 px-3 py-2.5 min-w-0 active:bg-white/[0.02] press-scale"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-themed truncate text-left">{r.title}</p>
                      <p className="text-[10px] text-faint mt-0.5 text-left">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: sev.color + '15', color: sev.color }}>{sev.label}</span>
                  </button>
                  <button
                    onClick={() => { haptic.medium(); setResolveReport(r) }}
                    className="w-12 flex items-center justify-center border-l border-token text-emerald-400 active:bg-emerald-500/10 press-scale shrink-0"
                  >
                    <Wrench size={18} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ OK PLANS ═══ */}
        {okPlans.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-1 px-0.5">
              <Shield size={11} /> Manutenzioni in regola ({okPlans.length})
            </p>
            {okPlans.map(plan => {
              const light = getTrafficLight(plan, planLastLogs[plan.id])
              return (
                <div key={plan.id} className="rounded-xl px-3.5 py-2.5" style={cardStyle}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: light.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-themed truncate">{plan.name}</p>
                      <p className="text-[10px] text-faint mt-0.5">Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0" style={{ background: light.color + '12', color: light.color }}>
                      {light.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ DOCUMENTS ═══ */}
        {machine.attachments?.length > 0 && (
          <div>
            <button onClick={() => toggle(setShowDocs)} className="w-full flex items-center justify-between py-2 px-0.5 press-scale">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-1">
                <FileText size={11} /> Documenti ({machine.attachments.length})
              </p>
              {showDocs ? <ChevronUp size={18} className="text-faint" /> : <ChevronDown size={18} className="text-faint" />}
            </button>
            {showDocs && (
              <div className="space-y-2 animate-fade-in">
                {machine.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener"
                    className="flex items-center gap-3 rounded-xl px-3.5 py-3 active:bg-white/[0.02] press-scale" style={cardStyle}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${a.type === 'pdf' ? 'bg-red-500/12' : a.type === 'image' ? 'bg-violet-500/12' : 'bg-emerald-500/12'}`}>
                      {a.type === 'pdf' ? <FileText size={18} className="text-red-400" /> : <Video size={18} className="text-emerald-400" />}
                    </div>
                    <span className="text-[13px] font-medium text-themed flex-1 truncate">{a.name}</span>
                    <ExternalLink size={14} className="text-faint shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ LOGS ═══ */}
        <div>
          <button onClick={() => toggle(setShowLogs)} className="w-full flex items-center justify-between py-2 px-0.5 press-scale">
            <p className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-1">
              <Wrench size={11} /> Ultimi Interventi ({logs.length})
            </p>
            {showLogs ? <ChevronUp size={18} className="text-faint" /> : <ChevronDown size={18} className="text-faint" />}
          </button>
          {showLogs && (
            <div className="space-y-2 animate-fade-in">
              {logs.length === 0 ? (
                <p className="text-[13px] text-faint text-center py-5">Nessun intervento registrato</p>
              ) : logs.slice(0, 8).map(log => (
                <div key={log.id} className="rounded-xl px-3.5 py-3" style={cardStyle}>
                  <div className="flex items-start gap-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-violet-500/12' : 'bg-amber-500/12'}`}>
                      {log.type === 'programmata' ? <Shield size={16} className="text-violet-400" /> : <AlertTriangle size={16} className="text-amber-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-themed">{log.title}</p>
                      {log.description && <p className="text-[11px] text-muted mt-0.5">{log.description}</p>}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-faint flex-wrap">
                        <span>{log.performed_by_name}</span>
                        <span>{timeAgo(log.performed_at)}</span>
                        {log.duration_minutes && <span>{log.duration_minutes}min</span>}
                        {log.parts_replaced && <span>{log.parts_replaced}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ RESOLVED ═══ */}
        {resolvedReports.length > 0 && (
          <div>
            <button onClick={() => toggle(setShowResolved)} className="w-full flex items-center justify-between py-2 px-0.5 press-scale">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest flex items-center gap-1">
                <CheckCircle size={11} /> Risolte ({resolvedReports.length})
              </p>
              {showResolved ? <ChevronUp size={18} className="text-faint" /> : <ChevronDown size={18} className="text-faint" />}
            </button>
            {showResolved && (
              <div className="space-y-2 animate-fade-in">
                {resolvedReports.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={cardStyle}>
                    <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-secondary truncate">{r.title}</p>
                      <p className="text-[10px] text-faint">{timeAgo(r.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ═══ FAB ═══ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom px-4 pb-3.5 pt-2.5"
        style={{ background: 'linear-gradient(to top, var(--color-bg) 70%, transparent)' }}>
        <div className="flex gap-3">
          <button
            onClick={() => { haptic.medium(); if (onQuickReport) onQuickReport(machine.name) }}
            className="flex-1 py-3.5 rounded-xl text-[15px] font-bold text-white flex items-center justify-center gap-2 press-scale active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 4px 16px rgba(245,158,11,0.25)' }}
          >
            <Zap size={20} strokeWidth={2.5} /> Rapido
          </button>
          <button
            onClick={() => { haptic.medium(); if (onNewReport) onNewReport(machine.name) }}
            className="flex-1 py-3.5 rounded-xl text-[15px] font-bold text-white flex items-center justify-center gap-2 press-scale active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 16px rgba(239,68,68,0.25)' }}
          >
            <AlertTriangle size={20} strokeWidth={2.5} /> Segnala
          </button>
        </div>
      </div>

      {/* ═══ MODAL — Conferma Manutenzione ═══ */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setConfirmPlan(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            style={{ maxHeight: '75vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />
            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-themed">Conferma Manutenzione</h3>
                <p className="text-sm text-faint">{confirmPlan.name}</p>
              </div>
            </div>
            <div className="space-y-[3vw] mb-[4vw]">
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Note (opzionale)</label>
                <textarea value={confirmNote} onChange={e => setConfirmNote(e.target.value)}
                  placeholder="Es. Tutto regolare" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (minuti)</label>
                <input type="number" value={confirmDuration} onChange={e => setConfirmDuration(e.target.value)}
                  placeholder="30" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
              </div>
            </div>
            <div className="flex gap-[3vw]">
              <button onClick={handleConfirmMaintenance} disabled={confirming}
                className="flex-1 py-[4vw] rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: '#22c55e', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {confirming ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={20} /> Conferma</>}
              </button>
              <button onClick={() => setConfirmPlan(null)}
                className="w-[25vw] py-[4vw] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">Annulla</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Risolvi + Registra ═══ */}
      {resolveReport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setResolveReport(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            style={{ maxHeight: '75vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />
            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center">
                <Wrench size={24} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-themed">Risolvi e Registra</h3>
                <p className="text-sm text-faint truncate">{resolveReport.title}</p>
              </div>
            </div>
            <div className="space-y-[3vw] mb-[4vw]">
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Cosa hai fatto?</label>
                <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                  placeholder="Es. Sostituita guarnizione" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-[3vw]">
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (min)</label>
                  <input type="number" value={resolveDuration} onChange={e => setResolveDuration(e.target.value)}
                    placeholder="60" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Ricambi</label>
                  <input type="text" value={resolveParts} onChange={e => setResolveParts(e.target.value)}
                    placeholder="Filtro XF-420" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
              </div>
            </div>
            <p className="text-xs text-faint text-center mb-[3vw]">La segnalazione verrà chiusa e l'intervento registrato</p>
            <div className="flex gap-[3vw]">
              <button onClick={handleResolveAndLog} disabled={resolving}
                className="flex-1 py-[4vw] rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {resolving ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Wrench size={20} /> Risolvi e Registra</>}
              </button>
              <button onClick={() => setResolveReport(null)}
                className="w-[25vw] py-[4vw] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
