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

// ── Casi simili (semantic search raw, no LLM) ─────────────
// Usa embed-query + search_knowledge filtrando i chunks 'report_chat'.
// Niente chiamata LLM, niente persistenza: pensata per il composer
// che fa query debounced ad ogni keystroke. Dedup per report_id,
// arricchimento con metadata report (titolo, macchina, data, closure).
//
// Ritorna array di { source_ref, content, similarity, report }.
export async function searchSimilarCases({ text, machineId, excludeReportId, limit = 3, minSimilarity = 0.5 }) {
  if (!supabase) throw new DemoModeError()
  const trimmed = (text || '').trim()
  if (trimmed.length < 20) return []
  // Senza machineId la RPC non filtra e ritorna i top globali — confusione
  // garantita (sempre stessi risultati indipendenti dal report). Skip.
  if (!machineId) return []

  const embedRes = await supabase.functions.invoke('embed-query', {
    body: { text: trimmed.slice(0, 4000) },
  })
  if (embedRes.error) throw new Error(embedRes.error.message || 'Embed error')
  const embedding = embedRes.data?.embedding
  if (!Array.isArray(embedding)) throw new Error('Embedding non valido')

  const { data: chunks, error } = await supabase.rpc('search_knowledge', {
    query_text: trimmed,
    query_embedding: embedding,
    p_machine_id: machineId || null,
    p_limit: 12,
  })
  if (error) throw error

  // Normalizza per evitare miss su trailing whitespace o casing diverso tra
  // come l'UUID arriva dal client e come è memorizzato nel chunk.
  const normExclude = excludeReportId ? String(excludeReportId).trim().toLowerCase() : null
  const byReport = new Map()
  for (const c of (chunks || [])) {
    if (c.source_kind !== 'report_chat') continue
    if (!c.source_ref) continue
    const normRef = String(c.source_ref).trim().toLowerCase()
    if (normExclude && normRef === normExclude) continue
    if (typeof c.similarity === 'number' && c.similarity < minSimilarity) continue
    const prev = byReport.get(c.source_ref)
    if (!prev || c.similarity > prev.similarity) byReport.set(c.source_ref, c)
  }
  const top = [...byReport.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, Math.min(limit, 10)))

  if (top.length === 0) return []

  const reportIds = top.map(c => c.source_ref)
  // Fetch metadata: prima prova con display_id (migration 049 applicata).
  // Se la colonna non esiste, ritenta senza per non far esplodere la query.
  let reports = null
  {
    const r1 = await supabase
      .from('reports')
      .select('id, display_id, title, status, machine, machine_id, created_at, updated_at, assigned_to_name, closure_root_cause, closure_action')
      .in('id', reportIds)
    if (r1.error) {
      console.warn('[ManuTech] reports select with display_id failed, retry without:', r1.error.message)
      const r2 = await supabase
        .from('reports')
        .select('id, title, status, machine, machine_id, created_at, updated_at, assigned_to_name, closure_root_cause, closure_action')
        .in('id', reportIds)
      reports = r2.data
    } else {
      reports = r1.data
    }
  }
  const reportMap = new Map((reports || []).map(r => [r.id, r]))

  return top.map(c => ({
    source_ref: c.source_ref,
    content: c.content,
    similarity: c.similarity,
    report: reportMap.get(c.source_ref) || null,
  })).filter(c => c.report)
}

// ── Stats indicizzazione per macchina (diagnostica) ───────
// Ritorna { chunks, sources, last_indexed_at, by_kind: {...} } via
// RPC get_knowledge_stats (definita in migration 028). Usata
// dall'empty state di SimilarCasesLivePanel per spiegare perché
// non trova nulla.
export async function getMachineKnowledgeStats(machineId) {
  if (!supabase || !machineId) return null
  const { data, error } = await supabase.rpc('get_knowledge_stats', { p_machine_id: machineId })
  if (error) {
    console.warn('[ManuTech] get_knowledge_stats error:', error.message)
    return null
  }
  return data || null
}
