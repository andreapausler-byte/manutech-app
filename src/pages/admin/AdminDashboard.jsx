import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useKPIStats } from '../../hooks/useKPIStats'
import { AlertTriangle } from 'lucide-react'
import HeroKPIs from './dashboard/HeroKPIs'
import MaintenanceAlertBanner from './dashboard/MaintenanceAlertBanner'
import TimeKPIs from './dashboard/TimeKPIs'
import ResolutionChart from './dashboard/ResolutionChart'
import TeamWorkload from './dashboard/TeamWorkload'
import ActivityFeed from './dashboard/ActivityFeed'
import MaintenanceSummary from './dashboard/MaintenanceSummary'

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
  const [maintenanceTasks, setMaintenanceTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const kpi = useKPIStats(reports)

  useEffect(() => {
    async function loadAll() {
      const [r, u, a, m, plans, logs] = await Promise.all([
        db.getReports(), db.getUsers(), db.getAllActivities(20), db.getMachines(),
        db.getAllMaintenancePlans(), db.getAllMaintenanceLogs()
      ])
      setReports(r); setUsers(u); setActivities(a); setMachines(m)

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
  const criticheNonAssegnate = reports.filter(r => r.severity === 'critica' && r.status === 'aperta' && !r.assigned_to).length

  if (loading) return null

  return (
    <div className="space-y-6 stagger-children">
      {criticheNonAssegnate > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl p-4 animate-fade-in"
          style={{
            background: 'rgba(255, 71, 87, 0.08)',
            border: '1px solid rgba(255, 71, 87, 0.3)',
            animation: 'fadeIn 0.3s ease, criticalPulse 2s ease-in-out infinite',
          }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255, 71, 87, 0.15)' }}>
            <AlertTriangle size={20} style={{ color: '#ff4757' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#ff4757' }}>
              {criticheNonAssegnate} segnalazion{criticheNonAssegnate === 1 ? 'e critica non assegnata' : 'i critiche non assegnate'}
            </p>
            <p className="text-xs text-muted mt-0.5">Richiedono assegnazione immediata</p>
          </div>
        </div>
      )}
      <HeroKPIs stats={stats} resolveRate={resolveRate} urgenti={urgenti} nonAssegnate={nonAssegnate} />
      <MaintenanceAlertBanner maintenanceTasks={maintenanceTasks} onNavigate={onNavigate} />
      <TimeKPIs kpi={kpi} />

      <div className="grid grid-cols-3 gap-5">
        <ResolutionChart reports={reports} stats={stats} resolveRate={resolveRate} />
        <TeamWorkload users={users} reports={reports} onNavigate={onNavigate} />
      </div>

      <div className="grid grid-cols-5 gap-5">
        <ActivityFeed activities={activities} reports={reports} onNavigate={onNavigate} />
        <MaintenanceSummary maintenanceTasks={maintenanceTasks} nonAssegnate={nonAssegnate} reports={reports} onNavigate={onNavigate} />
      </div>
    </div>
  )
}
