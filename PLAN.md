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

## Cosa esiste già (e che riusiamo)

ManuTech ha **un'infrastruttura RAG operativa** già pronta:

- Migration `028_knowledge_base.sql`: estensione `pgvector`, tabella `document_chunks` con `embedding vector(1024)`, indice HNSW + GIN per FTS italiano, RPC `search_knowledge` ibrida (vector + FTS)
- Edge function `embed-query`: wrapper privato a Voyage AI (`voyage-multilingual-2`, supporta italiano nativamente)
- Edge function `ingest-knowledge`: pipeline che chunka e embedda manuali macchina
- Edge function `assistant-chat`: RAG conversazionale sui chunks dei manuali, modello Haiku 4.5
- Tabella `comments` già strutturata bene (text, user_id, user_role, media JSONB, org_id)

Quindi il piano **non costruisce da zero**: estende `document_chunks` per includere commenti e descrizioni di report, riusa `embed-query` e `search_knowledge`.

---

## Ordine consigliato

**PR 1 → PR 2 → PR 3**. PR 4 opzionale dopo aver visto il valore.
PR 1 sblocca tutto, PR 2 popola lo storico, PR 3 è il momento "magico" per l'utente.

---

## PR 1 · Estensione document_chunks per report

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

## PR 2 · Backfill storico commenti e descrizioni

**File**: `supabase/functions/backfill-report-knowledge/index.ts` (nuova), `src/pages/admin/AdminKnowledgeBase.jsx` (eventuale tasto)

### Problema
PR 1 indicizza solo i nuovi commenti. La conoscenza pregressa (mesi/anni di commenti su report già chiusi) resta invisibile. Senza backfill, "casi simili" mostra sempre vuoto fino a quando non si accumulano abbastanza commenti nuovi.

### Soluzione
Funzione one-shot che scorre tutti i commenti dei report chiusi (e tutte le `reports.description` dei report chiusi), batch-embedda, popola `document_chunks`. Idempotente: skip i (source_kind, source_ref) già presenti.

### Scope
- Edge function `backfill-report-knowledge` chiamabile via tasto admin
- Input: `{ org_id?: string, batch_size?: number, dry_run?: boolean }`. Default org dell'admin chiamante. Default batch_size 50.
- Output: `{ processed, skipped, errors, total }`. Streaming/polling se possibile, altrimenti chunking client-side a batch.
- Tasto in `AdminKnowledgeBase.jsx` (o pagina equivalente esistente): "Re-indicizza commenti storici" con conferma + progress
- Costi Voyage: stimare con dry_run prima di eseguire. A `voyage-multilingual-2` ~$0.05/1M token. 1000 commenti × 100 token = 100k token = $0.005. Trascurabile per i volumi attuali.

### Out of scope
- Re-indexing automatico schedulato (per ora basta on-demand)
- Backfill commenti su report aperti (la logica "solo report chiusi" della PR 1 si applica anche qui)

### Definition of done
- Tasto "Re-indicizza" funziona, completa senza errori su un'org demo
- Idempotente: re-eseguire non duplica
- dry_run mostra il count di commenti da indicizzare prima di sparare le chiamate Voyage
- Toast con risultato finale ("847 indicizzati, 12 skip, 0 errori")

### Stima
1 giorno se PR 1 è solida. Il pattern è già presente in `ingest-knowledge` per i manuali, basta adattare.

---

## PR 3 · UI Casi simili nel composer segnalazione

**File**: `src/components/ReportComposer.jsx` (o equivalente), `src/hooks/useSimilarCases.js` (nuova), `src/components/SimilarCasesPanel.jsx` (nuova)

### Problema
L'operatore apre una nuova segnalazione e digita "encoder asse Y bloccato sulla riempitrice GAI". Non sa che 8 mesi fa Mario ha risolto un caso identico. La conoscenza c'è nel DB ma non gli arriva.

### Soluzione
Mentre l'operatore digita titolo/descrizione + sceglie macchina, hook con debounce 600ms che embedda il testo combinato + chiama `search_knowledge` con filtro `source_kind IN ('report_comment', 'report_description')` e `machine_id = scelta` (o macchine simili in fase 2). Mostra fino a 3 casi simili sotto il composer, ciascuno con: titolo report, estratto del commento, data, nome del tecnico che ha risolto. Click → modale di anteprima.

### Scope
- Hook `useSimilarCases({ text, machineId, debounceMs: 600, minLength: 20 })` che ritorna `{ cases, loading, error }`
- Embed lato edge function (`embed-query` esistente)
- Search via RPC `search_knowledge` esistente — eventuale piccola estensione per supportare filtri su source_kind e report_id
- Component `SimilarCasesPanel` collassabile (default aperto se ha risultati, chiuso se vuoto)
- Empty state: *"Nessun caso simile trovato. La conoscenza cresce ad ogni segnalazione chiusa."*
- Insufficient data state: se `total_chunks < 50`, mostra: *"Lo storico AI non è ancora maturo. Servono almeno 50 report chiusi per suggerimenti utili."*
- Click su caso → modale leggera con report storico (titolo, descrizione, commento rilevante evidenziato, link al report completo)
- Telemetria minima: contatore "casi mostrati" e "casi cliccati" su `activities` o tabella nuova `ai_suggestion_events`. Servirà per misurare se l'utente lo trova davvero utile.

### Out of scope
- Casi simili "fuori macchina" (su macchine diverse ma stesso problema) — euristica avanzata, fase 2
- Auto-suggestion in fase di voce (Fase 2)
- Spiegazione AI di "perché questo caso è simile" — interessante ma costoso, può aspettare

### Definition of done
- Composer con descrizione + macchina selezionata mostra 3 casi simili in <2s
- Click su un caso apre la modale storica
- Empty state corretto sia per "nessun caso simile" sia per "storico vuoto"
- Demo mode: il composer continua a funzionare, sezione casi simili invisibile o con messaggio "AI non disponibile in modalità demo"
- Mobile UX: il pannello non rompe il flusso del composer, è collassabile

### Stima
2-3 giorni. La parte AI è già pronta; il grosso è UX nel composer.

---

## PR 4 (opzionale) · Quality e telemetria

**Da decidere dopo aver visto PR 3 in uso**.

### Possibili contenuti
- Soglia di similarity dinamica (scarta sotto 0.6, threshold configurabile)
- Filtri: per categoria di componente, per gravità, per data (ultimi 12 mesi)
- Macchine simili (non solo identiche): se la macchina è una "Riempitrice", cerca anche su altre riempitrici
- Dashboard admin: "casi suggeriti / casi cliccati / report risolti più rapidamente con AI" (KPI di valore reale)
- A/B test: gruppo controllo senza panel per misurare differenza nel tempo medio di risoluzione

### Decision point
Apriamo PR 4 solo se PR 3 mostra >20% click-through rate sui casi suggeriti. Sotto, vuol dire che le similarity non sono buone abbastanza o l'UI non funziona — meglio iterare sulle prime 3 PR che impilare nuove feature.

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
