# ADR-010: AI Strategy — Vision and Sequencing

**Status:** Vision (living document, no transition to Accepted)
**Date:** 2026-05-15
**Sprint target:** N/A (cross-cutting strategic direction)
**Schema delta:** nessuno (questo ADR non modifica schema; orienta gli ADR futuri)
**Related:** ADR-007 (org_id UUID), ADR-008 (Interventi v2), ADR-009 (Agenda mobile, futuro)

---

## Nota sulla numerazione

Salto della numerazione ADR-009. Il numero 009 è riservato per "Agenda mobile" (UX feature, attualmente in stato di discovery, vedi ADR-008 §References). ADR-010 viene scritto prima per ragioni di priorità strategica: l'AI strategy è un layer trasversale che condiziona la struttura di tutti gli ADR successivi del prodotto. Quando ADR-009 verrà scritto, prenderà il suo numero. **Nessun retro-fill** dei buchi (002, 003, 004, 009) è previsto: gli ADR si scrivono in ordine cronologico delle decisioni, non riempiendo gap.

---

## Principio fondante: per chi esiste questa AI

L'AI di ManuTech esiste per **tutelare e aiutare in primis l'operatore e il tecnico**. Non è uno strumento di reporting per il management, non è una vetrina per investor o demo. È un layer al servizio di chi sporca le mani in fabbrica.

Il test che ogni feature AI deve superare prima di essere implementata:

> *"Questa funzionalità rende più facile, più sicura, più comoda la giornata dell'operatore o del tecnico?"*

Se la risposta è no, la feature non va costruita — anche se è tecnicamente possibile, anche se è commercialmente attraente, anche se altri SaaS competitor la stanno facendo.

**Implicazioni concrete:**

1. **UX senza frizioni:** ogni interazione AI deve essere completabile con guanti, in fabbrica rumorosa, in 1-2 tap. Threshold confidence, fallback chiari, conferme leggibili a colpo d'occhio.
2. **Comfort over completeness:** meglio una AI che risponde a 80% dei casi in modo eccellente, che una AI che risponde a 100% in modo mediocre.
3. **Tutela operativa:** l'AI deve ridurre il carico cognitivo, non aggiungerlo. Suggerisce, non interroga. Anticipa, non chiede.
4. **Trasparenza dell'errore:** quando l'AI sbaglia (e sbaglierà), l'operatore/tecnico deve poter correggere in 1 tap senza menù nascosti. Mai bloccare un flusso per "ambiguità AI".
5. **Priorità di Layer:** Layer 3 (insights cross-cliente, FASE 5+) viene DOPO Layer 1/2, mai prima. La AI per il founder/management è subordinata alla AI per l'operatore.

**Questo principio prevale su qualsiasi altra considerazione tecnica o commerciale espressa in questo ADR.** In caso di conflitto tra "fattibilità tecnica" e "comfort operatore", vince sempre l'operatore.

---

## Context

Il 15 maggio 2026, dopo una giornata di strategy day (Interventi v2, ADR-008) e un confronto col manutentore reale, è emersa la richiesta esplicita del founder/CTO di **formalizzare la direzione AI di ManuTech come livello trasversale del prodotto**, non come singola feature isolata.

Tre fattori convergenti hanno portato a questo momento:

1. `CLAUDE.md` "Current focus" pre-9/5 menzionava genericamente "Fase 4 RAG" senza struttura né sequencing — direzione persa nella rumorosità degli sprint operativi.
2. Use case multipli sono emersi nelle ultime 24h dal confronto utente: voice creation intervento durante telefonate coi fornitori, riassunto storico per macchina, classificazione automatica segnalazioni, tracciabilità longitudinale degli interventi.
3. Il modello dati che stiamo costruendo (ADR-008 Interventi v2) è già **AI-ready per design** senza che fosse esplicitato come obiettivo: denormalizzazioni con snapshot temporali, N→M reports↔interventions, participants con ruoli espliciti, jsonb per media e extra_data. Il substrato semantico per query AI esiste perché lo schema è stato pensato bene, ma la direzione non è stata documentata.

Questo ADR rimedia formalizzando il principio fondante, la vision, le dipendenze, il sequencing e gli anti-patterns vincolanti.

---

## Vision

ManuTech non è "un'app di gestione manutenzione con AI aggiunta". È **memoria operativa AI-native della fabbrica**, costruita al servizio di operatori e tecnici: ogni segnalazione, intervento, chat, foto, partecipante, schedulazione contribuisce a un substrato dati interrogabile semanticamente.

Il valore differenziante a regime non sarà "abbiamo le funzionalità base più la chat realtime". Sarà la capacità del prodotto di rispondere a domande operative concrete come *"cosa è stato fatto su questa Krones negli ultimi 12 mesi e da chi?"* in linguaggio naturale, con riferimenti precisi a interventi e segnalazioni passate, in 3 secondi invece che 30 minuti di scroll manuale — risparmiando tempo a chi sta in fabbrica, non a chi sta in ufficio.

### Tre principi guida (subordinati al principio fondante)

1. **AI is layer, not feature.** Sonnet (e modelli futuri Anthropic) attraversano il prodotto orizzontalmente — analisi, sintesi, classificazione, voice input. L'AI non vive in un tab dedicato "AI", non è un'aggiunta visibile. È invisibile e ovunque utile.

2. **SQL where possible, LLM where necessary.** Non sostituire query strutturate con generazione probabilistica. Usa LLM dove il dato è semi-strutturato o testuale (chat realtime, descrizioni libere, contenuto media, comandi vocali). Usa SQL dove il dato è strutturato e la domanda è deterministica.

3. **Schema-driven AI.** Il valore semantico della AI è proporzionale alla qualità dello schema sottostante. Investire in schema pulito (Interventi v2, denormalizzazioni snapshot, N→M N participants) è già investire in AI quality.

---

## Dipendenze

L'AI strategy non parte finché:

- **ADR-007** (`org_id` UUID hardening) è in produzione. Necessario per RLS pulita: ogni prompt Sonnet che attraversa Edge Function deve filtrare per `org_id` correttamente, altrimenti rischio cross-tenant data leak gravissimo in FASE 5.
- **ADR-008** (Interventi v2) è in produzione. Lo schema participants/execution_mode è la base per query semantiche su "chi ha fatto cosa, quando, con chi".
- **Tutta FASE 1-2-3** della roadmap esistente è in produzione. Non si costruisce AI sopra flussi UX instabili — gli operatori smettono di usare la AI prima di scoprirne il valore se il prodotto base traballa, e violano il principio fondante (comfort operatore prima di tutto).
- **Infrastruttura Edge Functions Supabase** è consolidata (esiste già per push notifications con VAPID e per voice scheduler in `useVoiceScheduler`). Il pattern "chiave API protetta backend, frontend chiama Edge Function" è già nostro standard.

---

## Sequencing

### Layer 0 — Fondamenta (in corso, prerequisito di tutto)

- ADR-007 `org_id` UUID hardening (Sprint 1d)
- ADR-008 Interventi v2 (Sprint 1e)
- ADR-009 Agenda mobile (Sprint 2a)

### Layer 1 — AI applicata, primo round (FASE 4, autunno 2026)

Tutte le feature Layer 1 sono mirate **direttamente all'operatore o al tecnico**, in coerenza col principio fondante.

**L1.A Riassunti generati on-demand**
Bottone "Genera riassunto" su macchina, segnalazione, o intervento. Sonnet estrae da chat, media, campi strutturati. Output testuale italiano leggibile. Use case: prima di un intervento, il tecnico genera *"cosa è successo su questa macchina ultimamente"* — gli risparmia 20 minuti di scroll.
*Stima:* 1-2 sprint dopo Interventi v2 in produzione.

**L1.B Classificazione automatica segnalazioni**
Quando un operatore crea una segnalazione testuale via Quick Report, Sonnet suggerisce `type` (correttiva/preventiva/ispezione/migliorativa) e `severity` (bassa/media/alta/critica). L'operatore conferma o corregge con un tap. Riduce errori di classificazione e tempo di compilazione — l'operatore inserisce solo il problema, l'AI fa il lavoro di categorizzazione.
*Stima:* 1 sprint.

**L1.C Voice creation intervento mobile**
Manutentore al telefono col fornitore dice *"crea intervento giovedì 21 maggio alle 14:00, elettricista Mario, quadro elettrico sala chimica"*. App crea stub intervento (data, fornitore, area, descrizione) da rifinire dopo da postazione admin. Riusa pipeline `useVoiceInput` + `useVoiceScheduler` esistente. Cattura l'intervento mentre il manutentore è ancora con le mani occupate al telefono. Sarà tracked in un futuro ADR dedicato.
*Stima:* 2 sprint.

### Layer 2 — AI memoria operativa (FASE 4 evoluta, Q4 2026)

**L2.A RAG su storico macchina**
Interfaccia in linguaggio naturale: *"quando abbiamo cambiato l'ultimo cuscinetto su Krones 3 e chi è venuto?"*. Risposta con riferimenti precisi a interventi/segnalazioni passate. Use case operativo: tecnico arriva su una macchina che non gestisce abitualmente, in 3 secondi ha il contesto.
*Stima:* 3-4 sprint. Apre questioni di costo API, latenza, vector store choice.

**L2.B Anomaly detection pattern segnalazioni ricorrenti**
Pattern recognition di segnalazioni ricorrenti su stessa macchina. Alert proattivo al tecnico/manutentore: *"questa Krones ha avuto 4 segnalazioni simili in 3 mesi, considera manutenzione strutturale"*. Trasforma prodotto da reattivo a predittivo — meno emergenze per il tecnico.
*Stima:* 2 sprint, sopra Layer 2.A (riusa embedding pipeline).

### Layer 3 — AI commerciale (FASE 5+, post multi-tenant, 2027)

**Layer subordinato al principio fondante: viene DOPO Layer 1 e 2, mai prima.** La AI per management/founder/investor è subordinata alla AI per chi sta in fabbrica.

**L3.A Insights cross-cliente anonimizzati**
*"Birrifici simili al tuo hanno 30% meno fermi su questa categoria di macchine"*. Richiede multi-tenant maturo, anonimizzazione robusta, consenso esplicito clienti.

**L3.B Benchmarking di settore**
Posizionamento del cliente nel proprio segmento. Genera valore enterprise vero, differenziante rispetto a competitor commodity. Vincolato da volume clienti minimo per significatività statistica.

---

## Anti-patterns vincolanti

1. **Mai esporre chiave API Anthropic frontend.** Tutte le chiamate Sonnet passano da Edge Function Supabase. Pattern già stabilito per `useVoiceScheduler`, va replicato senza eccezioni.
2. **Mai scrivere prompt che bypassino RLS.** Ogni prompt che recupera contesto da database deve includere `org_id` come filtro esplicito nelle query upstream. RLS in Postgres non protegge dal prompt: il prompt deve essere già "filtrato" dall'org corretto prima di colpire Sonnet.
3. **Mai sostituire query SQL con LLM** per domande deterministiche. *"Quante segnalazioni questa settimana?"* è SQL. *"Riassumimi le segnalazioni di questa settimana"* è LLM. Confondere le due cose brucia budget API e introduce non-determinismo dove non serve.
4. **Mai presentare output Sonnet come verità assoluta** quando influenza decisioni operative. Riassunti, classificazioni, suggerimenti vanno sempre marcati visivamente come "generato da AI" + bottone "modifica" o "rifiuta" sempre disponibile. L'operatore/tecnico ha ultima parola.
5. **Mai implementare feature AI prima che Layer 0 sia stabile in produzione.** Costruire AI su schema instabile genera debito tecnico esponenziale: cambiare lo schema obbliga a ri-progettare prompt, re-embeddare corpus, re-validare output. Inoltre, AI traballante su prodotto traballante = doppia frustrazione per l'operatore.
6. **Confidence threshold sempre dichiarato esplicitamente** per voice e classificazione. Pattern esistente `useVoiceScheduler` ha threshold 0.6 per rumore di fabbrica — replicare per ogni feature con uncertainty.
7. **Privacy by design.** Chat realtime contiene dati personali (nomi, messaggi). Prompt Sonnet che attraversano Edge Function vanno valutati per anonimizzazione pre-invio quando il caso d'uso lo richiede. Open question dedicata sotto.
8. **Mai costruire feature AI per impressionare** chi non userà mai il prodotto in fabbrica (founder, investor, demo audience). Il test "rende più facile la vita di operatore/tecnico?" è vincolante. Se fallisce, la feature non si fa — anche se è tecnicamente attraente o commercialmente vendibile.

---

## Use cases osservati dal mondo reale

Raccolti il 15/5/2026 dal confronto col manutentore + intuizioni founder. **Tutti gli use case sono validati dal principio fondante**: ognuno risolve un problema reale di operatore/tecnico, non di management. Da continuare a tracciare in `journal/ai-use-cases.md` (file da creare in sessione successiva). Ogni use case è un input per il sequencing dei Layer 1-2.

- **15/5** — Voice creation intervento durante telefonata col fornitore *(beneficiario: manutentore con mani occupate)* (Layer 1.C)
- **15/5** — Riassunto storico interventi su singola macchina *(beneficiario: tecnico che arriva su macchina non familiare)* (Layer 2.A)
- **15/5** — Pattern recognition di segnalazioni ricorrenti per anomaly detection *(beneficiario: manutentore che vuole evitare emergenze ricorrenti)* (Layer 2.B)
- **15/5** — Classificazione automatica `type`/`severity` al momento della creazione segnalazione *(beneficiario: operatore che vuole solo segnalare il problema senza compilare campi)* (Layer 1.B)
- **15/5** — Estrazione info da chat realtime (chi ha detto cosa, decisioni prese, accordi col fornitore) *(beneficiario: tecnico che riprende un intervento dopo giorni)* — possibile Layer 1.A esteso

Il valore di questa sezione cresce nel tempo. Quando arriverà il momento di pianificare Layer 1, l'obiettivo è avere 15-25 use case raccolti dal campo, non inventati a tavolino, e tutti con beneficiario operativo esplicito.

---

## Open questions strategiche

Non blocking per la vision, ma vanno chiuse prima di ogni Layer. Tracciate qui per non perderle.

1. **Costi API Sonnet a scala** — quando multi-tenant è in produzione, qual è il budget mensile sostenibile per cliente? Influenza la scelta tra Sonnet (più capace, più caro) e Haiku (più veloce, più cheap) per use case differenti. Decisione tipica: Haiku per classificazione/voice parsing, Sonnet per riassunti e RAG.
2. **Privacy/GDPR sui prompt** — chat realtime contiene nomi e contenuto potenzialmente sensibile. Va anonimizzato pre-invio a Sonnet? Quale livello (sostituzione nomi, redazione)? Vincoli contrattuali clienti enterprise.
3. **Caching strategy** — riassunti generati on-demand (ogni request è una chiamata API) vs precomputati periodicamente (cron + cache, request servite da cache). Trade-off costo vs freschezza.
4. **Vector store** — pgvector in Supabase (semplicità, già parte stack) vs servizio dedicato Pinecone/Weaviate (performance migliore a scala). Decisione vincolata da volume e latenza target.
5. **Modello mix** — solo Sonnet per tutto, oppure mix Sonnet/Haiku/futuri modelli Anthropic? Probabile risposta: mix, deciso per use case.
6. **Prompt engineering vs fine-tuning** — basta prompt engineering serio + RAG per gli use case identificati, o serve fine-tuning con dati ManuTech? Risposta provvisoria: prompt + RAG sufficiente per Layer 1-2, fine-tuning eventualmente in Layer 3 quando si ha corpus dati cross-cliente.

---

## Trigger di revisione

Questo ADR è **Vision living document**, non transita mai a `Accepted` o `Rejected`. Va riaperto e aggiornato in occasione di:

- **Layer 0 completato in produzione** → riapri sequencing Layer 1 con dati reali sul comportamento utenti
- **Cambio significativo pricing Anthropic API** → impatta scelta modello mix
- **Nuovo modello Anthropic** con capability significativamente diverse (più contesto, multimodalità migliore, agentic capabilities) → riconsidera quali Layer accelerare
- **Feedback campo significativo** su feature AI (sia positivo "lo usano molto più del previsto", sia negativo "non lo usa nessuno") → ricalibra priorità
- **Feedback operatori/tecnici sul campo segnala frizione UX** con qualsiasi feature AI → **priorità massima di revisione, eventualmente fermare il Layer in corso fino a fix**. Il principio fondante è vincolante: una AI che crea frizione operativa va corretta o ritirata, non difesa.
- **Apertura FASE 5 multi-tenant** → sblocca Layer 3, richiede revisione completa privacy/costi
- **Cambio strategia commerciale** (es. ManuTech evolve verso enterprise B2B con SLA AI, oppure verso self-service SMB) → impatta Layer 3 e infrastruttura, ma **mai** Layer 1/2 (che restano subordinati al principio fondante)

---

## Riferimenti

- `ADR-007-org-id-schema-hardening.md` — prerequisito infrastrutturale
- `ADR-008-interventions-v2-data-model.md` — substrato schema AI-ready
- `ADR-009-mobile-operator-temporal-view.md` (futuro) — UX layer su cui Layer 1 si appoggia
- `CLAUDE.md` — sezione "AI Strategy" da aggiungere come riferimento permanente
- `journal/ai-use-cases.md` (futuro) — log dei use case dal campo
- Architettura `useVoiceScheduler` + `useVoiceInput` esistente — pattern di riferimento per Edge Function + threshold confidence
- Roadmap FASE 4 (`ROADMAP.md`) — sequenziale con Layer 1
- Confronto manutentore 15/5/2026 — sorgente principale dei use case osservati e del principio fondante

---

## Notes

- Status resta `Vision` indefinitamente. Ogni Layer specifico avrà il proprio ADR di decisione tecnica (es. ADR-011 per Voice creation, ADR-012 per RAG, ecc. — numerazione da assegnare sequenzialmente quando si arriva al momento).
- Documento vivo: aggiornare a ogni revisione triggered. Aggiungere una sezione "Revision log" se le revisioni superano le 3.
- Questo ADR è anche un documento di **anti-drift**: serve a non perdere la direzione AI nelle settimane di sprint operativi. Linkato esplicitamente da `CLAUDE.md` Current focus quando arriverà il momento di iniziare Layer 1.
- **Il principio fondante è la testata d'angolo dell'ADR**: ogni decisione futura su feature AI deve essere validata contro di esso. Se in conflitto con altri principi qui espressi, vince il principio fondante.
