/**
 * Edge Function: assistant-chat
 *
 * Assistente AI per tecnici ManuTech. Riceve una domanda (+ context
 * opzionale machine_id / report_id) e costruisce un prompt per Claude
 * Haiku 4.5 con più fonti dati dell'organizzazione:
 *   - search_similar_reports         → report storici simili (RAG)
 *   - get_assistant_org_stats        → statistiche e classifica macchinari
 *   - get_open_reports_snapshot      → segnalazioni attualmente aperte
 *   - get_machine_history            → storia macchina (se machine_id)
 *
 * Una heuristic (classifyQuery) sceglie quali blocchi includere in base
 * al tipo di domanda (meta / operativa / diagnostica) per ridurre rumore.
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
  status: string | null
  type: string | null
  machine_id: string | null
  closure_root_cause: string | null
  closure_action: string | null
  closure_parts: string | null
  closure_hours: number | null
  closed_at: string | null
  similarity: number
}

interface OpenReport {
  id: string
  title: string | null
  description: string | null
  severity: string | null
  status: string | null
  type: string | null
  machine: string | null
  machine_id: string | null
  assigned_to_name: string | null
  age_hours: number | null
  created_at: string | null
}

interface OrgStatsTotals {
  reports_total: number
  reports_open: number
  reports_resolved: number
  resolved_pct: number
  critical_open: number
  reports_last_30d: number
}

interface TopMachine {
  name: string
  total: number
  open: number
  assigned: number
  in_progress: number
  awaiting_parts: number
  resolved: number
  critical_open: number
  last_report_at: string | null
}

interface OrgStats {
  totals: OrgStatsTotals | null
  top_machines: TopMachine[]
}

interface MachineHistory {
  machine_name: string
  total_reports: number
  mttr_hours: number | null
  recurring_types: { type: string; count: number }[]
  recent_maintenance: {
    title: string
    type: string
    description: string
    parts_replaced: string
    performed_by_name: string | null
    performed_at_label: string
  }[]
  upcoming_maintenance: {
    name: string
    frequency_days: number
    current_status: string
    next_due_label: string
    days_to_due: number
  }[]
  top_parts: { parts: string; usage_count: number }[]
}

// ── Prompt builder ──
function buildSystemPrompt(): string {
  return `Sei un assistente virtuale esperto di manutenzione industriale per l'app ManuTech. Il tuo ruolo è aiutare i tecnici e gli operatori della loro organizzazione attingendo a più fonti di dati che ti vengono fornite ad ogni richiesta.

Fonti che puoi ricevere nel contesto:
1. **Statistiche organizzazione** — totali e classifica macchinari per numero di segnalazioni
2. **Segnalazioni aperte** — guasti attualmente non risolti, con stato, severità ed eventuale tecnico assegnato
3. **Storia macchina** — solo se l'utente sta guardando una specifica macchina: tipi guasto ricorrenti, MTTR, manutenzioni recenti/in scadenza, ricambi più usati
4. **Report storici simili** — interventi già risolti che possono ispirare la soluzione

Regole di risposta:
- Rispondi SEMPRE in italiano, tono pratico e diretto (dai del "tu")
- Per domande META (classifiche, totali, "quale macchinario ha più…", "quanti aperti…"): usa le sezioni Statistiche e Segnalazioni aperte
- Per domande DIAGNOSTICHE ("come risolvo X", "perché Y non va"): usa Report storici simili e, se presente, Storia macchina
- Se ci sono segnalazioni aperte simili a quella che il tecnico sta affrontando, segnalalo (potrebbe esserci un collega già al lavoro o un duplicato)
- Cita le fonti: nomi macchinari, numeri di segnalazioni aperte, [#titolo_report] per i report storici
- Se TUTTE le sezioni sono vuote o non pertinenti, ammettilo e chiedi più dettagli
- Per domande diagnostiche struttura la risposta: "Probabile causa → Passi suggeriti → Ricambi/Strumenti"
- Massimo 250 parole, vai al sodo
- Non inventare dati, non dare consigli di sicurezza generici non richiesti`
}

function buildContextBlock(reports: SimilarReport[]): string {
  if (reports.length === 0) {
    return '[Nessun report storico simile trovato nell\'organizzazione]'
  }
  return reports.map((r, i) => {
    const parts: string[] = []
    const statusTag = r.status && !['risolta', 'chiuso'].includes(r.status) ? ` [APERTO — ${r.status}]` : ''
    parts.push(`--- Report storico #${i + 1}${statusTag} ---`)
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

function buildOrgStatsBlock(stats: OrgStats | null): string {
  if (!stats || !stats.totals) return ''
  const t = stats.totals
  const lines: string[] = []
  lines.push(`Totale report: ${t.reports_total} (aperti: ${t.reports_open}, risolti: ${t.reports_resolved} — ${t.resolved_pct}%)`)
  lines.push(`Critici aperti: ${t.critical_open} — Nuovi ultimi 30 giorni: ${t.reports_last_30d}`)
  if (stats.top_machines && stats.top_machines.length > 0) {
    lines.push('')
    lines.push('Top macchinari per numero di segnalazioni:')
    stats.top_machines.forEach((m, i) => {
      const name = (m.name || 'Senza nome').slice(0, 50)
      lines.push(
        `${i + 1}. ${name} — ${m.total} report ` +
        `(aperti ${m.open + m.assigned + m.in_progress + m.awaiting_parts}, ` +
        `critici ${m.critical_open}, risolti ${m.resolved}, ultimo: ${m.last_report_at || '—'})`,
      )
    })
  }
  return lines.join('\n')
}

function buildOpenReportsBlock(reports: OpenReport[], scopedToMachine: boolean): string {
  if (!reports || reports.length === 0) return ''
  const header = scopedToMachine
    ? `Segnalazioni aperte su questa macchina (${reports.length}):`
    : `Segnalazioni aperte più rilevanti (${reports.length}, top per severità + età):`
  const items = reports.map((r, i) => {
    const age = r.age_hours != null
      ? r.age_hours < 24 ? `${r.age_hours}h fa` : `${Math.floor(r.age_hours / 24)}g fa`
      : '—'
    const parts: string[] = []
    parts.push(`${i + 1}. [${r.severity || '—'}/${r.status || '—'}] ${r.title || '(senza titolo)'}`)
    if (r.machine && !scopedToMachine) parts.push(`   Macchina: ${r.machine}`)
    parts.push(`   Aperto: ${age}${r.assigned_to_name ? ` — Tecnico: ${r.assigned_to_name}` : ' — Non assegnato'}`)
    if (r.description) parts.push(`   Problema: ${r.description.slice(0, 200)}`)
    return parts.join('\n')
  })
  return [header, ...items].join('\n')
}

function buildMachineHistoryBlock(hist: MachineHistory | null): string {
  if (!hist) return ''
  const lines: string[] = []
  lines.push(`Macchinario: ${hist.machine_name} — Totale storico: ${hist.total_reports} report` +
    (hist.mttr_hours != null ? ` — MTTR medio: ${hist.mttr_hours}h` : ''))

  if (hist.recurring_types?.length) {
    lines.push('')
    lines.push('Tipi guasto ricorrenti: ' +
      hist.recurring_types.map(t => `${t.type} (${t.count}x)`).join(', '))
  }

  if (hist.upcoming_maintenance?.length) {
    lines.push('')
    lines.push('Manutenzioni in scadenza/scadute:')
    hist.upcoming_maintenance.forEach(m => {
      const status = m.days_to_due < 0
        ? `SCADUTA da ${Math.abs(m.days_to_due)}gg`
        : `tra ${m.days_to_due}gg`
      lines.push(`- ${m.name} (ogni ${m.frequency_days}gg) — ${status} — prossima: ${m.next_due_label}`)
    })
  }

  if (hist.recent_maintenance?.length) {
    lines.push('')
    lines.push('Ultime manutenzioni eseguite:')
    hist.recent_maintenance.forEach(m => {
      const who = m.performed_by_name ? ` — ${m.performed_by_name}` : ''
      const partsTxt = m.parts_replaced ? ` — Ricambi: ${m.parts_replaced}` : ''
      lines.push(`- ${m.performed_at_label}: ${m.title}${who}${partsTxt}`)
    })
  }

  if (hist.top_parts?.length) {
    lines.push('')
    lines.push('Ricambi più usati su questa macchina (da chiusure report):')
    hist.top_parts.forEach(p => {
      lines.push(`- ${p.parts} (usato ${p.usage_count}x)`)
    })
  }

  return lines.join('\n')
}

// ── Heuristic: classifica il tipo di domanda ──
// Decide se la domanda è: meta (statistiche/classifiche), operativa
// (stato/aperti), diagnostica (come risolvo X) o mista. Usato per
// includere/escludere blocchi e ridurre rumore quando la domanda è
// chiaramente di un solo tipo. Default: includi tutto.
function classifyQuery(query: string): { wantStats: boolean; wantOpen: boolean; wantDiagnostic: boolean } {
  const q = query.toLowerCase()
  const metaKW = ['quale', 'quali', 'quanti', 'quante', 'top', 'classifica', 'classific', 'media', 'totale', 'totali', 'statistic', 'percentuale', 'più segnalazion', 'piu segnalazion', 'più guast', 'piu guast', 'meglio', 'peggio', 'frequent']
  const openKW = ['aperto', 'aperti', 'aperta', 'aperte', 'in corso', 'in lavorazione', 'stato', 'chi sta', 'chi lavora', 'assegnat', 'in attesa']
  const diagKW = ['come risolv', 'come faccio', 'come ripar', 'come sistem', 'perché', 'perche', 'guasto', 'non funziona', 'rotto', 'rotta', 'errore', 'allarme', 'rumore', 'perdita', 'vibraz', 'surriscald', 'blocc', 'fermo']

  const wantStats = metaKW.some(k => q.includes(k))
  const wantOpen = openKW.some(k => q.includes(k))
  const wantDiagnostic = diagKW.some(k => q.includes(k))

  // Se non matcha nulla, includi tutto (default conservativo)
  if (!wantStats && !wantOpen && !wantDiagnostic) {
    return { wantStats: true, wantOpen: true, wantDiagnostic: true }
  }
  return { wantStats, wantOpen, wantDiagnostic }
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

    // ── 4. Retrieval + contesto esteso ──
    // Classifichiamo la query per decidere quali blocchi caricare.
    const classify = classifyQuery(query)
    // Scope C: estendere retrieval ai report aperti SOLO se siamo in contesto
    // macchina/report (l'utente sta guardando qualcosa di specifico).
    const includeOpenInRetrieval = !!(machineId || reportId)
    const hasMachineContext = !!machineId

    // Lanciamo le RPC in parallelo. Se una fallisce (es. migration non
    // ancora deployata) logghiamo e proseguiamo con il blocco vuoto.
    const [similarRes, statsRes, openRes, historyRes] = await Promise.all([
      supabase.rpc('search_similar_reports', {
        query_text: query,
        p_limit: TOP_K,
        p_machine_id: machineId ?? null,
        p_include_open: includeOpenInRetrieval,
      }),
      classify.wantStats || classify.wantDiagnostic
        ? supabase.rpc('get_assistant_org_stats')
        : Promise.resolve({ data: null, error: null }),
      classify.wantOpen || classify.wantDiagnostic || hasMachineContext
        ? supabase.rpc('get_open_reports_snapshot', { p_machine_id: machineId ?? null })
        : Promise.resolve({ data: null, error: null }),
      hasMachineContext
        ? supabase.rpc('get_machine_history', { p_machine_id: machineId })
        : Promise.resolve({ data: null, error: null }),
    ])

    if (similarRes.error) console.error('search_similar_reports error:', similarRes.error)
    if (statsRes.error) console.warn('get_assistant_org_stats error:', statsRes.error.message)
    if (openRes.error) console.warn('get_open_reports_snapshot error:', openRes.error.message)
    if (historyRes.error) console.warn('get_machine_history error:', historyRes.error.message)

    const similar: SimilarReport[] = similarRes.data || []
    const orgStats: OrgStats | null = statsRes.data || null
    const openReports: OpenReport[] = openRes.data || []
    const machineHistory: MachineHistory | null = historyRes.data || null

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

    const sections: string[] = []

    const orgBlock = buildOrgStatsBlock(orgStats)
    if (orgBlock) sections.push(`## Statistiche organizzazione\n\n${orgBlock}`)

    const openBlock = buildOpenReportsBlock(openReports, hasMachineContext)
    if (openBlock) sections.push(`## Segnalazioni aperte\n\n${openBlock}`)

    const historyBlock = buildMachineHistoryBlock(machineHistory)
    if (historyBlock) sections.push(`## Storia macchina\n\n${historyBlock}`)

    const contextBlock = buildContextBlock(similar)
    sections.push(`## Report storici simili\n\n${contextBlock}`)

    const contextNote = reportId
      ? `\n\n[Contesto aggiuntivo: il tecnico sta guardando il report ${reportId}]`
      : ''

    const userMessage = `${sections.join('\n\n')}${contextNote}\n\n## Domanda del tecnico\n\n${query}`

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
