/**
 * MobileDashboard v4.0 — Workflow manutenzione 3 step + report con media
 * 
 * Flusso: Da eseguire → Prendo in carico → In corso → Completa (con report + foto)
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, QUICK_TEMPLATES, timeAgo } from '../../lib/constants'
import { Badge, SkeletonDashboard } from '../../components/ui'
import PullToRefreshIndicator from '../../components/ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useKPIStats } from '../../hooks/useKPIStats'
import {
  AlertTriangle, CheckCircle, Wrench, Activity, ChevronRight,
  Zap, Timer, TrendingUp, Shield, Cog, Clock, X, Camera, Image,
  FileText, Paperclip, Play, User
} from 'lucide-react'

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft, urgent: true }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft, urgent: true }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft, urgent: false }
}

const STATUS_CONFIG = {
  da_eseguire: { label: 'Da eseguire', color: '#f59e0b', icon: Clock },
  in_corso: { label: 'In corso', color: '#3b82f6', icon: Wrench },
  completata: { label: 'Completata', color: '#22c55e', icon: CheckCircle },
}

export default function MobileDashboard({ user, onViewReport, onQuickReport }) {
  const [reports, setReports] = useState([])
  const [myTasks, setMyTasks] = useState([])
  const [loading, setLoading] = useState(true)

  // Take charge
  const [taking, setTaking] = useState(null)

  // Complete modal
  const [completeTask, setCompleteTask] = useState(null)
  const [cNote, setCNote] = useState('')
  const [cDuration, setCDuration] = useState('')
  const [cParts, setCParts] = useState('')
  const [cMedia, setCMedia] = useState([])
  const [completing, setCompleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()

  const loadData = useCallback(async () => {
    try {
      const [r, machines] = await Promise.all([db.getReports(), db.getMachines()])
      setReports(r)
      const allTasks = []
      for (const machine of machines) {
        const plans = await db.getMaintenancePlans(machine.id)
        for (const plan of plans) {
          const lastLog = await db.getLastLogForPlan(plan.id)
          const light = getTrafficLight(plan, lastLog)
          const status = plan.current_status || 'da_eseguire'
          const isAssignedToMe = plan.assigned_to === user?.id
          const isTakenByMe = plan.taken_by === user?.id
          const isUrgent = light.urgent
          // Mostra: urgenti, assegnati a me, o in corso da chiunque
          if (isAssignedToMe || isUrgent || status === 'in_corso') {
            allTasks.push({ plan, machine, lastLog, light, isAssignedToMe, isTakenByMe, status })
          }
        }
      }
      allTasks.sort((a, b) => {
        // In corso prima, poi scadute, poi per giorni rimasti
        if (a.status === 'in_corso' && b.status !== 'in_corso') return -1
        if (b.status === 'in_corso' && a.status !== 'in_corso') return 1
        return a.light.daysLeft - b.light.daysLeft
      })
      setMyTasks(allTasks)
    } catch {}
    setLoading(false)
  }, [user?.id])

  const handleRefresh = useCallback(async () => {
    const r = await db.getReports()
    setReports(r)
    await loadData()
  }, [loadData])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)
  const kpi = useKPIStats(reports)
  useEffect(() => { loadData() }, [loadData])

  // ── Step 1: Prendi in carico ──
  const handleTakeCharge = async (task) => {
    setTaking(task.plan.id)
    haptic.medium()
    try {
      await db.takeMaintenancePlan(task.plan.id, user?.id, user?.name)

      // Notifica agli admin: tecnico ha preso in carico
      db.addNotification({
        type: 'maintenance_taken',
        title: `🔧 Manutenzione presa in carico`,
        body: `${user?.name} ha preso in carico "${task.plan.name}" su ${task.machine.name}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))

      toast.success('Preso in carico!')
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setTaking(null)
  }

  // ── Step 2: Apri modal completamento ──
  const openComplete = (task) => {
    haptic.medium()
    setCompleteTask(task)
    setCNote(''); setCDuration(''); setCParts(''); setCMedia([])
  }

  // ── Upload foto/file ──
  const uploadMedia = async (type) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = type === 'photo' ? 'image/*' : '.pdf,.doc,.docx,image/*'
    if (type === 'photo') input.capture = 'environment'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      setUploading(true)
      try {
        const url = await db.uploadFile('attachments', `maintenance/${Date.now()}-${file.name}`, file)
        setCMedia(prev => [...prev, {
          type: file.type.startsWith('image/') ? 'photo' : 'document',
          name: file.name,
          url,
        }])
        haptic.light()
      } catch { toast.error('Errore upload') }
      setUploading(false)
    }
    input.click()
  }

  // ── Step 3: Completa e registra ──
  const handleComplete = async () => {
    if (!completeTask) return
    setCompleting(true)
    try {
      // 1. Registra l'intervento con media
      await db.createMaintenanceLog({
        machine_id: completeTask.machine.id,
        plan_id: completeTask.plan.id,
        type: 'programmata',
        title: completeTask.plan.name,
        description: cNote.trim() || null,
        performed_by: user?.id,
        performed_by_name: user?.name,
        duration_minutes: cDuration ? parseInt(cDuration) : null,
        parts_replaced: cParts.trim() || null,
        media: cMedia.length > 0 ? cMedia : null,
        performed_at: new Date().toISOString(),
        org_id: user?.org_id || 'default',
      })

      // 2. Segna come completata
      await db.completeMaintenancePlan(completeTask.plan.id)

      // Notifica agli admin: manutenzione completata
      db.addNotification({
        type: 'maintenance_completed',
        title: `✅ Manutenzione completata`,
        body: `${user?.name} ha completato "${completeTask.plan.name}" su ${completeTask.machine.name}${cDuration ? ` (${cDuration} min)` : ''}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))

      // 3. Dopo un ciclo, resetta automaticamente (lo fa il semaforo)
      // Per ora resettiamo subito lo stato per il prossimo ciclo
      setTimeout(async () => {
        await db.resetMaintenancePlan(completeTask.plan.id)
      }, 2000)

      haptic.success()
      toast.success('Manutenzione completata e registrata!')
      setCompleteTask(null)
      await loadData()
    } catch (e) { toast.error('Errore: ' + e.message) }
    setCompleting(false)
  }

  if (loading) return <SkeletonDashboard />

  const stats = {
    aperte: reports.filter(r => r.status === 'aperta').length,
    inCorso: reports.filter(r => r.status === 'in_lavorazione' || r.status === 'assegnata').length,
    risolte: reports.filter(r => r.status === 'risolta').length,
    critiche: reports.filter(r => r.severity === 'critica').length,
  }
  const total = reports.length
  const resolveRate = total > 0 ? Math.round((stats.risolte / total) * 100) : 0
  const inCorsoTasks = myTasks.filter(t => t.status === 'in_corso')
  const daEseguireTasks = myTasks.filter(t => t.status !== 'in_corso')

  return (
    <div ref={pullRef} className="px-[4vw] pt-0 pb-4">
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />
      <p className="text-2xl font-extrabold text-themed mb-[4vw] pt-[4vw] tracking-tight">Ciao, {user.name?.split(' ')[0]} 👋</p>

      {/* ═══ IN CORSO — Manutenzioni prese in carico ═══ */}
      {inCorsoTasks.length > 0 && (
        <div className="mb-[5vw]">
          <div className="flex items-center gap-2.5 mb-[3vw]">
            <div className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <Wrench size={20} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-themed">In corso</h3>
              <p className="text-sm text-faint">{inCorsoTasks.length} manutenzioni in lavorazione</p>
            </div>
          </div>

          <div className="space-y-[3vw]">
            {inCorsoTasks.map((task, i) => (
              <div key={`ic-${task.plan.id}`} className="rounded-2xl overflow-hidden bg-blue-500/5 border-2 border-blue-500/20">
                <div className="px-[4vw] pt-[3.5vw] pb-[2.5vw]">
                  <div className="flex items-start gap-[3vw]">
                    <div className="w-5 h-5 rounded-full bg-blue-500 shrink-0 mt-0.5 flex items-center justify-center">
                      <Wrench size={12} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-themed">{task.plan.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-sm text-faint flex items-center gap-1"><Cog size={13} /> {task.machine.name}</span>
                        {task.plan.taken_by_name && (
                          <span className="text-xs text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <User size={10} /> {task.plan.taken_by_name}
                          </span>
                        )}
                      </div>
                      {task.plan.instructions && <p className="text-sm text-muted mt-1.5 leading-relaxed">{task.plan.instructions}</p>}
                    </div>
                  </div>
                </div>

                <button onClick={() => openComplete(task)}
                  className="w-full py-[4vw] flex items-center justify-center gap-2 text-lg font-bold press-scale active:scale-[0.97] transition-all border-t border-blue-500/15"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: 'white', boxShadow: '0 4px 16px rgba(34,197,94,0.25)' }}>
                  <CheckCircle size={22} /> Completa — Registra Report
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ DA ESEGUIRE — Manutenzioni urgenti ═══ */}
      {daEseguireTasks.length > 0 && (
        <div className="mb-[5vw]">
          <div className="flex items-center gap-2.5 mb-[3vw]">
            <div className="w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center"
              style={{ background: daEseguireTasks.some(t => t.light.color === '#ef4444') ? '#ef444418' : '#f59e0b18' }}>
              <Shield size={20} style={{ color: daEseguireTasks.some(t => t.light.color === '#ef4444') ? '#ef4444' : '#f59e0b' }} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-themed">Manutenzioni da fare</h3>
              <p className="text-sm text-faint">{daEseguireTasks.length} interventi richiesti</p>
            </div>
          </div>

          <div className="space-y-[3vw]">
            {daEseguireTasks.map((task, i) => (
              <div key={`de-${task.plan.id}`}
                className={`rounded-2xl overflow-hidden border-2 ${
                  task.light.color === '#ef4444' ? 'bg-red-500/5 border-red-500/20'
                  : task.light.color === '#f59e0b' ? 'bg-amber-500/5 border-amber-500/15'
                  : 'card-elevated border-transparent'
                }`}>
                <div className="px-[4vw] pt-[3.5vw] pb-[2.5vw]">
                  <div className="flex items-start gap-[3vw]">
                    <div className="w-5 h-5 rounded-full shrink-0 mt-0.5"
                      style={{ background: task.light.color, boxShadow: `0 0 12px ${task.light.color}40` }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-themed">{task.plan.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-sm text-faint flex items-center gap-1"><Cog size={13} /> {task.machine.name}</span>
                        <span className="text-sm font-bold px-2 py-0.5 rounded-lg"
                          style={{ background: task.light.color + '18', color: task.light.color }}>
                          {task.light.label}
                        </span>
                      </div>
                      {task.plan.instructions && <p className="text-sm text-muted mt-1.5 leading-relaxed">{task.plan.instructions}</p>}
                    </div>
                  </div>
                </div>

                <button onClick={() => handleTakeCharge(task)}
                  disabled={taking === task.plan.id}
                  className="w-full py-[3.5vw] flex items-center justify-center gap-2 text-base font-bold press-scale active:scale-[0.97] transition-all border-t"
                  style={{
                    color: '#3b82f6',
                    borderColor: task.light.color === '#ef4444' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                    background: 'rgba(59,130,246,0.05)',
                  }}>
                  {taking === task.plan.id
                    ? <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    : <><Play size={18} /> Prendo in carico</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ KPI Grid ═══ */}
      <div className="grid grid-cols-2 gap-[3vw] mb-[3vw] stagger-children">
        {[
          { label: 'Aperte', value: stats.aperte, icon: AlertTriangle, color: '#f59e0b' },
          { label: 'In Corso', value: stats.inCorso, icon: Wrench, color: '#a855f7' },
          { label: 'Risolte', value: stats.risolte, icon: CheckCircle, color: '#22c55e' },
          { label: 'Critiche', value: stats.critiche, icon: Activity, color: '#ef4444' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-elevated rounded-2xl p-[3.5vw] flex items-center gap-[3vw]">
            <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '14' }}>
              <Icon size={24} style={{ color }} />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-white leading-none">{value}</p>
              <p className="text-sm mt-0.5 text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ KPI avanzati ═══ */}
      <div className="grid grid-cols-3 gap-[2.5vw] mb-[5vw]">
        <div className="card-elevated rounded-2xl p-[3vw] text-center">
          <div className="relative w-[12vw] h-[12vw] max-w-12 max-h-12 mx-auto mb-1.5">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-surface-3)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${resolveRate * 0.88} ${88 - resolveRate * 0.88}`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-white">{resolveRate}%</span>
          </div>
          <p className="text-xs font-bold text-faint">Risoluzione</p>
        </div>
        <div className="card-elevated rounded-2xl p-[3vw] text-center flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold text-themed leading-none">{kpi.avgResolutionLabel}</p>
          <p className="text-xs font-bold mt-1 text-faint">Tempo medio</p>
        </div>
        <div className="card-elevated rounded-2xl p-[3vw] text-center flex flex-col items-center justify-center">
          <p className="text-2xl font-extrabold text-themed leading-none">{kpi.reportsThisWeek}</p>
          <p className="text-xs font-bold mt-1 text-faint">Questa sett.</p>
        </div>
      </div>

      {/* ═══ Quick Report ═══ */}
      {onQuickReport && (
        <div className="mb-[5vw]">
          <div className="flex items-center gap-2 mb-[2.5vw]">
            <Zap size={18} className="text-amber-400" />
            <h3 className="text-lg font-bold text-secondary">Report Rapido</h3>
          </div>
          <div className="flex gap-[2.5vw] overflow-x-auto no-scrollbar pb-1">
            {QUICK_TEMPLATES.slice(0, 4).map((t) => (
              <button key={t.id} onClick={() => { haptic.light(); onQuickReport() }}
                className="card-interactive flex flex-col items-center gap-[1.5vw] min-w-[22vw] py-[3vw] px-[2vw] rounded-2xl shrink-0">
                <span className="text-2xl">{t.icon}</span>
                <span className="text-sm font-bold whitespace-nowrap text-secondary">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Reports list ═══ */}
      <div className="flex items-center justify-between mb-[2.5vw]">
        <h3 className="text-lg font-bold text-secondary">Segnalazioni</h3>
        <span className="text-sm text-faint">{reports.length} totali</span>
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-lg text-muted">Nessuna segnalazione</p>
        </div>
      ) : (
        <div className="space-y-[2.5vw]">
          {reports.map(report => {
            const rstatus = STATUS[report.status] || STATUS.aperta
            const severity = SEVERITY[report.severity] || SEVERITY.media
            return (
              <button key={report.id} onClick={() => onViewReport(report)}
                className="w-full text-left flex items-center gap-[3vw] card-interactive rounded-2xl px-[4vw] py-[3.5vw]">
                <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: rstatus.color + '12' }}>
                  <div className="w-3.5 h-3.5 rounded-full" style={{ background: rstatus.color }} />
                </div>
                <div className="flex-1 min-w-0 mr-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-lg font-bold text-themed truncate">{report.title}</h4>
                    <span className="text-sm shrink-0 text-faint">{timeAgo(report.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge {...severity} />
                    {report.assigned_to_name && (
                      <span className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg">👤 {report.assigned_to_name}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={22} className="shrink-0 text-faint" />
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ MODAL — Completa manutenzione con report ═══ */}
      {completeTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setCompleteTask(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl p-[5vw] pb-[8vw] animate-slide-up safe-area-bottom overflow-y-auto"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>

            <div className="w-10 h-1 bg-surface-3 rounded-full mx-auto mb-[4vw]" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-[2vw]">
              <div className="w-[12vw] h-[12vw] max-w-12 max-h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-themed">Report Manutenzione</h3>
                <p className="text-sm text-faint truncate">{completeTask.plan.name}</p>
              </div>
            </div>

            {/* Machine info */}
            <div className="flex items-center gap-2 bg-surface-2 rounded-xl px-[3vw] py-[2vw] mb-[3vw]">
              <Cog size={16} className="text-blue-400" />
              <span className="text-sm text-secondary font-medium">{completeTask.machine.name}</span>
            </div>

            {/* Istruzioni */}
            {completeTask.plan.instructions && (
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl px-[4vw] py-[3vw] mb-[4vw]">
                <p className="text-xs text-blue-300/70 uppercase tracking-wider font-semibold mb-1">Istruzioni</p>
                <p className="text-sm text-secondary leading-relaxed">{completeTask.plan.instructions}</p>
              </div>
            )}

            {/* Form */}
            <div className="space-y-[3vw] mb-[3vw]">
              <div>
                <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Cosa hai fatto? *</label>
                <textarea value={cNote} onChange={e => setCNote(e.target.value)}
                  placeholder="Descrivi l'intervento eseguito..."
                  className="w-full input-field rounded-2xl px-4 py-[3vw] text-base resize-none" rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-[3vw]">
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Durata (min)</label>
                  <input type="number" value={cDuration} onChange={e => setCDuration(e.target.value)}
                    placeholder="60" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-[1.5vw] font-semibold">Ricambi</label>
                  <input type="text" value={cParts} onChange={e => setCParts(e.target.value)}
                    placeholder="Filtro XF-420" className="w-full input-field rounded-2xl px-4 py-[3vw] text-base" />
                </div>
              </div>

              {/* ── Media attachments ── */}
              <div>
                <label className="block text-sm text-muted mb-[2vw] font-semibold">Foto e Documenti</label>
                <div className="flex gap-[2.5vw] mb-[2.5vw]">
                  <button onClick={() => uploadMedia('photo')} disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 py-[3vw] bg-blue-500/10 border border-blue-500/20 rounded-2xl text-base font-bold text-blue-400 press-scale active:bg-blue-500/20 disabled:opacity-40">
                    <Camera size={20} /> Foto
                  </button>
                  <button onClick={() => uploadMedia('file')} disabled={uploading}
                    className="flex-1 flex items-center justify-center gap-2 py-[3vw] bg-purple-500/10 border border-purple-500/20 rounded-2xl text-base font-bold text-purple-400 press-scale active:bg-purple-500/20 disabled:opacity-40">
                    <Paperclip size={20} /> File
                  </button>
                </div>

                {uploading && (
                  <div className="flex items-center justify-center gap-2 py-[2vw] text-sm text-faint">
                    <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    Caricamento...
                  </div>
                )}

                {cMedia.length > 0 && (
                  <div className="flex gap-[2vw] overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {cMedia.map((m, i) => (
                      <div key={i} className="relative shrink-0">
                        <div className="w-[18vw] h-[18vw] max-w-[76px] max-h-[76px] rounded-xl bg-surface-2 border border-token overflow-hidden flex items-center justify-center">
                          {m.type === 'photo'
                            ? <img src={m.url} alt="" className="w-full h-full object-cover" />
                            : <div className="text-center"><FileText size={20} className="text-red-400 mx-auto" /><span className="text-[8px] text-faint block mt-0.5 truncate w-[60px]">{m.name}</span></div>}
                        </div>
                        <button onClick={() => setCMedia(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <X size={10} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-[3vw]">
              <button onClick={handleComplete} disabled={completing}
                className="flex-1 py-[4vw] rounded-2xl text-lg font-bold text-themed flex items-center justify-center gap-2 press-scale transition-all"
                style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', boxShadow: '0 4px 16px rgba(34,197,94,0.3)' }}>
                {completing
                  ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={20} /> Completa e Invia</>}
              </button>
              <button onClick={() => setCompleteTask(null)}
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
