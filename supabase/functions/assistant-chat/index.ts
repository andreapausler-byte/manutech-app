/**
 * Edge Function: assistant-chat
 *
 * Assistente AI per tecnici ManuTech. Riceve una domanda (+ context
 * opzionale machine_id / report_id), esegue retrieval sui report risolti
 * dell'organizzazione tramite RPC `search_similar_reports`, poi chiama
 * Claude Haiku 4.5 per sintetizzare una risposta azionabile in italiano
 * con riferimenti ai report sorgente.
 *
 * Secrets necessari (Supabase Dashboard → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY        — chiave API Anthropic (sk-ant-...)
 *   SUPABASE_URL             — già configurata
 *   SUPABASE_SERVICE_ROLE_KEY — già configurata (solo per ruoli elevati non usati qui)
 *
 * Body JSON:
 *   {
 *     query: string,            // Domanda del tecnico (obbligatoria)
 *     conversation_id?: string, // Se presente, continua conversazione esistente
 *     machine_id?: string,      // Filtra retrieval su questa macchina
 *     report_id?: string        // Report corrente da cui partire (context)
 *   }
 *
 * Response:
 *   {
 *     conversation_id: string,
 *     user_message_id: string,
 *     assistant_message_id: string,
 *     content: string,
 *     sources: [{ report_id, title, similarity }]
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_MESSAGES_PER_HOUR = 30
const MAX_TOKENS = 1024
const TOP_K = 5

// ── Tipi retrieval ──
interface SimilarReport {
  id: string
  title: string | null
  description: string | null
  severity: string | null
  type: string | null
  machine_id: string | null
  closure_root_cause: string | null
  closure_action: string | null
  closure_parts: string | null
  closure_hours: number | null
  closed_at: string | null
  similarity: number
}

// ── Prompt builder ──
function buildSystemPrompt(): string {
  return `Sei un assistente virtuale esperto di manutenzione industriale per l'app ManuTech. Il tuo ruolo è aiutare i tecnici a risolvere guasti attingendo allo storico degli interventi già risolti nella loro organizzazione.

Regole di risposta:
- Rispondi SEMPRE in italiano, in tono pratico e diretto (tu dai del "tu" al tecnico)
- Quando il contesto fornisce report storici simili, usa quelle informazioni concrete (cause, azioni, ricambi) per costruire la risposta
- Cita esplicitamente i report a cui ti riferisci con [#nome_report] in linea
- Se il contesto è vuoto o non pertinente, ammettilo chiaramente e chiedi dettagli in più
- Struttura la risposta in: "Probabile causa → Passi suggeriti → Ricambi/Strumenti"
- Massimo 200 parole, vai al sodo
- Non inventare dati, non dare consigli di sicurezza generici non richiesti`
}

function buildContextBlock(reports: SimilarReport[]): string {
  if (reports.length === 0) {
    return '[Nessun report storico simile trovato nell\'organizzazione]'
  }
  return reports.map((r, i) => {
    const parts: string[] = []
    parts.push(`--- Report storico #${i + 1} ---`)
    parts.push(`Titolo: ${r.title || '(senza titolo)'}`)
    if (r.severity) parts.push(`Severità: ${r.severity}`)
    if (r.description) parts.push(`Problema riportato: ${r.description.slice(0, 400)}`)
    if (r.closure_root_cause) parts.push(`Causa radice: ${r.closure_root_cause.slice(0, 400)}`)
    if (r.closure_action) parts.push(`Azione risolutiva: ${r.closure_action.slice(0, 500)}`)
    if (r.closure_parts) parts.push(`Ricambi utilizzati: ${r.closure_parts.slice(0, 200)}`)
    if (r.closure_hours) parts.push(`Ore intervento: ${r.closure_hours}`)
    return parts.join('\n')
  }).join('\n\n')
}

// ── Claude call ──
async function callClaude(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === 'text')
  const content = textBlock?.text || '(nessuna risposta generata)'
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
  return { content, tokensUsed }
}

// ── Helpers ──
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    // ── 1. Estrai JWT utente ──
    const authHeader = req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return jsonResponse({ error: 'Missing authorization' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    // Client autenticato come utente: RLS attive, RPC get_my_* funzionano
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    )

    // ── 2. Parse body ──
    const body = await req.json().catch(() => ({}))
    const query: string = (body.query || '').toString().trim()
    const conversationIdIn: string | undefined = body.conversation_id
    const machineId: string | undefined = body.machine_id
    const reportId: string | undefined = body.report_id

    if (!query) return jsonResponse({ error: 'query è obbligatoria' }, 400)
    if (query.length > 2000) return jsonResponse({ error: 'query troppo lunga (max 2000)' }, 400)

    // ── 3. Rate limit ──
    const { data: rateCount, error: rateErr } = await supabase.rpc('count_assistant_messages_last_hour')
    if (rateErr) console.warn('Rate check error:', rateErr.message)
    if ((rateCount || 0) >= MAX_MESSAGES_PER_HOUR) {
      return jsonResponse({ error: `Limite di ${MAX_MESSAGES_PER_HOUR} messaggi/ora raggiunto. Riprova più tardi.` }, 429)
    }

    // ── 4. Retrieval: cerca report simili ──
    const { data: similarRaw, error: searchErr } = await supabase.rpc('search_similar_reports', {
      query_text: query,
      p_limit: TOP_K,
      p_machine_id: machineId ?? null,
    })
    if (searchErr) {
      console.error('search_similar_reports error:', searchErr)
    }
    const similar: SimilarReport[] = similarRaw || []

    // ── 5. Identità utente ──
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return jsonResponse({ error: 'Utente non valido' }, 401)

    const { data: orgIdData } = await supabase.rpc('get_my_org_id')
    const { data: userIdData } = await supabase.rpc('get_my_user_id')
    const orgId = orgIdData
    const appUserId = userIdData
    if (!orgId || !appUserId) return jsonResponse({ error: 'Profilo utente incompleto' }, 400)

    // ── 6. Risolvi / crea conversazione ──
    let conversationId = conversationIdIn
    if (!conversationId) {
      const title = query.slice(0, 60) + (query.length > 60 ? '…' : '')
      const { data: newConv, error: convErr } = await supabase
        .from('assistant_conversations')
        .insert({ user_id: appUserId, org_id: orgId, title })
        .select('id')
        .single()
      if (convErr || !newConv) return jsonResponse({ error: 'Errore creazione conversazione: ' + convErr?.message }, 500)
      conversationId = newConv.id
    }

    // ── 7. Inserisci messaggio utente ──
    const { data: userMsg, error: userMsgErr } = await supabase
      .from('assistant_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: query })
      .select('id')
      .single()
    if (userMsgErr || !userMsg) return jsonResponse({ error: 'Errore salvataggio messaggio: ' + userMsgErr?.message }, 500)

    // ── 8. Costruisci prompt e chiama Claude ──
    const systemPrompt = buildSystemPrompt()
    const contextBlock = buildContextBlock(similar)
    const contextNote = reportId ? `\n\n[Contesto aggiuntivo: il tecnico sta guardando il report ${reportId}]` : ''
    const userMessage = `## Contesto: report storici risolti\n\n${contextBlock}${contextNote}\n\n## Domanda del tecnico\n\n${query}`

    let assistantText = ''
    let tokensUsed = 0
    try {
      const result = await callClaude(systemPrompt, userMessage, apiKey)
      assistantText = result.content
      tokensUsed = result.tokensUsed
    } catch (err) {
      console.error('Claude error:', err)
      return jsonResponse({
        error: 'Errore assistente AI: ' + (err instanceof Error ? err.message : 'unknown'),
      }, 502)
    }

    // ── 9. Salva risposta assistente ──
    const sources = similar.map(r => ({
      report_id: r.id,
      title: r.title,
      similarity: Number(r.similarity.toFixed(4)),
    }))

    const { data: asstMsg, error: asstMsgErr } = await supabase
      .from('assistant_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantText,
        sources,
        tokens_used: tokensUsed,
      })
      .select('id')
      .single()
    if (asstMsgErr || !asstMsg) return jsonResponse({ error: 'Errore salvataggio risposta: ' + asstMsgErr?.message }, 500)

    // ── 10. Risposta finale ──
    return jsonResponse({
      conversation_id: conversationId,
      user_message_id: userMsg.id,
      assistant_message_id: asstMsg.id,
      content: assistantText,
      sources,
    })
  } catch (err) {
    console.error('assistant-chat fatal error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})
