# ADR-008 — Interventi v2 · data model (execution_mode + intervention_participants)

**Status**: Proposed · **Date**: 2026-05-15 · **Sprint target**: TBD (post-1c-bis, post-1d/ADR-007) · **Schema delta**: δ (su γ di ADR-006)

## Context

Confronto col manutentore reale del **14/5/2026 (sera)** ha fatto emergere 4 insight strutturali sul modello Interventi attualmente in produzione (`supabase/migrations/053_create_interventions.sql`, `054_add_supervised_by.sql`, `055_intervention_reports.sql`):

1. **Origine varia (0/1/N report)** — un intervento può nascere senza alcuna segnalazione (manutenzione programmata, opportunistica), oppure raggruppare N segnalazioni della stessa macchina (caso d'uso PTS).
2. **Modalità operative ortogonali al tipo tecnico** — "intervento di fornitore esterno", "fermo pianificato in shutdown", "opportunistica durante altra visita" non sono `type` (correttiva/preventiva/migliorativa/ispezione), sono modi di esecuzione.
3. **Partecipanti multipli** — un intervento non è 1 tecnico + 1 supervisore. Spesso: 1 lead, 1-2 di supporto, 1 fornitore esterno, 1 operatore di linea, 1 approvatore. Ognuno con stato proprio (invitato/confermato/rifiutato).
4. **Visibilità = accountability** — chi vede l'intervento nell'agenda ne è anche responsabile. La vista mobile del tecnico (FASE 3) non è solo UI: è un'estensione del modello dati.

Conseguenza strategica: l'**Agenda tecnico mobile** (in roadmap FASE 3) non può essere costruita sopra il modello attuale senza creare debito immediato. Serve **Interventi v2 PRIMA dell'Agenda**.

### Sorpresa significativa emersa dalla discovery schema-side

Lo schema attuale **già copre parzialmente 3 dei 4 insight**. Il brief originale proponeva colonne `intervention_type` e `intervention_origin` che collidono nominalmente con campi esistenti (`interventions.type` e `interventions.origin` introdotti in mig 053). Reframing applicato:

| Insight | Stato schema attuale | Delta proposto |
|---|---|---|
| #1 Origine 0/1/N | **Già coperto** da ADR-006 + mig 055 (`intervention_reports` N→M) | Nessuno schema-side. Residual gap UX su `origin='manuale'` (follow-up fuori scope) |
| #2 Modalità operative | Non coperto. `type` è ortogonale (correttiva/preventiva/…) | Nuova colonna `execution_mode` |
| #3 Partecipanti multipli | **Embrione coperto** da `supervised_by` (mig 054) | Nuova tabella `intervention_participants` con backfill da `assigned_to`+`supervised_by` |
| #4 Visibilità=accountability | Non schema-side: è UI/UX | Rinviato a futuro **ADR-009** (Agenda mobile), che userà lo schema di questo ADR |

## Decision drivers

- **Riusare ciò che esiste**: `intervention_reports` (mig 055) copre già Insight #1; `supervised_by` (mig 054) è l'embrione naturale di `intervention_participants`.
- **Non breakare il client esistente**: `assigned_to` e `supervised_by` su `interventions` restano denormalizzati (trigger di sync) — il codice client che li legge oggi continua a funzionare.
- **Non riservare lo schema a casi futuri**: niente Postgres enum (TEXT + CHECK rimane il pattern ManuTech), niente colonne per feature non ancora decise.
- **Open questions blocking restano blocking**: lo schema δ è proposto, non ratificato. La migration vera viene scritta solo dopo che le 5 open questions sono chiuse.

## Decision — Schema delta δ

### 4.1 `interventions.execution_mode` (nuova colonna)

```sql
ALTER TABLE public.interventions
  ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'ordinaria'
    CHECK (execution_mode IN
      ('ordinaria','fornitore_esterno','fermo_pianificato','opportunistica'));
CREATE INDEX idx_interventions_execution_mode
  ON public.interventions(execution_mode);
```

**Semantica**: ortogonale a `type`. Influenza notifiche (es. `fornitore_esterno` → email al fornitore + notifica a supervisore interno), approvazioni (es. `fermo_pianificato` può richiedere approvatore), visibilità per ruolo (es. `opportunistica` visibile solo al lead).

**Naming definitivo**: `execution_mode`, non `operating_mode` né `intervention_type` (collisione con `type` esistente). Confermato in clarifying questions.

### 4.2 Tabella `intervention_participants` (evoluzione di `supervised_by`)

```sql
CREATE TABLE public.intervention_participants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id    UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role               TEXT NOT NULL
    CHECK (role IN ('lead','supporto','operatore_linea','approvatore','osservatore','fornitore')),
  status             TEXT NOT NULL DEFAULT 'invitato'
    CHECK (status IN ('invitato','confermato','rifiutato','completato')),
  notified_at        TIMESTAMPTZ,
  responded_at       TIMESTAMPTZ,
  user_name_snapshot TEXT,
  user_role_snapshot TEXT,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  org_id             TEXT NOT NULL,
  UNIQUE (intervention_id, user_id, role)
);
```

> **Nota su `user_id` e fornitori**: lo schema SQL qui mostrato assume che i fornitori abbiano un record in `users` (richiede estensione futura di `users.role` CHECK con `'fornitore'`). Decisione rinviata a Open Question #3. Alternativa schema-side: FK polimorfica (`user_id UUID NULL`, `supplier_id UUID NULL`) + CHECK constraint che esattamente uno sia popolato. La scelta finale verrà presa in chiusura di Open Q #3, prima della migration di implementazione. Lo schema mostrato qui è quindi **indicativo della direzione preferita, non vincolante**.

Più indici:
- `idx_intervention_participants_intervention ON (intervention_id)`
- `idx_intervention_participants_user ON (user_id)`
- `idx_intervention_participants_lead ON (intervention_id) WHERE role='lead'` (partial, per lookup veloce del lead)

RLS analoghe a `interventions` (4 policy: select/insert/update/delete) con SELECT esteso al self-user (un partecipante può sempre vedere gli interventi a cui è invitato, indipendentemente dall'`assigned_to`).

### 4.3 Backward compatibility `assigned_to` / `supervised_by`

Per non rompere il client che oggi legge `interventions.assigned_to` e `interventions.supervised_by`, sincronizziamo i due lati tramite trigger:

- **Trigger AFTER INSERT/UPDATE/DELETE su `intervention_participants`** → aggiorna `interventions.assigned_to` (da `role='lead'`) e `interventions.supervised_by` (da `role='supporto'` con priorità o, se zero supporto, da `role='approvatore'`).
- **Trigger BEFORE INSERT/UPDATE su `interventions`** → se `assigned_to` è settato direttamente e non esiste un participant con `role='lead'`, crea participant `(lead, status='confermato')`. Stesso per `supervised_by → role='supporto'`.
- **Backfill iniziale** (parte della migration): per ogni intervento esistente, insert:
  - `(intervention_id, assigned_to, 'lead', 'confermato')` se `assigned_to IS NOT NULL`
  - `(intervention_id, supervised_by, 'supporto', 'confermato')` se `supervised_by IS NOT NULL`

### 4.4 `origin` invariato

Decisione esplicita: **NON modificare la CHECK su `interventions.origin`** (valori attuali: `'report','maintenance_plan','manuale'`). La semantica delle 4 modalità del brief originale (`da_segnalazione`/`piano_manutenzione`/`opportunistica`/`fornitore_pianificato`) si ottiene **componendo `origin` × `execution_mode`**:

| Combinazione | Significato |
|---|---|
| `origin='report'` + `execution_mode='ordinaria'` | Tecnico interno risolve segnalazione (caso base) |
| `origin='report'` + `execution_mode='fornitore_esterno'` | Segnalazione passata al fornitore |
| `origin='maintenance_plan'` + `execution_mode='fermo_pianificato'` | Manutenzione programmata in shutdown |
| `origin='manuale'` + `execution_mode='opportunistica'` | Intervento opportunistico durante altra visita |

## Open questions (blocking implementazione)

Da chiudere col manutentore reale prima di scrivere la migration.

1. **Workflow approvazione** — `execution_mode='fermo_pianificato'` (e forse `'fornitore_esterno'` sopra una certa soglia di costo?) richiede approvatore? Blocking o informativo? Lo status workflow `bozza→pianificato→confermato→…` basta o serve un nuovo `approvato` tra `pianificato` e `confermato`?
2. **Notifica operatore di linea su fermo macchina** — quando un intervento `execution_mode='fermo_pianificato'` viene creato sulla macchina X, l'operatore di linea che la usa va notificato come? Solo push? Stato visivo sulla scheda macchina? Email se è OFF turno?
3. **Account fornitori in ManuTech**
   - **3a. Workflow**: come un fornitore esterno conferma la sua partecipazione a un intervento? Email con link signup → account `users` con `role='fornitore'`? Oppure solo notifica al tecnico interno che gestisce la comunicazione offline?
   - **3b. (schema-blocking)** In funzione della 3a: estendere `users.role` CHECK con `'fornitore'` (path semplice, riusa pipeline notifiche/chat esistenti), OPPURE mantenere `supplier_profiles` separato e introdurre FK polimorfica (`user_id` NULL, `supplier_id` NULL) su `intervention_participants` (più rigoroso, separa entità ma duplica logica).
   - **Raccomandazione tecnica preliminare**: 3b → estendere `users.role`. Riduce complessità, allinea ai pattern esistenti, permette ai fornitori di ricevere notifiche/chat via la stessa pipeline. Sconsiglio polimorfismo a meno di vincoli legali/contrattuali specifici sui fornitori (es. NDA che impedisca trattarli come "utenti del sistema").
   - **Decisione finale**: bloccata in attesa di chiarimento manutentore.
4. **Reschedulazione** — quando `scheduled_start_at` cambia, tutti i partecipanti ri-notificati automaticamente? Solo il lead? Configurable per `execution_mode` (es. `fermo_pianificato` notifica TUTTI, `ordinaria` solo lead+operatore_linea)?
5. **Storico visibilità** — un operatore di linea che era stato linkato a un intervento poi rimosso, vede ancora l'intervento nello storico? Filtro temporale (es. solo ultimi 90 giorni) o filtro per ruolo (es. lead vede sempre, osservatore solo se attualmente linkato)?

**Raccomandazione priorità**: #3 (account fornitori) e #1 (workflow approvazione) sono **blocking-design** per la migration. #2, #4, #5 sono raffinamenti del flusso applicativo, possono restare aperte oltre la migration e chiuse iterativamente in fase di implementazione UI.

## Anti-patterns vincolanti

- **NO Postgres enum** — TEXT + CHECK (coerente con resto schema ManuTech)
- **NO breaking change** su `assigned_to` / `supervised_by` — denormalizzati via trigger di sync
- **NO implementazione prima di chiusura open questions** — questo ADR resta `Proposed` finché #3 e #1 non sono risolti
- `org_id` resta `TEXT` fino a mig 056 / ADR-007 (coerenza con sprint precedente — niente conversione cross-table opportunistica in questo ADR)

## Pre-implementation audit (15/5/2026, schema-side)

### Estratto dal codebase

Dai file `supabase/schema.sql` + `migrations/053-055`:

| Oggetto | Stato attuale | Note |
|---|---|---|
| `interventions.type` | ✓ esiste (mig 053) | CHECK su 4 valori "tecnici", non collide con `execution_mode` |
| `interventions.origin` | ✓ esiste (mig 053) | CHECK su 3 valori "provenienza", **invariato** |
| `interventions.supervised_by` | ✓ esiste (mig 054) | Resta denormalizzato via trigger di sync |
| `intervention_reports` | ✓ esiste (mig 055, ADR-006) | Copre già Insight #1 N→M |
| `execution_mode` / `modalita` / `kind` | ✗ liberi | OK per nuova colonna |
| `users.role` CHECK | `('operatore','tecnico','admin')` | **NO `'fornitore'`** — cfr. Open Q #3 |

Trigger esistenti su `interventions`: `trg_interventions_updated` (053), `trg_intervention_completed_close_reports` (055). I nuovi trigger di sync `interventions ↔ intervention_participants` operano su tabella nuova (intervention_participants) o su colonne diverse (`assigned_to`/`supervised_by`), quindi non collidono.

RLS esistenti su `interventions`: 4 policy (select/insert/update/delete). Da replicare 1:1 su `intervention_participants` con piccola estensione SELECT (un user che è partecipante può vedere l'intervento anche se non è `assigned_to`).

FK `maintenance_plans` ↔ `interventions`: unidirezionale (`interventions.maintenance_plan_id` → `maintenance_plans.id`). Nessun impatto da delta.

### SQL pronto da eseguire manualmente nel SQL Editor Supabase

L'audit live non è eseguibile dal container (no Supabase service-role key, solo ANON). Le 7 query seguenti sono read-only e vanno incollate manualmente nel SQL Editor di Supabase Studio contro l'org `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`. Risultati da incollare nella prossima sessione per integrazione audit.

```sql
-- 1) Quanti interventi non hanno assigned_to (proxy "manuale / orfani")?
SELECT COUNT(*) FROM interventions WHERE assigned_to IS NULL;

-- 2) Quanti interventi non hanno alcun link in intervention_reports
--    (proxy "opportunistica" / origin='manuale' / report drop in 055)?
SELECT COUNT(*) FROM interventions i
  WHERE NOT EXISTS (
    SELECT 1 FROM intervention_reports ir WHERE ir.intervention_id = i.id
  );

-- 3) Distribuzione N reports linkati per intervento (Blocker #4 / sanity 15/5)
SELECT bucket, COUNT(*) FROM (
  SELECT
    CASE
      WHEN cnt = 0 THEN '0'
      WHEN cnt = 1 THEN '1'
      ELSE '>1'
    END AS bucket
  FROM (
    SELECT i.id, COALESCE(COUNT(ir.report_id), 0) AS cnt
    FROM interventions i
    LEFT JOIN intervention_reports ir ON ir.intervention_id = i.id
    GROUP BY i.id
  ) per_intervention
) bucketed
GROUP BY bucket
ORDER BY bucket;

-- 4) Colonne "sospette" già esistenti sul DB (verifica nessuna collisione)
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name IN ('intervention_type','modalita','origin','kind','execution_mode','category');

-- 5) Trigger attivi su interventions
SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table = 'interventions';

-- 6) RLS policy su interventions
SELECT polname, polcmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'interventions';

-- 7) FK maintenance_plans ↔ interventions (sanity)
SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
 WHERE tc.constraint_type = 'FOREIGN KEY'
   AND tc.table_name = 'interventions';
```

Tutte read-only, nessun DML, nessun DDL.

## Riferimenti

- `docs/decisions/ADR-001-bis-interventions-vs-spare-orders.md` — separazione interventi vs ricambi
- `docs/decisions/ADR-005-*` (calendar admin)
- `docs/decisions/ADR-006-intervention-reports-many-to-many.md` — Insight #1 coverage
- `docs/decisions/ADR-007-org-id-schema-hardening.md` — TECH DEBT collegato (mig 056)
- **Futuro `ADR-009`** — Agenda mobile (UI), dipende dallo schema di questo ADR-008
- `supabase/migrations/053_create_interventions.sql` — schema base `interventions`
- `supabase/migrations/054_add_supervised_by.sql` — embrione partecipanti
- `supabase/migrations/055_intervention_reports.sql` — relazione N→M
- `supabase/schema.sql` (righe 20-31) — `users.role` CHECK (per Open Q #3)
- Confronto manutentore reale, 14/5/2026 (sera) — discovery

## Notes

Status pivota a **`accepted`** quando:
1. Le 5 open questions sono chiuse (#3 e #1 blocking, le altre opzionalmente)
2. ADR-007 mergiato (mig 056 in produzione: `org_id UUID`)
3. Sprint dedicato Interventi v2 creato in roadmap con stima

Questo ADR è **docs-only**. Nessuna migration scritta, nessun codice applicativo toccato. Sprint 1c-bis (Frizione #4 calendar nav) resta priorità per lunedì 18/5 e non viene rallentato da questa discovery.
