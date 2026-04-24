/**
 * Edge Function: extract-ticket-fields
 *
 * Riceve la trascrizione di un audio operatore + la lista macchine reali
 * dell'organizzazione e chiede a Claude Haiku 4.5 di estrarre i campi
 * strutturati per creare un report/ticket in ManuTech.
 *
 * Secrets necessari:
 *   ANTHROPIC_API_KEY — chiave API Anthropic (sk-ant-...)
 *
 * Body JSON:
 *   {
 *     text: string,              // trascrizione Whisper (obbligatoria)
 *     machines: Array<{          // macchine reali dal DB (filtrate attive)
 *       id: string,
 *       name: string,
 *       serial_number?: string | null,
 *       location?: string | null,
 *     }>
 *   }
 *
 * Response (campi italiani, valori null se non deducibili):
 *   {
 *     machine_id: string | null,
 *     machine_name: string | null,
 *     priority: "alta" | "media" | "bassa" | null,
 *     category: "guasto" | "manutenzione" | "anomalia" | "altro" | null,
 *     area: string | null,
 *     summary: string
 *   }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 400

interface MachineInput {
  id: string
  name: string
  serial_number?: string | null
  location?: string | null
}

interface ExtractedFields {
  machine_id: string | null
  machine_name: string | null
  priority: 'alta' | 'media' | 'bassa' | null
  category: 'guasto' | 'manutenzione' | 'anomalia' | 'altro' | null
  area: string | null
  summary: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildSystemPrompt(machines: MachineInput[]): string {
  const machineList = machines.length > 0
    ? machines.map(m => {
        const sn = m.serial_number ? ` (matricola: ${m.serial_number})` : ''
        const loc = m.location ? ` — area: ${m.location}` : ''
        return `- id:${m.id} | ${m.name}${sn}${loc}`
      }).join('\n')
    : '(nessuna macchina disponibile)'

  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Ricevi la trascrizione di un audio con cui un operatore segnala un problema.
Devi estrarre i campi richiesti per creare un ticket di manutenzione.

Macchine disponibili nel sistema (usa ESATTAMENTE il valore "id" per machine_id,
e copia il "name" in machine_name). Se nell'audio non si riconosce alcuna
macchina specifica, lascia entrambi null.
${machineList}

Rispondi SOLO con un oggetto JSON valido che rispetta ESATTAMENTE questo schema,
nessun altro testo, nessun markdown, nessun code fence:

{
  "machine_id": string | null,
  "machine_name": string | null,
  "priority": "alta" | "media" | "bassa" | null,
  "category": "guasto" | "manutenzione" | "anomalia" | "altro" | null,
  "area": string | null,
  "summary": string
}

Regole:
- "summary": titolo breve del ticket (massimo 80 caratteri), in italiano,
  al presente, descrittivo del problema ("Perdita olio pompa CIP", non
  "c'è una perdita sulla pompa"). Obbligatorio, mai null.
- "priority":
  - "alta" se guasto bloccante, perdita di prodotto, rischio sicurezza,
    macchina ferma
  - "media" se anomalia che rallenta ma non blocca la produzione
  - "bassa" se manutenzione preventiva, osservazione, usura non urgente
  - null se davvero non deducibile
- "category":
  - "guasto" se c'è un malfunzionamento
  - "manutenzione" se è una richiesta di intervento preventivo/programmato
  - "anomalia" se c'è un comportamento strano ma non un guasto chiaro
    (rumore, vibrazione, spia accesa)
  - "altro" per tutto il resto
- "area": testo libero (max 50 caratteri) solo se menzionata nell'audio
  (es. "reparto imbottigliamento", "linea 2"). Altrimenti null.
- Se la macchina nell'audio non è nella lista, lascia machine_id e
  machine_name a null.`
}

async function callClaude(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
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
  return textBlock?.text || ''
}

function parseJSON(raw: string): ExtractedFields | null {
  if (!raw) return null
  // Strip code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  // Isolate JSON object if Claude prepends text
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1)
  }
  try {
    const parsed = JSON.parse(cleaned)
    return {
      machine_id: parsed.machine_id ?? null,
      machine_name: parsed.machine_name ?? null,
      priority: ['alta', 'media', 'bassa'].includes(parsed.priority) ? parsed.priority : null,
      category: ['guasto', 'manutenzione', 'anomalia', 'altro'].includes(parsed.category)
        ? parsed.category
        : null,
      area: parsed.area ?? null,
      summary: (parsed.summary || '').toString().slice(0, 120),
    }
  } catch (err) {
    console.warn('extract-ticket-fields: JSON parse failed', err, raw.slice(0, 200))
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY non configurata' }, 500)

    const body = await req.json().catch(() => ({}))
    const text: string = (body?.text || '').toString().trim()
    const machines: MachineInput[] = Array.isArray(body?.machines) ? body.machines : []

    if (!text) return jsonResponse({ error: 'Campo "text" obbligatorio' }, 400)
    if (text.length > 4000) return jsonResponse({ error: 'Testo troppo lungo (max 4000)' }, 400)

    const systemPrompt = buildSystemPrompt(machines)

    const raw = await callClaude(systemPrompt, text, apiKey)
    const fields = parseJSON(raw)

    if (!fields) {
      // Fallback: l'utente compila a mano in OperatorReview
      return jsonResponse({
        machine_id: null,
        machine_name: null,
        priority: null,
        category: null,
        area: null,
        summary: text.slice(0, 80),
      })
    }

    // Validate machine_id against real list
    if (fields.machine_id && !machines.some(m => m.id === fields.machine_id)) {
      fields.machine_id = null
      fields.machine_name = null
    }
    if (!fields.summary) {
      fields.summary = text.slice(0, 80)
    }

    return jsonResponse(fields)
  } catch (err) {
    console.error('extract-ticket-fields fatal error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})
