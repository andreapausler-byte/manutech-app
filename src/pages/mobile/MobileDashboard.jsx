/**
 * MobileDashboard v5.0 — Redesign workflow manutenzione + KPI
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
import { useOperatorScore, BADGES, BADGE_CATEGORIES } from '../../hooks/useOperatorScore'
import {
  AlertTriangle, CheckCircle, Wrench, ChevronRight,
  Zap, Timer, Shield, Cog, Clock, X, Camera,
  FileText, Paperclip, Play, User, Trophy, Flame
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

// ── Section Header ──
function SectionHeader({ icon: Icon, iconBg, iconColor, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{subtitle}</p>
      </div>
    </div>
  )
}

export default function MobileDashboard({ user, onViewReport, onQuickReport }) {
  const [reports, setReports] = useState([])
  const [myTasks, setMyTasks] = useState([])
  const [loading, setLoading] = useState(true)
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
          if (isAssignedToMe || isUrgent || status === 'in_corso') {
            allTasks.push({ plan, machine, lastLog, light, isAssignedToMe, isTakenByMe, status })
          }
        }
      }
      allTasks.sort((a, b) => {
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
  const { leaderboard } = useOperatorScore(reports, 'month')
  const myScore = leaderboard.find(op => op.id === user?.id)
  useEffect(() => { loadData() }, [loadData])

  const handleTakeCharge = async (task) => {
    setTaking(task.plan.id)
    haptic.medium()
    try {
      await db.takeMaintenancePlan(task.plan.id, user?.id, user?.name)
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

  const openComplete = (task) => {
    haptic.medium()
    setCompleteTask(task)
    setCNote(''); setCDuration(''); setCParts(''); setCMedia([])
  }

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
        setCMedia(prev => [...prev, { type: file.type.startsWith('image/') ? 'photo' : 'document', name: file.name, url }])
        haptic.light()
      } catch { toast.error('Errore upload') }
      setUploading(false)
    }
    input.click()
  }

  const handleComplete = async () => {
    if (!completeTask) return
    setCompleting(true)
    try {
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
      await db.completeMaintenancePlan(completeTask.plan.id)
      db.addNotification({
        type: 'maintenance_completed',
        title: `✅ Manutenzione completata`,
        body: `${user?.name} ha completato "${completeTask.plan.name}" su ${completeTask.machine.name}${cDuration ? ` (${cDuration} min)` : ''}`,
        report_id: null, from_user: user?.id, target_user: null,
      }).catch(e => console.warn('Side effect failed:', e.message))
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
    <div ref={pullRef} style={{ padding: '0 4vw 16px' }}>
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />

      {/* ═══ Vista Operatore ═══ */}
      {user.role === 'operatore' && (
        <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 32 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 36 }}>🔧</span>
          </div>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>Ciao, {user.name?.split(' ')[0]}</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {user.department || 'Area produzione'}
          </p>
          {onQuickReport && (
            <button onClick={() => { haptic.medium(); onQuickReport() }} className="press-scale"
              style={{
                marginTop: 24, padding: '18px 48px', borderRadius: 16, fontSize: 16, fontWeight: 600,
                background: 'linear-gradient(135deg, var(--color-primary), #00d4ff)',
                color: '#fff', border: 'none', cursor: 'pointer',
                boxShadow: '0 0 20px rgba(124,106,255,0.15)',
              }}>
              Segnala Problema
            </button>
          )}

          {/* ── Score Widget ── */}
          {myScore && (
            <div style={{
              marginTop: 24, padding: '18px 20px', borderRadius: 20,
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
                <Trophy size={20} style={{ color: '#ffd700' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>Il tuo punteggio</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
                    {myScore.score}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>punti</p>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 12,
                  background: `${myScore.level.color}18`,
                }}>
                  <span style={{ fontSize: 24 }}>{myScore.level.icon}</span>
                  <p style={{ fontSize: 12, fontWeight: 700, color: myScore.level.color }}>{myScore.level.label}</p>
                </div>
                {myScore.streak > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Flame size={22} style={{ color: '#f59e0b' }} />
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b' }}>{myScore.streak}g</p>
                    <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>streak</p>
                  </div>
                )}
              </div>
              {/* Progress bar */}
              {myScore.nextLevel && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                    <span>{myScore.level.icon} {myScore.level.label}</span>
                    <span>{myScore.nextLevel.icon} {myScore.nextLevel.label} ({myScore.nextLevel.min} pt)</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      background: `linear-gradient(90deg, ${myScore.level.color}, ${myScore.nextLevel.color})`,
                      width: `${myScore.progress}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              )}
              {/* Rank */}
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 10 }}>
                Posizione <strong style={{ color: 'var(--color-primary)' }}>#{myScore.rank}</strong> su {leaderboard.length} operatori questo mese
              </p>

              {/* Badge sbloccati */}
              {myScore.badges?.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                    Badge sbloccati ({myScore.badges.length}/{BADGES.length})
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {myScore.badges.map(b => {
                      const cat = BADGE_CATEGORIES[b.category]
                      return (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 8,
                          background: `${cat.color}15`, fontSize: 12,
                        }}>
                          <span style={{ fontSize: 14 }}>{b.icon}</span>
                          <span style={{ fontWeight: 600, color: cat.color }}>{b.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  {/* Prossimo badge da sbloccare */}
                  {myScore.badgeProgress && (() => {
                    const nextBadge = myScore.badgeProgress.find(b => !b.unlocked)
                    if (!nextBadge) return null
                    return (
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                        Prossimo: {nextBadge.icon} <strong>{nextBadge.label}</strong> — {nextBadge.desc}
                      </p>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {user.role !== 'operatore' && (
        <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', paddingTop: 16, marginBottom: 20 }}>
          Ciao, {user.name?.split(' ')[0]} 👋
        </p>
      )}

      {/* ═══ KPI Strip — 4 metriche compatte ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Aperti', value: stats.aperte, color: '#ef4444' },
          { label: 'In Corso', value: stats.inCorso, color: '#3b82f6' },
          { label: 'Chiusi', value: stats.risolte, color: '#22c55e' },
          { label: 'Critiche', value: stats.critiche, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderTop: `3px solid ${color}`,
            borderRadius: 14, padding: '14px 8px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</p>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6, fontWeight: 600 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ═══ KPI Avanzati — 3 metriche ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {/* Ring progress */}
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 16, padding: '16px 12px', textAlign: 'center',
        }}>
          <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 8px' }}>
            <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${resolveRate * 0.88} ${88 - resolveRate * 0.88}`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <span style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: 'var(--color-text)',
            }}>{resolveRate}%</span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Risoluzione</p>
        </div>

        {/* Tempo medio */}
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 16, padding: '16px 12px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#06b6d415', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Timer size={16} style={{ color: '#06b6d4' }} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{kpi.avgResolutionLabel}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 4 }}>Tempo medio</p>
        </div>

        {/* Questa settimana */}
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 16, padding: '16px 12px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#8b5cf615', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Zap size={16} style={{ color: '#8b5cf6' }} />
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>{kpi.reportsThisWeek}</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 4 }}>Questa sett.</p>
        </div>
      </div>

      {/* ═══ IN CORSO — Manutenzioni prese in carico ═══ */}
      {inCorsoTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader icon={Wrench} iconBg="#8b5cf618" iconColor="#8b5cf6"
            title="In corso" subtitle={`${inCorsoTasks.length} manutenzion${inCorsoTasks.length === 1 ? 'e' : 'i'} in lavorazione`} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {inCorsoTasks.map(task => (
              <div key={`ic-${task.plan.id}`} style={{
                borderRadius: 18, overflow: 'hidden',
                background: '#8b5cf608',
                border: '2px solid #8b5cf630',
              }}>
                <div style={{ padding: '16px 18px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Wrench size={12} style={{ color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3 }}>{task.plan.name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Cog size={13} /> {task.machine.name}
                        </span>
                        {task.plan.taken_by_name && (
                          <span style={{
                            fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                            background: '#8b5cf618', color: '#8b5cf6',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            <User size={10} /> {task.plan.taken_by_name}
                          </span>
                        )}
                      </div>
                      {task.plan.instructions && (
                        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                          {task.plan.instructions}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <button onClick={() => openComplete(task)}
                  className="press-scale"
                  style={{
                    width: '100%', padding: '14px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 16, fontWeight: 700, color: '#fff',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    border: 'none', borderTop: '1px solid #22c55e20', cursor: 'pointer',
                  }}>
                  <CheckCircle size={20} /> Completa — Registra Report
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ DA ESEGUIRE — Manutenzioni urgenti ═══ */}
      {daEseguireTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader icon={Shield}
            iconBg={daEseguireTasks.some(t => t.light.color === '#ef4444') ? '#ef444418' : '#f59e0b18'}
            iconColor={daEseguireTasks.some(t => t.light.color === '#ef4444') ? '#ef4444' : '#f59e0b'}
            title="Manutenzioni da fare" subtitle={`${daEseguireTasks.length} intervent${daEseguireTasks.length === 1 ? 'o richiesto' : 'i richiesti'}`} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {daEseguireTasks.map(task => {
              const isRed = task.light.color === '#ef4444'
              const isAmber = task.light.color === '#f59e0b'
              return (
                <div key={`de-${task.plan.id}`} style={{
                  borderRadius: 18, overflow: 'hidden',
                  background: isRed ? '#ef444408' : isAmber ? '#f59e0b08' : 'var(--color-card)',
                  border: `2px solid ${isRed ? '#ef444425' : isAmber ? '#f59e0b20' : 'var(--color-border)'}`,
                }}>
                  <div style={{ padding: '16px 18px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        background: task.light.color,
                        boxShadow: `0 0 12px ${task.light.color}50`,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.3, flex: 1 }}>
                            {task.plan.name}
                          </p>
                          <span style={{
                            fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, flexShrink: 0,
                            background: `${task.light.color}18`, color: task.light.color,
                          }}>
                            {task.light.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Cog size={13} /> {task.machine.name}
                          </span>
                        </div>
                        {task.plan.instructions && (
                          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                            {task.plan.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button onClick={() => handleTakeCharge(task)}
                    disabled={taking === task.plan.id}
                    className="press-scale"
                    style={{
                      width: '100%', padding: '14px 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      fontSize: 15, fontWeight: 700,
                      color: 'var(--color-primary)',
                      background: 'var(--color-primary-glow)',
                      border: 'none', borderTop: `1px solid ${task.light.color}15`, cursor: 'pointer',
                      opacity: taking === task.plan.id ? 0.6 : 1,
                    }}>
                    {taking === task.plan.id
                      ? <div style={{ width: 20, height: 20, border: '2px solid #8b5cf630', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      : <><Play size={18} /> Prendo in carico</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Quick Report ═══ */}
      {onQuickReport && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Zap size={18} style={{ color: '#f59e0b' }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Report Rapido</h3>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }} className="no-scrollbar">
            {QUICK_TEMPLATES.slice(0, 4).map(t => (
              <button key={t.id} onClick={() => { haptic.light(); onQuickReport() }}
                className="card-interactive press-scale"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  minWidth: '22vw', padding: '14px 10px', borderRadius: 16, flexShrink: 0,
                }}>
                <span style={{ fontSize: 26 }}>{t.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Segnalazioni recenti ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
          {user.role === 'operatore' ? 'I Tuoi Ticket Recenti' : 'Segnalazioni'}
        </h3>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 500 }}>{reports.length} totali</span>
      </div>

      {reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>Nessuna segnalazione</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(user.role === 'operatore' ? reports.slice(0, 3) : reports.slice(0, 5))
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .map(report => {
            const rstatus = STATUS[report.status] || STATUS.aperta
            const severity = SEVERITY[report.severity] || SEVERITY.media
            return (
              <button key={report.id} onClick={() => onViewReport(report)}
                className="press-scale"
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: 'var(--color-card)', border: '1px solid var(--color-border)',
                  borderLeft: `4px solid ${rstatus.color}`,
                  borderRadius: 16, padding: '14px 16px', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <h4 style={{
                      fontSize: 15, fontWeight: 700, color: 'var(--color-text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>{report.title}</h4>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>{timeAgo(report.updated_at || report.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge {...severity} />
                    {report.assigned_to_name && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: '#8b5cf615', color: '#8b5cf6',
                      }}>👤 {report.assigned_to_name}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ MODAL — Completa manutenzione con report ═══ */}
      {completeTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setCompleteTask(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl animate-slide-up safe-area-bottom overflow-y-auto"
            style={{ maxHeight: '90vh', padding: '20px 5vw 32px' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '0 auto 20px' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: '#22c55e18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <CheckCircle size={22} style={{ color: '#22c55e' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Report Manutenzione</h3>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {completeTask.plan.name}
                </p>
              </div>
            </div>

            {/* Machine info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--color-surface-2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16,
            }}>
              <Cog size={16} style={{ color: '#8b5cf6' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{completeTask.machine.name}</span>
            </div>

            {/* Istruzioni */}
            {completeTask.plan.instructions && (
              <div style={{
                background: '#8b5cf608', border: '1px solid #8b5cf620',
                borderRadius: 14, padding: '14px 16px', marginBottom: 18,
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf690', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Istruzioni</p>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{completeTask.plan.instructions}</p>
              </div>
            )}

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Cosa hai fatto? *</label>
                <textarea value={cNote} onChange={e => setCNote(e.target.value)}
                  placeholder="Descrivi l'intervento eseguito..."
                  className="w-full input-field"
                  style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15, resize: 'none' }} rows={3} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Durata (min)</label>
                  <input type="number" value={cDuration} onChange={e => setCDuration(e.target.value)}
                    placeholder="60" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Ricambi</label>
                  <input type="text" value={cParts} onChange={e => setCParts(e.target.value)}
                    placeholder="Filtro XF-420" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
              </div>

              {/* Media */}
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Foto e Documenti</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: cMedia.length > 0 || uploading ? 10 : 0 }}>
                  <button onClick={() => uploadMedia('photo')} disabled={uploading}
                    className="press-scale"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 0', borderRadius: 14, fontSize: 15, fontWeight: 700,
                      background: '#8b5cf612', border: '1px solid #8b5cf625', color: '#8b5cf6',
                      cursor: 'pointer', opacity: uploading ? 0.4 : 1,
                    }}>
                    <Camera size={18} /> Foto
                  </button>
                  <button onClick={() => uploadMedia('file')} disabled={uploading}
                    className="press-scale"
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '12px 0', borderRadius: 14, fontSize: 15, fontWeight: 700,
                      background: '#a855f712', border: '1px solid #a855f725', color: '#a855f7',
                      cursor: 'pointer', opacity: uploading ? 0.4 : 1,
                    }}>
                    <Paperclip size={18} /> File
                  </button>
                </div>

                {uploading && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                    <div style={{ width: 16, height: 16, border: '2px solid #8b5cf630', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Caricamento...
                  </div>
                )}

                {cMedia.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {cMedia.map((m, i) => (
                      <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                          width: 68, height: 68, borderRadius: 12,
                          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {m.type === 'photo'
                            ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ textAlign: 'center' }}>
                                <FileText size={18} style={{ color: '#ef4444', margin: '0 auto' }} />
                                <span style={{ fontSize: 8, color: 'var(--color-text-muted)', display: 'block', marginTop: 2, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                              </div>}
                        </div>
                        <button onClick={() => setCMedia(prev => prev.filter((_, j) => j !== i))}
                          style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 20, height: 20, borderRadius: '50%',
                            background: '#ef4444', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          <X size={10} style={{ color: '#fff' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleComplete} disabled={completing}
                className="press-scale"
                style={{
                  flex: 1, padding: '16px 0', borderRadius: 16,
                  fontSize: 16, fontWeight: 700, color: '#fff',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                  opacity: completing ? 0.7 : 1,
                }}>
                {completing
                  ? <div style={{ width: 22, height: 22, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  : <><CheckCircle size={20} /> Completa e Invia</>}
              </button>
              <button onClick={() => setCompleteTask(null)}
                style={{
                  width: '30%', padding: '16px 0', borderRadius: 16,
                  fontSize: 16, fontWeight: 700, background: 'var(--color-surface-2)',
                  color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer',
                }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
