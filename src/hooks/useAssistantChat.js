/**
 * useAssistantChat — gestisce stato chat assistente AI
 *
 * - messages: array { id, role, content, sources, created_at, pending? }
 * - send(query, context): invia messaggio all'Edge Function
 * - loadConversation(id): carica storico
 * - reset(): nuova conversazione
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as assistant from '../lib/assistant'

export default function useAssistantChat({ machineId, reportId, initialConversationId, scope, power } = {}) {
  const [conversationId, setConversationId] = useState(initialConversationId || null)
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const pendingIdRef = useRef(0)

  const send = useCallback(async (query) => {
    const trimmed = (query || '').trim()
    if (!trimmed || sending) return null

    setError(null)
    setSending(true)

    // Messaggio utente ottimistico
    pendingIdRef.current += 1
    const tempUserId = `tmp-u-${pendingIdRef.current}`
    const tempAsstId = `tmp-a-${pendingIdRef.current}`
    setMessages(prev => [
      ...prev,
      { id: tempUserId, role: 'user', content: trimmed, created_at: new Date().toISOString() },
      { id: tempAsstId, role: 'assistant', content: '', pending: true, created_at: new Date().toISOString() },
    ])

    try {
      const resp = await assistant.sendMessage({
        query: trimmed,
        conversation_id: conversationId,
        machine_id: machineId,
        report_id: reportId,
        scope,
        power,
      })
      if (resp?.conversation_id && !conversationId) setConversationId(resp.conversation_id)

      setMessages(prev => prev.map(m => {
        if (m.id === tempUserId) return { ...m, id: resp.user_message_id || m.id }
        if (m.id === tempAsstId) {
          return {
            id: resp.assistant_message_id || m.id,
            role: 'assistant',
            content: resp.content || '',
            sources: resp.sources || [],
            created_at: new Date().toISOString(),
          }
        }
        return m
      }))
      return resp
    } catch (err) {
      const msg = err?.message === 'DEMO_MODE'
        ? 'Assistente AI non disponibile in modalità demo.'
        : (err?.message || 'Errore imprevisto dell\'assistente.')
      setError(msg)
      // Rimuovi il placeholder pending, lascia la domanda utente
      setMessages(prev => prev.filter(m => m.id !== tempAsstId))
      return null
    } finally {
      setSending(false)
    }
  }, [conversationId, machineId, reportId, scope, power, sending])

  const loadConversation = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const msgs = await assistant.getMessages(id)
      setConversationId(id)
      setMessages(msgs)
    } catch (err) {
      setError(err?.message || 'Errore caricamento conversazione')
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setError(null)
  }, [])

  // Auto-load iniziale della conversazione passata come prop
  useEffect(() => {
    if (initialConversationId) loadConversation(initialConversationId)
    // Solo al mount / cambio initialConversationId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId])

  return { conversationId, messages, sending, loading, error, send, loadConversation, reset }
}
