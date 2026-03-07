/**
 * NotificationCenter — Centro notifiche in-app
 * 
 * Features:
 *  - Icona campanella con badge contatore unread
 *  - Panel slide-down con lista notifiche
 *  - Tap su notifica → segna come letta
 *  - Tipi: new_report, status_change, comment, assigned
 *  - Mark all read
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../../lib/supabase'
import { timeAgo } from '../../lib/constants'
import { useHaptic } from '../../hooks/useHaptic'
import {
  Bell, X, FileText, ArrowRight, MessageCircle,
  UserCheck, Zap, CheckCheck, AlertTriangle
} from 'lucide-react'

const NOTIF_ICONS = {
  new_report:    { icon: FileText,      color: '#3b82f6' },
  quick_report:  { icon: Zap,           color: '#f59e0b' },
  status_change: { icon: ArrowRight,    color: '#a855f7' },
  comment:       { icon: MessageCircle, color: '#6366f1' },
  assigned:      { icon: UserCheck,     color: '#8b5cf6' },
}

export default function NotificationCenter({ userId, onOpenReport }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const haptic = useHaptic()
  const panelRef = useRef(null)

  const unreadCount = notifications.filter(n => !n.read).length

  const loadNotifications = useCallback(async () => {
    try {
      const data = await db.getNotifications(userId)
      setNotifications(data)
    } catch {}
  }, [userId])

  // Load on mount and periodically
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [loadNotifications])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
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
      {/* Bell button */}
      <button
        onClick={toggleOpen}
        className="relative w-[11vw] h-[11vw] max-w-11 max-h-11 rounded-xl flex items-center justify-center active:bg-white/10 press-scale"
      >
        <Bell size={22} className={unreadCount > 0 ? 'text-white' : 'text-faint'} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center animate-scale-in">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {open && (
        <div className="absolute right-0 top-[13vw] w-[90vw] max-w-sm panel-notification rounded-2xl z-50 overflow-hidden animate-scale-in">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-token">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-blue-400" />
              <span className="text-base font-bold text-white">Notifiche</span>
              {unreadCount > 0 && (
                <span className="text-xs font-bold text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full">
                  {unreadCount} nuove
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-muted hover:text-white font-medium flex items-center gap-1 px-2 py-1 rounded-lg active:bg-white/10"
                >
                  <CheckCheck size={14} /> Letti
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg active:bg-white/10">
                <X size={16} className="text-faint" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={32} className="text-faint mx-auto mb-2" />
                <p className="text-sm text-faint">Nessuna notifica</p>
              </div>
            ) : (
              notifications.map(notif => {
                const config = NOTIF_ICONS[notif.type] || NOTIF_ICONS.new_report
                const Icon = config.icon
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleMarkRead(notif)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors active:bg-white/5 ${
                      !notif.read ? 'bg-blue-500/5' : ''
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: config.color + '18' }}
                    >
                      <Icon size={16} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!notif.read ? 'font-bold text-white' : 'font-medium text-gray-300'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-xs text-faint mt-1">{timeAgo(notif.created_at)}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shrink-0 mt-1.5" />
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
