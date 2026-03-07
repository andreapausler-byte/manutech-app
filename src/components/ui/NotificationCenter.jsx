/**
 * NotificationCenter — Sprint 3.6c Realtime
 * 
 * Features:
 *  - Supabase Realtime subscription su tabella notifications → istantanea
 *  - Fallback polling ogni 15s per demo/compatibility
 *  - Web Notification nativa su ogni nuova notifica (anche app visibile)
 *  - Vibrazione + suono campanella
 *  - Icona campanella con badge contatore + shake animation
 *  - Panel slide-down con lista notifiche
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../../lib/supabase'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/constants'
import { useHaptic } from '../../hooks/useHaptic'
import {
  Bell, X, FileText, ArrowRight, MessageCircle,
  UserCheck, Zap, CheckCheck, AlertTriangle, Wrench, Clock, CalendarCheck
} from 'lucide-react'

const NOTIF_ICONS = {
  new_report:            { icon: FileText,      color: '#3b82f6' },
  quick_report:          { icon: Zap,           color: '#f59e0b' },
  status_change:         { icon: ArrowRight,    color: '#a855f7' },
  comment:               { icon: MessageCircle, color: '#6366f1' },
  assigned:              { icon: UserCheck,      color: '#8b5cf6' },
  maintenance_taken:     { icon: Wrench,        color: '#3b82f6' },
  maintenance_completed: { icon: CalendarCheck, color: '#22c55e' },
  maintenance_overdue:   { icon: AlertTriangle, color: '#ef4444' },
  maintenance_reminder:  { icon: Clock,         color: '#f59e0b' },
}

// ── Suono notifica (beep sintetico) ──
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
    // Secondo beep più alto
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.frequency.value = 1100
    osc2.type = 'sine'
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.5)
  } catch {}
}

export default function NotificationCenter({ userId, onOpenReport, onNewNotifications }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [bellShake, setBellShake] = useState(false)
  const haptic = useHaptic()
  const panelRef = useRef(null)
  const initialLoadRef = useRef(true)
  const onNewRef = useRef(onNewNotifications)
  onNewRef.current = onNewNotifications

  const unreadCount = notifications.filter(n => !n.read).length

  // ── Carica notifiche ──
  const loadNotifications = useCallback(async () => {
    try {
      const data = await db.getNotifications(userId)
      setNotifications(data)
      if (initialLoadRef.current) initialLoadRef.current = false
    } catch {}
  }, [userId])

  // ── Gestisci nuova notifica (realtime o polling) ──
  const handleNewNotification = useCallback((notif) => {
    // Ignora le proprie notifiche
    if (notif.from_user === userId) return

    // Aggiungi alla lista
    setNotifications(prev => {
      // Evita duplicati
      if (prev.some(n => n.id === notif.id)) return prev
      return [notif, ...prev].slice(0, 100)
    })

    // Shake campanella
    setBellShake(true)
    setTimeout(() => setBellShake(false), 800)

    // Suono
    playNotifSound()

    // Vibrazione
    haptic.medium()

    // Web Notification nativa (anche con app visibile)
    if (onNewRef.current) {
      onNewRef.current(notif.title, notif.body, {
        type: notif.type,
        report_id: notif.report_id,
        forceShow: true, // Mostra anche se app visibile
      })
    }
  }, [userId, haptic])

  // ── Carica al mount + polling di backup (15s) ──
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 15000)
    return () => clearInterval(interval)
  }, [loadNotifications])

  // ── Supabase Realtime subscription ──
  useEffect(() => {
    if (!supabase || !userId) return

    console.log('[NotifRT] Setting up realtime for userId:', userId)

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log('[NotifRT] New notification:', payload.new)
          const notif = payload.new

          // Controlla se è per questo utente (target_user = userId o null/broadcast)
          if (notif.target_user && notif.target_user !== userId) return

          handleNewNotification(notif)
        }
      )
      .subscribe((status) => {
        console.log('[NotifRT] Subscription status:', status)
      })

    return () => {
      console.log('[NotifRT] Cleaning up channel')
      supabase.removeChannel(channel)
    }
  }, [userId, handleNewNotification])

  // ── Close on outside click ──
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
    }
  }, [open])

  const toggleOpen = () => {
    haptic.light()
    setOpen(o => !o)
    if (!open) loadNotifications()
  }

  const handleMarkRead = async (notif) => {
    haptic.light()
    if (!notif.read) {
      await db.markNotificationRead(notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
    }
    if (notif.report_id && onOpenReport) {
      setOpen(false)
      onOpenReport(notif.report_id)
    }
  }

  const handleMarkAllRead = async () => {
    haptic.medium()
    await db.markAllNotificationsRead(userId)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button — with shake animation */}
      <button
        onClick={toggleOpen}
        className="relative w-[10vw] h-[10vw] max-w-10 max-h-10 rounded-xl flex items-center justify-center press-scale"
        style={{ background: 'rgba(255,255,255,0.12)' }}
      >
        <Bell
          size={18}
          color="rgba(255,255,255,0.9)"
          className={bellShake ? 'animate-bell-shake' : ''}
        />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold text-white flex items-center justify-center px-1 animate-scale-in"
            style={{ background: 'var(--color-danger)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div
          className="absolute right-0 top-[13vw] w-[90vw] max-w-sm rounded-2xl z-50 overflow-hidden animate-scale-in"
          style={{
            background: 'var(--color-surface-1)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <Bell size={16} style={{ color: 'var(--color-primary)' }} />
              <span className="text-base font-bold text-themed">Notifiche</span>
              {unreadCount > 0 && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
                >
                  {unreadCount} nuove
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium flex items-center gap-1 px-2 py-1 rounded-lg active:bg-white/10"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <CheckCheck size={14} /> Letti
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg active:bg-white/10">
                <X size={16} style={{ color: 'var(--color-text-faint)' }} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={32} style={{ color: 'var(--color-text-faint)' }} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--color-text-faint)' }}>Nessuna notifica</p>
              </div>
            ) : (
              notifications.map(notif => {
                const config = NOTIF_ICONS[notif.type] || NOTIF_ICONS.new_report
                const Icon = config.icon
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleMarkRead(notif)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: !notif.read ? 'var(--color-primary-glow)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: config.color + '18' }}
                    >
                      <Icon size={16} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notif.read ? 'font-bold' : 'font-medium'}`}
                        style={{ color: !notif.read ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                        {notif.title}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>{notif.body}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>{timeAgo(notif.created_at)}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--color-primary)' }} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
