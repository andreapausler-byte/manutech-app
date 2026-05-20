# Proposta tecnica · iCal Feed (Sprint Phase 4.0)

**Data**: 2026-05-20
**Branch**: `claude/ical-feed-phase-4-proposal-dWwYu`
**Stato**: Proposta — richiede approvazione prima di scrivere codice
**Tipo**: docs-only (nessuna migration, nessuna edge function in questo commit)

---

## 0. Disambiguazione "Phase 4.0"

"Phase 4.0" nel nome dello sprint non corrisponde alla **Fase 4 della ROADMAP** (`Knowledge che sopravvive`, RAG sui commenti). È un identificatore di sprint interno per la feature **iCal Feed**, che si colloca trasversalmente rispetto alle fasi della ROADMAP:

- ROADMAP FASE 3 backlog include "**Agenda tecnico mobile**" (vista lista temporale dentro la PWA), sequenziale a Interventi v2 (ADR-008 Proposed).
- iCal Feed è una **alternativa o complemento esterno** all'Agenda mobile: il tecnico vede gli interventi nel proprio Google/Apple Calendar nativo, senza aprire l'app.

**Tensione strategica da chiarire (vedi §5.A)**: anticipare iCal Feed prima dell'Agenda mobile UI dentro la PWA? Sono due risposte allo stesso bisogno ("prepararsi psicologicamente ai prossimi impegni"), con costi/benefici diversi.

---

## 1. Contesto ricostruito dal repo

### 1.1 Cosa è già stato deciso

- **Schema `interventions`** (mig 053-055) è in produzione e copre già i campi necessari per generare eventi calendario:
  - `scheduled_start_at`, `scheduled_end_at` (TIMESTAMPTZ) → DTSTART/DTEND
  - `estimated_duration_min` (INTEGER) → fallback per DTEND
  - `actual_start_at`, `actual_end_at` → utili in vista storica
  - `title`, `description`, `location` → SUMMARY/DESCRIPTION/LOCATION
  - `status` ∈ (`bozza`,`pianificato`,`confermato`,`in_corso`,`completato`,`annullato`) → STATUS iCal
  - `severity`, `type`, `origin` → CATEGORIES
  - `assigned_to` (+ snapshot `assigned_to_name`/`assigned_to_role`) → ATTENDEE / scope='mine'
  - `machine_id`, `machine_name` → contesto in DESCRIPTION
  - `org_id` (TEXT) → filtro multi-tenant
  - `extra_data` JSONB → estensione futura
- **Hook `useInterventionsCalendar`** (`src/hooks/useInterventionsCalendar.js`) già implementa scope `'mine'` filtrando `assigned_to === currentUserId`. Pattern direttamente riusabile nella query Edge Function.
- **Pattern token pubblico** già esiste in `guest_tokens` (schema.sql:194): TEXT UNIQUE, `enabled`, `expires_at`, RLS con SELECT/INSERT/UPDATE/DELETE separate per ruoli admin/tecnico. È il template per `calendar_feed_tokens`.
- **Edge Functions** seguono pattern Deno + `Deno.serve` + `@supabase/supabase-js@2` via esm.sh + service role per bypass RLS. CORS handler standard. Esempio canonico: `supabase/functions/guest-chat/index.ts`.
- **`config.toml`** documenta il pattern `verify_jwt = false` per Edge Functions che servono richieste senza Supabase Auth (es. `transcribe`, `extract-ticket-fields`). iCal feed userà lo stesso pattern.
- **ADR-005** (`vocabulary-alignment`) e ADR-008 (`interventions-v2-data-model`, Proposed) sono i riferimenti vocabulary/schema. Nessun ADR esistente menziona iCal, calendar export, calendar sharing o `.ics`.

### 1.2 Cosa è aperto / non ancora deciso

- **Nessun ADR su iCal feed** o calendar export. Questa proposta è il documento di apertura.
- **ADR-008** `intervention_participants` resta Proposed. La v1 dell'iCal feed userà `assigned_to` (compatibile con stato attuale); evolverà naturalmente a `intervention_participants` quando ADR-008 viene migrato. Decisione architetturale: **non bloccare iCal feed su ADR-008**.
- **ADR-009** (futuro UI Agenda mobile) non scritto. iCal feed può precederlo, seguirlo o sostituirlo parzialmente — vedi §5.A.
- **`maintenance_plans`** ha `frequency_days` ma non `next_execution_at`. Senza data esplicita non c'è materiale "eventizzabile" — vedi Q4 sotto.
- Journal `journal/2026-05.md` non contiene memo storici su iCal. Greppato `ical|i-cal|webcal|VEVENT|.ics` su tutti i .md del repo: zero match rilevanti. **Non esiste decisione pregressa da rispettare.**

### 1.3 Riferimenti chiave repo

- `supabase/migrations/053_create_interventions.sql` (riga 27-97): schema tabella interventions
- `supabase/schema.sql:194` (`guest_tokens`): template token pubblico
- `supabase/functions/guest-chat/index.ts`: template Edge Function con token validation + service role
- `supabase/config.toml`: pattern `verify_jwt = false`
- `src/hooks/useInterventionsCalendar.js:75`: filtro scope='mine' su assigned_to

---

## 2. Audit schema rilevante

| Tabella | Colonne rilevanti per iCal | Note |
|---|---|---|
| `interventions` | `id`, `scheduled_start_at`, `scheduled_end_at`, `estimated_duration_min`, `title`, `description`, `location`, `status`, `severity`, `type`, `origin`, `assigned_to`, `assigned_to_name`, `machine_id`, `machine_name`, `org_id`, `updated_at` | **Tutto già esiste**. Pronta per consumo iCal. |
| `users` | `id`, `name`, `email`, `role`, `org_id` | Usato per join nominativo assegnatario + filtro org_id |
| `intervention_participants` | **NON ESISTE** (ADR-008 Proposed) | v1 userà solo `assigned_to`; v2 includerà partecipanti quando migrato |
| `reports` | `id`, `title`, `assigned_to` (legacy), `created_at` | NON include eventi reports nel feed (sono "ticket", non eventi). I report linkati a interventi appaiono via `interventions.report_id` come metadata in DESCRIPTION. |
| `machines` | `id`, `name`, `location`, `department` | Riferimento per LOCATION fallback se `interventions.location` vuota |
| `maintenance_plans` | `id`, `name`, `frequency_days`, `assigned_to` | **Non eventizzabile direttamente** (manca data). Vedi Q4. |
| `guest_tokens` | `token`, `enabled`, `expires_at`, `created_by`, `org_id` | **Template** per `calendar_feed_tokens` |

### Tabella nuova proposta: `calendar_feed_tokens`

```sql
CREATE TABLE public.calendar_feed_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,                    -- 32 bytes base64url
  scope       TEXT NOT NULL DEFAULT 'mine'
              CHECK (scope IN ('mine','org')),         -- 'org' riservato a futuri admin
  enabled     BOOLEAN NOT NULL DEFAULT true,
  org_id      TEXT NOT NULL DEFAULT 'default',
  last_accessed_at TIMESTAMPTZ,                        -- analytics + idle revoke futuro
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_calendar_feed_tokens_token ON public.calendar_feed_tokens(token);
CREATE INDEX idx_calendar_feed_tokens_user  ON public.calendar_feed_tokens(user_id);
```

RLS analoghe a `guest_tokens` ma con `user_id = get_my_user_id()` (un utente vede/gestisce solo i propri token, admin vede/revoca tutti).

### Edge Functions esistenti (per stile/pattern)

10 funzioni attive in `supabase/functions/`: `assistant-chat`, `embed-query`, `extract-ticket-fields`, `guest-chat`, `ingest-knowledge`, `send-email-notification`, `send-push-notification`, `send-weekly-digest`, `signup-org`, `transcribe`. Tutte Deno + TypeScript, pattern `Deno.serve`. La proposta riusa esattamente questo stile per la nuova `ical` function.

---

## 3. Risposte alle 8 domande

### Q1 — URL pattern

**Raccomandazione**: `/functions/v1/ical/{token}.ics` (path-based, suffisso `.ics`).

**Razionale**:
- L'estensione `.ics` aiuta Outlook (storicamente sensibile a content-type guessing) e abilita link "salva come" su browser.
- Token nel path evita problemi con client che ri-fetchano e potrebbero perdere querystring durante redirect (caso documentato su alcune versioni Outlook desktop pre-2020 e su alcuni feed reader iOS).
- Pattern compatibile con Google Calendar (accetta sia path sia query), Apple Calendar (accetta entrambi, predilige path con `.ics`), Outlook 365 / Outlook desktop (preferisce path con `.ics`).
- Coerente con la convenzione REST e con il pattern delle Edge Functions Supabase (`/functions/v1/{name}`).

**Implementazione concreta**: la function si chiama `ical`, l'utente sottoscrive `https://<project>.supabase.co/functions/v1/ical/{token}.ics`. Il parsing della path part recupera il token fino al `.ics`. Per robustezza aggiuntiva, accettiamo anche `?token={token}` come fallback non documentato (zero costo, riduce friction se qualcuno digita il pattern "sbagliato").

**Webcal prefix**: opzionalmente offrire anche `webcal://...` come UX (alcuni client lo riconoscono come "abbonati"), ma il backend è lo stesso URL `https://`.

### Q2 — Autenticazione

**Raccomandazione**: opzione (a) — **token random opaco** di 32 bytes base64url salvato in `calendar_feed_tokens`.

**Razionale**:
- **Semplicità rotazione**: rigenerare = DELETE + INSERT. UX: l'utente vede solo "rigenera URL" e copia il nuovo. Nessuna firma da invalidare, nessuna lista di revoca.
- **Audit-friendly**: il token è un record, posso loggare `last_accessed_at`, contare utilizzi, listare token attivi per utente.
- **Coerente con `guest_tokens`** già in produzione: stesso pattern → meno superficie cognitiva.
- **Opzione (b) HMAC** sembra elegante ma richiede gestione segreto separato + non risolve la rotazione (devo comunque tenere una blacklist o un counter). Più complessa, non più sicura per questo caso d'uso.
- **Opzione (c) JWT**: scade. Per un feed "incolla URL e dimentica", la scadenza è un anti-pattern UX (l'utente scopre il calendario rotto dopo settimane). Skip.

**Forza del token**: 32 bytes random = 256 bit di entropia. Non brute-forceable. Niente PII nel token (no UUID utente esposto). Niente predicibilità.

**Sicurezza extra v1.1 (opzionale)**: rate limit 60 req/min per token, refuse se `enabled=false`, opzione `expires_at` futura per token a tempo (non default).

### Q3 — Scope feed

**Raccomandazione**: v1 = **assignee only** (`assigned_to = user`). Lo scope è derivato dal `user_id` legato al token, non è parametro nell'URL.

**Razionale**:
- Massima semplicità + privacy by default (un tecnico non vede in calendario interventi di colleghi).
- **Coerente con `useInterventionsCalendar` scope='mine'** già in produzione. Mantiene un solo concetto di "i miei interventi" tra app interna e feed esterno.
- **ADR-008** introdurrà `intervention_participants` con ruoli `lead/supporto/operatore_linea/...`. Quando migrato, lo scope='mine' del feed evolverà naturalmente a "interventi dove l'utente è participant con role IN (...)". **Non bloccare iCal su ADR-008**: la v1 sopra `assigned_to` è forward-compatible (l'API resta uguale, cambia solo la query interna).
- **Scope='org' per admin**: rinviato a v2. Motivazione: un admin che vede 200 interventi/mese nel proprio Google Calendar nativo lo trova rumoroso e probabilmente lo silenzia. Meglio iniziare con scope=mine anche per admin (vedono i loro), poi aggiungere su richiesta esplicita una vista "tutti gli interventi della mia azienda" con filtri (es. solo `pianificato` + `confermato`, esclusi `completato`).

**Schema del token già preparato**: colonna `scope` con CHECK `IN ('mine','org')` permette evoluzione senza migration.

### Q4 — Inclusione `maintenance_plans`

**Raccomandazione**: **escludere** `maintenance_plans` dal feed v1. Includere solo `interventions` (con `origin IN ('report','maintenance_plan','manuale')`).

**Razionale**:
- `maintenance_plans` ha `frequency_days` ma **non ha `next_execution_at`**. Non c'è un timestamp eventizzabile. L'unica via per generarli sarebbe calcolare `last_log.performed_at + frequency_days` per ogni plan — fragile, soggetto a interpretazioni, alto rischio di "evento fantasma" su piani inattivi o ricalibrati.
- Il modello dati ManuTech tratta i piani come **template ricorrenti**, non eventi. L'evento concreto nasce quando il piano viene **schedulato** → crea un `intervention` con `origin='maintenance_plan'` + `scheduled_start_at` valorizzato. **Quell'intervento è già nel feed.**
- Aggiungere VEVENT con RRULE per piani ricorrenti senza data sembra una buona idea, ma in pratica:
  - I client trattano RRULE come "ricorrenza certa" → mostrano eventi infiniti
  - Se il piano viene poi modificato/disabilitato, il feed deve emettere RECURRENCE-ID exceptions complessi
  - L'utente vede sul calendario "manutenzione filtro X ogni 30 giorni alle 9:00" ma in realtà il tecnico assegnato non è ancora deciso → confusione

**Eccezione futura**: se in v2 si introduce `maintenance_plans.next_due_at` (colonna nuova, calcolata da trigger su `maintenance_logs`), si potrebbe emettere un VEVENT singolo "prossima scadenza piano X" per i piani con `assigned_to` valorizzato. Decisione rinviata.

### Q5 — Formato VEVENT

**Raccomandazione**:

| Campo | Sorgente | Note |
|---|---|---|
| `UID` (mandatory) | `intervention.id + '@manutech.app'` | Globalmente univoco, stabile (no re-create su edit) |
| `DTSTAMP` (mandatory) | `now()` al momento della generazione | Quando il feed è stato generato |
| `DTSTART` (mandatory) | `scheduled_start_at` in UTC | Vedi Q6 |
| `SUMMARY` (mandatory) | `title` (max 75 char, troncato) | Prefisso `[TK-id]` per leggibilità |
| `DTEND` (consigliato) | `scheduled_end_at` if exists, else `scheduled_start_at + estimated_duration_min`, else `scheduled_start_at + 60min` | Vedi sotto |
| `DESCRIPTION` | Composto: descrizione + macchina + assegnatario + tipo + severità + link app | Multi-riga con `\n` (escapato `\\n` in iCal) |
| `LOCATION` | `interventions.location` if not null, else `machine.location`, else vuoto | Stringa singola |
| `STATUS` | Mapping (vedi tabella) | Solo 3 valori iCal validi |
| `CATEGORIES` | `'ManuTech,'` + `type` + `,severity-` + severity | Es. `ManuTech,correttiva,severity-alta` |
| `URL` | `https://manutech.app/interventions/{id}` | Deep link app (verifica routing) |
| `ORGANIZER` (opzionale) | snapshot creator name + email org generica | Skip se rumoroso |
| `LAST-MODIFIED` | `interventions.updated_at` in UTC | Aiuta i client a sincronizzare le modifiche |

**Mapping STATUS** (iCal accetta solo `TENTATIVE`, `CONFIRMED`, `CANCELLED`):
- `bozza`, `pianificato` → `TENTATIVE`
- `confermato`, `in_corso`, `completato` → `CONFIRMED`
- `annullato` → `CANCELLED`

**Interventi senza data fine**: fallback a chain `scheduled_end_at` → `start + estimated_duration_min` → `start + 60min` (default ragionevole). **Non usare all-day**: il modello operativo prevede orari precisi, all-day sarebbe imbruttito (es. "manutenzione tutto il giorno" sembra ferma macchina ma può essere un'ispezione di 30 min).

**Interventi senza `scheduled_start_at`**: **skip** (non emettere VEVENT). Nel feed entrano solo interventi pianificati con data. Un intervento `bozza` senza data non ha senso in calendario.

**Filtro temporale di default**: emettere VEVENT con `scheduled_start_at >= now() - 30 days` (storico recente) e `<= now() + 12 months`. Riduce dimensione feed e copre il caso operativo "settimana prossima + revisione storica recente". Configurabile via querystring `?days_past=30&days_future=365` per consumer power user.

### Q6 — Fuso orario

**Raccomandazione**: **emettere DTSTART/DTEND in UTC con suffisso `Z`** (es. `DTSTART:20260520T140000Z`). No VTIMEZONE block.

**Razionale**:
- Massima compatibilità: tutti i client iCal moderni interpretano UTC e convertono in fuso utente automaticamente.
- VTIMEZONE block (necessario per emettere `TZID=Europe/Rome`) è ~30 righe per ogni feed, error-prone (DST rules cambiano nel tempo, devono essere mantenute), e non aggiunge valore per utenti tutti in Italia.
- DB salva `TIMESTAMPTZ` in UTC nativamente → conversione zero: basta formattare nel formato iCal `YYYYMMDDTHHMMSSZ`.

**Trade-off**: se in futuro un fornitore esterno in fuso diverso (es. Germania `Europe/Berlin`) entra nel sistema, l'evento "ore 14 a Padova" appare al fornitore "ore 14 nel tuo fuso" = sbagliato. Soluzione futura: aggiungere `TZID=Europe/Rome` con VTIMEZONE block solo se/quando il caso si presenta. Per il **target operativo attuale (stabilimenti italiani)** è zero problemi.

### Q7 — Revoca / rotazione token

**Raccomandazione**:
1. **UI in mobile** (`ProfilePage`) + **UI in admin** (V6App → profilo personale dell'admin)
2. **Self-service**: ogni utente vede SOLO i propri token, può rigenerare il proprio
3. **Admin override**: l'admin (`get_my_role()='admin'`) può listare e revocare token di qualsiasi utente della sua org (caso "tecnico dimesso" → revoca tutto)

**Flusso UX**:
- Sezione "Calendario esterno" nella ProfilePage
- Stati: "Non attivo" → bottone "Attiva calendario esterno" → genera token, mostra URL completo + bottone "Copia"
- Stati: "Attivo" → mostra URL (offuscato con bottone show/copy), data ultima sincronizzazione (`last_accessed_at`), bottone "Rigenera URL" (con conferma: "il vecchio URL smetterà di funzionare"), bottone "Disattiva" (setta `enabled=false`)
- Hint UX: istruzioni copy/paste per Google Calendar (Settings → Add calendar → From URL), Apple Calendar (File → New Calendar Subscription), Outlook (Add calendar → Subscribe from web)

**Stima UI**: ~0.5 giorni componente + ~0.5 giorni admin override. Out of scope per la PR Edge Function — separabile in PR successiva.

### Q8 — Rate limiting / caching

**Raccomandazione v1**: niente ETag/Last-Modified. Sì rate limit base. Sì `Cache-Control: private, max-age=300`.

**Stima carico realistica** (con assunzioni ManuTech attuali):
- Utenti reali in produzione: ~5-10 (org pilota)
- Interventi medi per utente attivi (finestra ±90gg): ~10-50
- Polling iCal client: tipicamente 15min (Google), 5-30min (Apple), 30-60min (Outlook)
- Query SQL per request: 1 select su `interventions` con index `idx_interventions_assigned` (assigned_to, scheduled_start_at) → millisecondi
- Stima request/giorno: 10 utenti × 4 req/h × 24h = ~1.000 req/giorno = **0.01 req/s di picco**

**Conclusione**: il costo computazionale è trascurabile. ETag/Last-Modified aggiungerebbero codice + bug surface senza beneficio osservabile. Si introducono quando emerge il bisogno (es. crescita 100× utenti).

**Rate limit invece sì**: difensivo contro abuse (token leakato → script che fa polling 1 req/s). 60 req/min per token via in-memory `Map` (pattern già in `guest-chat/index.ts:27-38`). Risposta 429 con messaggio.

**Cache header**: `Cache-Control: private, max-age=300` indica ai client (e ad eventuali proxy) di non rifare la stessa richiesta entro 5 minuti. Riduce il throughput senza richiedere logica server.

**Trade-off accettato**: se un intervento viene modificato e l'utente ricontrolla il calendario, può vedere lo stato vecchio per fino a 5 min (cache locale) + 15 min (polling Google). Per il caso d'uso "preparazione mentale alla settimana" questo è accettabile. Per modifiche urgenti l'utente è già notificato via push.

---

## 4. Implementation outline (per orientamento, non scope)

Solo per dare visibilità di quanto sarà la PR di implementazione. **NON è impegno di codifica in questo commit.**

1. **Migration `056_calendar_feed_tokens.sql`**: nuova tabella + RLS + indici (~50 righe SQL)
2. **Edge Function `supabase/functions/ical/index.ts`** (~250 righe TypeScript):
   - GET handler con path parsing per token
   - Validazione token (enabled + lookup user_id + org_id)
   - Query interventions con filtri scope + range temporale
   - Generazione iCal text (helper `formatVEvent`, escape RFC 5545)
   - Update `last_accessed_at` (fire-and-forget)
   - Rate limit in-memory + Cache-Control + Content-Type `text/calendar; charset=utf-8`
3. **`supabase/config.toml`**: aggiungere `[functions.ical] verify_jwt = false`
4. **`src/lib/db/calendar-feed.js`** (~80 righe): wrapper client per CRUD token (create/list/regenerate/disable)
5. **`src/components/profile/CalendarFeedSection.jsx`** (~120 righe): UI mobile + admin per gestione self-service token
6. **Demo mode**: fallback localStorage per `calendar-feed.js` (pattern CLAUDE.md)
7. **Test manuale**: validare con Google Calendar + Apple Calendar + Outlook 365 (3 client target)

**Stima totale**: 2-3 giorni una volta approvata la proposta. Implementazione sequenziabile in 2 PR (back-end + front-end).

---

## 5. Domande dove preferisco che decida tu prima di procedere

### 5.A. Sequencing rispetto ad Agenda mobile UI

iCal feed e Agenda mobile UI (la vista lista temporale dentro la PWA, screenshot founder 20/5) rispondono allo stesso bisogno operativo ("prepararsi psicologicamente ai prossimi impegni"). Sono complementari ma il costo è analogo (1-2 gg ognuna).

Tre opzioni:
- **(i) Prima Agenda mobile, poi iCal**: feature interna prima, esterna dopo. Razionale: tutto sotto controllo della PWA, niente dipendenza da Google/Apple. Contro: tecnico deve aprire l'app.
- **(ii) Prima iCal, poi Agenda mobile**: leverage del calendario nativo del telefono, zero training. Contro: dipendiamo da terze parti per visibilità della feature core.
- **(iii) Entrambe in parallelo o iCal ora + Agenda mobile in sprint successivo**: massima copertura, costo 2x.

**La mia preferenza è (ii) iCal prima** — il valore "vedo gli interventi nel mio calendario senza aprire l'app" è disruptive per il tecnico in fabbrica. Ma la decisione è strategica, va con te.

### 5.B. Dominio UID e branding `URL`

Il `UID` proposto è `<intervention.id>@manutech.app` e l'URL deep link è `https://manutech.app/interventions/{id}`. **Esiste già il dominio `manutech.app` o l'app è solo su Vercel preview/produzione con dominio diverso?** Se sì, mi confermi il dominio canonico. Se no, propongo placeholder `https://app.manutech.it` o il dominio Vercel effettivo. Non è bloccante per la proposta ma serve prima di scrivere la function.

### 5.C. Maintenance plans nel feed — confermi l'esclusione?

In Q4 ho raccomandato di escludere `maintenance_plans` dal feed v1 (motivazione: manca `next_execution_at`, includerli genera "eventi fantasma"). Volevo essere esplicito che questa è una **scelta restrittiva**: alcuni utenti potrebbero aspettarsi di vedere "manutenzione filtro X ogni 30gg" nel calendario. **Confermi l'esclusione o vuoi che pensi a un'alternativa con RRULE?** (Nota: la RRULE iCal funzionerebbe, ma costa ~1gg extra e introduce complessità di gestione exceptions.)

---

## 6. Anti-pattern vincolanti per l'implementazione

Se la proposta viene approvata, in fase di implementazione:

- **NO** token in URL leggibile tipo `/ical/{user_uuid}.ics` — espone PII (lo user_id), facilita enumerazione, viola principio "URL incollabile senza esporre identità"
- **NO** scadenza di default sul token (`expires_at` resta NULL salvo richiesta esplicita). UX "incolla e dimentica" lo richiede.
- **NO** include `maintenance_plans` finché manca `next_due_at` colonna
- **NO** VTIMEZONE block — UTC con `Z` suffix è sufficiente per target operativo Italia
- **NO** breaking change sull'API client esistente di `interventions` — la function è additive
- **NO** logica di approvazione/notifica fornitore nel feed v1 — ADR-008 governerà quel flusso quando accepted
- **SÌ** demo mode su `lib/db/calendar-feed.js` (pattern CLAUDE.md "ogni nuova funzione DB deve avere fallback localStorage")
- **SÌ** RLS replicate da `guest_tokens` con sostituzione `created_by` → `user_id`
- **SÌ** rate limit in-memory (pattern `guest-chat`)
- **SÌ** test manuale su 3 client (Google + Apple + Outlook) prima di marcare PR done

---

## 7. Sequenza approvazione

1. Tu leggi questa proposta
2. Rispondi alle 3 domande di §5
3. Approvi o richiedi revisione
4. Apro PR di implementazione (migration + edge function + UI) sulla branch corrente o nuova
5. Test manuale produzione + chiusura sprint

Nessun codice applicativo viene scritto prima del go.
