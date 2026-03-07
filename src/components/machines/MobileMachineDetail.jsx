/**
 * MobileMachineDetail v2.0 — Punto di controllo operativo
 * 
 * L'operatore arriva, scansiona il QR, e da qui fa TUTTO:
 *  ✅ Consulta dati tecnici e documenti
 *  ✅ Segnala un problema (Quick Report pre-compilato)
 *  ✅ Conferma manutenzione programmata ("Fatto ✓")
 *  ✅ Chiude segnalazione + registra intervento straordinario
 *
 * Design: bottoni enormi, colori chiari, zero ambiguità
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
  CheckCircle, X, Send, Clock, Zap
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

export default function MobileMachineDetail({ machine, onBack, onViewReport, onQuickReport, onNewReport }) {
  const { user } = useAuth()
  const toast = useToast()
  const haptic = useHaptic()

  const [plans, setPlans] = useState([])
  const [logs, setLogs] = useState([])
  const [reports, setReports] = useState([])
  const [planLastLogs, setPlanLastLogs] = useState({})
  const [loading, setLoading] = useState(true)

  // Sections
  const [showDocs, setShowDocs] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  // Confirm maintenance modal
  const [confirmPlan, setConfirmPlan] = useState(null)
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmDuration, setConfirmDuration] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Resolve + register modal
  const [resolveReport, setResolveReport] = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveDuration, setResolveDuration] = useState('')
  const [resolveParts, setResolveParts] = useState('')
  const [resolving, setResolving] = useState(false)

  useEffect(() => { loadData() }, [machine.id])

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

  // ── Conferma manutenzione programmata ──
  const handleConfirmMaintenance = async () => {
    if (!confirmPlan) return
    setConfirming(true)
    try {
      await db.createMaintenanceLog({
        machine_id: machine.id,
        plan_id: confirmPlan.id,
        type: 'programmata',
        title: confirmPlan.name,
        description: confirmNote.trim() || null,
        performed_by: user?.id,
        performed_by_name: user?.name,
        duration_minutes: confirmDuration ? parseInt(confirmDuration) : null,
        performed_at: new Date().toISOString(),
        org_id: user?.org_id || 'default',
      })
      haptic.success()
      toast.success('Manutenzione registrata!')

      // Notifica: manutenzione programmata completata
      db.addNotification({
        type: 'maintenance_completed',
        title: `✅ Manutenzione registrata`,
        body: `${user?.name} ha completato "${confirmPlan.name}" su ${machine.name}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(() => {})

      setConfirmPlan(null)
      setConfirmNote('')
      setConfirmDuration('')
      await loadData()
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
    setConfirming(false)
  }

  // ── Risolvi segnalazione + registra straordinaria ──
  const handleResolveAndLog = async () => {
    if (!resolveReport) return
    setResolving(true)
    try {
      // 1. Chiudi segnalazione
      await db.updateReport(resolveReport.id, { status: 'risolta' })

      // 2. Log activity
      db.addActivity(resolveReport.id, {
        type: 'status_change', from_status: resolveReport.status, to_status: 'risolta',
        user_id: user?.id, user_name: user?.name,
      }).catch(() => {})

      // 3. Registra manutenzione straordinaria
      await db.createMaintenanceLog({
        machine_id: machine.id,
        report_id: resolveReport.id,
        type: 'straordinaria',
        title: `Risolto: ${resolveReport.title}`,
        description: resolveNote.trim() || null,
        performed_by: user?.id,
        performed_by_name: user?.name,
        duration_minutes: resolveDuration ? parseInt(resolveDuration) : null,
        parts_replaced: resolveParts.trim() || null,
        performed_at: new Date().toISOString(),
        org_id: user?.org_id || 'default',
      })

      haptic.success()
      toast.success('Segnalazione risolta e intervento registrato!')

      // Notifica: segnalazione risolta
      db.addNotification({
        type: 'status_change',
        title: `✅ Segnalazione risolta: ${resolveReport.title}`,
        body: `${user?.name} ha risolto e registrato l'intervento su ${machine.name}`,
        report_id: resolveReport.id, from_user: user?.id,
        target_user: resolveReport.created_by !== user?.id ? resolveReport.created_by : null,
      }).catch(() => {})

      setResolveReport(null)
      setResolveNote('')
      setResolveDuration('')
      setResolveParts('')
      await loadData()
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
    setResolving(false)
  }

  const activeReports = reports.filter(r => r.status !== 'risolta')
  const resolvedReports = reports.filter(r => r.status === 'risolta')

  // Separate plans by urgency
  const urgentPlans = plans.filter(p => getTrafficLight(p, planLastLogs[p.id]).urgent)
  const okPlans = plans.filter(p => !getTrafficLight(p, planLastLogs[p.id]).urgent)

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base pb-[22vw]">
      {/* ═══ Header ═══ */}
      <header className="header-page flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
        <button onClick={onBack} className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-themed truncate">{machine.name}</h1>
          {machine.department && <p className="text-sm text-faint">{machine.department}</p>}
        </div>
      </header>

      <div className="px-[4vw] py-[4vw] space-y-[5vw] animate-fade-in">

        {/* ═══ HERO — Photo + Quick Data ═══ */}
        {machine.photo_url && (
          <div className="rounded-2xl overflow-hidden border border-token aspect-video shadow-lg">
            <img src={machine.photo_url} alt={machine.name} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Technical data cards */}
        {(machine.manufacturer || machine.model || machine.serial_number || machine.year) && (
          <div className="grid grid-cols-2 gap-[2.5vw]">
            {[
              { icon: Factory, label: 'Costruttore', value: machine.manufacturer, color: '#3b82f6' },
              { icon: Cog, label: 'Modello', value: machine.model, color: '#8b5cf6' },
              { icon: Hash, label: 'Matricola', value: machine.serial_number, color: '#06b6d4' },
              { icon: Calendar, label: 'Anno', value: machine.year, color: '#f59e0b' },
            ].filter(f => f.value).map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card-elevated rounded-2xl p-[3.5vw]">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '15' }}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <span className="text-xs text-faint uppercase tracking-wider">{label}</span>
                </div>
                <p className="text-base font-bold text-themed pl-9">{value}</p>
              </div>
            ))}
          </div>
        )}

        {machine.description && (
          <p className="text-base text-secondary leading-relaxed card-elevated rounded-2xl p-[4vw]">{machine.description}</p>
        )}

        {/* ═══ ALERT BANNER — Manutenzioni scadute ═══ */}
        {urgentPlans.length > 0 && (
          <div className="bg-red-500/10 border-2 border-red-500/20 rounded-2xl p-[4vw]">
            <div className="flex items-center gap-3 mb-[3vw]">
              <div className="w-[10vw] h-[10vw] max-w-10 max-h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-base font-bold text-red-400">{urgentPlans.length} manutenzioni da fare</p>
                <p className="text-sm text-red-400/70">Completa gli interventi in scadenza</p>
              </div>
            </div>
            <div className="space-y-[2.5vw]">
              {urgentPlans.map(plan => {
                const light = getTrafficLight(plan, planLastLogs[plan.id])
                return (
                  <div key={plan.id} className="bg-black/20 rounded-2xl p-[3.5vw]">
                    <div className="flex items-center gap-[3vw] mb-[2.5vw]">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: light.color, boxShadow: `0 0 12px ${light.color}50` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-themed">{plan.name}</p>
                        <p className="text-sm text-faint">Ogni {plan.frequency_days}g · <span style={{ color: light.color }}>{light.label}</span></p>
                      </div>
                    </div>
                    {plan.instructions && <p className="text-sm text-muted mb-[2.5vw] leading-relaxed">{plan.instructions}</p>}
                    <button
                      onClick={() => { haptic.medium(); setConfirmPlan(plan) }}
                      className="w-full py-[3.5vw] rounded-2xl text-base font-bold text-themed flex items-center justify-center gap-2 press-scale active:scale-[0.97] transition-all"
                      style={{ background: '#22c55e', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}
                    >
                      <CheckCircle size={20} /> Fatto — Registra Intervento
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ ACTIVE REPORTS — con "Risolvi e Registra" ═══ */}
        {activeReports.length > 0 && (
          <div>
            <p className="text-sm text-muted font-bold uppercase tracking-wider mb-[2.5vw] flex items-center gap-1.5">
              <ClipboardList size={15} /> Segnalazioni Attive ({activeReports.length})
            </p>
            <div className="space-y-[2.5vw]">
              {activeReports.map(r => {
                const sts = STATUS[r.status] || STATUS.aperta
                const sev = SEVERITY[r.severity] || SEVERITY.media
                return (
                  <div key={r.id} className="card-elevated rounded-2xl overflow-hidden">
                    {/* Report info — tappabile per aprire il dettaglio */}
                    <button
                      onClick={() => onViewReport?.(r)}
                      className="w-full text-left flex items-center gap-[3.5vw] px-[4vw] py-[3.5vw] active:bg-white/[0.03] press-scale"
                    >
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: sts.color, boxShadow: `0 0 8px ${sts.color}40` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-themed truncate">{r.title}</p>
                        <p className="text-sm text-faint">{r.created_by_name} · {timeAgo(r.created_at)}</p>
                      </div>
                      <Badge {...sev} />
                    </button>
                    {/* Resolve action */}
                    <button
                      onClick={() => { haptic.medium(); setResolveReport(r) }}
                      className="w-full flex items-center justify-center gap-2 py-[3vw] border-t border-token text-emerald-400 font-bold text-base active:bg-emerald-500/10 press-scale transition-all"
                    >
                      <Wrench size={18} /> Risolvi e Registra Intervento
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ MAINTENANCE PLANS — quelli OK ═══ */}
        {okPlans.length > 0 && (
          <div>
            <p className="text-sm text-muted font-bold uppercase tracking-wider mb-[2.5vw] flex items-center gap-1.5">
              <Shield size={15} /> Manutenzioni in regola ({okPlans.length})
            </p>
            <div className="space-y-[2.5vw]">
              {okPlans.map(plan => {
                const light = getTrafficLight(plan, planLastLogs[plan.id])
                return (
                  <div key={plan.id} className="card-elevated rounded-2xl p-[4vw]">
                    <div className="flex items-center gap-[3vw]">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: light.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-themed">{plan.name}</p>
                        <p className="text-sm text-faint">Ogni {plan.frequency_days}g · {plan.assigned_to_name || 'Non assegnato'}</p>
                      </div>
                      <span className="text-sm font-bold px-3 py-1.5 rounded-xl shrink-0" style={{ background: light.color + '18', color: light.color }}>
                        {light.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ DOCUMENTS — collapsible ═══ */}
        {machine.attachments?.length > 0 && (
          <div>
            <button onClick={() => toggle(setShowDocs)} className="w-full flex items-center justify-between py-[2vw] press-scale">
              <p className="text-sm text-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={15} /> Documenti ({machine.attachments.length})
              </p>
              {showDocs ? <ChevronUp size={20} className="text-faint" /> : <ChevronDown size={20} className="text-faint" />}
            </button>
            {showDocs && (
              <div className="space-y-[2vw] animate-fade-in">
                {machine.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener"
                    className="flex items-center gap-[3.5vw] card-interactive rounded-2xl px-[4vw] py-[4vw] active:bg-surface-2 press-scale">
                    <div className={`w-[11vw] h-[11vw] max-w-11 max-h-11 rounded-xl flex items-center justify-center ${a.type === 'pdf' ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
                      {a.type === 'pdf' ? <FileText size={20} className="text-red-400" /> : <Video size={20} className="text-emerald-400" />}
                    </div>
                    <span className="text-base font-medium text-themed flex-1 truncate">{a.name}</span>
                    <ExternalLink size={18} className="text-faint shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ LOGS — collapsible ═══ */}
        <div>
          <button onClick={() => toggle(setShowLogs)} className="w-full flex items-center justify-between py-[2vw] press-scale">
            <p className="text-sm text-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Wrench size={15} /> Ultimi Interventi ({logs.length})
            </p>
            {showLogs ? <ChevronUp size={20} className="text-faint" /> : <ChevronDown size={20} className="text-faint" />}
          </button>
          {showLogs && (
            <div className="space-y-[2.5vw] animate-fade-in">
              {logs.length === 0 ? (
                <p className="text-sm text-faint text-center py-6">Nessun intervento registrato</p>
              ) : logs.slice(0, 8).map(log => (
                <div key={log.id} className="card-elevated rounded-2xl p-[4vw]">
                  <div className="flex items-start gap-[3vw]">
                    <div className={`w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center shrink-0 ${log.type === 'programmata' ? 'bg-blue-500/15' : 'bg-amber-500/15'}`}>
                      {log.type === 'programmata' ? <Shield size={18} className="text-blue-400" /> : <AlertTriangle size={18} className="text-amber-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-themed">{log.title}</p>
                      {log.description && <p className="text-sm text-muted mt-0.5">{log.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-sm text-faint flex-wrap">
                        <span>{log.performed_by_name}</span>
                        <span>{timeAgo(log.performed_at)}</span>
                        {log.duration_minutes && <span>⏱ {log.duration_minutes}min</span>}
                        {log.parts_replaced && <span>🔩 {log.parts_replaced}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ═══ RESOLVED REPORTS — collapsible ═══ */}
        {resolvedReports.length > 0 && (
          <div>
            <button onClick={() => toggle(setShowResolved)} className="w-full flex items-center justify-between py-[2vw] press-scale">
              <p className="text-sm text-muted font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle size={15} /> Risolte ({resolvedReports.length})
              </p>
              {showResolved ? <ChevronUp size={20} className="text-faint" /> : <ChevronDown size={20} className="text-faint" />}
            </button>
            {showResolved && (
              <div className="space-y-[2vw] animate-fade-in">
                {resolvedReports.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center gap-[3vw] card-elevated rounded-2xl px-[4vw] py-[3vw]">
                    <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-secondary truncate">{r.title}</p>
                      <p className="text-xs text-faint">{timeAgo(r.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ FAB — Segnala Problema (doppia scelta) ═══ */}
      <div className="fixed bottom-[4vw] left-[4vw] right-[4vw] z-40 safe-area-bottom flex gap-[3vw]">
        <button
          onClick={() => {
            haptic.medium()
            if (onQuickReport) onQuickReport(machine.name)
          }}
          className="flex-1 py-[3.5vw] rounded-2xl text-base font-bold text-themed flex items-center justify-center gap-2 press-scale active:scale-[0.97] transition-all"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
          }}
        >
          <Zap size={20} strokeWidth={2.5} />
          Rapido
        </button>
        <button
          onClick={() => {
            haptic.medium()
            if (onNewReport) onNewReport(machine.name)
          }}
          className="flex-1 py-[3.5vw] rounded-2xl text-base font-bold text-themed flex items-center justify-center gap-2 press-scale active:scale-[0.97] transition-all"
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
          }}
        >
          <AlertTriangle size={20} strokeWidth={2.5} />
          Completo
        </button>
      </div>

      {/* ═══ MODAL — Conferma Manutenzione Programmata ═══ */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setConfirmPlan(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />

            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
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
                <textarea
                  value={confirmNote}
                  onChange={e => setConfirmNote(e.target.value)}
                  placeholder="Es. Tutto regolare, nessun problema rilevato"
                  className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (minuti, opzionale)</label>
                <input
                  type="number"
                  value={confirmDuration}
                  onChange={e => setConfirmDuration(e.target.value)}
                  placeholder="Es. 30"
                  className="w-full input-field rounded-2xl px-4 py-[3vw] text-base"
                />
              </div>
            </div>

            <div className="flex gap-[3vw]">
              <button onClick={handleConfirmMaintenance} disabled={confirming}
                className="flex-1 py-[4vw] rounded-2xl text-lg font-bold text-themed flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: '#22c55e', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {confirming ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={20} /> Conferma</>}
              </button>
              <button onClick={() => setConfirmPlan(null)}
                className="w-[25vw] py-[4vw] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Risolvi Segnalazione + Registra Straordinaria ═══ */}
      {resolveReport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setResolveReport(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom"
            onClick={e => e.stopPropagation()}>

            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />

            <div className="flex items-center gap-3 mb-[4vw]">
              <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 bg-amber-500/15 rounded-xl flex items-center justify-center">
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
                <textarea
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  placeholder="Es. Sostituita guarnizione, rabboccato olio"
                  className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none"
                  rows={3}
                />
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

            <p className="text-xs text-faint text-center mb-[3vw]">
              La segnalazione verrà chiusa e l'intervento registrato nel fascicolo macchina
            </p>

            <div className="flex gap-[3vw]">
              <button onClick={handleResolveAndLog} disabled={resolving}
                className="flex-1 py-[4vw] rounded-2xl text-lg font-bold text-themed flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {resolving ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Wrench size={20} /> Risolvi e Registra</>}
              </button>
              <button onClick={() => setResolveReport(null)}
                className="w-[25vw] py-[4vw] rounded-2xl text-lg font-bold bg-surface-2 text-muted press-scale">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
