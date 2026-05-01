import { supabase } from './_client'
import { KEYS, getStore } from './_demoStore'

// Forma del payload restituito da get_optimization_dashboard():
// {
//   mttr_hours, mttr_hours_prev,
//   mtbf_days, mtbf_days_prev,
//   preventive_ratio_pct, preventive_ratio_prev_pct,
//   preventive_count, corrective_count,
//   open_critical, open_high, overdue_plans,
//   total_machines,
//   top_machines: [{ machine_id, machine_name, incident_count, downtime_hours, open_count }],
//   top_root_causes: [{ cause, count }],
//   trend_30d: { corrective_now, corrective_prev, preventive_now, preventive_prev },
//   window_days: 90,
//   generated_at,
// }

const MS_HOUR = 1000 * 60 * 60
const MS_DAY = MS_HOUR * 24

function inWindow(dateStr, fromMs, toMs) {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return t >= fromMs && t < toMs
}

// Fallback demo: ricalcola i KPI dai dati in localStorage.
// È un'approssimazione (i campi closed_at potrebbero mancare in demo) ma
// permette di vedere la pagina anche senza Supabase configurato.
function computeDashboardDemo() {
  const now = Date.now()
  const w_start = now - 90 * MS_DAY
  const w_prev = now - 180 * MS_DAY

  const reports = getStore(KEYS.reports)
  const machines = getStore(KEYS.machines)
  const logsAll = JSON.parse(localStorage.getItem('manutech_maintenance_logs') || '[]')

  const closedInWindow = reports.filter(r => r.closed_at && inWindow(r.closed_at, w_start, now))
  const closedInPrev = reports.filter(r => r.closed_at && inWindow(r.closed_at, w_prev, w_start))

  const avgHours = (list) => {
    if (!list.length) return 0
    const sum = list.reduce((s, r) => s + (new Date(r.closed_at) - new Date(r.created_at)) / MS_HOUR, 0)
    return sum / list.length
  }

  const mttr_hours = avgHours(closedInWindow)
  const mttr_hours_prev = avgHours(closedInPrev)

  // MTBF: gap medio tra reports correttivi consecutivi per macchina
  const computeMTBF = (from, to) => {
    const byMachine = {}
    for (const r of reports) {
      if (r.type !== 'correttiva' || !r.machine_id || !r.closed_at) continue
      if (!inWindow(r.closed_at, from, to)) continue
      ;(byMachine[r.machine_id] = byMachine[r.machine_id] || []).push(r)
    }
    const gaps = []
    for (const list of Object.values(byMachine)) {
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      for (let i = 1; i < list.length; i++) {
        const g = (new Date(list[i].created_at) - new Date(list[i - 1].closed_at)) / MS_DAY
        if (g > 0) gaps.push(g)
      }
    }
    return gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0
  }
  const mtbf_days = computeMTBF(w_start, now)
  const mtbf_days_prev = computeMTBF(w_prev, w_start)

  const corrInWindow = reports.filter(r => r.type === 'correttiva' && inWindow(r.created_at, w_start, now))
  const corrInPrev = reports.filter(r => r.type === 'correttiva' && inWindow(r.created_at, w_prev, w_start))
  const prevInWindow = logsAll.filter(l => inWindow(l.performed_at, w_start, now))
  const prevInPrev = logsAll.filter(l => inWindow(l.performed_at, w_prev, w_start))

  const ratio = (p, c) => (p + c) > 0 ? (p / (p + c)) * 100 : 0

  // Top macchine per ore-fermo (chiuse + ancora aperte fino a ora)
  const downtimeByMachine = {}
  for (const r of reports) {
    if (!r.machine_id || !inWindow(r.created_at, w_start, now)) continue
    const end = r.closed_at ? new Date(r.closed_at).getTime() : now
    const hours = Math.max(0, (end - new Date(r.created_at).getTime()) / MS_HOUR)
    const m = downtimeByMachine[r.machine_id] = downtimeByMachine[r.machine_id] || {
      machine_id: r.machine_id,
      machine_name: machines.find(m => m.id === r.machine_id)?.name || '—',
      downtime_hours: 0, incident_count: 0, open_count: 0,
    }
    m.downtime_hours += hours
    m.incident_count++
    if (!['risolta', 'chiuso'].includes(r.status)) m.open_count++
  }
  const top_machines = Object.values(downtimeByMachine)
    .map(m => ({ ...m, downtime_hours: Math.round(m.downtime_hours * 10) / 10 }))
    .sort((a, b) => b.downtime_hours - a.downtime_hours)
    .slice(0, 5)

  // Top cause radice
  const causes = {}
  for (const r of reports) {
    const c = r.closure_root_cause?.trim()
    if (!c) continue
    if (!inWindow(r.closed_at, w_start, now)) continue
    causes[c] = (causes[c] || 0) + 1
  }
  const top_root_causes = Object.entries(causes)
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Trend 30gg
  const t30 = now - 30 * MS_DAY
  const t60 = now - 60 * MS_DAY
  const trend_30d = {
    corrective_now: reports.filter(r => r.type === 'correttiva' && inWindow(r.created_at, t30, now)).length,
    corrective_prev: reports.filter(r => r.type === 'correttiva' && inWindow(r.created_at, t60, t30)).length,
    preventive_now: logsAll.filter(l => inWindow(l.performed_at, t30, now)).length,
    preventive_prev: logsAll.filter(l => inWindow(l.performed_at, t60, t30)).length,
  }

  // Aperti per severità + piani in ritardo (semplificato in demo)
  const isOpen = (r) => !['risolta', 'chiuso'].includes(r.status)
  const open_critical = reports.filter(r => r.severity === 'critica' && isOpen(r)).length
  const open_high = reports.filter(r => r.severity === 'alta' && isOpen(r)).length

  return {
    mttr_hours: Math.round(mttr_hours * 10) / 10,
    mttr_hours_prev: Math.round(mttr_hours_prev * 10) / 10,
    mtbf_days: Math.round(mtbf_days * 10) / 10,
    mtbf_days_prev: Math.round(mtbf_days_prev * 10) / 10,
    preventive_ratio_pct: Math.round(ratio(prevInWindow.length, corrInWindow.length) * 10) / 10,
    preventive_ratio_prev_pct: Math.round(ratio(prevInPrev.length, corrInPrev.length) * 10) / 10,
    preventive_count: prevInWindow.length,
    corrective_count: corrInWindow.length,
    open_critical,
    open_high,
    overdue_plans: 0,
    total_machines: machines.length,
    top_machines,
    top_root_causes,
    trend_30d,
    window_days: 90,
    generated_at: new Date().toISOString(),
  }
}

export const analytics = {
  async getOptimizationDashboard() {
    if (supabase) {
      const { data, error } = await supabase.rpc('get_optimization_dashboard')
      if (error) throw error
      return data
    }
    return computeDashboardDemo()
  },
}
