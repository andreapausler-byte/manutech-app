/**
 * useKPIStats — Calcolo KPI avanzati per dashboard admin e mobile
 * 
 * Metriche:
 *  - Tempo medio risoluzione (in ore)
 *  - Trend settimanale (ultimi 7 giorni vs precedenti)
 *  - Report per giorno della settimana
 *  - Performance per operatore
 *  - Top macchinari problematici
 */

import { useMemo } from 'react'

export function useKPIStats(reports) {
  return useMemo(() => {
    if (!reports || reports.length === 0) {
      return {
        avgResolutionHours: 0,
        avgResolutionLabel: '—',
        medianResolutionHours: 0,
        weeklyTrend: { current: 0, previous: 0, change: 0 },
        dailyDistribution: new Array(7).fill(0),
        reportsThisWeek: 0,
        reportsLastWeek: 0,
        quickReportPct: 0,
        topOperators: [],
        topMachines: [],
        severityTrend: [],
        resolvedThisWeek: 0,
      }
    }

    const now = Date.now()
    const DAY = 86400000
    const WEEK = 7 * DAY

    // ── Tempo medio risoluzione ──
    const resolved = reports.filter(r => r.status === 'risolta' && r.created_at && r.updated_at)
    const resolutionTimes = resolved.map(r => {
      const created = new Date(r.created_at).getTime()
      const updated = new Date(r.updated_at).getTime()
      return (updated - created) / 3600000 // in ore
    }).filter(h => h > 0 && h < 8760) // < 1 anno

    const avgResolutionHours = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0

    const medianResolutionHours = resolutionTimes.length > 0
      ? resolutionTimes.sort((a, b) => a - b)[Math.floor(resolutionTimes.length / 2)]
      : 0

    const avgResolutionLabel = formatDuration(avgResolutionHours)

    // ── Trend settimanale ──
    const thisWeekStart = now - WEEK
    const lastWeekStart = now - 2 * WEEK

    const reportsThisWeek = reports.filter(r => new Date(r.created_at).getTime() > thisWeekStart).length
    const reportsLastWeek = reports.filter(r => {
      const t = new Date(r.created_at).getTime()
      return t > lastWeekStart && t <= thisWeekStart
    }).length

    const resolvedThisWeek = reports.filter(r =>
      r.status === 'risolta' && r.updated_at && new Date(r.updated_at).getTime() > thisWeekStart
    ).length

    const weeklyChange = reportsLastWeek > 0
      ? Math.round(((reportsThisWeek - reportsLastWeek) / reportsLastWeek) * 100)
      : reportsThisWeek > 0 ? 100 : 0

    // ── Distribuzione per giorno (ultimi 7 giorni) ──
    const dailyDistribution = new Array(7).fill(0)
    const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    reports.forEach(r => {
      const d = new Date(r.created_at)
      if (d.getTime() > thisWeekStart) {
        const dayIndex = (d.getDay() + 6) % 7 // Lunedì = 0
        dailyDistribution[dayIndex]++
      }
    })

    // ── Quick report % ──
    const quickCount = reports.filter(r => r.is_quick).length
    const quickReportPct = reports.length > 0 ? Math.round((quickCount / reports.length) * 100) : 0

    // ── Top operatori (per volume) ──
    const operatorMap = {}
    reports.forEach(r => {
      if (!r.created_by_name) return
      if (!operatorMap[r.created_by_name]) {
        operatorMap[r.created_by_name] = { name: r.created_by_name, total: 0, resolved: 0, critical: 0 }
      }
      operatorMap[r.created_by_name].total++
      if (r.status === 'risolta') operatorMap[r.created_by_name].resolved++
      if (r.severity === 'critica') operatorMap[r.created_by_name].critical++
    })
    const topOperators = Object.values(operatorMap).sort((a, b) => b.total - a.total).slice(0, 5)

    // ── Top macchinari (per report attivi) ──
    const machineMap = {}
    reports.filter(r => r.machine && r.status !== 'risolta').forEach(r => {
      machineMap[r.machine] = (machineMap[r.machine] || 0) + 1
    })
    const topMachines = Object.entries(machineMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    // ── Trend severità (ultimi 4 settimane) ──
    const severityTrend = []
    for (let i = 3; i >= 0; i--) {
      const weekStart = now - (i + 1) * WEEK
      const weekEnd = now - i * WEEK
      const weekReports = reports.filter(r => {
        const t = new Date(r.created_at).getTime()
        return t > weekStart && t <= weekEnd
      })
      severityTrend.push({
        week: i === 0 ? 'Questa' : i === 1 ? 'Scorsa' : `${i + 1} sett. fa`,
        total: weekReports.length,
        critica: weekReports.filter(r => r.severity === 'critica').length,
        alta: weekReports.filter(r => r.severity === 'alta').length,
      })
    }

    return {
      avgResolutionHours,
      avgResolutionLabel,
      medianResolutionHours,
      weeklyTrend: { current: reportsThisWeek, previous: reportsLastWeek, change: weeklyChange },
      dailyDistribution,
      dayLabels,
      reportsThisWeek,
      reportsLastWeek,
      quickReportPct,
      topOperators,
      topMachines,
      severityTrend,
      resolvedThisWeek,
    }
  }, [reports])
}

function formatDuration(hours) {
  if (hours === 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const remaining = Math.round(hours % 24)
  return remaining > 0 ? `${days}g ${remaining}h` : `${days}g`
}
