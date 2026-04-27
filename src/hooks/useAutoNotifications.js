/**
 * useAutoNotifications — Sprint 3.5 Notifiche Automatiche
 *
 * Hook che controlla periodicamente le scadenze manutenzione
 * e genera notifiche automatiche per:
 *  - Manutenzioni in scadenza tra 5 giorni (reminder una tantum)
 *  - Manutenzioni scadute (notifica una tantum alla scadenza)
 *
 * Usa un flag localStorage persistente per ciclo di manutenzione
 * (si resetta solo quando viene registrato un nuovo intervento).
 */

import { useEffect, useCallback, useRef } from 'react'
import { db } from '../lib/supabase'

const SENT_KEY = 'manutech_auto_notifs_sent'
const CHECK_INTERVAL = 5 * 60 * 1000 // Ogni 5 minuti

function getSentMap() {
  try {
    const raw = localStorage.getItem(SENT_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch { return {} }
}

function markSent(planId, type, lastLogDate) {
  const sent = getSentMap()
  sent[`${planId}_${type}`] = lastLogDate || 'no_log'
  localStorage.setItem(SENT_KEY, JSON.stringify(sent))
}

function wasSent(planId, type, lastLogDate) {
  const sent = getSentMap()
  const key = `${planId}_${type}`
  // Se l'ultimo log è cambiato, la notifica va re-inviata nel prossimo ciclo
  return sent[key] === (lastLogDate || 'no_log')
}

export function useAutoNotifications(userId, _userRole) {
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
          const lastLogKey = lastLog?.performed_at || plan.created_at
          const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          const daysLeft = plan.frequency_days - daysSince

          // Chi deve ricevere la notifica?
          const targetUser = plan.assigned_to || null

          // ── Scaduta (daysLeft <= 0): una sola notifica per ciclo ──
          if (daysLeft <= 0 && !wasSent(plan.id, 'overdue', lastLogKey)) {
            await db.addNotification({
              type: 'maintenance_overdue',
              title: `⚠️ Manutenzione scaduta: ${plan.name}`,
              body: `${machine.name} — scaduta da ${Math.abs(daysLeft)} giorni. Intervento urgente richiesto.`,
              report_id: null,
              from_user: null,
              target_user: targetUser,
              org_id: plan.org_id,
            }).catch(e => console.warn('Side effect failed:', e.message))
            markSent(plan.id, 'overdue', lastLogKey)
          }

          // ── In scadenza (entro 5 giorni): una sola notifica per ciclo ──
          if (daysLeft > 0 && daysLeft <= 5 && !wasSent(plan.id, 'reminder', lastLogKey)) {
            await db.addNotification({
              type: 'maintenance_reminder',
              title: `🔔 Manutenzione in scadenza: ${plan.name}`,
              body: `${machine.name} — scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}. Pianifica l'intervento.`,
              report_id: null,
              from_user: null,
              target_user: targetUser,
              org_id: plan.org_id,
            }).catch(e => console.warn('Side effect failed:', e.message))
            markSent(plan.id, 'reminder', lastLogKey)
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
