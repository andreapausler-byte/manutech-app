/**
 * Client lib per l'Assistente AI (bot tecnico)
 *
 * Wrappa l'Edge Function `assistant-chat` e le query su
 * `assistant_conversations` / `assistant_messages`.
 *
 * Pattern demo: se Supabase non è configurato, ogni funzione
 * lancia DemoModeError. I componenti UI usano isAssistantAvailable()
 * per mostrare il DemoBanner invece di chiamare queste funzioni.
 */

import { supabase } from './supabase'

export class DemoModeError extends Error {
  constructor() {
    super('DEMO_MODE')
    this.code = 'DEMO_MODE'
  }
}

export function isAssistantAvailable() {
  return !!supabase
}

// ── Invia messaggio all'assistente ────────────────────────
// Ritorna { conversation_id, content, sources, assistant_message_id, user_message_id }
export async function sendMessage({ query, conversation_id, machine_id, report_id }) {
  if (!supabase) throw new DemoModeError()
  const { data, error } = await supabase.functions.invoke('assistant-chat', {
    body: { query, conversation_id, machine_id, report_id },
  })
  if (error) {
    // supabase.functions.invoke non include il body JSON in caso di !ok
    throw new Error(error.message || 'Errore chiamata assistente')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// ── Elenco conversazioni dell'utente corrente ─────────────
export async function listConversations({ limit = 30 } = {}) {
  if (!supabase) throw new DemoModeError()
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// ── Messaggi di una conversazione ─────────────────────────
export async function getMessages(conversationId) {
  if (!supabase) throw new DemoModeError()
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// ── Elimina una conversazione ─────────────────────────────
export async function deleteConversation(conversationId) {
  if (!supabase) throw new DemoModeError()
  const { error } = await supabase
    .from('assistant_conversations')
    .delete()
    .eq('id', conversationId)
  if (error) throw error
}
