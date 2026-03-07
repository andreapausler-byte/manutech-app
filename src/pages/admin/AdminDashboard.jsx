import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, timeAgo, formatDate } from '../../lib/constants'
import { Badge } from '../../components/ui'
import { useKPIStats } from '../../hooks/useKPIStats'
import {
  AlertTriangle, CheckCircle, Clock, Wrench, TrendingUp, BarChart3,
  ArrowUpRight, ArrowDownRight, ChevronRight, Activity, Zap, Timer,
  FileText, ArrowRight, MessageCircle, UserCheck, Shield, Cog
} from 'lucide-react'

const ACTIVITY_ICONS = {
  created:       { icon: FileText,      color: '#3b82f6' },
  quick_created: { icon: Zap,           color: '#f59e0b' },
  status_change: { icon: ArrowRight,    color: '#a855f7' },
  comment:       { icon: MessageCircle, color: '#6366f1' },
  assigned:      { icon: UserCheck,     color: '#8b5cf6' },
}

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ef4444', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#f59e0b', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#22c55e', daysLeft }
}

export default function AdminDashboard({ onNavigate }) {
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [activities, setActivities] = useState([])
  const [machines, setMachines] = useState([])
  const [maintenanceTasks, setMaintenanceTasks] = useState([]) // { plan, machine, lastLog, light }
  const [loading, setLoading] = useState(true)

  const kpi = useKPIStats(reports)

  useEffect(() => {
    async function loadAll() {
      const [r, u, a, m, plans, logs] = await Promise.all([
        db.getReports(), db.getUsers(), db.getAllActivities(20), db.getMachines(),
        db.getAllMaintenancePlans(), db.getAllMaintenanceLogs()
      ])
      setReports(r); setUsers(u); setActivities(a); setMachines(m)

      // Build machine lookup and find last log per plan from pre-fetched data
      const machineMap = Object.fromEntries(m.map(machine => [machine.id, machine]))
      const lastLogByPlan = {}
      for (const log of logs) {
        if (log.plan_id && (!lastLogByPlan[log.plan_id] || new Date(log.performed_at) > new Date(lastLogByPlan[log.plan_id].performed_at))) {
          lastLogByPlan[log.plan_id] = log
        }
      }

      const tasks = plans.map(plan => {
        const machine = machineMap[plan.machine_id]
        const lastLog = lastLogByPlan[plan.id] || null
        const light = getTrafficLight(plan, lastLog)
        return { plan, machine, lastLog, light }
      }).filter(t => t.machine)

      tasks.sort((a, b) => a.light.daysLeft - b.light.daysLeft)
      setMaintenanceTasks(tasks)
      setLoading(false)
    }
    loadAll()
  }, [])

  const stats = {
    total: reports.length,
    aperte: reports.filter(r => r.status === 'aperta').length,
    assegnate: reports.filter(r => r.status === 'assegnata').length,
    inCorso: reports.filter(r => r.status === 'in_lavorazione').length,
    risolte: reports.filter(r => r.status === 'risolta').length,
    critiche: reports.filter(r => r.severity === 'critica').length,
    alte: reports.filter(r => r.severity === 'alta').length,
    tecnici: users.filter(u => u.role === 'tecnico').length,
    operatori: users.filter(u => u.role === 'operatore').length,
  }

  const resolveRate = stats.total > 0 ? Math.round((stats.risolte / stats.total) * 100) : 0
  const urgenti = stats.critiche + stats.alte
  const nonAssegnate = reports.filter(r => r.status === 'aperta' && !r.assigned_to).length

  return (
    <div className="space-y-6 stagger-children">

      {/* Hero KPIs — 4 big cards */}
      <div className="grid grid-cols-4 gap-5">
        {[
          {
            label: 'Segnalazioni Aperte',
            value: stats.aperte,
            sub: `${nonAssegnate} non assegnate`,
            icon: AlertTriangle,
            color: '#f59e0b',
            gradient: 'from-amber-500/15 to-amber-600/5',
            trend: stats.aperte > 0 ? 'up' : null,
          },
          {
            label: 'In Lavorazione',
            value: stats.assegnate + stats.inCorso,
            sub: `${stats.tecnici} tecnici attivi`,
            icon: Wrench,
            color: '#a855f7',
            gradient: 'from-purple-500/15 to-purple-600/5',
            trend: null,
          },
          {
            label: 'Risolte',
            value: stats.risolte,
            sub: `${resolveRate}% tasso risoluzione`,
            icon: CheckCircle,
            color: '#22c55e',
            gradient: 'from-emerald-500/15 to-emerald-600/5',
            trend: resolveRate > 50 ? 'up' : 'down',
          },
          {
            label: 'Urgenti',
            value: urgenti,
            sub: `${stats.critiche} critiche, ${stats.alte} alte`,
            icon: Activity,
            color: urgenti > 0 ? '#ef4444' : '#22c55e',
            gradient: urgenti > 0 ? 'from-red-500/15 to-red-600/5' : 'from-emerald-500/15 to-emerald-600/5',
            trend: urgenti > 0 ? 'up' : null,
          },
        ].map(({ label, value, sub, icon: Icon, color, gradient, trend }) => (
          <div key={label} className={`bg-gradient-to-br ${gradient} border border-token rounded-2xl p-6 transition-all hover:border-token`}>
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
                <Icon size={22} style={{ color }} />
              </div>
              {trend && (
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </div>
              )}
            </div>
            <p className="text-4xl font-bold text-themed tracking-tight">{value}</p>
            <p className="text-sm text-secondary font-medium mt-1">{label}</p>
            <p className="text-xs text-faint mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ═══ Maintenance Alert Banner ═══ */}
      {(() => {
        const overdueM = maintenanceTasks.filter(t => t.light.color === '#ef4444')
        const warningM = maintenanceTasks.filter(t => t.light.color === '#f59e0b')
        if (overdueM.length === 0 && warningM.length === 0) return null
        return (
          <div className={`border rounded-2xl p-5 flex items-center gap-4 ${overdueM.length > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${overdueM.length > 0 ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
              <Shield size={24} className={overdueM.length > 0 ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-themed">
                {overdueM.length > 0
                  ? `${overdueM.length} manutenzioni scadute`
                  : `${warningM.length} manutenzioni in scadenza`}
              </p>
              <p className="text-sm text-muted mt-0.5">
                {overdueM.length > 0 && warningM.length > 0
                  ? `${overdueM.length} scadute + ${warningM.length} in scadenza entro 7 giorni`
                  : overdueM.length > 0
                    ? 'Interventi urgenti richiesti'
                    : 'Scadono entro 7 giorni'}
              </p>
            </div>
            <button onClick={() => onNavigate?.('maintenance')}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white shrink-0 transition-colors ${overdueM.length > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
              Gestisci →
            </button>
          </div>
        )
      })()}

      {/* Time-based KPIs — 4 compact cards */}
      <div className="grid grid-cols-4 gap-5">
        {/* Avg Resolution Time */}
        <div className="card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Timer size={16} className="text-cyan-400" />
            <span className="text-xs text-muted uppercase tracking-wider font-semibold">Tempo Medio</span>
          </div>
          <p className="text-3xl font-bold text-white">{kpi.avgResolutionLabel}</p>
          <p className="text-xs text-faint mt-1">dalla creazione alla risoluzione</p>
        </div>

        {/* Weekly Trend */}
        <div className="card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-blue-400" />
            <span className="text-xs text-muted uppercase tracking-wider font-semibold">Questa Settimana</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-white">{kpi.reportsThisWeek}</p>
            {kpi.weeklyTrend.change !== 0 && (
              <span className={`text-sm font-bold flex items-center mb-1 ${kpi.weeklyTrend.change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {kpi.weeklyTrend.change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(kpi.weeklyTrend.change)}%
              </span>
            )}
          </div>
          <p className="text-xs text-faint mt-1">vs {kpi.reportsLastWeek} settimana scorsa</p>
        </div>

        {/* Resolved This Week */}
        <div className="card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-emerald-400" />
            <span className="text-xs text-muted uppercase tracking-wider font-semibold">Risolte</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400">{kpi.resolvedThisWeek}</p>
          <p className="text-xs text-faint mt-1">chiuse questa settimana</p>
        </div>

        {/* Quick Report % + Daily chart */}
        <div className="card-elevated rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-amber-400" />
            <span className="text-xs text-muted uppercase tracking-wider font-semibold">Report Rapidi</span>
          </div>
          <p className="text-3xl font-bold text-amber-400">{kpi.quickReportPct}%</p>
          <div className="flex items-end gap-0.5 mt-2 h-8">
            {kpi.dailyDistribution.map((count, i) => {
              const max = Math.max(...kpi.dailyDistribution, 1)
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500/60 rounded-sm min-h-[2px] transition-all"
                    style={{ height: `${(count / max) * 100}%` }}
                  />
                  <span className="text-[8px] text-faint mt-0.5">{kpi.dayLabels?.[i]?.[0]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Middle row — Resolution chart + Severity + Team */}
      <div className="grid grid-cols-3 gap-5">

        {/* Resolution Rate — big visual */}
        <div className="card-elevated rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-6">Tasso Risoluzione</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#1f2937" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#22c55e" strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${resolveRate * 3.14} ${314 - resolveRate * 3.14}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{resolveRate}%</span>
                <span className="text-xs text-faint">{stats.risolte}/{stats.total}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-themed">{stats.total}</p>
              <p className="text-[11px] text-faint mt-0.5">Totali</p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-emerald-400">{stats.risolte}</p>
              <p className="text-[11px] text-faint mt-0.5">Chiuse</p>
            </div>
          </div>
        </div>

        {/* Severity Breakdown */}
        <div className="card-elevated rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-6">Distribuzione Gravità</h3>
          <div className="space-y-4">
            {Object.entries(SEVERITY).map(([key, { label, color }]) => {
              const count = reports.filter(r => r.severity === key).length
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                      <span className="text-sm text-secondary font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{count}</span>
                      <span className="text-xs text-faint w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Status mini-bars */}
          <div className="mt-6 pt-5 border-t border-token">
            <p className="text-[11px] text-faint uppercase tracking-wider mb-3">Per Stato</p>
            <div className="flex gap-1.5 h-8 rounded-lg overflow-hidden">
              {Object.entries(STATUS).map(([key, { label, color }]) => {
                const count = reports.filter(r => r.status === key).length
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div key={key} className="flex items-center justify-center text-[10px] font-bold text-white transition-all duration-500"
                    style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? '24px' : 0 }}
                    title={`${label}: ${count}`}
                  >
                    {count}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-4 mt-2.5">
              {Object.entries(STATUS).map(([key, { label, color }]) => (
                <span key={key} className="flex items-center gap-1.5 text-[11px] text-faint">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Team Workload */}
        <div className="card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Carico di Lavoro</h3>
            <button onClick={() => onNavigate?.('users')} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5">
              Gestisci <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2.5">
            {(() => {
              // Calcola carico per TUTTI gli utenti con almeno 1 segnalazione assegnata
              const workload = users
                .map(u => {
                  const assigned = reports.filter(r => r.assigned_to === u.id)
                  const active = assigned.filter(r => r.status !== 'risolta').length
                  const resolved = assigned.filter(r => r.status === 'risolta').length
                  const critical = assigned.filter(r => r.status !== 'risolta' && (r.severity === 'critica' || r.severity === 'alta')).length
                  return { ...u, active, resolved, total: assigned.length, critical }
                })
                .filter(u => u.total > 0)
                .sort((a, b) => b.active - a.active)

              const maxActive = Math.max(...workload.map(u => u.active), 1)

              if (workload.length === 0) {
                return <p className="text-sm text-faint text-center py-6">Nessuna segnalazione assegnata</p>
              }

              return workload.map(u => {
                const roleIcon = u.role === 'tecnico' ? '🔧' : u.role === 'admin' ? '👔' : '👷'
                const roleColor = u.role === 'tecnico' ? '#22c55e' : u.role === 'admin' ? '#f59e0b' : '#3b82f6'
                const loadPct = (u.active / maxActive) * 100
                const isOverloaded = u.active >= 4

                return (
                  <div key={u.id} className="p-3 bg-surface-2 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                        style={{ background: roleColor + '18' }}>
                        {roleIcon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{u.name}</p>
                        <p className="text-[11px] text-faint capitalize">{u.role}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {u.critical > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">{u.critical} urg</span>
                        )}
                        <span className={`text-lg font-bold ${isOverloaded ? 'text-red-400' : u.active > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {u.active}
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${loadPct}%`,
                            background: isOverloaded ? '#ef4444' : u.active > 2 ? '#f59e0b' : '#22c55e'
                          }} />
                      </div>
                      <span className="text-[10px] text-faint w-16 text-right">{u.resolved} risolte</span>
                    </div>
                  </div>
                )
              })
            })()}
          </div>

          <div className="mt-5 pt-4 border-t border-token grid grid-cols-3 gap-2">
            {[
              { label: 'Admin', count: users.filter(u => u.role === 'admin').length, color: '#f59e0b' },
              { label: 'Tecnici', count: users.filter(u => u.role === 'tecnico').length, color: '#22c55e' },
              { label: 'Operatori', count: users.filter(u => u.role === 'operatore').length, color: '#3b82f6' },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center p-2 bg-surface-1 rounded-lg">
                <p className="text-lg font-bold text-themed">{count}</p>
                <p className="text-[10px] text-faint uppercase">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom — Recent + Quick actions */}
      <div className="grid grid-cols-5 gap-5">
        {/* Real Activity Feed — takes 3 cols */}
        <div className="col-span-3 card-elevated rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Attività Recente</h3>
            <button onClick={() => onNavigate?.('reports')} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5">
              Vedi tutte <ChevronRight size={12} />
            </button>
          </div>

          {activities.length > 0 ? (
            <div className="space-y-1">
              {activities.slice(0, 12).map((act, i) => {
                const config = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.created
                const Icon = config.icon
                return (
                  <div key={act.id || i} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: config.color + '18' }}>
                      <Icon size={14} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-white truncate">
                        {act.type === 'status_change' && act.to_status
                          ? `Stato → ${STATUS[act.to_status]?.label || act.to_status}`
                          : act.type === 'comment'
                          ? `"${(act.detail || 'Commento').slice(0, 50)}"`
                          : act.type === 'quick_created'
                          ? 'Report rapido creato'
                          : 'Segnalazione creata'}
                      </p>
                      <p className="text-xs text-faint">{act.user_name || '—'}</p>
                    </div>
                    {act.type === 'status_change' && act.to_status && (
                      <Badge {...(STATUS[act.to_status] || {})} />
                    )}
                    <span className="text-sm text-faint shrink-0 w-20 text-right">{timeAgo(act.created_at)}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-1">
              {reports.slice(0, 10).map((r) => {
                const st = STATUS[r.status] || STATUS.aperta
                const sev = SEVERITY[r.severity] || SEVERITY.media
                return (
                  <div key={r.id} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => onNavigate?.('reports')}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
                    <span className="text-[15px] text-white flex-1 truncate">{r.title}</span>
                    <Badge {...sev} />
                    <span className="text-sm text-faint shrink-0 w-20 text-right">{timeAgo(r.created_at)}</span>
                  </div>
                )
              })}
              {reports.length === 0 && <p className="text-center py-10 text-faint">Nessuna segnalazione registrata</p>}
            </div>
          )}
        </div>

        {/* Quick stats — takes 2 cols */}
        <div className="col-span-2 space-y-5">
          {/* Segnalazioni da assegnare */}
          <div className={`border rounded-2xl p-5 ${nonAssegnate > 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface-1/80 border-token'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nonAssegnate > 0 ? 'bg-amber-500/20' : 'bg-surface-2'}`}>
                <AlertTriangle size={18} className={nonAssegnate > 0 ? 'text-amber-400' : 'text-faint'} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{nonAssegnate}</p>
                <p className="text-sm text-muted">Da assegnare</p>
              </div>
            </div>
            {nonAssegnate > 0 && (
              <button onClick={() => onNavigate?.('reports')}
                className="w-full py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-sm font-semibold rounded-xl transition-colors">
                Assegna ora →
              </button>
            )}
          </div>

          {/* Stato Manutenzioni Programmate */}
          <div className="card-elevated rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">Manutenzioni</h3>
              <button onClick={() => onNavigate?.('maintenance')} className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5">
                Gestisci <ChevronRight size={12} />
              </button>
            </div>

            {(() => {
              const overdue = maintenanceTasks.filter(t => t.light.color === '#ef4444')
              const warning = maintenanceTasks.filter(t => t.light.color === '#f59e0b')
              const ok = maintenanceTasks.filter(t => t.light.color === '#22c55e')

              if (maintenanceTasks.length === 0) {
                return <p className="text-sm text-faint text-center py-4">Nessun piano configurato</p>
              }

              return (
                <>
                  {/* Summary bars */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className={`rounded-xl p-2.5 text-center ${overdue.length > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-surface-2'}`}>
                      <p className={`text-xl font-bold ${overdue.length > 0 ? 'text-red-400' : 'text-white'}`}>{overdue.length}</p>
                      <p className="text-[10px] text-faint">Scadute</p>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center ${warning.length > 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-surface-2'}`}>
                      <p className={`text-xl font-bold ${warning.length > 0 ? 'text-amber-400' : 'text-white'}`}>{warning.length}</p>
                      <p className="text-[10px] text-faint">In scadenza</p>
                    </div>
                    <div className="bg-surface-2 rounded-xl p-2.5 text-center">
                      <p className="text-xl font-bold text-emerald-400">{ok.length}</p>
                      <p className="text-[10px] text-faint">In regola</p>
                    </div>
                  </div>

                  {/* Urgent tasks list */}
                  {[...overdue, ...warning].length > 0 ? (
                    <div className="space-y-2">
                      {[...overdue, ...warning].slice(0, 5).map((task, i) => (
                        <div key={`${task.plan.id}-${i}`} className="flex items-center gap-3 p-2.5 bg-surface-2 rounded-xl">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: task.light.color, boxShadow: `0 0 8px ${task.light.color}40` }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-themed font-medium truncate">{task.plan.name}</p>
                            <p className="text-[11px] text-faint truncate">
                              <Cog size={10} className="inline mr-1" />{task.machine.name}
                              {task.plan.assigned_to_name && <> · 👤 {task.plan.assigned_to_name}</>}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ background: task.light.color + '18', color: task.light.color }}>
                            {task.light.label}
                          </span>
                        </div>
                      ))}
                      {[...overdue, ...warning].length > 5 && (
                        <p className="text-xs text-faint text-center py-1">+ {[...overdue, ...warning].length - 5} altre</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                      <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                      <p className="text-sm text-emerald-400 font-medium">Tutte le manutenzioni in regola</p>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
