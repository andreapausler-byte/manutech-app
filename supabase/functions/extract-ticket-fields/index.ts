/**
 * Edge Function: extract-ticket-fields
 *
 * Estrae campi strutturati da una trascrizione audio per ManuTech.
 * Supporta 6 contesti diversi con prompt e schemi JSON dedicati:
 *
 *   - operator_new_ticket  (default, retrocompatibile)
 *   - tech_new_ticket      (creazione ticket da tecnico, input più tecnico)
 *   - tech_update          (aggiornamento avanzamento ticket)
 *   - tech_close           (chiusura ticket: cause, soluzione, tempo)
 *   - tech_note            (nota rapida, no cambio stato)
 *   - tech_spare_request   (richiesta ricambio)
 *
 * Secrets:
 *   ANTHROPIC_API_KEY — chiave API Anthropic (sk-ant-...)
 *
 * Body JSON:
 *   {
 *     text: string,                      // trascrizione Whisper (obbligatoria)
 *     machines: Array<MachineInput>,     // macchine reali dell'org (per new_ticket)
 *     context?: string,                  // default 'operator_new_ticket'
 *     context_payload?: object           // info ticket per update/close/note/spare
 *   }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 600

interface MachineInput {
  id: string
  name: string
  serial_number?: string | null
  location?: string | null
}

interface ContextPayload {
  ticket_id?: string
  ticket_title?: string
  ticket_status?: string
  machine_name?: string
  current_assignee?: string
  last_activities?: string[]
  technician_id?: string
  technician_name?: string
}

const STATUS_VALUES = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta', 'chiuso']
const SEVERITY_VALUES = ['alta', 'media', 'bassa']
const CATEGORY_VALUES = ['guasto', 'manutenzione', 'anomalia', 'altro']
const URGENCY_VALUES = ['bassa', 'media', 'alta', 'urgente']
const INTERVENTION_VALUES = ['emergenza', 'correttivo', 'preventivo', 'predittivo', 'programmato']

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// FUZZY MACHINE MATCHING — fallback quando Claude non identifica la macchina
// ──────────────────────────────────────────────────────────────────────────
// Token "rumore" da ignorare: parole comuni che non identificano una macchina.
const STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'un\'',
  'di', 'del', 'della', 'dei', 'delle', 'da', 'dal', 'dalla',
  'a', 'al', 'alla', 'ai', 'alle', 'in', 'nel', 'nella', 'nei', 'nelle',
  'su', 'sul', 'sulla', 'con', 'per', 'tra', 'fra', 'e', 'o', 'ma',
  'che', 'chi', 'cui', 'non', 'si', 'ci', 'vi', 'ne',
  'ha', 'ho', 'hai', 'hanno', 'sono', 'e\'', 'era', 'sia',
  'macchina', 'macchinario', 'numero', 'linea', 'ticket', 'problema',
  'problemi', 'guasto', 'cosa', 'questo', 'quello',
])

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritici
    .replace(/[^a-z0-9\s-]/g, ' ')   // pulisci punteggiatura
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[\s-]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

/**
 * Cerca la macchina più "matchabile" nel testo trascritto.
 *
 * Strategia: per ogni macchina, calcola uno score basato su quanti
 * token significativi del nome (e matricola/location) compaiono nel
 * testo. Il match più alto sopra una soglia minima vince.
 *
 * Utile quando Claude non identifica la macchina perché:
 *  - il nome del DB ha più parole del riferimento parlato (es. utente
 *    dice "AMS" ma in DB è "Tappatrice AMS Linea 2")
 *  - Whisper sbaglia leggermente parte del nome
 *
 * Soglia: almeno 1 token "forte" (>= 3 caratteri) deve matchare e lo
 * score deve essere >= 0.4 (40% dei token significativi del nome).
 */
function fuzzyMatchMachine(
  transcription: string,
  claudeMachineName: string | null | undefined,
  machines: MachineInput[],
): { id: string; name: string } | null {
  const haystack = normalize(`${transcription} ${claudeMachineName || ''}`)
  if (!haystack) return null

  let best: { id: string; name: string; score: number; strongHits: number } | null = null

  for (const m of machines) {
    if (!m?.id || !m?.name) continue
    const tokens = tokenize(`${m.name} ${m.serial_number || ''} ${m.location || ''}`)
    if (tokens.length === 0) continue

    let hits = 0
    let strongHits = 0
    for (const t of tokens) {
      // boundary match (evita "ams" che matcha "trasamicina")
      const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i')
      if (re.test(haystack)) {
        hits++
        if (t.length >= 3) strongHits++
      }
    }
    const score = hits / tokens.length
    if (!best || score > best.score) {
      best = { id: m.id, name: m.name, score, strongHits }
    }
  }

  if (!best) return null
  if (best.strongHits === 0) return null
  if (best.score < 0.4) return null
  return { id: best.id, name: best.name }
}

// ──────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS — uno per ogni context
// ──────────────────────────────────────────────────────────────────────────

function machineListBlock(machines: MachineInput[]): string {
  if (machines.length === 0) return '(nessuna macchina disponibile)'
  return machines.map(m => {
    const sn = m.serial_number ? ` (matricola: ${m.serial_number})` : ''
    const loc = m.location ? ` — area: ${m.location}` : ''
    return `- id:${m.id} | ${m.name}${sn}${loc}`
  }).join('\n')
}

function buildSystemPromptOperator(machines: MachineInput[]): string {
  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Ricevi la trascrizione di un audio con cui un operatore segnala un problema.
Devi estrarre i campi richiesti per creare un ticket di manutenzione.

Macchine disponibili nel sistema (usa ESATTAMENTE il valore "id" per machine_id,
e copia il "name" in machine_name). Se nell'audio non si riconosce alcuna
macchina specifica, lascia entrambi null.
${machineListBlock(machines)}

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

function buildSystemPromptTechNew(machines: MachineInput[], payload: ContextPayload): string {
  const tech = payload.technician_name ? ` (${payload.technician_name})` : ''
  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Un TECNICO di manutenzione${tech} sta creando un nuovo ticket usando un comando
vocale (non un Operatore). Il Tecnico ha conoscenza tecnica approfondita,
quindi può fornire diagnosi iniziali, valutazioni di priorità tecnica e
auto-assegnazione.

Macchine disponibili nel sistema (usa ESATTAMENTE il valore "id" per
machine_id, e copia il "name" in machine_name):
${machineListBlock(machines)}

Rispondi SOLO con un oggetto JSON valido che rispetta ESATTAMENTE questo schema,
nessun altro testo, nessun markdown, nessun code fence:

{
  "machine_id": string | null,
  "machine_name": string | null,
  "componente": string | null,
  "tipo_guasto": "perdita" | "rumore" | "blocco" | "anomalia_parametri" | "usura" | "altro" | null,
  "summary": string,
  "diagnosi_iniziale": string | null,
  "priority": "alta" | "media" | "bassa" | null,
  "motivazione_priorita": string | null,
  "tipo_intervento": "emergenza" | "correttivo" | "preventivo" | "predittivo" | "programmato" | null,
  "category": "guasto" | "manutenzione" | "anomalia" | "altro" | null,
  "auto_assegnazione": boolean,
  "ricambi_potenziali": string[],
  "note_tecniche": string | null,
  "confidence": number
}

Regole:
- "summary": titolo breve (max 80 caratteri), in italiano, al presente,
  descrittivo. Obbligatorio.
- "diagnosi_iniziale": valutazione tecnica preliminare desunta dal vocale
  (es. "cuscinetto in degrado, sospetto inizio cedimento"). Null se non
  presente.
- "motivazione_priorita": perché questa priorità (motivazione tecnica o
  produttiva), max 100 caratteri. Null se non desumibile.
- "auto_assegnazione": true se il Tecnico dice esplicitamente "me lo
  assegno", "lo prendo io", "ci penso io" o simili.
- "ricambi_potenziali": array di stringhe con i ricambi che il Tecnico
  prevede possano servire (max 5 elementi). [] se nessuno menzionato.
- "tipo_intervento": deduci dal contesto. "emergenza" se urgente bloccante,
  "predittivo" se rilevamento anticipato (rumore, vibrazione), "programmato"
  se da pianificare entro X giorni, "preventivo" se manutenzione regolare,
  "correttivo" altrimenti.
- "category": "guasto"/"manutenzione"/"anomalia"/"altro" come per Operatore.
- "confidence": 0-100, quanto sei sicuro dell'estrazione complessiva. Sotto
  60 se molti campi sono null o ambigui.
- NON inventare informazioni. Se un campo non è desumibile, metti null
  (oppure [] per array, false per auto_assegnazione).
- Se la macchina nell'audio non è nella lista, lascia machine_id e
  machine_name a null.`
}

function buildSystemPromptTechUpdate(_machines: MachineInput[], payload: ContextPayload): string {
  const ctx = [
    payload.ticket_title ? `Titolo: ${payload.ticket_title}` : null,
    payload.ticket_status ? `Stato attuale: ${payload.ticket_status}` : null,
    payload.machine_name ? `Macchina: ${payload.machine_name}` : null,
    payload.current_assignee ? `Assegnato a: ${payload.current_assignee}` : null,
  ].filter(Boolean).join('\n')

  const history = (payload.last_activities || []).slice(0, 3).join('\n  - ')

  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Un TECNICO sta aggiornando un ticket esistente tramite comando vocale.

CONTESTO TICKET:
${ctx || '(nessun contesto fornito)'}

ULTIME ATTIVITÀ:
  - ${history || '(nessuna attività precedente)'}

Devi estrarre i campi seguenti dalla trascrizione vocale del Tecnico.
Rispondi SOLO con un oggetto JSON valido conforme a questo schema, nessun
altro testo, nessun markdown, nessun code fence:

{
  "diagnosi_confermata": string | null,
  "azioni_eseguite": string[],
  "ricambi_ordinati": [
    { "articolo": string, "fornitore": string | null, "eta": string | null }
  ],
  "stato_proposto": "in_lavorazione" | "in_attesa_ricambi" | "risolta" | null,
  "note_tecniche": string | null,
  "tempo_intervento_minuti": number | null,
  "confidence": number
}

Regole:
- "diagnosi_confermata": cosa il Tecnico ha effettivamente trovato (es.
  "pistoncino rovinato", "cuscinetto bloccato"). Null se non chiaro.
- "azioni_eseguite": array di azioni concrete fatte dal Tecnico (es.
  ["smontaggio valvola", "sostituzione guarnizione temporanea"]). [] se
  nessuna.
- "ricambi_ordinati": array di ricambi ordinati durante l'intervento, con
  fornitore ed ETA se menzionati. [] se nessun ordine.
- "stato_proposto": il nuovo stato che il Tecnico sta indicando:
  - "in_lavorazione" se sta ancora lavorando
  - "in_attesa_ricambi" se ha ordinato pezzi e aspetta
  - "risolta" se dichiara esplicitamente che ha risolto
  - null se non chiaro o se non vuole cambiare stato
- "note_tecniche": testo libero con osservazioni tecniche aggiuntive.
- "tempo_intervento_minuti": durata stimata dell'intervento appena fatto,
  in minuti. Es. "ho impiegato due ore" → 120. Null se non menzionato.
- "confidence": 0-100. Sotto 60 se ambiguo.
- NON inventare. Null/[] se non desumibile.`
}

function buildSystemPromptTechClose(_machines: MachineInput[], payload: ContextPayload): string {
  const ctx = [
    payload.ticket_title ? `Titolo: ${payload.ticket_title}` : null,
    payload.machine_name ? `Macchina: ${payload.machine_name}` : null,
  ].filter(Boolean).join('\n')

  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Un TECNICO sta CHIUDENDO un ticket tramite comando vocale.
Devi estrarre i campi di chiusura dell'intervento.

CONTESTO TICKET:
${ctx || '(nessun contesto fornito)'}

Rispondi SOLO con un oggetto JSON valido conforme a questo schema, nessun
altro testo, nessun markdown, nessun code fence:

{
  "closure_hours": number | null,
  "closure_parts": string | null,
  "closure_root_cause": string | null,
  "closure_action": string | null,
  "test_eseguiti": string | null,
  "confidence": number
}

Regole:
- "closure_hours": ore lavoro (può essere decimale: 1.5 = 1h30min). Es.
  "ci ho messo due ore" → 2. "Mezza giornata" → 4. Null se non menzionato.
- "closure_parts": ricambi utilizzati durante l'intervento, testo libero
  (es. "kit guarnizioni DN65, cuscinetto SKF 6205"). Null se nessuno.
- "closure_root_cause": causa radice del guasto come dichiarata dal
  Tecnico (es. "filtri sporchi a monte", "cuscinetto rotto per usura").
  Obbligatorio quando possibile, null solo se davvero non deducibile.
- "closure_action": azione correttiva applicata (es. "sostituzione
  pistoncino e pulizia filtri", "lubrificazione e ritaratura"). Null se
  non chiaro.
- "test_eseguiti": eventuali test/verifiche fatte (es. "due cicli a vuoto",
  "test pressione 6 bar"). Null se nessuno.
- "confidence": 0-100. Sotto 60 se molti campi null.
- NON inventare. Estrai solo quello che il Tecnico dice esplicitamente.`
}

function buildSystemPromptTechNote(_machines: MachineInput[], payload: ContextPayload): string {
  const ctx = payload.ticket_title ? `Ticket: ${payload.ticket_title}` : '(nessun contesto fornito)'

  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Un TECNICO sta aggiungendo una NOTA RAPIDA a un ticket, senza cambiare
lo stato. Devi solo pulire e strutturare leggermente la trascrizione.

CONTESTO: ${ctx}

Rispondi SOLO con un oggetto JSON valido conforme a questo schema, nessun
altro testo, nessun markdown, nessun code fence:

{
  "nota_tecnica": string,
  "tag": string | null,
  "confidence": number
}

Regole:
- "nota_tecnica": il testo della nota, ripulito ma fedele alla trascrizione
  (max 500 caratteri). Obbligatorio.
- "tag": una parola chiave singola che categorizzi la nota se evidente
  (es. "fornitore", "ricambio", "pianificazione", "osservazione"). Null
  se non chiaro.
- "confidence": 0-100. Per le note semplici quasi sempre alto (>80).`
}

function buildSystemPromptTechSpare(_machines: MachineInput[], payload: ContextPayload): string {
  const ctx = [
    payload.ticket_title ? `Ticket: ${payload.ticket_title}` : null,
    payload.machine_name ? `Macchina: ${payload.machine_name}` : null,
  ].filter(Boolean).join('\n') || '(nessun contesto fornito)'

  return `Sei un assistente per la manutenzione industriale di un birrificio (ManuTech).
Un TECNICO sta richiedendo un RICAMBIO tramite comando vocale.

CONTESTO:
${ctx}

Rispondi SOLO con un oggetto JSON valido conforme a questo schema, nessun
altro testo, nessun markdown, nessun code fence:

{
  "articolo": string,
  "quantita": number,
  "fornitore": string | null,
  "urgenza": "bassa" | "media" | "alta" | "urgente",
  "deadline_giorni": number | null,
  "note": string | null,
  "confidence": number
}

Regole:
- "articolo": nome del ricambio richiesto (es. "kit guarnizioni DN65",
  "cuscinetto SKF 6205"). Obbligatorio. Max 100 caratteri.
- "quantita": quantità richiesta. Default 1 se non menzionata. Mai null.
- "fornitore": brand/fornitore se menzionato (SKF, Festo, Comac, ...).
  Null altrimenti.
- "urgenza":
  - "urgente" se "subito", "appena possibile", "domani", "entro questa
    settimana"
  - "alta" se entro 3-5 giorni o "presto"
  - "media" se entro 1-2 settimane
  - "bassa" se senza fretta
- "deadline_giorni": numero di giorni entro cui serve il ricambio. Es.
  "fine settimana" → calcola in base a oggi (default 5). "Lunedì" → 3-4.
  Null se nessuna deadline.
- "note": testo libero con info aggiuntive (compatibilità, alternative,
  ecc.). Null se nessuna.
- "confidence": 0-100. Sotto 60 se l'articolo non è chiaramente
  identificabile.`
}

const PROMPT_BUILDERS: Record<string, (m: MachineInput[], p: ContextPayload) => string> = {
  operator_new_ticket: buildSystemPromptOperator,
  tech_new_ticket: buildSystemPromptTechNew,
  tech_update: buildSystemPromptTechUpdate,
  tech_close: buildSystemPromptTechClose,
  tech_note: buildSystemPromptTechNote,
  tech_spare_request: buildSystemPromptTechSpare,
}

// ──────────────────────────────────────────────────────────────────────────
// PARSERS — uno per ogni context
// ──────────────────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    cleaned = cleaned.slice(first, last + 1)
  }
  return cleaned
}

function safeParse(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(stripFences(raw))
  } catch (err) {
    console.warn('extract-ticket-fields: JSON parse failed', err, raw.slice(0, 200))
    return null
  }
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (Number.isNaN(n)) return 70
  return Math.max(0, Math.min(100, n))
}

function asString(v: unknown, max = 500): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return s.slice(0, max)
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(v as T) ? (v as T) : null
}

function asStringArray(v: unknown, maxItems = 10): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => asString(x, 200)).filter((x): x is string => !!x).slice(0, maxItems)
}

function parseOperatorNewTicket(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  return {
    machine_id: asString(p.machine_id, 50),
    machine_name: asString(p.machine_name, 200),
    priority: asEnum(p.priority, SEVERITY_VALUES),
    category: asEnum(p.category, CATEGORY_VALUES),
    area: asString(p.area, 80),
    summary: asString(p.summary, 120) || '',
  }
}

function parseTechNewTicket(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  const ricambi = asStringArray(p.ricambi_potenziali, 5)
  return {
    machine_id: asString(p.machine_id, 50),
    machine_name: asString(p.machine_name, 200),
    componente: asString(p.componente, 100),
    tipo_guasto: asString(p.tipo_guasto, 50),
    summary: asString(p.summary, 120) || '',
    diagnosi_iniziale: asString(p.diagnosi_iniziale, 500),
    priority: asEnum(p.priority, SEVERITY_VALUES),
    motivazione_priorita: asString(p.motivazione_priorita, 200),
    tipo_intervento: asEnum(p.tipo_intervento, INTERVENTION_VALUES),
    category: asEnum(p.category, CATEGORY_VALUES),
    auto_assegnazione: !!p.auto_assegnazione,
    ricambi_potenziali: ricambi,
    note_tecniche: asString(p.note_tecniche, 500),
    confidence: clampConfidence(p.confidence),
  }
}

function parseTechUpdate(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  const ricambiRaw = Array.isArray(p.ricambi_ordinati) ? p.ricambi_ordinati : []
  const ricambi_ordinati = ricambiRaw.slice(0, 10).map((r: Record<string, unknown>) => ({
    articolo: asString(r.articolo, 200) || '',
    fornitore: asString(r.fornitore, 100),
    eta: asString(r.eta, 50),
  })).filter(r => r.articolo)

  const tempo = typeof p.tempo_intervento_minuti === 'number'
    ? p.tempo_intervento_minuti
    : parseFloat(String(p.tempo_intervento_minuti ?? ''))

  return {
    diagnosi_confermata: asString(p.diagnosi_confermata, 500),
    azioni_eseguite: asStringArray(p.azioni_eseguite, 10),
    ricambi_ordinati,
    stato_proposto: asEnum(p.stato_proposto, STATUS_VALUES),
    note_tecniche: asString(p.note_tecniche, 1000),
    tempo_intervento_minuti: Number.isFinite(tempo) ? Math.max(0, tempo) : null,
    confidence: clampConfidence(p.confidence),
  }
}

function parseTechClose(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  const hours = typeof p.closure_hours === 'number'
    ? p.closure_hours
    : parseFloat(String(p.closure_hours ?? ''))
  return {
    closure_hours: Number.isFinite(hours) ? Math.max(0, hours) : null,
    closure_parts: asString(p.closure_parts, 500),
    closure_root_cause: asString(p.closure_root_cause, 500),
    closure_action: asString(p.closure_action, 500),
    test_eseguiti: asString(p.test_eseguiti, 500),
    confidence: clampConfidence(p.confidence),
  }
}

function parseTechNote(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  return {
    nota_tecnica: asString(p.nota_tecnica, 500) || '',
    tag: asString(p.tag, 50),
    confidence: clampConfidence(p.confidence),
  }
}

function parseTechSpare(raw: string) {
  const p = safeParse(raw)
  if (!p) return null
  const qty = typeof p.quantita === 'number' ? p.quantita : parseInt(String(p.quantita ?? '1'), 10)
  const dl = typeof p.deadline_giorni === 'number' ? p.deadline_giorni : parseInt(String(p.deadline_giorni ?? ''), 10)
  return {
    articolo: asString(p.articolo, 200) || '',
    quantita: Number.isFinite(qty) && qty > 0 ? qty : 1,
    fornitore: asString(p.fornitore, 100),
    urgenza: asEnum(p.urgenza, URGENCY_VALUES) || 'media',
    deadline_giorni: Number.isFinite(dl) && dl >= 0 ? dl : null,
    note: asString(p.note, 500),
    confidence: clampConfidence(p.confidence),
  }
}

const PARSERS: Record<string, (raw: string) => unknown> = {
  operator_new_ticket: parseOperatorNewTicket,
  tech_new_ticket: parseTechNewTicket,
  tech_update: parseTechUpdate,
  tech_close: parseTechClose,
  tech_note: parseTechNote,
  tech_spare_request: parseTechSpare,
}

// ──────────────────────────────────────────────────────────────────────────
// CLAUDE CALL
// ──────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY non configurata' }, 500)

    const body = await req.json().catch(() => ({}))
    const text: string = (body?.text || '').toString().trim()
    const machines: MachineInput[] = Array.isArray(body?.machines) ? body.machines : []
    const contextRaw: string = (body?.context || 'operator_new_ticket').toString()
    const context: string = PROMPT_BUILDERS[contextRaw] ? contextRaw : 'operator_new_ticket'
    const contextPayload: ContextPayload = (body?.context_payload && typeof body.context_payload === 'object')
      ? body.context_payload as ContextPayload
      : {}

    if (!text) return jsonResponse({ error: 'Campo "text" obbligatorio' }, 400)
    if (text.length > 4000) return jsonResponse({ error: 'Testo troppo lungo (max 4000)' }, 400)

    const builder = PROMPT_BUILDERS[context]
    const parser = PARSERS[context]
    const systemPrompt = builder(machines, contextPayload)

    const raw = await callClaude(systemPrompt, text, apiKey)
    const fields = parser(raw)

    if (!fields) {
      // Fallback context-specific: payload minimo per consentire compilazione manuale
      if (context === 'operator_new_ticket' || context === 'tech_new_ticket') {
        return jsonResponse({
          machine_id: null,
          machine_name: null,
          priority: null,
          category: null,
          area: null,
          summary: text.slice(0, 80),
          confidence: 0,
        })
      }
      return jsonResponse({ confidence: 0, _fallback: true, _raw_text: text.slice(0, 200) })
    }

    // Validazione machine_id contro lista reale + fuzzy fallback
    // (solo per context con macchine)
    if (context === 'operator_new_ticket' || context === 'tech_new_ticket') {
      const f = fields as { machine_id?: string | null; machine_name?: string | null; summary?: string }
      if (f.machine_id && !machines.some(m => m.id === f.machine_id)) {
        f.machine_id = null
        f.machine_name = null
      }
      // Fuzzy fallback: se Claude non ha matchato, cerca direttamente nel
      // testo trascritto i token significativi del nome macchina.
      if (!f.machine_id && machines.length > 0) {
        const fuzzy = fuzzyMatchMachine(text, f.machine_name, machines)
        if (fuzzy) {
          f.machine_id = fuzzy.id
          f.machine_name = fuzzy.name
        }
      }
      if (!f.summary) f.summary = text.slice(0, 80)
    }

    return jsonResponse(fields)
  } catch (err) {
    console.error('extract-ticket-fields fatal error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : 'Errore imprevisto',
    }, 500)
  }
})
