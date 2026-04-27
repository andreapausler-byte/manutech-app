import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { useKPIStats } from '../../hooks/useKPIStats'
import PageHeader from '../../components/layout/PageHeader'
import { findNavItem } from '../../lib/adminNav'
import HeroKPIs from './dashboard/HeroKPIs'
import MaintenanceAlertBanner from './dashboard/MaintenanceAlertBanner'
import TimeKPIs from './dashboard/TimeKPIs'
import ResolutionChart from './dashboard/ResolutionChart'
import TeamWorkload from './dashboard/TeamWorkload'
import ActivityFeed from './dashboard/ActivityFeed'
import MaintenanceSummary from './dashboard/MaintenanceSummary'

const NAV_ITEM = findNavItem('dashboard')

const daysBetween = (d1, d2) => Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))

function getTrafficLight(plan, lastLog) {
  const lastDate = lastLog?.performed_at || plan.created_at
  const daysSince = daysBetween(lastDate, new Date())
  const daysLeft = plan.frequency_days - daysSince
  if (daysLeft <= 0) return { label: `Scaduta da ${Math.abs(daysLeft)}g`, color: '#ff5c5c', daysLeft }
  if (daysLeft <= 7) return { label: `Scade tra ${daysLeft}g`, color: '#ffaa2c', daysLeft }
  return { label: `Tra ${daysLeft}g`, color: '#3ddc84', daysLeft }
}

export default function AdminDashboard({ onNavigate }) {
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [activities, setActivities] = useState([])
  const [maintenanceTasks, setMaintenanceTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const kpi = useKPIStats(reports)

  useEffect(() => {
    async function loadAll() {
      const [r, u, a, plans, lastLogByPlan] = await Promise.all([
        db.getReports(), db.getUsers(), db.getAllActivities(20),
        db.getAllMaintenancePlansWithMachine(), db.getLastLogPerPlan()
      ])
      setReports(r); setUsers(u); setActivities(a)

      const tasks = plans.map(plan => {
        const machine = plan.machine
        if (!machine) return null
        const lastLog = lastLogByPlan[plan.id] || null
        const light = getTrafficLight(plan, lastLog)
        return { plan, machine, lastLog, light }
      }).filter(Boolean)

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

  if (loading) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="stagger-children">
      <PageHeader title={NAV_ITEM.label} description={NAV_ITEM.desc} />

      {/* Row 1: Hero KPIs */}
      <HeroKPIs stats={stats} resolveRate={resolveRate} urgenti={urgenti} nonAssegnate={nonAssegnate} />

      {/* Row 2: Maintenance Alert (conditional) */}
      <MaintenanceAlertBanner maintenanceTasks={maintenanceTasks} onNavigate={onNavigate} />

      {/* Row 3: Time KPIs */}
      <TimeKPIs kpi={kpi} />

      {/* Row 4: Charts + Team — 2 col bilanciato */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <ResolutionChart reports={reports} stats={stats} resolveRate={resolveRate} />
        <TeamWorkload users={users} reports={reports} onNavigate={onNavigate} />
      </div>

      {/* Row 5: Activity + Maintenance — full width */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <ActivityFeed activities={activities} reports={reports} onNavigate={onNavigate} />
        <MaintenanceSummary maintenanceTasks={maintenanceTasks} nonAssegnate={nonAssegnate} onNavigate={onNavigate} />
      </div>
    </div>
  )
}
