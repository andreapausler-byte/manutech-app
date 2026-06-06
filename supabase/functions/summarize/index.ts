/**
 * Edge Function: summarize
 *
 * Primitivo AI riutilizzabile ("AI come layer, non feature"): genera un
 * riassunto in italiano da un set di elementi forniti dal client. Usato
 * trasversalmente nell'admin desktop:
 *   - kind 'agenda'           → riassunto interventi di un periodo (calendario)
 *   - kind 'machine_history'  → riassunto storico di un macchinario
 *   - kind 'intervention'     → sintesi/handoff di un singolo intervento
 *
 * Potenza AI → modello via resolveModel(power, 'summarize') (_shared/models.ts):
 *   veloce/equilibrato → Sonnet 4.6 · approfondito → Opus 4.8
 *   (Opus: thinking adaptive + effort, niente temperature/top_p — gestito dal resolver).
 *
 * Sicurezza (ADR-010):
 *   #1 chiave API Anthropic solo server-side.
 *   #2 gli `items` arrivano già filtrati da RLS lato client (il frontend li
 *      ottiene con la sessione utente autenticata, come searchSimilarCases) →
 *      questa funzione NON ha bisogno di accesso DB e si limita a sintetizzare
 *      ciò che l'utente può già vedere. Il gateway Supabase verifica il JWT.
 *
 * Body JSON:
 *   { kind: 'agenda'|'machine_history'|'intervention', items: object[], meta?, power? }
 * Response:
 *   { content: string, model: string, power: string }
 */

import { resolveModel, normalizePower, type Power } from '../_shared/models.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_TOKENS = 1400
const MAX_ITEMS = 60          // cap difensivo sul numero di elementi
const MAX_FIELD_CHARS = 400   // clip per singolo valore testuale
const MAX_PROMPT_CHARS = 24000

type Kind = 'agenda' | 'machine_history' | 'intervention'

const KINDS: Kind[] = ['agenda', 'machine_history', 'intervention']

// Istruzione specifica per tipo: cosa deve produrre il riassunto.
const INSTRUCTIONS: Record<Kind, string> = {
  agenda:
    'Riassumi l\'agenda interventi del periodo per un responsabile manutenzione che vuole "prepararsi ai prossimi impegni". ' +
    'Raggruppa per giorno se le date ci sono, evidenzia priorità/urgenze e carichi sui tecnici, segnala sovrapposizioni o giorni scarichi. ' +
    'Chiudi con 1-3 punti di attenzione concreti.',
  machine_history:
    'Riassumi lo storico di questo macchinario per un tecnico che ci arriva sopra: cosa è successo di recente, guasti ricorrenti o pattern (come ipotesi, non certezze), interventi/manutenzioni salienti e stato attuale. ' +
    'Evidenzia eventuali ricorrenze che suggeriscono un problema strutturale.',
  intervention:
    'Sintetizza questo intervento per un passaggio di consegne: cosa va fatto/è stato fatto, stato, macchina coinvolta, note rilevanti e prossimi passi.',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function clip(v: unknown, n = MAX_FIELD_CHARS): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > n ? s.slice(0, n) + '…' : s
}

// Serializza un elemento (oggetto piatto) in righe "chiave: valore", saltando
// vuoti, funzioni e blob enormi. Non assume uno schema fisso → riusabile per
// interventi, report, macchine.
function serializeItem(item: Record<string, unknown>, idx: number): string {
  const lines: string[] = [`#${idx + 1}`]
  for (const [k, v] of Object.entries(item || {})) {
    if (v == null || v === '' ) continue
    if (typeof v === 'function') continue
    let val: string
    if (Array.isArray(v)) {
      const flat = v.filter((x) => x != null && String(x).trim()).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)))
      if (flat.length === 0) continue
      val = flat.join(', ')
    } else if (typeof v === 'object') {
      val = JSON.stringify(v)
    } else {
      val = String(v)
    }
    val = val.trim()
    if (!val) continue
    lines.push(`  ${k}: ${clip(val)}`)
  }
  return lines.join('\n')
}

function buildSystemPrompt(): string {
  return `Sei l'assistente AI di ManuTech, esperto di manutenzione industriale. Produci riassunti operativi in ITALIANO.

Regole vincolanti:
- Rispondi SEMPRE in italiano, tono pratico e diretto, sintetico e leggibile a colpo d'occhio (usa bullet quando aiuta).
- Basati ESCLUSIVAMENTE sui dati forniti. Non inventare numeri, cause, date o correlazioni che non sono nei dati.
- Quando un'informazione manca o è ambigua, DICHIARALO esplicitamente invece di riempire i vuoti.
- Le ricorrenze/pattern vanno presentati come IPOTESI da verificare, mai come certezze.
- È un supporto al tecnico/responsabile, non un verdetto: l'utente ha l'ultima parola.
- Massimo ~250 parole.`
}

function buildUserPrompt(kind: Kind, items: Record<string, unknown>[], meta: Record<string, unknown> | undefined): string {
  const parts: string[] = []
  parts.push(INSTRUCTIONS[kind])
  if (meta && Object.keys(meta).length > 0) {
    parts.push('')
    parts.push('Contesto:')
    for (const [k, v] of Object.entries(meta)) {
      if (v == null || v === '') continue
      parts.push(`- ${k}: ${clip(v)}`)
    }
  }
  parts.push('')
  parts.push(`Dati (${items.length} element${items.length === 1 ? 'o' : 'i'}):`)
  parts.push(items.map((it, i) => serializeItem(it, i)).join('\n'))
  let prompt = parts.join('\n')
  if (prompt.length > MAX_PROMPT_CHARS) prompt = prompt.slice(0, MAX_PROMPT_CHARS) + '\n…[troncato]'
  return prompt
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
  extraBody: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...extraBody,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === 'text')
  return textBlock?.text || '(nessun riassunto generato)'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    // Il gateway Supabase verifica il JWT; richiediamo comunque l'header per
    // non esporre un proxy Claude anonimo.
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.replace(/^Bearer\s+/i, '')) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY non configurata' }, 500)

    const body = await req.json().catch(() => ({}))
    const kind = body.kind as Kind
    if (!KINDS.includes(kind)) {
      return jsonResponse({ error: `kind non valido (atteso: ${KINDS.join(' | ')})` }, 400)
    }

    let items = Array.isArray(body.items) ? body.items : []
    items = items
      .filter((it: unknown) => it && typeof it === 'object')
      .slice(0, MAX_ITEMS) as Record<string, unknown>[]
    if (items.length === 0) {
      return jsonResponse({ error: 'Nessun elemento da riassumere' }, 400)
    }

    const meta = (body.meta && typeof body.meta === 'object') ? body.meta as Record<string, unknown> : undefined
    const power: Power = normalizePower(body.power, 'equilibrato')
    const { model, extraBody } = resolveModel(power, 'summarize')
    console.info(`[summarize] kind=${kind} items=${items.length} power=${power} model=${model}`)

    const content = await callClaude(
      buildSystemPrompt(),
      buildUserPrompt(kind, items, meta),
      apiKey,
      model,
      extraBody,
    )

    return jsonResponse({ content, model, power })
  } catch (err) {
    console.error('[summarize] error:', err)
    return jsonResponse({ error: (err as Error).message || 'Errore interno' }, 500)
  }
})
