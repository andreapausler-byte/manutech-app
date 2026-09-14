// useMyDay — il mio lavoro di oggi, da tre sorgenti diverse in una lista sola.
//
// Segnalazioni assegnate, interventi in agenda e manutenzioni programmate
// vivono in tre viste separate perché sono tre tabelle separate. Ma la domanda
// che uno si fa la mattina è una sola — "cosa devo fare oggi, e chi sta
// aspettando una mia risposta?" — e per rispondere oggi bisogna aprire tre
// schermate e tenere a mente il risultato.
//
// Questo hook le interroga in parallelo e le riordina per **urgenza**, non per
// tipo: un intervento in ritardo e un ticket critico fermo stanno nella stessa
// sezione, perché sono la stessa cosa (qualcosa che doveva già essere fatto).
//
// Sezioni, in ordine di lettura:
//   late       In ritardo        — doveva già essere fatto
//   today      Oggi              — è per oggi, o ci stai lavorando adesso
//   update     Da aggiornare     — qualcuno aspetta una risposta da te
//   soon       In arrivo         — i prossimi giorni
//   unassigned Senza nessuno     — solo admin: la coda che non è di nessuno
//
// Nessuna query nuova e nessuna RPC: usa le funzioni db già esistenti, quindi
// il fallback demo mode è quello che hanno loro (le manutenzioni programmate
// in demo mode non esistono — `getAllMaintenancePlansWithMachine` torna []).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../lib/supabase'
import { TERMINAL_STATUSES } from '../lib/constants'
import { getTrafficLight } from '../lib/maintenanceStatus'
import { ASSIGNEE_MINE, matchesAssignee } from '../lib/assigneeFilter'

const DAY_MS = 24 * 60 * 60 * 1000

// Stessa soglia del banner "ferme da troppo" in AdminReports: 3 settimane
// senza un movimento e il ticket ha smesso di camminare da solo.
export const MY_DAY_STALE_DAYS = 21

// Quanto indietro cercare interventi che dovevano già essere fatti. Oltre il
// mese un "in ritardo" non è più un promemoria, è un problema di altra natura.
const LOOKBACK_DAYS = 30

export const MY_DAY_SECTIONS = [
  { key: 'late', label: 'In ritardo', hint: 'Doveva già essere fatto', color: '#ef4444' },
  { key: 'today', label: 'Oggi', hint: 'Il lavoro di oggi', color: 'var(--color-primary)' },
  { key: 'update', label: 'Da aggiornare', hint: 'Qualcuno aspetta una risposta', color: '#f59e0b' },
  { key: 'soon', label: 'In arrivo', hint: 'I prossimi giorni', color: '#06b6d4' },
  { key: 'unassigned', label: 'Senza nessuno', hint: 'Da assegnare a qualcuno', color: '#a1a1aa' },
]

const startOfDay = (d) => { const n = new Date(d); n.setHours(0, 0, 0, 0); return n }
const endOfDay = (d) => { const n = new Date(d); n.setHours(23, 59, 59, 999); return n }

const SEVERITY_RANK = { critica: 4, alta: 3, media: 2, bassa: 1 }

// Ordinamento dentro una sezione: prima chi ha un orario (e più vicino), poi
// per gravità. Un intervento delle 8:00 sta sopra a uno delle 16:00; un ticket
// senza orario sta sotto agli appuntamenti, ma se è critico risale.
function compareItems(a, b) {
  const aT = a.when ? a.when.getTime() : null
  const bT = b.when ? b.when.getTime() : null
  if (aT !== null && bT !== null && aT !== bT) return aT - bT
  if (aT !== null && bT === null) return -1
  if (aT === null && bT !== null) return 1
  const sev = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  if (sev !== 0) return sev
  return (a.title || '').localeCompare(b.title || '')
}

export function useMyDay({ user, horizonDays = 7, includeUnassigned = false } = {}) {
  const [data, setData] = useState({ reports: [], interventions: [], plans: [], lastLogs: {}, activity: {} })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const userId = user?.id
  const role = user?.role

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!userId) return
    if (silent) setRefreshing(true); else setLoading(true)
    setError(null)
    const today = new Date()
    try {
      // Le manutenzioni programmate servono solo se le guardo davvero: per
      // l'operatore sono lavoro di qualcun altro e il fetch è inutile.
      const wantsPlans = role === 'tecnico' || role === 'admin'
      const [reports, interventions, plans, lastLogs] = await Promise.all([
        db.getReports().catch(e => { console.warn('[useMyDay] getReports:', e?.message); return [] }),
        db.getInterventionsCalendar({
          rangeStart: startOfDay(new Date(today.getTime() - LOOKBACK_DAYS * DAY_MS)),
          rangeEnd: endOfDay(new Date(today.getTime() + horizonDays * DAY_MS)),
          scope: 'mine',
          currentUserId: userId,
        }).catch(e => { console.warn('[useMyDay] getInterventionsCalendar:', e?.message); return [] }),
        wantsPlans
          ? db.getAllMaintenancePlansWithMachine().catch(e => { console.warn('[useMyDay] getAllMaintenancePlansWithMachine:', e?.message); return [] })
          : Promise.resolve([]),
        wantsPlans
          ? db.getLastLogPerPlan().catch(e => { console.warn('[useMyDay] getLastLogPerPlan:', e?.message); return {} })
          : Promise.resolve({}),
      ])

      // I non letti costano un round-trip: lo paghiamo solo sui miei ticket
      // aperti, non su tutto lo storico dell'organizzazione.
      const mineOptions = { includeCreated: role === 'operatore' }
      const myOpenIds = (reports || [])
        .filter(r => !TERMINAL_STATUSES.includes(r.status) && matchesAssignee(r, ASSIGNEE_MINE, userId, mineOptions))
        .map(r => r.id)
      const activity = myOpenIds.length
        ? await db.getReportsActivity(myOpenIds, userId).catch(e => {
          console.warn('[useMyDay] getReportsActivity:', e?.message); return {}
        })
        : {}

      setData({ reports: reports || [], interventions: interventions || [], plans: plans || [], lastLogs: lastLogs || {}, activity: activity || {} })
      setUpdatedAt(new Date())
    } catch (e) {
      console.error('[useMyDay] load failed', e)
      setError(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId, role, horizonDays])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => load({ silent: true }), [load])

  const sections = useMemo(() => {
    const now = new Date()
    const dayStart = startOfDay(now)
    const dayEnd = endOfDay(now)
    const horizonEnd = endOfDay(new Date(now.getTime() + horizonDays * DAY_MS))
    const buckets = { late: [], today: [], update: [], soon: [], unassigned: [] }
    const mineOptions = { includeCreated: role === 'operatore' }

    // ── Segnalazioni ──
    for (const r of data.reports) {
      const isOpen = !TERMINAL_STATUSES.includes(r.status)
      if (!isOpen) continue
      const isMine = matchesAssignee(r, ASSIGNEE_MINE, userId, mineOptions)

      if (!isMine) {
        // Coda "senza nessuno": interessa solo a chi assegna.
        if (includeUnassigned && !r.assigned_to && r.status === 'aperta') {
          buckets.unassigned.push(makeReportItem(r, { unread: 0, staleDays: 0, note: 'Nessun tecnico assegnato' }))
        }
        continue
      }

      const unread = data.activity[r.id]?.unread_count || 0
      const lastMove = new Date(r.updated_at || r.created_at)
      const staleDays = Math.floor((now - lastMove) / DAY_MS)

      // Un guasto critico che ti è stato assegnato e non hai ancora aperto è
      // in ritardo per definizione: non ha una scadenza, ha una macchina ferma.
      if (r.severity === 'critica' && r.status === 'assegnata') {
        buckets.late.push(makeReportItem(r, { unread, staleDays, note: 'Critica, non ancora iniziata' }))
        continue
      }
      if (unread > 0) {
        buckets.update.push(makeReportItem(r, { unread, staleDays, note: `${unread} ${unread === 1 ? 'messaggio non letto' : 'messaggi non letti'}` }))
        continue
      }
      if (r.status === 'in_attesa_ricambi') {
        buckets.update.push(makeReportItem(r, { unread, staleDays, note: 'Sollecita il fornitore' }))
        continue
      }
      if (staleDays >= MY_DAY_STALE_DAYS) {
        buckets.update.push(makeReportItem(r, { unread, staleDays, note: `Ferma da ${staleDays} giorni` }))
        continue
      }
      buckets.today.push(makeReportItem(r, { unread, staleDays }))
    }

    // ── Interventi in agenda (già filtrati "miei" dal fetch) ──
    for (const i of data.interventions) {
      if (i.status === 'annullato' || i.status === 'completato') continue
      if (!i.scheduled_start_at) continue
      const when = new Date(i.scheduled_start_at)
      if (when < dayStart) {
        const lateDays = Math.floor((dayStart - startOfDay(when)) / DAY_MS)
        buckets.late.push(makeInterventionItem(i, when, { note: `Pianificato ${lateDays}g fa` }))
      } else if (when <= dayEnd) {
        buckets.today.push(makeInterventionItem(i, when))
      } else if (when <= horizonEnd) {
        buckets.soon.push(makeInterventionItem(i, when))
      }
    }

    // ── Manutenzioni programmate ──
    for (const plan of data.plans) {
      if (plan.current_status === 'completata') continue
      const light = getTrafficLight(plan, data.lastLogs[plan.id])
      const isMine = plan.assigned_to === userId || plan.taken_by === userId
      if (!isMine) {
        if (includeUnassigned && !plan.assigned_to && light.daysLeft <= 0) {
          buckets.unassigned.push(makePlanItem(plan, light, { note: `${light.label} — nessuno assegnato` }))
        }
        continue
      }
      if (light.daysLeft < 0) buckets.late.push(makePlanItem(plan, light))
      else if (light.daysLeft === 0) buckets.today.push(makePlanItem(plan, light))
      else if (light.daysLeft <= horizonDays) buckets.soon.push(makePlanItem(plan, light))
    }

    for (const key of Object.keys(buckets)) buckets[key].sort(compareItems)

    return MY_DAY_SECTIONS
      .filter(s => s.key !== 'unassigned' || includeUnassigned)
      .map(s => ({ ...s, items: buckets[s.key] }))
  }, [data, userId, role, horizonDays, includeUnassigned])

  const counts = useMemo(() => {
    const c = { total: 0 }
    for (const s of sections) {
      c[s.key] = s.items.length
      if (s.key !== 'unassigned') c.total += s.items.length
    }
    return c
  }, [sections])

  return { sections, counts, loading, refreshing, error, refresh, updatedAt }
}

// ── Normalizzazione ──
// Le tre sorgenti hanno nomi di campo diversi per le stesse cose. Qui
// diventano un item solo, così la UI non sa più da dove arriva la riga.

function makeReportItem(r, { unread = 0, staleDays = 0, note } = {}) {
  return {
    key: `report-${r.id}`,
    kind: 'report',
    id: r.id,
    title: r.title || 'Segnalazione senza titolo',
    machine: r.machine || r.machine_name || null,
    when: null,
    severity: r.severity,
    status: r.status,
    unread,
    staleDays,
    note: note || null,
    raw: r,
  }
}

function makeInterventionItem(i, when, { note } = {}) {
  return {
    key: `intervention-${i.id}`,
    kind: 'intervention',
    id: i.id,
    title: i.title || 'Intervento',
    machine: i.machine_name || null,
    when,
    severity: i.severity,
    status: i.status,
    unread: 0,
    staleDays: 0,
    note: note || null,
    raw: i,
  }
}

function makePlanItem(plan, light, { note } = {}) {
  return {
    key: `plan-${plan.id}`,
    kind: 'plan',
    id: plan.id,
    title: plan.name || 'Manutenzione programmata',
    machine: plan.machine?.name || plan.machine_name || null,
    when: null,
    severity: light.daysLeft <= 0 ? 'alta' : 'media',
    status: plan.current_status || 'da_eseguire',
    unread: 0,
    staleDays: 0,
    note: note || light.label,
    light,
    raw: plan,
  }
}
