/**
 * useDirectMessageRealtime — Hook per notifiche DM in tempo reale
 *
 * Modellato su useChatRealtime.js ma per la chat diretta 1-a-1.
 * - Subscription Supabase Realtime su direct_messages
 * - Conteggio non letti per conversazione
 * - Toast + haptic per nuovi messaggi
 * - Badge count totale per la bottom nav
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../lib/supabase'
import { useToast } from './useToast'
import { useHaptic } from './useHaptic'

export function useDirectMessageRealtime(userId) {
  const [unreadByConversation, setUnreadByConversation] = useState({})
  const toast = useToast()
  const haptic = useHaptic()
  const toastRef = useRef(toast)
  const hapticRef = useRef(haptic)
  useEffect(() => { toastRef.current = toast }, [toast])
  useEffect(() => { hapticRef.current = haptic }, [haptic])

  const totalUnreadDM = Object.values(unreadByConversation).reduce((sum, n) => sum + n, 0)

  // Load initial unread counts
  const loadUnreadCounts = useCallback(async () => {
    if (!userId) return
    try {
      const counts = await db.getUnreadDMCounts(userId)
      setUnreadByConversation(counts)
    } catch (err) {
      console.warn('[DMRT] Errore caricamento non letti:', err)
    }
  }, [userId])

  // Mark conversation as read
  const markDMAsRead = useCallback(async (conversationId) => {
    if (!userId || !conversationId) return
    try {
      await db.markDMAsRead(conversationId, userId)
      setUnreadByConversation(prev => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
    } catch (err) {
      console.warn('[DMRT] Errore markDMAsRead:', err)
    }
  }, [userId])

  // Load on mount
  useEffect(() => {
    loadUnreadCounts()
  }, [loadUnreadCounts])

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !userId) return

    const channel = supabase
      .channel('dm-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const newMsg = payload.new
          if (newMsg.sender_id === userId) return

          setUnreadByConversation(prev => ({
            ...prev,
            [newMsg.conversation_id]: (prev[newMsg.conversation_id] || 0) + 1
          }))

          hapticRef.current.light()
          const name = newMsg.sender_name || 'Qualcuno'
          const preview = newMsg.text?.slice(0, 60) || 'Media'
          toastRef.current.info(`${name}: ${preview}`, { duration: 4000 })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return {
    unreadByConversation,
    totalUnreadDM,
    markDMAsRead,
    refreshUnread: loadUnreadCounts,
  }
}
