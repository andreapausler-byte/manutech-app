# PLAN · Fase 4 anticipata · RAG sui commenti

**Stato**: in apertura
**Branch**: `claude/initial-setup-nDLxm`
**Apertura**: 9 maggio 2026
**Decisione di rotta**: anticipiamo un pezzo di Fase 4 ("Knowledge che sopravvive") rinviando Fase 1 ("Eventi prima dello stato"). Razionale in `ROADMAP.md` sezione *Decisioni di rotta*.

---

## Obiettivo della fase

Quando l'operatore apre una nuova segnalazione, il sistema mostra **3 casi storici simili già risolti** sulla stessa macchina (o macchina analoga). Il valore è togliere "Luigi è in ferie e nessuno sa come fare": la conoscenza dei tecnici resta nel prodotto, non cammina fuori dalla porta con le persone.

**Use case scelto**: (A) RAG su commenti di report chiusi, mostrato nel composer della nuova segnalazione.

**Out of scope dichiarato**:
- (B) Riassunto ticket lunghi → prossima fase se questa funziona
- (C) Triage all'apertura → già esiste in `extract-ticket-fields` edge function, valutiamo dopo se va integrato meglio
- (D) Coach in chat → richiede infrastruttura streaming, in coda
- Differenziazione tier per modello AI → decisione di prodotto rinviata, default a Haiku 4.5 per ora

---

## Cosa esiste già (verificato leggendo il codice)

Il piano iniziale di questo file assumeva di dover estendere la knowledge base ai commenti dei report. **Falso**: era già fatto. Verifica completa:

- Migration `028` + `041`: `document_chunks` accetta `source_kind = 'report_chat'` (la 041 ha aggiunto questo valore al CHECK)
- Edge function `ingest-knowledge`: già indicizza i report chiusi includendo titolo, descrizione, closure_root_cause/action/parts, e tutti i commenti — vedi `index.ts:472`
- Trigger automatico alla chiusura report: `ReportDetail.jsx:511` chiama `db.queueMachineReindex(report.machine_id)` quando il tecnico clicca "risolvi"
- Trigger su edit/delete commento: `ChatPanel.jsx:451,465` ri-indicizza la macchina
- Tasto admin "Re-indicizza biblioteca AI" per macchina: `MachineDocumentationTab.jsx`
- Componente `SimilarReportsPanel.jsx`: pannello "Soluzioni dal passato" già presente in `ReportDetail` (one-shot al click "Apri", usa `assistant-chat` con sintesi LLM)

**Quindi la PR 1 è una sola cosa**: portare la ricerca "casi simili" nel **composer di nuova segnalazione** in modo **live** (debounced mentre l'utente scrive). Non c'è migration nuova, non c'è edge function nuova — solo un nuovo componente UI e un piccolo helper in `lib/assistant.js`.

Le PR 2 (backfill) e PR 3 (UI nel composer) della prima stesura del piano sono assorbite o cancellate. La PR 1 originaria (estendere document_chunks) è duplicato di lavoro già esistente.

---

## Ordine consigliato

**PR 1** è l'unica davvero necessaria. Tutto il resto sopra (estensione schema, backfill) è già nel codice. Le PR 2/3/4 della prima stesura sono cancellate o assorbite.

---

## ~~PR 1 · Estensione document_chunks per report~~ — CANCELLATA

Era duplicato di codice già esistente (migration 041 + ingest-knowledge linea 472). Lasciata qui sotto come archivio storico della prima ipotesi sbagliata. Lezione: leggere TUTTE le migration + edge function PRIMA di scrivere PLAN, non solo la 028.

---

## PR 1 (vera) · UI Casi simili live nel composer

**File**: `src/lib/assistant.js`, `src/components/reports/SimilarCasesLivePanel.jsx` (nuovo), `src/components/reports/NewReport.jsx`

### Problema
L'operatore apre una nuova segnalazione. Mentre digita "encoder asse Y bloccato sulla riempitrice", non sa che 8 mesi fa Mario ha risolto un caso identico. La conoscenza c'è già nel DB (in `document_chunks` come `report_chat`), ma all'operatore non arriva: il pannello "Soluzioni dal passato" esiste solo dentro `ReportDetail` (su un report già aperto), non nel composer di una segnalazione nuova.

### Soluzione
Componente `SimilarCasesLivePanel` che vive nel composer. Mentre l'operatore digita titolo + descrizione + sceglie macchina:
1. Concatena `title + description`, debounce 700ms, skip se <30 char
2. Chiama edge `embed-query` per ottenere embedding del testo
3. Chiama RPC `search_knowledge` filtrato per `machine_id`, prende top 12 chunks
4. Filtra client-side per `source_kind === 'report_chat'`, dedupe per `source_ref` (=report_id) tenendo la similarity più alta
5. Fetcha metadati dei top 3 report (titolo, macchina, closure_root_cause, ecc.) in un'unica query
6. Mostra pannello con 3 card: titolo + estratto + similarity % + macchina + data + nome tecnico
7. Click su una card apre una **modale di anteprima** con causa, azione, estratto chunk. Il composer resta intatto sotto.

**Niente LLM call** in questo flow. Solo embedding + RPC + fetch report. Costo per query: ~$0.0001 (Voyage). Velocità: <1s tipico.

### Scope
- `lib/assistant.js`: aggiungere `searchSimilarCases({ text, machineId, excludeReportId, limit })`
- `components/reports/SimilarCasesLivePanel.jsx`: nuovo, gestisce debounce + stati loading/empty/error/results + modale di preview
- `components/reports/NewReport.jsx`: integrazione subito dopo il campo Descrizione, calcola `machineId` da `form.machine` via lookup `machines.find(m => m.name === form.machine)?.id`
- Demo mode: il pannello restituisce `null` se `!isAssistantAvailable()`
- Empty state esplicito: "Nessuna segnalazione storica simile sulla stessa macchina. Quando questa verrà chiusa, arricchirà lo storico per i prossimi."
- Niente telemetria in questa PR (eventuale PR 2 di follow-up)

### Out of scope
- Integrazione anche in `QuickReport.jsx` (i quick template hanno meno testo, valore inferiore — valutiamo dopo)
- Casi simili "fuori macchina" (su macchine diverse ma stesso problema)
- Telemetria click-through (richiede tabella nuova, follow-up)
- Apertura "completa" del report storico nel composer (per ora solo preview modale; se serve, aggiungiamo `onOpenFull` callback al chiamante)

### Definition of done
- Compilando titolo + descrizione + macchina nel composer, dopo ~700ms appare il pannello con 3 casi simili (se esistono)
- Click su un caso apre preview modale con causa/azione/estratto
- Demo mode: pannello invisibile, composer continua a funzionare normalmente
- Niente regressioni su `SimilarReportsPanel` (che resta in ReportDetail)
- Build e lint passano

### Stima
~~3-4 giorni~~ → **mezza giornata** (riusa tutto il backend esistente)

---

## ~~PR 2 · Backfill storico~~ — CANCELLATA

Esiste già: il tasto "Re-indicizza biblioteca AI" in `MachineDocumentationTab.jsx` riprocessa tutti i report chiusi della macchina via `ingest-knowledge`. La triggata automatica alla chiusura report mantiene lo storico aggiornato. Eventualmente in futuro si può aggiungere un "Re-indicizza tutto globale" (1 PR piccola), ma non è bloccante.

---

## ~~PR 3 · UI Casi simili nel composer~~ — DIVENTATA PR 1

Spostata sopra. Era la vera PR 1 dall'inizio, mascherata da "sequenza" di lavoro che si è rivelata già completata.

---

## PR 2 (eventuale) · Telemetria e follow-up

**File**: `supabase/migrations/029_*.sql`, `supabase/functions/ingest-report-knowledge/index.ts` (nuova), `src/lib/db/reports.js`

### Problema
La tabella `document_chunks` indicizza solo manuali macchina. I commenti dei tecnici e le descrizioni dei report storici (la conoscenza più ricca del prodotto) non sono indicizzati.

### Soluzione
Estendere `document_chunks` con due nuovi `source_kind`: `'report_comment'` e `'report_description'`. Aggiungere `report_id UUID NULLABLE` come campo collegato. `machine_id` resta NOT NULL e si propaga dal report (un report ha sempre una macchina associata, da verificare in fase di implementazione).

Pipeline embedding al salvataggio: quando un commento viene inserito **e il report è in stato `risolta` o `chiuso`**, enqueue embedding via edge function. La stessa logica vale per `reports.description` quando il report transita a chiuso.

### Scope
- Migration: ALTER document_chunks (`report_id UUID`, espansione CHECK su source_kind)
- Indice: `CREATE INDEX idx_chunks_report ON document_chunks(report_id) WHERE report_id IS NOT NULL`
- Edge function `ingest-report-knowledge`: input `{ kind: 'comment'|'description', id: UUID }`, fa fetch del testo, chunka se >2000 char (i commenti tipici sono brevi → 1 chunk per commento), embed via Voyage, INSERT. Idempotente: skip se `(source_kind, source_ref)` già presente.
- Hook in `db/reports.js`: dopo `addComment` e dopo transizione a `risolta`/`chiuso`, chiamata fire-and-forget all'edge function (ignora errori non bloccanti)
- Demo mode: skip totale embedding (no-op silenzioso)

### Out of scope
- Backfill storico (PR 2)
- UI consumer (PR 3)
- Re-embedding su edit/delete commento (per ora il commento eliminato resta nei chunks, lo gestiamo se diventa problema — i dati di operatori reali raramente cancellano i commenti operativi)

### Definition of done
- Inserire un commento su un report chiuso popola `document_chunks` con un nuovo record source_kind='report_comment'
- Idempotenza: re-inserire lo stesso commento (test manuale) non duplica
- Demo mode: nessun errore in console, nessuna chiamata alla edge function
- RLS: i chunks dei commenti rispettano org_id (i clienti non si vedono fra loro)
- Build/lint passano

### Stima
1-2 giorni. Niente UI, solo pipeline. Il rischio è la latenza: l'embedding non deve bloccare il salvataggio commento (chiamata async, errori loggati ma non rilanciati).

---

## Vincoli comuni

- Build e lint devono passare prima di ogni push
- **Demo mode** rispettato: ogni nuova funzione DB ha fallback localStorage o no-op silenzioso
- **Multi-tenant**: `org_id` propagato e RLS rispettata (i chunks di un'azienda non sono visibili a un'altra)
- **Privacy**: i commenti vanno a Voyage per embedding. Verificare ToS Voyage. Lungo periodo, valutare embedding locale (es. modello multilingual su device) — fuori scope ora
- **Costo**: monitorare costi Voyage e Anthropic dopo PR 2 (backfill); reporting mensile in `journal/`
- **Niente Sonnet/Opus**: tutto Haiku 4.5 per ora; tier per modello deciso dopo aver visto le feature funzionare
- Italiano in UI, inglese nel codice
- No nuovi file CSS, no librerie UI esterne (regola CLAUDE.md)
- Test: ad oggi non c'è vitest. Tocchiamo AI/RAG senza test → testing manuale rigoroso. Se PR 1 si rivela troppo rischiosa, fermiamoci e aggiungiamo vitest prima di proseguire

---

## Note di rischio

1. **Privacy / GDPR**: i commenti contengono nomi di tecnici, descrizioni di guasti, possibili informazioni sensibili. Inviarli a Voyage AI è un trasferimento dati a terzi. Verificare il DPA di Voyage (Anthropic ha un DPA pubblico). Se non ok, esplorare alternative (Cohere, embedding locale).
2. **Volumi storici**: se l'org ha <50 report chiusi, il valore di "casi simili" è basso. La PR 3 ha già un empty state per questo, ma è bene saperlo: l'utente potrebbe percepire la feature come "non funziona" nei primi mesi.
3. **Drift di lingua**: i commenti possono mescolare italiano e termini tecnici inglesi. `voyage-multilingual-2` lo gestisce nativamente, ma vale verificare con un test su 5-10 commenti reali.
4. **Edge function timeouts**: Supabase edge function ha timeout 60s. Il backfill di PR 2 potrebbe superarlo se i commenti sono migliaia → batchato lato client.
5. **Senza eventi (Fase 1 rinviata)**: per ora i commenti sono il proxy della "storia di un report". Se in futuro Fase 1 introduce `request_events`, potremmo voler indicizzare anche quelli. La struttura `document_chunks` con `source_kind` è già aperta a estensioni, ma il refactor sarà non banale. Lo accettiamo come debito futuro.
