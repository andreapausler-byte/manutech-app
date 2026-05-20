# ADR-008 — Interventi v2 · data model (execution_mode + intervention_participants)

**Status**: Proposed · **Date**: 2026-05-15 · **Last update**: 2026-05-20 · **Sprint target**: TBD (post-ADR-007 mig 056) · **Schema delta**: δ (su γ di ADR-006)

> **Decision history**:
> - 15/5 sera — confronto manutentore #1: chiuse Open Q #1 (workflow approvazione = informativa, non gating) e Open Q #3 (account fornitori = contatto esterno, no estensione `users.role`).
> - 20/5 — status review: ADR-007 mig 056 NON ancora in produzione (verificato `ls supabase/migrations/`). Prereq #2 di pivot a `accepted` non soddisfatto. Open Q #2/#4/#5 residue con raccomandazione tecnica preliminare aggiunta in questo update — da chiudere col manutentore #2.

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
    CHECK (role IN ('lead','supporto','operatore_linea','approvatore','osservatore')),
  -- NB: `'fornitore'` rimosso a seguito Q3 chiusa il 15/5 sera (contatto
  -- esterno, no users.role extension). I fornitori esterni sono modellati
  -- come FK opzionale `interventions.external_supplier_id` (vedi 4.5),
  -- non come participants. La pipeline notifiche/chat resta invariata.
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

> **Aggiornamento Q3 (15/5 sera, decisione chiusa)**: i fornitori esterni NON entrano in `intervention_participants`. Restano contatti esterni, gestiti via riferimento a `supplier_profiles` (mig 030) come FK opzionale `interventions.external_supplier_id` — vedi sezione 4.5. `users.role` CHECK resta invariato (`operatore`, `tecnico`, `admin`, `super_admin`). La pipeline notifiche/chat verso il fornitore esterno passa per il tecnico interno (lead), non per la piattaforma. Nessuna FK polimorfica, nessun signup fornitore self-service.

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

### 4.5 `interventions.external_supplier_id` (nuovo, da Q3)

A seguito chiusura Q3 (contatto esterno, no `users.role` extension), il fornitore esterno è modellato come FK opzionale a `supplier_profiles` direttamente su `interventions`:

```sql
ALTER TABLE public.interventions
  ADD COLUMN external_supplier_id UUID NULL
    REFERENCES public.supplier_profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_interventions_external_supplier
  ON public.interventions(external_supplier_id)
  WHERE external_supplier_id IS NOT NULL;
```

**Semantica**: popolato (nullable) quando il fornitore è identificato. Coerenza con `execution_mode='fornitore_esterno'` resta UI-driven, non DB-enforced (un intervento può essere `'fornitore_esterno'` con fornitore "da definire" durante la pianificazione). Nessun CHECK su `(execution_mode='fornitore_esterno') = (external_supplier_id IS NOT NULL)`: troppo rigido per flussi reali.

**Pipeline comunicazione**: invariata. Il tecnico interno (lead in `intervention_participants`) gestisce email/telefono/WhatsApp col fornitore offline. ManuTech non invia push/email al fornitore — è una decisione esplicita di Q3, non un debito tecnico.

**Backward compatibility**: zero. Colonna nuova, nullable, default NULL. Nessun client legge `external_supplier_id` oggi.

## Open questions

Le 5 questions originali sono ora in 3 stati: CLOSED (Q1, Q3), OPEN con raccomandazione tecnica preliminare (Q2, Q4, Q5).

### Q1 — Workflow approvazione · CLOSED 2026-05-15 (sera)

**Decisione**: il workflow di approvazione è **informativo, non gating**. Lo status workflow esistente `bozza→pianificato→confermato→in_corso→completato` resta invariato. Nessun nuovo stato `approvato` tra `pianificato` e `confermato`.

**Implicazioni schema**: il ruolo `'approvatore'` resta nel CHECK di `intervention_participants.role` come **canale di notifica** (riceve push/email quando creato un intervento `execution_mode='fermo_pianificato'`), non come gating del workflow. Un intervento può procedere a `confermato` anche senza approvatore presente in `intervention_participants`. Nessun trigger di blocco workflow.

**Da riconfermare nel confronto #2** (interpretazione tecnica): se per "informativa" il manutentore intende invece "il ruolo approvatore proprio non esiste, è un concetto solo del management", rimuovere `'approvatore'` dal CHECK + delle 4 modalità di notifica per `fermo_pianificato`. Mantenuto conservativo nello schema attuale perché più facile rimuovere che aggiungere.

### Q2 — Notifica operatore di linea su fermo macchina · OPEN

**Domanda**: quando viene creato un intervento `execution_mode='fermo_pianificato'` sulla macchina X, come va notificato l'operatore di linea?

**Sub-questione critica (preliminare)**: chi è "l'operatore di linea della macchina X"? Esiste oggi un mapping operatore↔macchina nello schema? Verifica rapida: nessuna colonna `operator_id` su `machines` né tabella `machine_operators`. Va introdotto un mapping nuovo, oppure si notifica a tutti gli operatori dell'org.

**Opzioni**:
- (a) Push immediato (se subscription attiva) + banner permanente sulla scheda macchina ("Manutenzione programmata: 23/05 14:00")
- (b) Solo banner sulla scheda macchina, no push intrusivo (push solo se severità del report linkato è alta)
- (c) Push + email se l'operatore è OFF turno (richiede schema turni — fuori scope L0)

**Raccomandazione tecnica preliminare**: (a). Riusa pipeline push Sprint 1b-B + banner come query `interventions WHERE machine_id=X AND status IN ('pianificato','confermato') AND scheduled_start_at > now()` su scheda macchina mobile. Email off-turno è iperingegnerizzata per il valore attuale, defer.

**Sub-questione bonus per manutentore #2**: la macchina X ha un solo operatore "principale" o N operatori che ruotano? Se N, si notificano tutti o solo il "responsabile di linea"?

### Q3 — Account fornitori · CLOSED 2026-05-15 (sera)

**Decisione**: i fornitori sono **contatti esterni**, non utenti ManuTech. Nessuna estensione di `users.role` CHECK con `'fornitore'`. `users.role` resta `('operatore','tecnico','admin','super_admin')` invariato.

**Implicazioni schema**:
- `intervention_participants.role` CHECK: 5 valori (`lead, supporto, operatore_linea, approvatore, osservatore`). `'fornitore'` rimosso (vedi 4.2).
- `interventions.external_supplier_id UUID NULL REFERENCES supplier_profiles(id)`: nuova FK opzionale per identificare il fornitore esterno (vedi 4.5).
- Comunicazione col fornitore esterno via canale offline (email/telefono/WhatsApp) gestita dal tecnico interno lead. ManuTech NON invia push/email al fornitore.

**Debt collaterale identificato (fuori scope ADR-008)**: il codice client ha ancora riferimenti residui a `role === 'fornitore'` (es. `InterventionForm.jsx:120`, `UserPicker.jsx:62`, `PendingSuppliersPanel.jsx:23`) — bug latente già pre-esistente (mig 044 lo documenta: "in pratica i fornitori sono registrati con role='tecnico'"). Cleanup separato da pianificare quando si scrive il client di Interventi v2.

### Q4 — Reschedulazione · OPEN

**Domanda**: quando `scheduled_start_at` cambia, chi viene ri-notificato?

**Opzioni**:
- (a) Tutti i participants di `intervention_participants` (uniforme, no policy per execution_mode)
- (b) Solo il lead (minimale, il lead poi propaga manualmente)
- (c) Configurable per `execution_mode`: `fermo_pianificato` notifica tutti + operatore di linea, `ordinaria` solo lead + supporto, `fornitore_esterno` solo lead (che ripassa al fornitore offline)

**Raccomandazione tecnica preliminare**: (c). Pattern già coerente col dominio (`execution_mode` come driver di policy). `notified_at` su `intervention_participants` si re-resetta a NULL al rescheduling per audit trail. Implementazione: trigger BEFORE UPDATE su `interventions` che, se `OLD.scheduled_start_at IS DISTINCT FROM NEW.scheduled_start_at`, inserisce job in queue notifiche con policy `execution_mode`-aware.

**Sub-questione per manutentore #2**: la notifica di reschedule sostituisce semanticamente quella iniziale (1 push sola, "ora alle X invece di Y"), o si aggiunge (2 push storici)? Da UX founder-side: probabilmente sostituisce — replace dell'ultima notifica `intervention_scheduled` con `intervention_rescheduled`.

### Q5 — Storico visibilità · OPEN

**Domanda**: un operatore di linea linkato a un intervento poi rimosso lo vede ancora nello storico?

**Opzioni**:
- (a) "Snapshot semantico": chi era participant al momento della `status='completato'` vede l'intervento per sempre (anche se rimosso prima della completion: vede solo se era ancora linkato al completamento)
- (b) "Filtro per ruolo": lead vede sempre, osservatore solo se attualmente linkato (visibilità diversa per role)
- (c) "Filtro temporale": tutti vedono ultimi 90 giorni, oltre solo se attualmente linkato

**Raccomandazione tecnica preliminare**: (a). Snapshot semantico è naturale e accountable: chi c'era al completamento è co-responsabile e mantiene visibilità storica. Pattern `*_snapshot` su `intervention_participants.user_name_snapshot/user_role_snapshot` (già in 4.2) preserva il dato anche se l'utente viene cancellato (`ON DELETE RESTRICT` impedisce hard delete, ma il pattern serve per snapshot del ruolo al momento). Persistenza garantita anche se la persona cambia ruolo.

**Sub-questione per manutentore #2**: deletion di un participant pre-completion (operatore_linea sbagliato → rimosso prima dell'intervento) cancella la sua visibilità retroattiva, oppure resta come "linkato il X, rimosso il Y" in audit trail? Default proposto: soft-removal con `removed_at TIMESTAMPTZ` invece di `DELETE` — l'audit trail resta, la visibilità no.

### Priorità chiusura Q2/Q4/Q5

Tutte e 3 sono raffinamenti applicativi, non schema-blocking. La migration di implementazione può procedere con default tecnici (raccomandazioni (a)/(c)/(a) sopra) e i comportamenti possono essere raffinati iterativamente in fase di implementazione UI. Conviene comunque chiuderle nel confronto manutentore #2 prima di pivotare ADR-008 a `accepted`: il costo del confronto è basso (30 min stimati), la chiarezza che si ottiene è alta.

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

Status pivota a **`accepted`** quando tutti e 3:
1. ~~Q1 e Q3 chiuse~~ ✓ (15/5 sera). Q2/Q4/Q5 chiuse (preferenza: confronto manutentore #2; ammesso default tecnico se conferma orale veloce su raccomandazioni in 4.5 + sezione Open questions).
2. ADR-007 mergiato — mig 056 in produzione (`org_id UUID`). **Verificato 20/5 via `ls supabase/migrations/`: NON ANCORA in produzione**. È il blocker primario residuo.
3. Sprint dedicato Interventi v2 creato in roadmap con stima.

**Stato 20/5**: blocker (2) è il vero gate. Decision drivers consigliano di prioritizzare ADR-007 mig 056 come prossimo sprint architetturale, prima di scrivere migration 057+ di Interventi v2. La chiusura Q2/Q4/Q5 può procedere in parallelo (è docs-only, non blocca codice).

Questo ADR è **docs-only**. Nessuna migration scritta, nessun codice applicativo toccato.
