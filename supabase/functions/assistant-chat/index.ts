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
import { resolveModel, normalizePower, type Power } from '../_shared/models.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Modello di default storico per la chat globale (scope 'global' → potenza
// 'veloce'). La risoluzione effettiva passa ora da resolveModel(power, surface):
// vedi _shared/models.ts. Costante mantenuta solo come riferimento legacy.
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

interface MaintenancePlanItem {
  plan_name: string
  frequency_days: number
  current_status: string
  assigned_to_name: string | null
  machine_name: string
  serial_number: string | null
  department: string | null
  next_due_label: string | null
  days_to_due: number | null
  last_performed_at_label: string | null
}

interface MaintenancePlansByGroup {
  status?: string
  frequency_days?: number
  count: number
}

interface MaintenancePlansPerMachine {
  machine_id: string | null
  machine_name: string
  serial_number: string | null
  department: string | null
  plans_count: number
}

interface MaintenancePlansOverview {
  total: number
  machines_with_plans: number
  by_status: MaintenancePlansByGroup[]
  by_frequency: MaintenancePlansByGroup[]
  per_machine: MaintenancePlansPerMachine[]
  plans: MaintenancePlanItem[]
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

interface SupplierOpenReport {
  report_id: string
  title: string | null
  severity: string | null
  status: string | null
  machine: string | null
  age_hours: number | null
}

interface SupplierOverview {
  kind: 'registered' | 'shadow'
  user_id?: string
  supplier_name: string
  referent_name?: string | null
  specialties?: string[] | null
  city?: string | null
  user_status?: string | null
  open_count: number
  open_reports: SupplierOpenReport[]
  resolved_12m: number
  interventions_total: number
  last_intervention_at?: string | null
  machines?: string[] | null
}

interface CurrentReport {
  id: string
  title: string | null
  description: string | null
  severity: string | null
  status: string | null
  type: string | null
  machine: string | null
  machine_id: string | null
  created_by_name: string | null
  assigned_to_name: string | null
  is_quick: boolean | null
  extra_data: Record<string, unknown> | null
  closure_root_cause: string | null
  closure_action: string | null
  closure_parts: string | null
  closure_hours: number | null
  created_at: string | null
  closed_at: string | null
}

// Intervento pianificato (tabella interventions) — per il blocco "Agenda".
interface ScheduledIntervention {
  title: string | null
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  status: string | null
  type: string | null
  severity: string | null
  machine_name: string | null
  assigned_to_name: string | null
  assigned_to_role: string | null
  location: string | null
}

// Manutenzione eseguita (tabella maintenance_logs) — per lo storico org.
interface MaintenanceLogEntry {
  type: string | null            // 'programmata' (ordinaria) | 'straordinaria' | ...
  title: string | null
  description: string | null
  performed_by_name: string | null
  contractor_name?: string | null
  parts_replaced: string | null
  duration_minutes: number | null
  performed_at: string | null
  machine?: { name: string | null; serial_number: string | null } | null
  machine_id?: string | null
}

// Commento (chat) di una segnalazione aperta — per la correlazione cross-ticket
// in modalità approfondita.
interface OpenTicketComment {
  report_id: string
  user_name: string | null
  user_role: string | null
  text: string | null
  kind: string | null
  created_at: string | null
}

// ── Prompt builder ──
function buildSystemPrompt(): string {
  return `Sei il "cervello operativo" di ManuTech: un assistente AI esperto di manutenzione industriale che guida tecnici, operatori e manager di un'azienda manifatturiera. Il tuo obiettivo strategico è aiutare l'organizzazione a ridurre i tempi di riparazione e a prevenire i fermi macchina straordinari (che impattano direttamente il fatturato). Per farlo attingi alle fonti dati dell'organizzazione che ti vengono fornite ad ogni richiesta.

Fonti che puoi ricevere nel contesto:
1. **Anagrafica macchinari** — lista delle macchine dell'org con matricola (serial number), modello, produttore, anno, reparto, ubicazione, stato operativo, criticità
2. **Statistiche organizzazione** — totali e classifica macchinari per numero di segnalazioni
3. **Insight strategici** — macchine più a rischio (ranking), manutenzioni preventive scadute, pattern di guasto ricorrenti a livello org (ultimi 90gg), riparazioni lunghe (outlier ore)
4. **Piani di manutenzione (overview)** — censimento completo dei piani di manutenzione attivi nell'org: totale, distribuzione per stato/frequenza, raggruppamento per macchina e lista dettagliata con prossima scadenza calcolata. Da usare per "quanti piani abbiamo", "quali piani per macchina X", "che cadenza hanno i piani", a complemento degli insight strategici (che mostrano solo i piani scaduti/in scadenza imminente)
5. **Segnalazioni aperte** — guasti attualmente non risolti, con stato, severità ed eventuale tecnico assegnato
6. **Storia macchina** — solo se l'utente sta guardando una specifica macchina: anagrafica completa, tipi guasto ricorrenti, MTTR, manutenzioni recenti/in scadenza, ricambi più usati
7. **Discussione corrente sul ticket** — solo se l'utente sta guardando un ticket specifico: messaggi recenti dei tecnici/operatori in chat (incluse note vocali trascritte). È la fonte più AGGIORNATA: dice cosa il team ha già provato, ipotesi correnti, dettagli che NON sono nel titolo né nella descrizione iniziale
8. **Report storici simili** — interventi già risolti che possono ispirare la soluzione
9. **Biblioteca tecnica (documenti)** — estratti da manuali d'uso, schede tecniche, istruzioni di manutenzione, rapporti di interventi (anche di ditte esterne), certificati della macchina, e **conversazioni dei ticket gia' risolti** (titolo + descrizione iniziale + causa radice + azione + chat dei tecnici che hanno trovato la soluzione)
10. **Fornitori esterni** — anagrafica completa delle ditte esterne dell'org: nome, specialita', referente, ticket aperti correnti (con titolo/severita'/macchina/giorni aperti), conteggio interventi storici, ultimo intervento. Distingue tra fornitori registrati (con account) e "ombra" (presenti solo nello storico interventi)
11. **Agenda interventi pianificati (calendario)** — gli interventi a calendario dai giorni scorsi in avanti: data/ora, titolo, stato, tipo, severità, macchinario, tecnico/fornitore assegnato. È la fotografia dei PROSSIMI IMPEGNI della squadra (ciò che operatore/tecnico vede nel Calendario)
12. **Manutenzioni eseguite (storico)** — registro delle manutenzioni ordinarie e straordinarie GIÀ effettuate (data, macchina, tipo, esecutore interno o ditta esterna, durata, ricambi). Da usare per "cosa è stato fatto", frequenza reale degli interventi, attività di una ditta esterna, ultima manutenzione di un certo tipo
13. **Discussioni in corso (segnalazioni aperte)** — disponibile solo a massima potenza: i messaggi recenti delle chat di PIÙ segnalazioni aperte contemporaneamente, raggruppati per ticket. Serve a CORRELARE ciò che il team sta dicendo su ticket diversi (problemi simili in corso, stesso ricambio citato altrove, possibili duplicati)

Regole di risposta:
- Rispondi SEMPRE in italiano, tono pratico e diretto (dai del "tu")
- Per domande ANAGRAFICHE ("matricole", "modelli", "produttori", "quali macchine abbiamo"): usa Anagrafica macchinari; presenta i dati in elenco o tabella compatta
- Per domande sui FORNITORI ("cosa pendente con X", "storico interventi di Y", "chi si occupa di Z", "quali ditte esterne abbiamo"): usa il blocco Fornitori esterni. Se l'utente nomina un fornitore preciso (es. "PTS"), trova il match nella lista (anche fuzzy: "PTS S.R.L" matcha "PTS") e dai dettaglio: ticket aperti specifici (titolo/severita'/macchina/giorni), conteggi storici, ultimo intervento. Se NON c'e' nessun match, dichiaralo esplicitamente ("non trovo nessun fornitore con questo nome nell'anagrafica") e proponi i fornitori piu' attivi attualmente
- Per domande META (classifiche, totali, "quale macchinario ha più…", "quanti aperti…"): usa Statistiche, Anagrafica e Segnalazioni aperte
- Per domande STRATEGICHE / MANAGERIALI ("su cosa concentrarmi", "come riduco i fermi", "priorità", "cosa sta peggiorando", "dove perdo tempo"): usa Insight strategici come fonte principale; proponi 2-4 azioni concrete ordinate per impatto, citando numeri (matricole, MTTR, giorni di ritardo)
- Per domande sui PIANI DI MANUTENZIONE ("quanti piani abbiamo", "che cadenza hanno i piani", "quali piani sono attivi", "piani per macchina X", "manutenzioni programmate"): usa il blocco "Piani di manutenzione (overview)" come fonte primaria. Riporta totale piani, numero di macchine coperte, distribuzione per stato/frequenza, e — se richiesto — il dettaglio per macchina. Distingui chiaramente fra "piani attivi" (l'overview) e "piani scaduti / in scadenza" (Insight strategici). Se la domanda riguarda una macchina specifica e nell'overview non risulta, dichiaralo esplicitamente
- Per domande su AGENDA / CALENDARIO ("cosa è in programma", "interventi di questa settimana", "che impegni abbiamo", "agenda di domani", "carico dei tecnici"): usa il blocco "Agenda interventi pianificati" come fonte primaria. Raggruppa per giorno, evidenzia urgenze/critici, carichi sui tecnici e giorni scarichi/sovrapposti. Se la finestra non contiene interventi, dillo esplicitamente
- Per domande su MANUTENZIONI ESEGUITE / STORICO LAVORI ("cosa abbiamo fatto", "quante manutenzioni su X", "ultimi interventi della ditta Y", "quando è stata fatta la manutenzione Z", "quante straordinarie quest'anno"): usa il blocco "Manutenzioni eseguite (storico)". Distingui ordinaria (programmata) da straordinaria e segnala se eseguita da ditta esterna. Se la finestra non copre il periodo chiesto, dichiaralo
- Se è presente il blocco "Discussioni in corso (segnalazioni aperte)", usalo per CORRELARE tra loro i ticket aperti: segnala problemi simili in corso su più segnalazioni, ricambi/sintomi citati in più chat, e possibili duplicati. Cita i ticket coinvolti. Resta su ipotesi da verificare, non su certezze
- PROPOSTA DI PIANI DI MANUTENZIONE: quando l'utente lo chiede ("proponi un piano", "che manutenzione preventiva servirebbe", "come pianifico") o quando dai dati emerge un bisogno chiaro (guasti ricorrenti su una macchina dagli Insight strategici, preventive scadute, macchina ad alta criticità senza piani attivi), PROPONI 1-3 piani di manutenzione concreti. Per ciascuno indica: macchina (con matricola se nota), cadenza suggerita (es. ogni 30/90/180gg), cosa controllare/sostituire, e il PERCHÉ basato sui dati (es. "3 guasti al gruppo X in 90gg"). Proponili come SUGGERIMENTI da validare, mai come piani già creati: tu non crei nulla nel sistema, suggerisci. Tieni conto dell'agenda esistente per non sovrapporre carichi
- Per domande DIAGNOSTICHE ("come risolvo X", "perché Y non va"): usa Report storici simili, Storia macchina e Biblioteca tecnica
- Per domande DOCUMENTALI ("che dice il manuale", "coppia di serraggio", "specifica", "come si monta"): usa PRIMA la Biblioteca tecnica; privilegia il manuale ufficiale
- Quando citi una macchina includi nome e matricola se disponibile (es. "Imbottigliatrice [matricola IMB-023]")
- Quando citi un documento usa formato [Titolo documento, categoria]. Quando citi un intervento usa [Ditta X, data] o [Intervento interno, data]. Quando citi un ticket risolto usa [Ticket risolto: titolo, data]
- Le conversazioni dei ticket gia' risolti (source_kind ticket_risolto) contengono spesso la SOLUZIONE TROVATA SUL CAMPO: causa radice reale, azione che ha funzionato, ricambi usati. Trattatela con priorita' alta per le domande diagnostiche
- Se ci sono segnalazioni aperte simili a quella in corso, segnalalo (possibile duplicato o collega già al lavoro)
- Se TUTTE le sezioni sono vuote o non pertinenti, ammettilo e chiedi più dettagli
- Quando ti viene fornita la sezione "Report corrente", e' il PUNTO DI PARTENZA del ragionamento: descrizione iniziale del problema, severita', tipo, dati aggiuntivi (note tecniche, diagnosi iniziale, ricambi potenziali, motivazione priorita'). Cita SEMPRE almeno un dato specifico da qui prima di andare oltre
- Quando ti viene fornita la "Discussione corrente sul ticket", leggila DOPO il report corrente: contiene quello che il team sta dicendo proprio ora. NON suggerire azioni che sono gia' state tentate o citate in chat. Se nei messaggi recenti emergono dettagli (codici errore, ricambi gia' sostituiti, sintomi specifici), incorporali nel ragionamento e citali esplicitamente
- ORDINE DI LETTURA per ticket aperti: 1) Report corrente (problema + dati aggiuntivi) -> 2) Discussione corrente (cosa hanno gia' provato/detto) -> 3) Storia macchina + Biblioteca tecnica -> 4) Report storici simili. La risposta deve mostrare un percorso coerente da 1 a 4
- Per domande diagnostiche struttura la risposta: "Probabile causa → Passi suggeriti → Ricambi/Strumenti"
- Per domande strategiche struttura: "Situazione → Priorità → Azioni concrete"
- Massimo 300 parole, vai al sodo. Per liste anagrafiche puoi essere più compatto (usa tabelle/bullet)
- Non inventare dati né valori numerici: se non li trovi nel contesto, di' che servono i documenti o un operatore esperto`
}

// ── Scope 'ticket': prompt focalizzato su una singola segnalazione ──
// L'assistente lavora su QUESTO ticket, usa la scheda tecnica del macchinario
// e mette in relazione le altre segnalazioni dello stesso macchinario per far
// emergere ricorrenze — come ipotesi, non come certezze.
function buildTicketSystemPrompt(): string {
  return `Sei l'assistente AI di ManuTech, qui in modalità "approfondimento ticket". L'utente (tecnico/admin) sta guardando UNA segnalazione specifica e vuole capirla a fondo. Ti vengono forniti, già filtrati per la sua organizzazione:

1. **Segnalazione corrente** — il ticket su cui sei focalizzato: titolo, descrizione, severità, tipo, stato, eventuale chiusura.
2. **Scheda tecnica del macchinario** — anagrafica della macchina coinvolta (matricola, produttore, modello, anno, reparto, criticità).
3. **Altre segnalazioni sullo stesso macchinario** — storico (aperte + chiuse recenti) della STESSA macchina, esclusa quella corrente. Servono a far emergere ricorrenze e pattern.
4. (Eventuale) Biblioteca tecnica e report simili semanticamente, se presenti.

Regole di risposta:
- Rispondi SEMPRE in italiano, tono pratico e diretto (dai del "tu"). Sintetico, leggibile a colpo d'occhio.
- Parti SEMPRE dalla segnalazione corrente: cita almeno un dato specifico di quel ticket prima di andare oltre.
- Usa la scheda tecnica per contestualizzare (es. tipo di macchina, criticità).
- Quando metti in relazione le altre segnalazioni della stessa macchina, presenta le ricorrenze come **ipotesi da verificare**, non come certezze ("potrebbe esserci un pattern: 3 guasti simili al gruppo X negli ultimi mesi"). Cita i ticket a cui ti riferisci.
- **Dichiara esplicitamente quando un'informazione manca o è incerta.** Non inventare correlazioni, cause o numeri che non sono nel contesto fornito. Se il contesto non basta per rispondere, dillo e indica cosa servirebbe.
- Le tue conclusioni sono spunti per il tecnico, non verdetti: l'utente ha sempre l'ultima parola.
- Massimo ~300 parole.`
}

// ── Builder: storico segnalazioni stessa macchina (scope 'ticket') ──
// Recupero server-side con client JWT-utente (RLS attiva → già org-scoped).
// Lista deterministica delle ricorrenze: aperte (qualunque età) + chiuse
// negli ultimi 12 mesi, esclusa la corrente, più recenti prima, cap 20.
interface SameMachineReport {
  display_id?: string | null
  title?: string | null
  severity?: string | null
  status?: string | null
  type?: string | null
  created_at?: string | null
  closed_at?: string | null
  closure_root_cause?: string | null
}

function fmtDateIt(d?: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(d).slice(0, 10)
  }
}

function buildSameMachineReportsBlock(list: SameMachineReport[], hasMachine: boolean): string {
  if (!hasMachine) {
    return 'Macchinario non collegato a questo ticket (nessun `machine_id`): impossibile derivare le altre segnalazioni della stessa macchina.'
  }
  if (!list || list.length === 0) {
    return 'Nessun\'altra segnalazione per questo macchinario nel periodo considerato (aperte + chiuse ultimi 12 mesi).'
  }
  return list.map((r) => {
    const when = r.closed_at ? `chiusa ${fmtDateIt(r.closed_at)}` : `aperta ${fmtDateIt(r.created_at)}`
    const tag = r.display_id ? `[${r.display_id}] ` : ''
    const cause = r.closure_root_cause ? ` — causa: ${r.closure_root_cause.slice(0, 160)}` : ''
    return `- ${tag}[${r.severity || '—'}/${r.status || '—'}] ${r.title || '(senza titolo)'} (${when})${cause}`
  }).join('\n')
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

// ── Builder: anagrafica fornitori esterni ──
// Lista completa dei fornitori dell'org (registrati + ombra) con
// ticket aperti correnti, storico interventi, ultimo intervento.
// Permette domande tipo "cosa pendente con PTS?" o "storico Manara".
function buildSuppliersBlock(suppliers: SupplierOverview[]): string {
  if (!suppliers || suppliers.length === 0) return ''
  const lines: string[] = []
  lines.push(`Fornitori esterni dell'organizzazione (${suppliers.length}):`)
  lines.push('')
  suppliers.forEach((s, i) => {
    const tag = s.kind === 'shadow' ? ' [solo in storico, no account]' : ''
    const stats: string[] = []
    if (s.open_count > 0) stats.push(`${s.open_count} ticket aperti`)
    if (s.resolved_12m > 0) stats.push(`${s.resolved_12m} risolti 12m`)
    if (s.interventions_total > 0) stats.push(`${s.interventions_total} interventi storici`)
    const statsLabel = stats.length ? ` — ${stats.join(' · ')}` : ''
    lines.push(`${i + 1}. ${s.supplier_name}${tag}${statsLabel}`)

    const detail: string[] = []
    if (s.specialties?.length) detail.push(`specialita': ${s.specialties.join(', ')}`)
    if (s.referent_name) detail.push(`referente: ${s.referent_name}`)
    if (s.city) detail.push(`citta': ${s.city}`)
    if (s.user_status && s.user_status !== 'active') detail.push(`status: ${s.user_status}`)
    if (s.last_intervention_at) detail.push(`ultimo intervento: ${s.last_intervention_at.slice(0, 10)}`)
    if (s.machines?.length) detail.push(`macchine: ${s.machines.slice(0, 4).join(', ')}`)
    if (detail.length > 0) lines.push(`   ${detail.join(' · ')}`)

    // Ticket aperti dettagliati (max 8 per fornitore per non gonfiare)
    if (s.open_reports?.length > 0) {
      const reports = s.open_reports.slice(0, 8)
      reports.forEach(r => {
        const age = r.age_hours != null
          ? r.age_hours < 24 ? `${r.age_hours}h` : `${Math.floor(r.age_hours / 24)}g`
          : '—'
        lines.push(`   - [${r.severity || '?'}/${r.status || '?'}] ${r.title || '(senza titolo)'} su ${r.machine || '—'} (aperto ${age})`)
      })
      if (s.open_reports.length > 8) {
        lines.push(`   - ... +${s.open_reports.length - 8} altri ticket aperti`)
      }
    }
  })
  return lines.join('\n').trim()
}

// ── Builder: report corrente (descrizione + dati aggiuntivi) ──
// Fornisce all'AI il contesto del ticket che l'utente sta guardando:
// titolo, descrizione iniziale completa, severita', tipo, dati strutturati
// estratti dal voice_new_ticket (note_tecniche, diagnosi_iniziale,
// ricambi_potenziali, motivazione_priorita, ecc.) e — se chiuso — la
// chiusura. E' il PUNTO DI PARTENZA del ragionamento, prima della chat.
function buildCurrentReportBlock(r: CurrentReport | null): string {
  if (!r) return ''
  const lines: string[] = []
  lines.push(`Titolo: ${r.title || '(senza titolo)'}`)
  if (r.severity || r.type || r.status) {
    const meta: string[] = []
    if (r.severity) meta.push(`severita': ${r.severity}`)
    if (r.type) meta.push(`tipo: ${r.type}`)
    if (r.status) meta.push(`stato: ${r.status}`)
    lines.push(meta.join(' · '))
  }
  if (r.machine) lines.push(`Macchina: ${r.machine}`)
  if (r.created_by_name) lines.push(`Aperto da: ${r.created_by_name}`)
  if (r.assigned_to_name) lines.push(`Assegnato a: ${r.assigned_to_name}`)
  if (r.description?.trim()) {
    lines.push('')
    lines.push(`Descrizione iniziale del problema:`)
    lines.push(r.description.trim())
  }
  // Dati strutturati estratti dall'AI alla creazione (voice_new_ticket)
  // o aggiunti manualmente: note_tecniche, diagnosi_iniziale, ricambi_potenziali, ecc.
  if (r.extra_data && typeof r.extra_data === 'object') {
    const extras: string[] = []
    for (const [k, v] of Object.entries(r.extra_data)) {
      if (v == null) continue
      if (k === 'transcription' || k === 'source' || k === 'confidence') continue
      const val = Array.isArray(v) ? v.filter(x => x != null && String(x).trim()).join(', ')
                 : typeof v === 'object' ? JSON.stringify(v)
                 : String(v).trim()
      if (val) extras.push(`- ${k}: ${val.slice(0, 400)}`)
    }
    if (extras.length > 0) {
      lines.push('')
      lines.push('Dati aggiuntivi del report:')
      lines.push(...extras)
    }
  }
  // Se il ticket e' gia' stato chiuso (ma l'utente sta riguardando
  // lo storico per imparare), riportiamo anche la chiusura.
  if (r.closure_root_cause || r.closure_action) {
    lines.push('')
    lines.push('Esito chiusura:')
    if (r.closure_root_cause) lines.push(`- causa radice: ${r.closure_root_cause}`)
    if (r.closure_action) lines.push(`- azione risolutiva: ${r.closure_action}`)
    if (r.closure_parts) lines.push(`- ricambi: ${r.closure_parts}`)
    if (r.closure_hours != null) lines.push(`- ore intervento: ${r.closure_hours}`)
  }
  return lines.join('\n').trim()
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

// ── Builder: overview piani di manutenzione ──
// Censimento completo dei piani attivi nell'org. Complementa il blocco
// "Insight strategici" (che mostra solo piani scaduti / in scadenza
// entro 7 giorni). Risponde a: "quanti piani abbiamo?", "che cadenza
// hanno i piani?", "quali macchine hanno piani?".
function buildMaintenancePlansBlock(o: MaintenancePlansOverview | null): string {
  if (!o || !o.total || o.total === 0) return ''
  const lines: string[] = []
  lines.push(`Piani di manutenzione attivi nell'organizzazione: ${o.total} (su ${o.machines_with_plans} macchine)`)

  if (o.by_status?.length) {
    const parts = o.by_status.map(s => `${s.status}: ${s.count}`)
    lines.push(`Per stato: ${parts.join(' · ')}`)
  }

  if (o.by_frequency?.length) {
    const parts = o.by_frequency
      .slice(0, 8)
      .map(f => `${f.frequency_days}gg: ${f.count}`)
    lines.push(`Per frequenza: ${parts.join(' · ')}`)
  }

  if (o.per_machine?.length) {
    lines.push('')
    lines.push('Piani per macchina:')
    o.per_machine.forEach(pm => {
      const sn = pm.serial_number ? ` [${pm.serial_number}]` : ''
      const dept = pm.department ? ` (${pm.department})` : ''
      lines.push(`- ${pm.machine_name}${sn}${dept}: ${pm.plans_count} pian${pm.plans_count === 1 ? 'o' : 'i'}`)
    })
  }

  if (o.plans?.length) {
    lines.push('')
    lines.push(`Dettaglio piani (${o.plans.length}, ordinati per prossima scadenza):`)
    o.plans.forEach(p => {
      const sn = p.serial_number ? ` [${p.serial_number}]` : ''
      let due = ''
      if (p.days_to_due == null) {
        due = p.next_due_label ? ` — prossima ${p.next_due_label}` : ''
      } else if (p.days_to_due < 0) {
        due = ` — SCADUTA da ${Math.abs(p.days_to_due)}gg (era ${p.next_due_label})`
      } else {
        due = ` — tra ${p.days_to_due}gg (prossima ${p.next_due_label})`
      }
      const last = p.last_performed_at_label ? ` · ultima ${p.last_performed_at_label}` : ' · mai eseguita'
      const who = p.assigned_to_name ? ` · ${p.assigned_to_name}` : ''
      const status = p.current_status && p.current_status !== 'da_eseguire' ? ` [${p.current_status}]` : ''
      lines.push(`- ${p.plan_name} su ${p.machine_name}${sn} (ogni ${p.frequency_days}gg)${due}${last}${who}${status}`)
    })
  }

  return lines.join('\n')
}

// ── Builder: agenda interventi pianificati (tabella interventions) ──
// Fotografia del calendario: interventi dai ~7 giorni scorsi in avanti,
// raggruppati per giorno, ordinati cronologicamente. Esclude gli annullati.
function buildAgendaBlock(list: ScheduledIntervention[]): string {
  if (!list || list.length === 0) return ''
  const now = Date.now()
  const lines: string[] = []
  let upcoming = 0
  for (const i of list) {
    if (i.scheduled_start_at && new Date(i.scheduled_start_at).getTime() >= now) upcoming += 1
  }
  lines.push(`Interventi a calendario (${list.length} in finestra, di cui ${upcoming} futuri):`)
  lines.push('')
  let lastDay = ''
  for (const i of list) {
    const d = i.scheduled_start_at ? new Date(i.scheduled_start_at) : null
    const dayLabel = d
      ? d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Senza data'
    if (dayLabel !== lastDay) {
      lines.push(`${dayLabel}:`)
      lastDay = dayLabel
    }
    const time = d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '--:--'
    const who = i.assigned_to_name
      ? ` — ${i.assigned_to_name}${i.assigned_to_role ? ` (${i.assigned_to_role})` : ''}`
      : ' — non assegnato'
    const machine = i.machine_name ? ` — ${i.machine_name}` : ''
    const meta = [i.status, i.type, i.severity].filter(Boolean).join('/')
    lines.push(`  - ${time} ${i.title || '(senza titolo)'}${meta ? ` [${meta}]` : ''}${machine}${who}`)
  }
  return lines.join('\n')
}

// ── Builder: storico manutenzioni eseguite (maintenance_logs) ──
function buildMaintenanceLogsBlock(list: MaintenanceLogEntry[]): string {
  if (!list || list.length === 0) return ''
  const lines: string[] = []
  lines.push(`Manutenzioni eseguite (storico organizzazione, ${list.length} più recenti):`)
  for (const l of list) {
    const when = fmtDateIt(l.performed_at)
    const machine = l.machine?.name
      ? `${l.machine.name}${l.machine.serial_number ? ` [${l.machine.serial_number}]` : ''}`
      : '—'
    const who = l.contractor_name ? `ditta ${l.contractor_name}` : (l.performed_by_name || 'interno')
    lines.push(`- ${when} — ${machine} — [${l.type || 'manutenzione'}] ${l.title || '(senza titolo)'}`)
    const extra: string[] = [who]
    if (l.duration_minutes) extra.push(`${l.duration_minutes} min`)
    if (l.parts_replaced) extra.push(`ricambi: ${String(l.parts_replaced).slice(0, 120)}`)
    lines.push(`  ${extra.join(' · ')}`)
  }
  return lines.join('\n')
}

// ── Builder: discussioni in corso su segnalazioni aperte (cross-ticket) ──
// Solo modalità approfondita. Raggruppa i commenti per segnalazione aperta,
// tiene gli ultimi ~6 messaggi per ticket e max ~15 ticket per non gonfiare.
function buildOpenTicketsChatBlock(
  comments: OpenTicketComment[],
  reportMap: Map<string, OpenReport>,
): string {
  if (!comments || comments.length === 0) return ''
  const byReport = new Map<string, OpenTicketComment[]>()
  for (const c of comments) {
    if (!c.text || !c.text.trim()) continue
    const arr = byReport.get(c.report_id) || []
    if (arr.length < 6) arr.push(c) // comments arrivano dal più recente: tieni i 6 più nuovi
    byReport.set(c.report_id, arr)
  }
  if (byReport.size === 0) return ''
  const lines: string[] = []
  lines.push(`Discussioni in corso su segnalazioni aperte (${byReport.size} ticket con chat recente):`)
  let shown = 0
  for (const [rid, arr] of byReport) {
    if (shown >= 15) break
    shown++
    const r = reportMap.get(rid)
    const head = r
      ? `${r.title || '(senza titolo)'}${r.machine ? ` — ${r.machine}` : ''}${r.severity ? ` [${r.severity}]` : ''}`
      : 'Segnalazione aperta'
    lines.push('')
    lines.push(`• ${head}:`)
    for (const c of arr.slice().reverse()) { // ordine cronologico
      const who = c.user_name || 'Utente'
      const role = c.user_role ? ` (${c.user_role})` : ''
      const kindTag = c.kind && c.kind !== 'chat' ? ` [${c.kind}]` : ''
      const txt = (c.text || '').trim().slice(0, 300)
      lines.push(`   - ${who}${role}${kindTag}: ${txt}`)
    }
  }
  return lines.join('\n')
}

// ── Heuristic: classifica il tipo di domanda ──
// Decide se caricare: anagrafica, statistiche, segnalazioni aperte,
// aspetti diagnostici, biblioteca tecnica (documentale), insight
// strategici, piani di manutenzione. Una query può essere mista.
// Default conservativo: includi tutto.
function classifyQuery(query: string): {
  wantStats: boolean
  wantOpen: boolean
  wantDiagnostic: boolean
  wantKnowledge: boolean
  wantInventory: boolean
  wantStrategic: boolean
  wantMaintenancePlans: boolean
  wantAgenda: boolean
} {
  const q = query.toLowerCase()
  const metaKW = ['quale', 'quali', 'quanti', 'quante', 'top', 'classifica', 'classific', 'media', 'totale', 'totali', 'statistic', 'percentuale', 'più segnalazion', 'piu segnalazion', 'più guast', 'piu guast', 'meglio', 'peggio', 'frequent']
  const openKW = ['aperto', 'aperti', 'aperta', 'aperte', 'in corso', 'in lavorazione', 'stato', 'chi sta', 'chi lavora', 'assegnat', 'in attesa']
  const diagKW = ['come risolv', 'come faccio', 'come ripar', 'come sistem', 'perché', 'perche', 'guasto', 'non funziona', 'rotto', 'rotta', 'errore', 'allarme', 'rumore', 'perdita', 'vibraz', 'surriscald', 'blocc']
  const knowKW = ['manuale', 'manuali', 'istruzion', 'specifica', 'specifich', 'coppia', 'serraggio', 'come si monta', 'come si smonta', 'come si cambia', 'come si sostituisc', 'tensione', 'amperaggio', 'potenza', 'dimension', 'tolleranz', 'catalogo', 'scheda tecnica', 'datasheet', 'taratura', 'calibrazion', 'certificato', 'conformità', 'conformita', 'ditta esterna', 'ditta ester', 'contractor', 'bolla', 'fattura ', 'capitolato', 'revision', 'ispezion']
  const invKW = ['matricol', 'serial', 'modello', 'modelli', 'produttor', 'marca', 'marche', 'anagrafic', 'inventario', 'elenco macchin', 'lista macchin', 'quali macchine', 'quali macchinar', 'reparto', 'reparti', 'ubicazion', 'macchine abbiamo', 'macchinari abbiamo', 'dismess', 'fuori servizio']
  const stratKW = ['priorit', 'concentrar', 'focus', 'focalizz', 'ridurr', 'riduzione', 'ottimizz', 'migliorar', 'pianific', 'strategi', 'fermo macchina', 'fermi macchina', 'downtime', 'imprevist', 'dove perdo', 'perdo tempo', 'perdo di più', 'cosa sta peggiorando', 'sta peggiorando', 'cosa dovrei', 'su cosa', 'quali interventi', 'rischio', 'a rischio', 'scadut', 'scadenz', 'pattern', 'ricorrent', 'azioni concret', 'raccomand']
  // Domande sui piani di manutenzione (overview completo, non solo i
  // piani scaduti coperti da Insight strategici).
  const mplanKW = ['piano di manuten', 'piani di manuten', 'piani manuten', 'piano manuten', 'manutenzione preventiva', 'manutenzioni preventive', 'manutenzione programmata', 'manutenzioni programmate', 'cadenza', 'frequenza manuten', 'piani attivi', 'piano attivo', 'piani di lavoro', 'preventiv', 'routine', 'tagliando', 'tagliand']
  // Agenda / calendario degli interventi pianificati (tabella interventions):
  // "cosa è in programma", "interventi di questa settimana", "agenda", ecc.
  const agendaKW = ['agenda', 'calendario', 'pianificat', 'programmat', 'in programma', 'schedulat', 'calendarizz', 'appuntament', 'prossimi intervent', 'prossime attività', 'prossime attivita', 'questa settimana', 'settimana prossima', 'prossima settimana', 'prossimi giorni', 'in agenda', 'oggi', 'domani', 'questo mese', 'che interventi', 'quali intervent', 'interventi previst', 'interventi in', 'carico di lavoro', 'impegni']

  const wantStats = metaKW.some(k => q.includes(k))
  const wantOpen = openKW.some(k => q.includes(k))
  const wantDiagnostic = diagKW.some(k => q.includes(k))
  const wantKnowledge = knowKW.some(k => q.includes(k))
  const wantInventory = invKW.some(k => q.includes(k))
  const wantStrategic = stratKW.some(k => q.includes(k))
  const wantMaintenancePlans = mplanKW.some(k => q.includes(k))
  const wantAgenda = agendaKW.some(k => q.includes(k))
  // "piani" da solo è ambiguo (può essere "piani di lavoro" o ufficio
  // tecnico). Lo accettiamo solo se compare in un contesto chiaro
  // (es. "quanti piani", "i piani", "tutti i piani", "piani sono",
  // "piani per", "piani della/del").
  const looseMplan = (
    /\b(quanti|quante|quali|tutti|alcuni|i|gli|nostri|miei|attivi|attivo)\s+piani\b/.test(q) ||
    /\bpiani\s+(per|della|del|delle|degli|attivi|attivo|programmati|programmate|sono|abbiamo)\b/.test(q)
  )

  const finalWantMaintenance = wantMaintenancePlans || looseMplan

  // Se non matcha nulla, includi tutto (default conservativo)
  if (!wantStats && !wantOpen && !wantDiagnostic && !wantKnowledge && !wantInventory && !wantStrategic && !finalWantMaintenance && !wantAgenda) {
    return {
      wantStats: true, wantOpen: true, wantDiagnostic: true,
      wantKnowledge: true, wantInventory: true, wantStrategic: true,
      wantMaintenancePlans: true, wantAgenda: true,
    }
  }
  return {
    wantStats, wantOpen, wantDiagnostic, wantKnowledge,
    wantInventory, wantStrategic,
    wantMaintenancePlans: finalWantMaintenance,
    wantAgenda,
  }
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
// model + extraBody arrivano dal resolver (_shared/models.ts): extraBody porta
// i parametri specifici del tier (es. thinking adaptive + effort per Opus 4.8).
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string,
  extraBody: Record<string, unknown> = {},
) {
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

    // Scope chat: 'global' (default, comportamento storico) o 'ticket'
    // (approfondimento su una singola segnalazione con contesto fornito dal client).
    const scope: 'global' | 'ticket' = body.scope === 'ticket' ? 'ticket' : 'global'
    // Potenza AI → modello. Default per scope finché non esiste il selettore UI:
    // ticket→equilibrato (Sonnet 4.6), global→veloce (Haiku, comportamento storico).
    const power: Power = normalizePower(body.power, scope === 'ticket' ? 'equilibrato' : 'veloce')
    const { model: anthropicModel, extraBody: anthropicExtraBody } = resolveModel(power, 'assistant_chat')
    console.info(`[scope] scope=${scope} power=${power} model=${anthropicModel}`)

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
    //
    // Potenza "approfondito" (Opus 4.8) = massima potenza di calcolo → diamo
    // all'AI accesso a TUTTO lo storico: bypassa il gating per-intento
    // (carica tutte le fonti) e allarga le finestre temporali / i cap.
    const deep = power === 'approfondito'

    const shouldFetchKnowledge =
      deep || classify.wantKnowledge || classify.wantDiagnostic || hasMachineContext
    // Inventario: lo carichiamo quando l'utente chiede matricole/anagrafica,
    // quando fa domande meta (serve per referenziare le macchine),
    // strategiche, o quando NON è in contesto macchina (org-wide overview).
    const shouldFetchInventory =
      deep || classify.wantInventory || classify.wantStats || classify.wantStrategic
    // Insight strategici: solo se domanda strategica o meta.
    const shouldFetchStrategic =
      deep || classify.wantStrategic || classify.wantStats
    // Overview piani di manutenzione: caricato per domande dirette sui
    // piani e per domande strategiche (i piani sono complemento
    // naturale degli insight). NON caricato se l'utente sta guardando
    // una macchina specifica: in quel caso i piani della macchina
    // arrivano già da get_machine_history.
    const shouldFetchMaintenancePlans =
      !hasMachineContext && (deep || classify.wantMaintenancePlans || classify.wantStrategic)
    // Agenda interventi pianificati (tabella interventions). Caricata per
    // domande su calendario/agenda e per domande strategiche o sui piani
    // (servono a proporre/ricollocare manutenzioni). Non in scope 'ticket'.
    const shouldFetchAgenda =
      scope !== 'ticket' && (deep || classify.wantAgenda || classify.wantStrategic || classify.wantMaintenancePlans)
    // Storico manutenzioni EFFETTUATE (maintenance_logs) a livello org:
    // ordinaria/straordinaria con data, macchina, esecutore, ricambi. In
    // contesto macchina arriva già da get_machine_history; qui copriamo la
    // chat globale. Sempre in modalità approfondita.
    const shouldFetchMaintenanceLogs =
      !hasMachineContext && (deep || classify.wantMaintenancePlans || classify.wantStrategic || classify.wantDiagnostic)

    // Cap e finestre temporali scalano con la potenza: "approfondito" tira su
    // molto più storico (costo/latenza maggiori, accettati per la max potenza).
    const topK = deep ? 12 : TOP_K
    const knowledgeLimit = deep ? 12 : 6
    const agendaSinceDays = deep ? 60 : 7
    const agendaLimit = deep ? 150 : 40
    const mlogsMonthsBack = deep ? 24 : 6
    const mlogsLimit = deep ? 100 : 30

    const voyageKey = Deno.env.get('VOYAGE_API_KEY')
    let queryEmbedding: number[] | null = null
    if (shouldFetchKnowledge && voyageKey) {
      queryEmbedding = await embedUserQuery(query, voyageKey)
    }

    // Lanciamo le RPC in parallelo. Se una fallisce (es. migration non
    // ancora deployata) logghiamo e proseguiamo con il blocco vuoto.
    const [
      similarRes, statsRes, openRes, historyRes,
      knowledgeRes, inventoryRes, strategicRes,
      currentReportRes, currentChatRes, suppliersRes,
      maintenancePlansRes, sameMachineRes, agendaRes, mlogsRes,
    ] = await Promise.all([
      supabase.rpc('search_similar_reports', {
        query_text: query,
        p_limit: topK,
        p_machine_id: machineId ?? null,
        p_include_open: includeOpenInRetrieval,
      }),
      deep || classify.wantStats || classify.wantDiagnostic || classify.wantStrategic
        ? supabase.rpc('get_assistant_org_stats')
        : Promise.resolve({ data: null, error: null }),
      deep || classify.wantOpen || classify.wantDiagnostic || classify.wantStrategic || hasMachineContext
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
            p_limit: knowledgeLimit,
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
      // Report corrente: descrizione + dati aggiuntivi (extra_data) +
      // eventuale chiusura. Punto di partenza del ragionamento dell'AI.
      reportId
        ? (async () => {
            console.info(`[current-report] fetching report ${reportId}`)
            const res = await supabase
              .from('reports')
              .select('id, title, description, severity, status, type, machine, machine_id, created_by_name, assigned_to_name, is_quick, extra_data, closure_root_cause, closure_action, closure_parts, closure_hours, created_at, closed_at')
              .eq('id', reportId)
              .maybeSingle()
            console.info(`[current-report] found=${res.data ? 'Y' : 'N'} error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : (async () => {
            console.info(`[current-report] no report_id, skipping`)
            return { data: null, error: null }
          })(),
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
      // Anagrafica fornitori esterni dell'org. Sempre caricata: e' utile
      // anche per domande generiche tipo "quali fornitori abbiamo?" o
      // "cosa pendente con PTS?". Costo token contenuto (~30 fornitori
      // medi). Fallback graceful se la migration 043 non e' applicata.
      (async () => {
        const res = await supabase.rpc('get_assistant_suppliers_overview')
        console.info(`[suppliers] count=${Array.isArray(res.data) ? res.data.length : 0} error=${res.error?.message ?? 'none'}`)
        return res
      })(),
      // Overview piani di manutenzione attivi. Necessario per rispondere
      // a "quanti piani abbiamo?" o "quali piani per macchina X?": gli
      // Insight strategici mostrano solo i piani scaduti / in scadenza
      // entro 7 giorni e quindi non danno la fotografia completa.
      // Fallback graceful se la migration 045 non e' applicata.
      shouldFetchMaintenancePlans
        ? (async () => {
            const res = await supabase.rpc('get_assistant_maintenance_plans_overview')
            const total = (res.data && typeof res.data === 'object' && 'total' in res.data)
              ? (res.data as { total: number }).total : 0
            console.info(`[maintenance-plans] total=${total} error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : Promise.resolve({ data: null, error: null }),
      // Scope 'ticket': storico deterministico delle altre segnalazioni della
      // STESSA macchina (aperte qualunque età + chiuse ultimi 12 mesi, esclusa
      // la corrente, più recenti prima, cap 20). Client JWT-utente → RLS attiva
      // (già org-scoped). Fallback senza display_id se la migration 049 manca.
      scope === 'ticket' && machineId
        ? (async () => {
            const since = new Date()
            since.setMonth(since.getMonth() - 12)
            const orFilter = `status.not.in.(risolta,chiuso),closed_at.gte.${since.toISOString()}`
            const cols = 'id, display_id, title, severity, status, type, created_at, closed_at, closure_root_cause'
            const colsNoDid = 'id, title, severity, status, type, created_at, closed_at, closure_root_cause'
            const q = (sel: string) => supabase
              .from('reports')
              .select(sel)
              .eq('machine_id', machineId)
              .neq('id', reportId ?? '')
              .or(orFilter)
              .order('created_at', { ascending: false })
              .limit(20)
            let res = await q(cols)
            if (res.error) {
              console.warn(`[same-machine] select con display_id fallito (${res.error.message}), retry senza`)
              res = await q(colsNoDid)
            }
            console.info(`[same-machine] count=${res.data?.length ?? 0} error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : Promise.resolve({ data: null, error: null }),
      // Agenda interventi pianificati: tabella interventions, RLS-scoped (client
      // JWT-utente). Finestra dagli ultimi 7 giorni in avanti, esclusi annullati,
      // ordinati cronologicamente, cap 40.
      shouldFetchAgenda
        ? (async () => {
            const since = new Date()
            since.setDate(since.getDate() - agendaSinceDays)
            const res = await supabase
              .from('interventions')
              .select('title, scheduled_start_at, scheduled_end_at, status, type, severity, machine_name, assigned_to_name, assigned_to_role, location')
              .gte('scheduled_start_at', since.toISOString())
              .neq('status', 'annullato')
              .order('scheduled_start_at', { ascending: true })
              .limit(agendaLimit)
            console.info(`[agenda] count=${res.data?.length ?? 0} error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : Promise.resolve({ data: null, error: null }),
      // Storico manutenzioni effettuate (maintenance_logs) org-wide, RLS-scoped.
      // Finestra e cap scalano con la potenza. Embed del nome macchina via FK;
      // fallback senza embed se la relazione non è risolvibile.
      shouldFetchMaintenanceLogs
        ? (async () => {
            const since = new Date()
            since.setMonth(since.getMonth() - mlogsMonthsBack)
            const cols = 'type, title, description, performed_by_name, contractor_name, parts_replaced, duration_minutes, performed_at, machine:machines(name, serial_number)'
            const colsNoJoin = 'type, title, description, performed_by_name, parts_replaced, duration_minutes, performed_at, machine_id'
            const q = (sel: string) => supabase
              .from('maintenance_logs')
              .select(sel)
              .gte('performed_at', since.toISOString())
              .order('performed_at', { ascending: false })
              .limit(mlogsLimit)
            let res = await q(cols)
            if (res.error) {
              console.warn(`[mlogs] select esteso fallito (${res.error.message}), retry base`)
              res = await q(colsNoJoin)
            }
            console.info(`[mlogs] count=${res.data?.length ?? 0} error=${res.error?.message ?? 'none'}`)
            return res
          })()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (similarRes.error) console.error('search_similar_reports error:', similarRes.error)
    if (statsRes.error) console.warn('get_assistant_org_stats error:', statsRes.error.message)
    if (openRes.error) console.warn('get_open_reports_snapshot error:', openRes.error.message)
    if (historyRes.error) console.warn('get_machine_history error:', historyRes.error.message)
    if (knowledgeRes.error) console.warn('search_knowledge error:', knowledgeRes.error.message, JSON.stringify(knowledgeRes.error))
    if (inventoryRes.error) console.warn('get_machines_inventory error:', inventoryRes.error.message)
    if (strategicRes.error) console.warn('get_assistant_strategic_insights error:', strategicRes.error.message)
    if (currentChatRes.error) console.warn('comments(current ticket) error:', currentChatRes.error.message)
    if (currentReportRes.error) console.warn('current report fetch error:', currentReportRes.error.message)
    if (suppliersRes.error) console.warn('get_assistant_suppliers_overview error:', suppliersRes.error.message)
    if (maintenancePlansRes.error) console.warn('get_assistant_maintenance_plans_overview error:', maintenancePlansRes.error.message)

    const similar: SimilarReport[] = similarRes.data || []
    const orgStats: OrgStats | null = statsRes.data || null
    const openReports: OpenReport[] = openRes.data || []
    const machineHistory: MachineHistory | null = historyRes.data || null
    const knowledgeChunks: KnowledgeChunk[] = knowledgeRes.data || []
    const inventory: MachineInventoryItem[] = inventoryRes.data || []
    const strategic: StrategicInsights | null = strategicRes.data || null
    const currentReport: CurrentReport | null = (currentReportRes.data as CurrentReport | null) || null
    const currentChat: CurrentTicketComment[] = (currentChatRes.data as CurrentTicketComment[]) || []
    const suppliers: SupplierOverview[] = Array.isArray(suppliersRes.data) ? (suppliersRes.data as SupplierOverview[]) : []
    const maintenancePlans: MaintenancePlansOverview | null =
      (maintenancePlansRes.data as MaintenancePlansOverview | null) || null
    if (sameMachineRes.error) console.warn('same-machine reports error:', sameMachineRes.error.message)
    const sameMachineReports: SameMachineReport[] = Array.isArray(sameMachineRes.data)
      ? (sameMachineRes.data as SameMachineReport[])
      : []
    if (agendaRes.error) console.warn('agenda(interventions) error:', agendaRes.error.message)
    const scheduledInterventions: ScheduledIntervention[] = Array.isArray(agendaRes.data)
      ? (agendaRes.data as ScheduledIntervention[])
      : []
    if (mlogsRes.error) console.warn('maintenance_logs error:', mlogsRes.error.message)
    const maintenanceLogs: MaintenanceLogEntry[] = Array.isArray(mlogsRes.data)
      ? (mlogsRes.data as MaintenanceLogEntry[])
      : []

    // Modalità approfondita (Opus 4.8): chat delle segnalazioni APERTE per
    // correlare discussioni cross-ticket. Round-trip extra deliberato, solo a
    // max potenza; riusa gli id delle aperte già recuperati (snapshot).
    let openTicketsChat: OpenTicketComment[] = []
    if (deep && scope !== 'ticket' && openReports.length > 0) {
      const openIds = openReports.map(r => r.id).filter(Boolean).slice(0, 30)
      if (openIds.length > 0) {
        let res = await supabase
          .from('comments')
          .select('report_id, user_name, user_role, text, kind, created_at, deleted_at')
          .in('report_id', openIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(120)
        if (res.error) {
          // Fallback senza deleted_at (colonna assente su DB non migrati)
          res = await supabase
            .from('comments')
            .select('report_id, user_name, user_role, text, kind, created_at')
            .in('report_id', openIds)
            .order('created_at', { ascending: false })
            .limit(120)
        }
        if (res.error) console.warn('open-tickets-chat error:', res.error.message)
        openTicketsChat = (res.data as OpenTicketComment[]) || []
        console.info(`[open-tickets-chat] reports=${openIds.length} comments=${openTicketsChat.length}`)
      }
    }

    // ── Diagnostic trace: retrieval summary ──
    console.info(`[retrieval] query="${query.slice(0, 80)}" | reportId=${reportId || 'none'} machineId=${machineId || 'none'} | wantInv=${classify.wantInventory} wantStrat=${classify.wantStrategic} wantKnow=${classify.wantKnowledge} wantDiag=${classify.wantDiagnostic} wantMplan=${classify.wantMaintenancePlans} hasMachineCtx=${hasMachineContext} | similar=${similar.length} stats=${orgStats ? 'Y' : 'N'} open=${openReports.length} history=${machineHistory ? 'Y' : 'N'} knowledge=${knowledgeChunks.length} inventory=${inventory.length} strategic=${strategic ? 'Y' : 'N'} mplans=${maintenancePlans?.total ?? 'N'} agenda=${scheduledInterventions.length} mlogs=${maintenanceLogs.length} openChat=${openTicketsChat.length} currentChat=${currentChat.length}`)
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
    // Scope 'ticket': prompt focalizzato + contesto fornito dal client in cima.
    const systemPrompt = scope === 'ticket' ? buildTicketSystemPrompt() : buildSystemPrompt()

    const sections: string[] = []

    // Scope 'ticket': storico deterministico delle altre segnalazioni della
    // stessa macchina (ricorrenze). La scheda tecnica del macchinario arriva
    // già dal blocco "Storia macchina" (get_machine_history) più sotto.
    if (scope === 'ticket') {
      const sameMachineBlock = buildSameMachineReportsBlock(sameMachineReports, !!machineId)
      sections.push(`## Altre segnalazioni sullo stesso macchinario (storico ricorrenze)\n\n${sameMachineBlock}`)
    }

    const inventoryBlock = buildInventoryBlock(inventory)
    if (inventoryBlock) sections.push(`## Anagrafica macchinari\n\n${inventoryBlock}`)

    const strategicBlock = buildStrategicBlock(strategic)
    if (strategicBlock) sections.push(`## Insight strategici (governance manutenzione)\n\n${strategicBlock}`)

    // Censimento completo dei piani di manutenzione attivi. Distinto
    // dagli Insight strategici, che mostrano solo i piani scaduti o
    // in scadenza imminente.
    const maintenancePlansBlock = buildMaintenancePlansBlock(maintenancePlans)
    if (maintenancePlansBlock) sections.push(`## Piani di manutenzione (overview)\n\n${maintenancePlansBlock}`)

    // Agenda: calendario degli interventi pianificati (prossimi impegni della
    // squadra). Fonte primaria per domande su agenda/calendario e base per
    // proporre/ricollocare manutenzioni.
    const agendaBlock = buildAgendaBlock(scheduledInterventions)
    if (agendaBlock) sections.push(`## Agenda interventi pianificati (calendario)\n\n${agendaBlock}`)

    // Storico manutenzioni effettuate (ordinaria/straordinaria) a livello org.
    const maintenanceLogsBlock = buildMaintenanceLogsBlock(maintenanceLogs)
    if (maintenanceLogsBlock) sections.push(`## Manutenzioni eseguite (storico)\n\n${maintenanceLogsBlock}`)

    const knowledgeBlock = buildKnowledgeBlock(knowledgeChunks)
    if (knowledgeBlock) sections.push(`## Biblioteca tecnica (manuali, schede, interventi)\n\n${knowledgeBlock}`)

    const orgBlock = buildOrgStatsBlock(orgStats)
    if (orgBlock) sections.push(`## Statistiche organizzazione\n\n${orgBlock}`)

    const openBlock = buildOpenReportsBlock(openReports, hasMachineContext)
    if (openBlock) sections.push(`## Segnalazioni aperte\n\n${openBlock}`)

    // Discussioni in corso su più segnalazioni aperte (solo approfondito):
    // permette all'AI di correlare ciò che il team sta dicendo su ticket diversi.
    if (openTicketsChat.length > 0) {
      const openReportsMap = new Map(openReports.map(r => [r.id, r]))
      const openChatBlock = buildOpenTicketsChatBlock(openTicketsChat, openReportsMap)
      if (openChatBlock) sections.push(`## Discussioni in corso (segnalazioni aperte)\n\n${openChatBlock}`)
    }

    // Anagrafica fornitori esterni: serve per domande tipo "cosa pendente
    // con PTS?", "storico Manara", "quali fornitori abbiamo per
    // l'elettronica?". Sempre incluso, e' utile come overview globale.
    const suppliersBlock = buildSuppliersBlock(suppliers)
    if (suppliersBlock) sections.push(`## Fornitori esterni\n\n${suppliersBlock}`)

    const historyBlock = buildMachineHistoryBlock(machineHistory)
    if (historyBlock) sections.push(`## Storia macchina\n\n${historyBlock}`)

    // Report corrente: il PUNTO DI PARTENZA del ragionamento. Contiene la
    // descrizione iniziale del problema + dati aggiuntivi (note tecniche,
    // diagnosi iniziale, ricambi potenziali, motivazione priorita') che
    // sono spesso la base da cui partire prima di guardare la chat.
    const currentReportBlock = buildCurrentReportBlock(currentReport)
    if (currentReportBlock) sections.push(`## Report corrente (ticket che l'utente sta guardando)\n\n${currentReportBlock}`)

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
      const result = await callClaude(systemPrompt, userMessage, apiKey, anthropicModel, anthropicExtraBody)
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
