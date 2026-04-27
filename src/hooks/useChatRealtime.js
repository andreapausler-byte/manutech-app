/**
 * useChatRealtime — Hook per notifiche chat in tempo reale
 * 
 * Features:
 *  - Subscription Supabase Realtime sulla tabella comments
 *  - Conteggio messaggi non letti per report (via chat_reads)
 *  - Toast + haptic quando arriva un nuovo messaggio
 *  - Badge count totale per la bottom nav
 *  - markAsRead(reportId) per segnare una chat come letta
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'

export function useChatRealtime(userId) {
  const [unreadByReport, setUnreadByReport] = useState({})
  const [lastMessage, setLastMessage] = useState(null)
  const toast = useToast()
  const haptic = useHaptic()
  const toastRef = useRef(toast)
  const hapticRef = useRef(haptic)
  useEffect(() => { toastRef.current = toast }, [toast])
  useEffect(() => { hapticRef.current = haptic }, [haptic])

  const totalUnread = Object.values(unreadByReport).reduce((sum, n) => sum + n, 0)

  // ── Carica conteggi non letti ──
  const loadUnreadCounts = useCallback(async () => {
    if (!supabase || !userId) {
      console.log('[ChatRT] Skip loadUnread: supabase=', !!supabase, 'userId=', userId)
      return
    }

    try {
      const { data: reports } = await supabase
        .from('reports').select('id').order('created_at', { ascending: false })
      if (!reports?.length) {
        console.log('[ChatRT] No reports found')
        return
      }

      const { data: reads } = await supabase
        .from('chat_reads').select('report_id, last_read_at')
        .eq('user_id', userId)
      
      const readsMap = {}
      ;(reads || []).forEach(r => { readsMap[r.report_id] = r.last_read_at })

      const counts = {}
      for (const report of reports) {
        const lastRead = readsMap[report.id]
        let query = supabase
          .from('comments')
          .select('id', { count: 'exact', head: true })
          .eq('report_id', report.id)
          .neq('user_id', userId)
        
        if (lastRead) {
          query = query.gt('created_at', lastRead)
        }
        
        const { count } = await query
        if (count > 0) {
          counts[report.id] = count
        }
      }

      console.log('[ChatRT] Unread counts loaded:', counts)
      setUnreadByReport(counts)
    } catch (err) {
      console.warn('[ChatRT] Errore caricamento non letti:', err)
    }
  }, [userId])

  // ── Segna come letto ──
  const markAsRead = useCallback(async (reportId) => {
    if (!supabase || !userId || !reportId) return

    try {
      await supabase
        .from('chat_reads')
        .upsert(
          { user_id: userId, report_id: reportId, last_read_at: new Date().toISOString() },
          { onConflict: 'user_id,report_id' }
        )
      
      setUnreadByReport(prev => {
        const next = { ...prev }
        delete next[reportId]
        return next
      })
      console.log('[ChatRT] Marked as read:', reportId)
    } catch (err) {
      console.warn('[ChatRT] Errore markAsRead:', err)
    }
  }, [userId])

  // ── Carica al mount ──
  useEffect(() => {
    loadUnreadCounts()
  }, [loadUnreadCounts])

  // ── Supabase Realtime subscription ──
  useEffect(() => {
    if (!supabase || !userId) {
      console.log('[ChatRT] Skip realtime: supabase=', !!supabase, 'userId=', userId)
      return
    }

    console.log('[ChatRT] Setting up realtime subscription for userId:', userId)

    const channel = supabase
      .channel('chat-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => {
          console.log('[ChatRT] Realtime event received:', payload)
          const newComment = payload.new
          
          if (newComment.user_id === userId) {
            console.log('[ChatRT] Ignoring own message')
            return
          }

          setUnreadByReport(prev => ({
            ...prev,
            [newComment.report_id]: (prev[newComment.report_id] || 0) + 1
          }))

          setLastMessage(newComment)
          hapticRef.current.light()

          const name = newComment.user_name || 'Qualcuno'
          const preview = newComment.text?.slice(0, 60) || '📎 Media'
          toastRef.current.info(`💬 ${name}: ${preview}`, {
            duration: 4000,
          })
        }
      )
      .subscribe((status) => {
        console.log('[ChatRT] Subscription status:', status)
      })

    return () => {
      console.log('[ChatRT] Cleaning up channel')
      supabase.removeChannel(channel)
    }
  }, [userId])

  return {
    unreadByReport,
    totalUnread,
    lastMessage,
    markAsRead,
    refreshUnread: loadUnreadCounts,
  }
}
