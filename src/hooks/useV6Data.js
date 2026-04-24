/**
 * useV6Data — Adapter dati reali → view-model v6 Amarcord
 *
 * Aggrega reports + machines + users e produce le shape consumate dalle
 * pagine v6 (CommandCenter, TicketBoard, TicketDetail): tickets, alerts,
 * machines arricchite con risk/status, KPI produzione.
 *
 * Le metriche di rischio sono euristiche basate sullo storico segnalazioni
 * (non c'è ancora un motore AI predittivo). Gli alert sono derivati da
 * frequenza di ticket recenti + severità aperte.
 */

import { useState, useEffect, useMemo } from 'react'
import { db } from '../lib/supabase'
import { timeAgo } from '../lib/constants'

const DAY_MS = 86400000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS

// ── Mapping severità → priorità v6 ─────────────────────────────
function priorityFromSeverity(severity) {
  if (severity === 'critica' || severity === 'alta') return 'alta'
  if (severity === 'media') return 'media'
  return 'bassa'
}

// ── Mapping stato segnalazione → stato ticket v6 ────────────────
function ticketStatusFromReport(status) {
  if (status === 'risolta' || status === 'chiuso') return 'chiuso'
  if (status === 'in_lavorazione' || status === 'in_attesa_ricambi') return 'in_corso'
  return 'aperto'
}

// ── Categoria v6 da report type ─────────────────────────────────
function categoryFromType(type) {
  if (type === 'correttiva') return 'guasto'
  if (type === 'preventiva') return 'manutenzione'
  if (type === 'ispezione') return 'anomalia'
  if (type === 'migliorativa') return 'altro'
  return 'guasto'
}

// ── Impatto stimato €/h da severità ─────────────────────────────
// Euristica: finché non c'è un campo dedicato sulla segnalazione.
function impactFromSeverity(severity, status) {
  if (status === 'chiuso' || status === 'risolta') return 0
  if (severity === 'critica') return 480
  if (severity === 'alta') return 300
  if (severity === 'media') return 120
  return 0
}

// ── ID compatto per UI stile "TK-2847" ─────────────────────────
function shortTicketId(rawId) {
  if (!rawId) return 'TK-?'
  const s = String(rawId)
  const last = s.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()
  return `TK-${last || 'XXXX'}`
}

// ── Build tickets view-model ────────────────────────────────────
function buildTickets(reports, machinesById) {
  return reports.map(r => {
    const m = r.machine_id ? machinesById[r.machine_id] : null
    const status = ticketStatusFromReport(r.status)
    return {
      id: shortTicketId(r.id),
      rawId: r.id,
      status,
      priority: priorityFromSeverity(r.severity),
      title: r.title || '(senza titolo)',
      machineId: r.machine_id || null,
      machineCode: m?.code || '—',
      machineName: m?.name || '—',
      machineArea: m?.area || '—',
      category: categoryFromType(r.type),
      ago: timeAgo(r.updated_at || r.created_at),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      techName: r.assigned_to_user?.name || null,
      operatorName: r.created_by_user?.name || r.created_by_name || '—',
      impactEurH: impactFromSeverity(r.severity, status),
      severity: r.severity,
      description: r.description || '',
      reportStatus: r.status,
    }
  })
}

// ── Arricchisce ogni macchina con risk/status/mtbf ──────────────
function buildMachines(machines, reports) {
  const now = Date.now()
  const openByMachine = {}
  const recentByMachine = {}
  const lastIncidentByMachine = {}
  const resolvedByMachine = {}

  reports.forEach(r => {
    if (!r.machine_id) return
    const t = new Date(r.updated_at || r.created_at).getTime()
    const createdT = new Date(r.created_at).getTime()
    const isOpen = !['risolta', 'chiuso'].includes(r.status)

    if (isOpen) {
      openByMachine[r.machine_id] = (openByMachine[r.machine_id] || 0) + 1
    } else {
      resolvedByMachine[r.machine_id] = (resolvedByMachine[r.machine_id] || 0) + 1
    }

    if (createdT > now - MONTH_MS) {
      recentByMachine[r.machine_id] = (recentByMachine[r.machine_id] || 0) + 1
    }

    if (!lastIncidentByMachine[r.machine_id] || t > lastIncidentByMachine[r.machine_id]) {
      lastIncidentByMachine[r.machine_id] = t
    }
  })

  return machines.map(m => {
    const open = openByMachine[m.id] || 0
    const recent = recentByMachine[m.id] || 0
    const resolved = resolvedByMachine[m.id] || 0
    // Risk euristico: aperti pesano 25, recenti 8, max 100.
    const risk = Math.min(100, Math.round(open * 25 + recent * 8))
    const status = risk >= 70 ? 'at_risk' : risk >= 40 ? 'attention' : 'ok'

    const lastT = lastIncidentByMachine[m.id]
    const lastIncident = lastT ? timeAgo(new Date(lastT).toISOString()) : '—'

    // Uptime 7g stimato: 100 - (open × 4), clip a [70, 100].
    const uptime7d = Math.max(70, Math.min(100, 100 - open * 4))

    // MTBF stimato in ore: approssimazione grossolana su resolved ultimo anno.
    const mtbf = resolved > 0 ? Math.round((365 * 24) / Math.max(1, resolved)) : 720

    return {
      id: m.id,
      code: m.code || m.name?.slice(0, 6) || 'M-?',
      name: m.name || '(senza nome)',
      area: m.area || 'Altro',
      status,
      risk,
      mtbf,
      lastIncident,
      uptime7d,
      openCount: open,
      recentCount: recent,
    }
  })
}

// ── Alert derivati: macchine con rischio maggiore ───────────────
// Non è vera AI predittiva: è storico recente pesato. L'etichetta nelle
// UI chiarisce che è analisi storica.
function buildAlerts(enrichedMachines, reports) {
  const now = Date.now()
  const reportsByMachine = {}
  reports.forEach(r => {
    if (!r.machine_id) return
    const t = new Date(r.created_at).getTime()
    if (t > now - MONTH_MS) {
      (reportsByMachine[r.machine_id] ??= []).push(r)
    }
  })

  return enrichedMachines
    .filter(m => m.risk >= 40)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 3)
    .map((m, idx) => {
      const rs = reportsByMachine[m.id] || []
      const byType = {}
      rs.forEach(r => { byType[r.type || 'altro'] = (byType[r.type || 'altro'] || 0) + 1 })
      const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]
      const sample = rs[0]

      return {
        id: `al-${m.id}`,
        machineId: m.id,
        risk: m.risk,
        window: m.risk >= 70 ? '72 h' : m.risk >= 55 ? '5 g' : '7 g',
        pattern: sample?.title || (topType ? `Ricorrenza: ${topType[0]}` : 'Trend anomalo'),
        confidence: Math.min(0.95, 0.55 + m.risk / 200),
        evidence: `${m.openCount} ticket aperti · ${m.recentCount} segnalazioni negli ultimi 30g`,
        action: m.risk >= 70
          ? 'Ispezione urgente + ticket programmato'
          : m.risk >= 55
          ? 'Pianificare verifica tecnico'
          : 'Monitorare trend',
        rank: idx + 1,
      }
    })
}

// ── KPI produzione calcolati dai reports ────────────────────────
function buildKpi(reports, tickets) {
  const now = Date.now()
  const open = tickets.filter(t => t.status !== 'chiuso')

  const closedThisWeek = reports.filter(r =>
    (r.status === 'risolta' || r.status === 'chiuso') &&
    new Date(r.updated_at || r.created_at).getTime() > now - WEEK_MS
  ).length
  const closedLastWeek = reports.filter(r => {
    if (r.status !== 'risolta' && r.status !== 'chiuso') return false
    const t = new Date(r.updated_at || r.created_at).getTime()
    return t > now - 2 * WEEK_MS && t <= now - WEEK_MS
  }).length

  const openedThisWeek = reports.filter(r =>
    new Date(r.created_at).getTime() > now - WEEK_MS
  ).length
  const openedLastWeek = reports.filter(r => {
    const t = new Date(r.created_at).getTime()
    return t > now - 2 * WEEK_MS && t <= now - WEEK_MS
  }).length

  // MTTR medio in minuti dai report risolti
  const resolved = reports.filter(r =>
    r.status === 'risolta' && r.created_at && r.updated_at
  )
  const resolutionHours = resolved.map(r => {
    const a = new Date(r.created_at).getTime()
    const b = new Date(r.updated_at).getTime()
    return (b - a) / 3600000
  }).filter(h => h > 0 && h < 24 * 365)
  const mttrHours = resolutionHours.length
    ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
    : 0
  const mttrMin = Math.round(mttrHours * 60)

  // MTBF: ore medie tra report risolti nell'ultimo anno (grossolana)
  const YEAR_MS = 365 * DAY_MS
  const yearResolved = reports.filter(r =>
    (r.status === 'risolta' || r.status === 'chiuso') &&
    new Date(r.updated_at || r.created_at).getTime() > now - YEAR_MS
  ).length
  const mtbf = yearResolved > 0 ? Math.round((365 * 24) / yearResolved) : 720

  // Uptime stimato come 100 - (aperti/totali) * 15, clip
  const uptime = Math.max(85, Math.min(100, 100 - (open.length * 1.5))).toFixed(1)

  const lostEurToday = open.reduce((acc, t) => acc + (t.impactEurH || 0), 0)

  return {
    uptime: parseFloat(uptime),
    uptimeDelta: 0.0,
    mttr: mttrMin,
    mttrDelta: 0,
    mtbf,
    mtbfDelta: 0,
    lostEurToday,
    lostEurDelta: 0,
    openTickets: open.length,
    openTicketsDelta: openedThisWeek - openedLastWeek,
    closedWeek: closedThisWeek,
    closedWeekDelta: closedThisWeek - closedLastWeek,
  }
}

// ── Hook principale ─────────────────────────────────────────────
export function useV6Data() {
  const [reports, setReports] = useState([])
  const [rawMachines, setRawMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        setLoading(true)
        const [r, m] = await Promise.all([
          db.getReports(),
          db.getMachines(),
        ])
        if (!alive) return
        setReports(r || [])
        setRawMachines(m || [])
        setError(null)
      } catch (e) {
        if (!alive) return
        setError(e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [reloadTick])

  const view = useMemo(() => {
    const machinesById = Object.fromEntries(rawMachines.map(m => [m.id, m]))
    const tickets = buildTickets(reports, machinesById)
    const enrichedMachines = buildMachines(rawMachines, reports)
    const alerts = buildAlerts(enrichedMachines, reports)
    const kpi = buildKpi(reports, tickets)
    const ticketsById = Object.fromEntries(tickets.map(t => [t.id, t]))
    const ticketsByRawId = Object.fromEntries(tickets.map(t => [t.rawId, t]))
    const enrichedById = Object.fromEntries(enrichedMachines.map(m => [m.id, m]))

    // Split ticket buckets con cutoff su "chiusi ultimi 7g".
    const recentCutoff = Date.now() - WEEK_MS
    const buckets = {
      aperto: tickets.filter(t => t.status === 'aperto'),
      in_corso: tickets.filter(t => t.status === 'in_corso'),
      chiuso: tickets.filter(t =>
        t.status === 'chiuso' &&
        t.updatedAt && new Date(t.updatedAt).getTime() > recentCutoff
      ),
    }

    return {
      machines: enrichedMachines,
      tickets,
      ticketBuckets: buckets,
      alerts,
      kpi,
      machineById: (id) => enrichedById[id] || null,
      ticketById: (id) => ticketsById[id] || ticketsByRawId[id] || null,
    }
  }, [reports, rawMachines])

  return {
    ...view,
    loading,
    error,
    reload: () => setReloadTick(t => t + 1),
  }
}
