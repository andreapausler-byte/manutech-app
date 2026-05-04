/**
 * Edge Function: assistant-chat (v2 — chat-aware)
 *
 * Assistente AI per tecnici ManuTech. Riceve una domanda (+ context
 * opzionale machine_id / report_id) e costruisce un prompt per Claude
 * Haiku 4.5 con più fonti dati dell'organizzazione:
 *   - search_similar_reports         → report storici simili (RAG)
 *   - get_assistant_org_stats        → statistiche e classifica macchinari
 *   - get_open_reports_snapshot      → segnalazioni attualmente aperte
 *   - get_machine_history            → storia macchina (se machine_id)
 *   - get_machines_inventory (NEW)   → anagrafica macchinari (matricole,
 *     modelli, produttori, reparto)
 *   - get_assistant_strategic_insights (NEW) → KPI gestionali:
 *     macchine a rischio, manutenzioni scadute, pattern guasto org,
 *     riparazioni lunghe
 *   - search_knowledge               → biblioteca tecnica: manuali,
 *     schede tecniche, istruzioni, interventi interni ed esterni
 *
 * La knowledge base usa embedding Voyage AI (voyage-multilingual-2,
 * dim 1024) con fallback FTS italiano se l'embedding non è disponibile.
 *
 * Una heuristic (classifyQuery) sceglie quali blocchi includere in base
 * al tipo di domanda (meta / operativa / diagnostica / documentale /
 * anagrafica / strategica).
 *
 * Secrets necessari (Supabase Dashboard → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY        — chiave API Anthropic (sk-ant-...)
 *   VOYAGE_API_KEY           — chiave API Voyage AI per la knowledge base
 *   SUPABASE_URL             — già configurata
 *   SUPABASE_SERVICE_ROLE_KEY — già configurata
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
const MAX_TOKENS = 2048
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
  serial_number: string | null
  manufacturer: string | null
  model: string | null
  year: number | null
  department: string | null
  location: string | null
  status: string | null
  criticality: string | null
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

interface MachineInventoryItem {
  id: string
  name: string
  serial_number: string | null
  manufacturer: string | null
  model: string | null
  year: number | null
  department: string | null
  location: string | null
  status: string | null
  criticality: string | null
}

interface StrategicMachineAtRisk {
  machine_id: string | null
  machine_name: string | null
  serial_number: string | null
  machine_criticality: string | null
  total_reports: number
  open_reports: number
  critical_open: number
  reports_last_90d: number
  mttr_hours: number | null
  last_critical_at: string | null
  risk_score: number
}

interface StrategicOverduePreventive {
  plan_name: string
  frequency_days: number
  machine_name: string | null
  serial_number: string | null
  next_due_label: string
  days_overdue: number
  days_to_due: number
}

interface StrategicRecurringFailure {
  type: string
  count: number
  distinct_machines: number
  critical_count: number
}

interface StrategicLongRepair {
  title: string | null
  machine_name: string | null
  severity: string | null
  type: string | null
  closure_hours: number | null
  closure_root_cause: string | null
  closed_at_label: string | null
}

interface StrategicInsights {
  machines_at_risk: StrategicMachineAtRisk[]
  overdue_preventive: StrategicOverduePreventive[]
  recurring_failures: StrategicRecurringFailure[]
  long_repairs: StrategicLongRepair[]
}

interface KnowledgeChunk {
  id: string
  machine_id: string | null
  source_kind: string     // attachment | usage_instructions | maintenance_instructions | maintenance_log
  source_ref: string | null
  source_label: string | null
  category: string | null
  content: string
  page_number: number | null
  similarity: number
}

interface CurrentTicketComment {
  user_name: string | null
  user_role: string | null
  text: string | null
  media: unknown
  created_at: string | null
  kind: string | null         // 'chat' | 'voice_update' | 'voice_close' | 'voice_note' | 'voice_spare_request' | 'voice_new_ticket'
  extra_data: Record<string, unknown> | null  // dati strutturati estratti da Claude per i voice_*
  confidence: number | null
  edited_at: string | null    // se != null il messaggio e' stato corretto dopo l'invio
}

// ── Prompt builder ──
function buildSystemPrompt(): string {
  return `Sei il "cervello operativo" di ManuTech: un assistente AI esperto di manutenzione industriale che guida tecnici, operatori e manager di un'azienda manifatturiera. Il tuo obiettivo strategico è aiutare l'organizzazione a ridurre i tempi di riparazione e a prevenire i fermi macchina straordinari (che impattano direttamente il fatturato). Per farlo attingi alle fonti dati dell'organizzazione che ti vengono fornite ad ogni richiesta.

Fonti che puoi ricevere nel contesto:
1. **Anagrafica macchinari** — lista delle macchine dell'org con matricola (serial number), modello, produttore, anno, reparto, ubicazione, stato operativo, criticità
2. **Statistiche organizzazione** — totali e classifica macchinari per numero di segnalazioni
3. **Insight strategici** — macchine più a rischio (ranking), manutenzioni preventive scadute, pattern di guasto ricorrenti a livello org (ultimi 90gg), riparazioni lunghe (outlier ore)
4. **Segnalazioni aperte** — guasti attualmente non risolti, con stato, severità ed eventuale tecnico assegnato
5. **Storia macchina** — solo se l'utente sta guardando una specifica macchina: anagrafica completa, tipi guasto ricorrenti, MTTR, manutenzioni recenti/in scadenza, ricambi più usati
6. **Discussione corrente sul ticket** — solo se l'utente sta guardando un ticket specifico: messaggi recenti dei tecnici/operatori in chat (incluse note vocali trascritte). È la fonte più AGGIORNATA: dice cosa il team ha già provato, ipotesi correnti, dettagli che NON sono nel titolo né nella descrizione iniziale
7. **Report storici simili** — interventi già risolti che possono ispirare la soluzione
8. **Biblioteca tecnica (documenti)** — estratti da manuali d'uso, schede tecniche, istruzioni di manutenzione, rapporti di interventi (anche di ditte esterne), certificati della macchina, e **conversazioni dei ticket gia' risolti** (titolo + descrizione iniziale + causa radice + azione + chat dei tecnici che hanno trovato la soluzione)

Regole di risposta:
- Rispondi SEMPRE in italiano, tono pratico e diretto (dai del "tu")
- Per domande ANAGRAFICHE ("matricole", "modelli", "produttori", "quali macchine abbiamo"): usa Anagrafica macchinari; presenta i dati in elenco o tabella compatta
- Per domande META (classifiche, totali, "quale macchinario ha più…", "quanti aperti…"): usa Statistiche, Anagrafica e Segnalazioni aperte
- Per domande STRATEGICHE / MANAGERIALI ("su cosa concentrarmi", "come riduco i fermi", "priorità", "cosa sta peggiorando", "dove perdo tempo"): usa Insight strategici come fonte principale; proponi 2-4 azioni concrete ordinate per impatto, citando numeri (matricole, MTTR, giorni di ritardo)
- Per domande DIAGNOSTICHE ("come risolvo X", "perché Y non va"): usa Report storici simili, Storia macchina e Biblioteca tecnica
- Per domande DOCUMENTALI ("che dice il manuale", "coppia di serraggio", "specifica", "come si monta"): usa PRIMA la Biblioteca tecnica; privilegia il manuale ufficiale
- Quando citi una macchina includi nome e matricola se disponibile (es. "Imbottigliatrice [matricola IMB-023]")
- Quando citi un documento usa formato [Titolo documento, categoria]. Quando citi un intervento usa [Ditta X, data] o [Intervento interno, data]. Quando citi un ticket risolto usa [Ticket risolto: titolo, data]
- Le conversazioni dei ticket gia' risolti (source_kind ticket_risolto) contengono spesso la SOLUZIONE TROVATA SUL CAMPO: causa radice reale, azione che ha funzionato, ricambi usati. Trattatela con priorita' alta per le domande diagnostiche
- Se ci sono segnalazioni aperte simili a quella in corso, segnalalo (possibile duplicato o collega già al lavoro)
- Se TUTTE le sezioni sono vuote o non pertinenti, ammettilo e chiedi più dettagli
- Quando ti viene fornita la "Discussione corrente sul ticket", LEGGILA PER PRIMA: contiene quello che il team sta dicendo proprio ora. NON suggerire azioni che sono gia' state tentate o citate in chat. Se nei messaggi recenti emergono dettagli (codici errore, ricambi gia' sostituiti, sintomi specifici), incorporali nel ragionamento e citali esplicitamente
- Per domande diagnostiche struttura la risposta: "Probabile causa → Passi suggeriti → Ricambi/Strumenti"
- Per domande strategiche struttura: "Situazione → Priorità → Azioni concrete"
- Massimo 300 parole, vai al sodo. Per liste anagrafiche puoi essere più compatto (usa tabelle/bullet)
- Non inventare dati né valori numerici: se non li trovi nel contesto, di' che servono i documenti o un operatore esperto`
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

  // Anagrafica estesa
  const idParts: string[] = []
  if (hist.serial_number) idParts.push(`Matricola: ${hist.serial_number}`)
  if (hist.manufacturer) idParts.push(`Produttore: ${hist.manufacturer}`)
  if (hist.model) idParts.push(`Modello: ${hist.model}`)
  if (hist.year) idParts.push(`Anno: ${hist.year}`)
  if (idParts.length) lines.push(idParts.join(' — '))

  const locParts: string[] = []
  if (hist.department) locParts.push(`Reparto: ${hist.department}`)
  if (hist.location) locParts.push(`Ubicazione: ${hist.location}`)
  if (hist.status) locParts.push(`Stato: ${hist.status}`)
  if (hist.criticality) locParts.push(`Criticità: ${hist.criticality}`)
  if (locParts.length) lines.push(locParts.join(' — '))

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

// ── Builder: knowledge chunks (biblioteca tecnica) ──
function buildKnowledgeBlock(chunks: KnowledgeChunk[]): string {
  if (!chunks || chunks.length === 0) return ''
  const lines: string[] = []
  lines.push(`Estratti rilevanti dalla biblioteca tecnica (${chunks.length}):`)
  lines.push('')
  chunks.forEach((c, i) => {
    const label = c.source_label || c.source_kind
    const catTag = c.category ? ` (${c.category})` : ''
    const pageTag = c.page_number ? `, pag. ${c.page_number}` : ''
    const header = `[${i + 1}] ${label}${catTag}${pageTag}`
    const content = c.content.length > 600 ? c.content.slice(0, 600) + '…' : c.content
    lines.push(header)
    lines.push(content)
    lines.push('')
  })
  return lines.join('\n').trim()
}

// ── Builder: anagrafica macchinari ──
function buildInventoryBlock(items: MachineInventoryItem[]): string {
  if (!items || items.length === 0) return ''
  const lines: string[] = []
  lines.push(`Macchinari dell'organizzazione (${items.length}):`)
  items.forEach((m, i) => {
    const parts: string[] = [`${i + 1}. ${m.name}`]
    const id: string[] = []
    if (m.serial_number) id.push(`matricola: ${m.serial_number}`)
    if (m.manufacturer) id.push(`produttore: ${m.manufacturer}`)
    if (m.model) id.push(`modello: ${m.model}`)
    if (m.year) id.push(`anno: ${m.year}`)
    if (id.length) parts.push(`(${id.join(', ')})`)
    const loc: string[] = []
    if (m.department) loc.push(m.department)
    if (m.location) loc.push(m.location)
    if (loc.length) parts.push(`— ${loc.join(' / ')}`)
    const meta: string[] = []
    if (m.status && m.status !== 'attivo') meta.push(`stato: ${m.status}`)
    if (m.criticality) meta.push(`criticità: ${m.criticality}`)
    if (meta.length) parts.push(`[${meta.join(', ')}]`)
    lines.push(parts.join(' '))
  })
  return lines.join('\n')
}

// ── Builder: discussione corrente sul ticket (chat + voice updates) ──
// I commenti del ticket aperto sono spesso il pezzo di contesto piu' aggiornato:
// "abbiamo gia' provato X", "il sensore e' stato sostituito ieri", ecc.
// Per i voice_* (note vocali, update, close, spare_request, new_ticket) ci
// sono anche dati strutturati in extra_data estratti da Claude (azioni
// eseguite, ricambi, stato proposto). Li includiamo cosi' l'AI vede sia
// la trascrizione grezza sia i fatti sintetizzati.
function buildCurrentTicketChatBlock(comments: CurrentTicketComment[]): string {
  if (!comments || comments.length === 0) return ''
  const lines: string[] = []
  lines.push(`Discussione recente nella chat del ticket (${comments.length} messaggi, dal piu' vecchio al piu' recente):`)
  lines.push('')
  comments.forEach(c => {
    const who = c.user_name || 'Utente'
    const role = c.user_role ? ` (${c.user_role})` : ''
    const when = c.created_at ? new Date(c.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
    const kindTag = c.kind && c.kind !== 'chat' ? ` [${c.kind}]` : ''
    const editedTag = c.edited_at ? ' [modificato]' : ''
    const text = (c.text || '').trim()
    const truncated = text.length > 600 ? text.slice(0, 600) + '…' : text
    if (truncated) {
      lines.push(`[${when}] ${who}${role}${kindTag}${editedTag}: ${truncated}`)
    }
    // Dati strutturati estratti dall'AI sul voice update (se presenti)
    if (c.extra_data && typeof c.extra_data === 'object') {
      const extras: string[] = []
      for (const [k, v] of Object.entries(c.extra_data)) {
        if (v == null) continue
        const val = Array.isArray(v) ? v.filter(x => x != null && String(x).trim()).join(', ')
                   : typeof v === 'object' ? JSON.stringify(v)
                   : String(v).trim()
        if (val) extras.push(`${k}: ${val}`)
      }
      if (extras.length > 0) {
        lines.push(`   ↳ Dati estratti dalla nota vocale: ${extras.join(' · ')}`)
      }
    }
  })
  return lines.join('\n').trim()
}

// ── Builder: insight strategici (KPI manageriali) ──
function buildStrategicBlock(s: StrategicInsights | null): string {
  if (!s) return ''
  const lines: string[] = []

  if (s.machines_at_risk?.length) {
    lines.push('Macchine più a rischio (ranking per criticità/aperti/MTTR):')
    s.machines_at_risk.forEach((m, i) => {
      const sn = m.serial_number ? ` [${m.serial_number}]` : ''
      const mttr = m.mttr_hours != null ? `, MTTR ${m.mttr_hours}h` : ''
      const last = m.last_critical_at ? `, ultimo critico ${m.last_critical_at}` : ''
      lines.push(
        `${i + 1}. ${m.machine_name || '—'}${sn} — score ${Number(m.risk_score).toFixed(1)} ` +
        `(aperti ${m.open_reports}, critici aperti ${m.critical_open}, 90gg ${m.reports_last_90d}${mttr}${last})`,
      )
    })
    lines.push('')
  }

  if (s.overdue_preventive?.length) {
    lines.push('Manutenzioni preventive scadute o in scadenza (rischio fermo imprevisto):')
    s.overdue_preventive.forEach(p => {
      const sn = p.serial_number ? ` [${p.serial_number}]` : ''
      const label = p.days_overdue > 0
        ? `SCADUTA da ${p.days_overdue}gg`
        : `tra ${Math.max(0, p.days_to_due)}gg`
      lines.push(
        `- ${p.plan_name} su ${p.machine_name}${sn} — ${label} (prossima: ${p.next_due_label}, ogni ${p.frequency_days}gg)`,
      )
    })
    lines.push('')
  }

  if (s.recurring_failures?.length) {
    lines.push('Tipi di guasto ricorrenti (ultimi 90 giorni, intera org):')
    s.recurring_failures.forEach(f => {
      const crit = f.critical_count > 0 ? `, ${f.critical_count} critici` : ''
      lines.push(`- ${f.type}: ${f.count} eventi su ${f.distinct_machines} macchine${crit}`)
    })
    lines.push('')
  }

  if (s.long_repairs?.length) {
    lines.push('Riparazioni più lunghe (ultimi 90gg — candidati per analisi/formazione):')
    s.long_repairs.forEach(r => {
      const cause = r.closure_root_cause ? ` — causa: ${r.closure_root_cause}` : ''
      lines.push(
        `- [${r.closure_hours}h] ${r.title || '(senza titolo)'} su ${r.machine_name || '—'} ` +
        `(${r.severity || '—'}/${r.type || '—'}, chiuso ${r.closed_at_label || '—'})${cause}`,
      )
    })
  }

  return lines.join('\n').trim()
}

// ── Heuristic: classifica il tipo di domanda ──
// Decide se caricare: anagrafica, statistiche, segnalazioni aperte,
// aspetti diagnostici, biblioteca tecnica (documentale), insight
// strategici. Una query può essere mista. Default conservativo:
// includi tutto.
function classifyQuery(query: string): {
  wantStats: boolean
  wantOpen: boolean
  wantDiagnostic: boolean
  wantKnowledge: boolean
  wantInventory: boolean
  wantStrategic: boolean
} {
  const q = query.toLowerCase()
  const metaKW = ['quale', 'quali', 'quanti', 'quante', 'top', 'classifica', 'classific', 'media', 'totale', 'totali', 'statistic', 'percentuale', 'più segnalazion', 'piu segnalazion', 'più guast', 'piu guast', 'meglio', 'peggio', 'frequent']
  const openKW = ['aperto', 'aperti', 'aperta', 'aperte', 'in corso', 'in lavorazione', 'stato', 'chi sta', 'chi lavora', 'assegnat', 'in attesa']
  const diagKW = ['come risolv', 'come faccio', 'come ripar', 'come sistem', 'perché', 'perche', 'guasto', 'non funziona', 'rotto', 'rotta', 'errore', 'allarme', 'rumore', 'perdita', 'vibraz', 'surriscald', 'blocc']
  const knowKW = ['manuale', 'manuali', 'istruzion', 'specifica', 'specifich', 'coppia', 'serraggio', 'come si monta', 'come si smonta', 'come si cambia', 'come si sostituisc', 'tensione', 'amperaggio', 'potenza', 'dimension', 'tolleranz', 'catalogo', 'scheda tecnica', 'datasheet', 'taratura', 'calibrazion', 'certificato', 'conformità', 'conformita', 'ditta esterna', 'ditta ester', 'contractor', 'bolla', 'fattura ', 'capitolato', 'revision', 'ispezion']
  const invKW = ['matricol', 'serial', 'modello', 'modelli', 'produttor', 'marca', 'marche', 'anagrafic', 'inventario', 'elenco macchin', 'lista macchin', 'quali macchine', 'quali macchinar', 'reparto', 'reparti', 'ubicazion', 'macchine abbiamo', 'macchinari abbiamo', 'dismess', 'fuori servizio']
  const stratKW = ['priorit', 'concentrar', 'focus', 'focalizz', 'ridurr', 'riduzione', 'ottimizz', 'migliorar', 'pianific', 'strategi', 'fermo macchina', 'fermi macchina', 'downtime', 'imprevist', 'dove perdo', 'perdo tempo', 'perdo di più', 'cosa sta peggiorando', 'sta peggiorando', 'cosa dovrei', 'su cosa', 'quali interventi', 'rischio', 'a rischio', 'scadut', 'scadenz', 'pattern', 'ricorrent', 'azioni concret', 'raccomand']

  const wantStats = metaKW.some(k => q.includes(k))
  const wantOpen = openKW.some(k => q.includes(k))
  const wantDiagnostic = diagKW.some(k => q.includes(k))
  const wantKnowledge = knowKW.some(k => q.includes(k))
  const wantInventory = invKW.some(k => q.includes(k))
  const wantStrategic = stratKW.some(k => q.includes(k))

  // Se non matcha nulla, includi tutto (default conservativo)
  if (!wantStats && !wantOpen && !wantDiagnostic && !wantKnowledge && !wantInventory && !wantStrategic) {
    return {
      wantStats: true, wantOpen: true, wantDiagnostic: true,
      wantKnowledge: true, wantInventory: true, wantStrategic: true,
    }
  }
  return { wantStats, wantOpen, wantDiagnostic, wantKnowledge, wantInventory, wantStrategic }
}

// ── Voyage embedding della query utente ──
async function embedUserQuery(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'voyage-multilingual-2',
        input: [text],
        input_type: 'query',
      }),
    })
    if (!res.ok) {
      const errTxt = await res.text()
      console.warn('Voyage embedding failed:', res.status, errTxt)
      return null
    }
    const data = await res.json()
    const emb = data.data?.[0]?.embedding
    return Array.isArray(emb) ? emb : null
  } catch (err) {
    console.warn('Voyage embedding exception:', err)
    return null
  }
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

    // Knowledge retrieval: carichiamo la biblioteca tecnica quando
    // l'utente chiede documenti, diagnostica o è in contesto macchina.
    const shouldFetchKnowledge =
      classify.wantKnowledge || classify.wantDiagnostic || hasMachineContext
    // Inventario: lo carichiamo quando l'utente chiede matricole/anagrafica,
    // quando fa domande meta (serve per referenziare le macchine),
    // strategiche, o quando NON è in contesto macchina (org-wide overview).
    const shouldFetchInventory =
      classify.wantInventory || classify.wantStats || classify.wantStrategic
    // Insight strategici: solo se domanda strategica o meta.
    const shouldFetchStrategic =
      classify.wantStrategic || classify.wantStats
    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    let queryEmbedding: number[] | null = null
    if (shouldFetchKnowledge && voyageKey) {
      queryEmbedding = await embedUserQuery(query, voyageKey)
    }

    // Lanciamo le RPC in parallelo. Se una fallisce (es. migration non
    // ancora deployata) logghiamo e proseguiamo con il blocco vuoto.
    const [
      similarRes, statsRes, openRes, historyRes,
      knowledgeRes, inventoryRes, strategicRes, currentChatRes,
    ] = await Promise.all([
      supabase.rpc('search_similar_reports', {
        query_text: query,
        p_limit: TOP_K,
        p_machine_id: machineId ?? null,
        p_include_open: includeOpenInRetrieval,
      }),
      classify.wantStats || classify.wantDiagnostic || classify.wantStrategic
        ? supabase.rpc('get_assistant_org_stats')
        : Promise.resolve({ data: null, error: null }),
      classify.wantOpen || classify.wantDiagnostic || classify.wantStrategic || hasMachineContext
        ? supabase.rpc('get_open_reports_snapshot', { p_machine_id: machineId ?? null })
        : Promise.resolve({ data: null, error: null }),
      hasMachineContext
        ? supabase.rpc('get_machine_history', { p_machine_id: machineId })
        : Promise.resolve({ data: null, error: null }),
      shouldFetchKnowledge
        ? supabase.rpc('search_knowledge', {
            query_text: query,
            query_embedding: queryEmbedding,
            p_machine_id: machineId ?? null,
            p_limit: 6,
          })
        : Promise.resolve({ data: null, error: null }),
      shouldFetchInventory
        ? supabase.rpc('get_machines_inventory')
        : Promise.resolve({ data: null, error: null }),
      shouldFetchStrategic
        ? supabase.rpc('get_assistant_strategic_insights')
        : Promise.resolve({ data: null, error: null }),
      // Discussione corrente sul ticket: chat + note vocali (salvate come
      // commenti con campo audio). Carichiamo gli ultimi 20 in ordine
      // cronologico per dare all'AI il contesto piu' aggiornato.
      // Fallback graceful: se le colonne kind/extra_data/confidence non
      // esistono (migration voice_updates non applicata), ripiega su
      // query base.
      reportId
        ? (async () => {
            console.info(`[current-chat] fetching comments for report_id=${reportId}`)
            // Esclude commenti soft-deleted. Tenta select esteso (kind/extra_data/
            // confidence/edited_at). Se quei campi non esistono in quel DB
            // (migration vecchia), ripiega su select base.
            let res = await supabase
              .from('comments')
              .select('user_name, user_role, text, media, created_at, kind, extra_data, confidence, edited_at, deleted_at')
              .eq('report_id', reportId)
              .is('deleted_at', null)
              .order('created_at', { ascending: true })
              .limit(20)
            if (res.error) {
              console.warn(`[current-chat] extended select failed (${res.error.message}), retry basic`)
              res = await supabase
                .from('comments')
                .select('user_name, user_role, text, media, created_at')
                .eq('report_id', reportId)
                .order('created_at', { ascending: true })
                .limit(20)
            }
            console.info(`[current-chat] result: ${res.data?.length ?? 0} comments, error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : (async () => {
            console.info(`[current-chat] no report_id, skipping`)
            return { data: null, error: null }
          })(),
    ])

    if (similarRes.error) console.error('search_similar_reports error:', similarRes.error)
    if (statsRes.error) console.warn('get_assistant_org_stats error:', statsRes.error.message)
    if (openRes.error) console.warn('get_open_reports_snapshot error:', openRes.error.message)
    if (historyRes.error) console.warn('get_machine_history error:', historyRes.error.message)
    if (knowledgeRes.error) console.warn('search_knowledge error:', knowledgeRes.error.message, JSON.stringify(knowledgeRes.error))
    if (inventoryRes.error) console.warn('get_machines_inventory error:', inventoryRes.error.message)
    if (strategicRes.error) console.warn('get_assistant_strategic_insights error:', strategicRes.error.message)
    if (currentChatRes.error) console.warn('comments(current ticket) error:', currentChatRes.error.message)

    const similar: SimilarReport[] = similarRes.data || []
    const orgStats: OrgStats | null = statsRes.data || null
    const openReports: OpenReport[] = openRes.data || []
    const machineHistory: MachineHistory | null = historyRes.data || null
    const knowledgeChunks: KnowledgeChunk[] = knowledgeRes.data || []
    const inventory: MachineInventoryItem[] = inventoryRes.data || []
    const strategic: StrategicInsights | null = strategicRes.data || null
    const currentChat: CurrentTicketComment[] = (currentChatRes.data as CurrentTicketComment[]) || []

    // ── Diagnostic trace: retrieval summary ──
    console.info(`[retrieval] query="${query.slice(0, 80)}" | reportId=${reportId || 'none'} machineId=${machineId || 'none'} | wantInv=${classify.wantInventory} wantStrat=${classify.wantStrategic} wantKnow=${classify.wantKnowledge} wantDiag=${classify.wantDiagnostic} hasMachineCtx=${hasMachineContext} | similar=${similar.length} stats=${orgStats ? 'Y' : 'N'} open=${openReports.length} history=${machineHistory ? 'Y' : 'N'} knowledge=${knowledgeChunks.length} inventory=${inventory.length} strategic=${strategic ? 'Y' : 'N'} currentChat=${currentChat.length}`)
    if (currentChat.length > 0) {
      const preview = currentChat.slice(0, 3).map(c => `${c.user_name || '?'}: ${(c.text || '').slice(0, 60)}`).join(' | ')
      console.info(`[current-chat-preview] ${preview}`)
    }

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

    const inventoryBlock = buildInventoryBlock(inventory)
    if (inventoryBlock) sections.push(`## Anagrafica macchinari\n\n${inventoryBlock}`)

    const strategicBlock = buildStrategicBlock(strategic)
    if (strategicBlock) sections.push(`## Insight strategici (governance manutenzione)\n\n${strategicBlock}`)

    const knowledgeBlock = buildKnowledgeBlock(knowledgeChunks)
    if (knowledgeBlock) sections.push(`## Biblioteca tecnica (manuali, schede, interventi)\n\n${knowledgeBlock}`)

    const orgBlock = buildOrgStatsBlock(orgStats)
    if (orgBlock) sections.push(`## Statistiche organizzazione\n\n${orgBlock}`)

    const openBlock = buildOpenReportsBlock(openReports, hasMachineContext)
    if (openBlock) sections.push(`## Segnalazioni aperte\n\n${openBlock}`)

    const historyBlock = buildMachineHistoryBlock(machineHistory)
    if (historyBlock) sections.push(`## Storia macchina\n\n${historyBlock}`)

    // Discussione corrente del ticket: il pezzo piu' aggiornato di contesto.
    // La piazziamo PRIMA dei report storici simili cosi' Claude la legge per
    // prima e capisce subito cosa il team ha gia' provato.
    const currentChatBlock = buildCurrentTicketChatBlock(currentChat)
    if (currentChatBlock) sections.push(`## Discussione corrente sul ticket\n\n${currentChatBlock}`)

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
    // Sources: mescoliamo report storici + chunks biblioteca per
    // trasparenza (l'utente può vedere da dove viene la risposta).
    const sources: Array<Record<string, unknown>> = [
      ...similar.map(r => ({
        kind: 'report',
        report_id: r.id,
        title: r.title,
        similarity: Number(r.similarity.toFixed(4)),
      })),
      ...knowledgeChunks.slice(0, 6).map(k => ({
        kind: 'knowledge',
        source_kind: k.source_kind,
        source_ref: k.source_ref,
        source_label: k.source_label,
        category: k.category,
        page_number: k.page_number,
        similarity: Number(k.similarity.toFixed(4)),
      })),
    ]

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
