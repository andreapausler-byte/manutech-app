/**
 * useAutoNotifications — Sprint 3.5 Notifiche Automatiche
 * 
 * Hook che controlla periodicamente le scadenze manutenzione
 * e genera notifiche automatiche per:
 *  - Manutenzioni scadute (notifica al tecnico assegnato)
 *  - Manutenzioni in scadenza entro 3 giorni (reminder)
 * 
 * Usa un flag localStorage per evitare duplicati nella stessa giornata.
 */

import { useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'

const SENT_KEY = 'manutech_auto_notifs_sent'
const CHECK_INTERVAL = 5 * 60 * 1000 // Ogni 5 minuti

function getSentToday() {
  try {
    const raw = localStorage.getItem(SENT_KEY)
    if (!raw) return {}
    const { date, sent } = JSON.parse(raw)
    // Resetta se è un nuovo giorno
    if (date !== new Date().toISOString().slice(0, 10)) return {}
    return sent || {}
  } catch { return {} }
}

function markSent(planId, type) {
  const sent = getSentToday()
  sent[`${planId}_${type}`] = true
  localStorage.setItem(SENT_KEY, JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    sent,
  }))
}

function wasSent(planId, type) {
  return getSentToday()[`${planId}_${type}`] === true
}

export function useAutoNotifications(userId, userRole) {
  const checking = useRef(false)

  const checkDeadlines = useCallback(async () => {
    if (checking.current || !userId) return
    checking.current = true

    try {
      const machines = await db.getMachines()

      for (const machine of machines) {
        const plans = await db.getMaintenancePlans(machine.id)

        for (const plan of plans) {
          const lastLog = await db.getLastLogForPlan(plan.id)
          const lastDate = lastLog?.performed_at || plan.created_at
          const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          const daysLeft = plan.frequency_days - daysSince

          // Chi deve ricevere la notifica?
          const targetUser = plan.assigned_to || null

          // ── Scaduta: notifica urgente ──
          if (daysLeft <= 0 && !wasSent(plan.id, 'overdue')) {
            await db.addNotification({
              type: 'maintenance_overdue',
              title: `⚠️ Manutenzione scaduta: ${plan.name}`,
              body: `${machine.name} — scaduta da ${Math.abs(daysLeft)} giorni. Intervento urgente richiesto.`,
              report_id: null,
              from_user: null,
              target_user: targetUser,
              org_id: plan.org_id || 'default',
            }).catch(e => console.warn('Side effect failed:', e.message))
            markSent(plan.id, 'overdue')
          }

          // ── In scadenza (entro 3 giorni): reminder ──
          if (daysLeft > 0 && daysLeft <= 3 && !wasSent(plan.id, 'reminder')) {
            await db.addNotification({
              type: 'maintenance_reminder',
              title: `🔔 Manutenzione in scadenza: ${plan.name}`,
              body: `${machine.name} — scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}. Pianifica l'intervento.`,
              report_id: null,
              from_user: null,
              target_user: targetUser,
              org_id: plan.org_id || 'default',
            }).catch(e => console.warn('Side effect failed:', e.message))
            markSent(plan.id, 'reminder')
          }
        }
      }
    } catch (e) {
      console.warn('Auto-notification check failed:', e)
    }

    checking.current = false
  }, [userId])

  useEffect(() => {
    // Prima verifica subito
    const timer = setTimeout(checkDeadlines, 3000)
    // Poi periodicamente
    const interval = setInterval(checkDeadlines, CHECK_INTERVAL)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [checkDeadlines])
}
