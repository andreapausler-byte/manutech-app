# ADR-001-bis — interventions: nuova tabella, non estensione di spare_part_orders

**Status**: accepted · **Date**: 2026-05-13 · **Sprint**: 1a · **Supersedes**: ADR-001 (handoff doc §3)

## Context

Il briefing dello Sprint 1 (handoff v1.1) proponeva di creare una nuova tabella `public.interventions` come ponte tra `reports`/`maintenance_plans` (origini) e `maintenance_logs` (consuntivo). ADR-001 originale motivava la scelta con:

> spare_part_orders contiene 5 record reali in produzione, tutti con `kind = 'ricambio'`. Forzarla a contenere anche interventi creerebbe confusione semantica.

Durante l'esplorazione del codice (Phase 1 del workflow di plan mode) è emerso un fatto non considerato nel briefing originale:

**La migration 051 (`051_external_requests.sql`) aveva già esteso `spare_part_orders` per ospitare interventi**:

- Aggiunto `kind TEXT CHECK IN ('ricambio','intervento')`
- Aggiunto `scheduled_at`, `duration_h`, `location`, `specialty`
- Aggiunto polimorfismo timeline su `comments.spare_order_id` e `activities.spare_order_id`
- Esiste un componente `src/components/spare/InterventionRequestModal.jsx` (~360 righe) che scrive interventi su questa tabella

In sostanza la feature era stata predisposta nel DB e implementata nel frontend, ma probabilmente non era mai entrata in flow operativo. Una query in produzione ha confermato: `SELECT kind, COUNT(*) FROM spare_part_orders GROUP BY kind` ritorna solo `ricambio: 5`. Zero record `kind='intervento'`.

## Decision

Procediamo come previsto dall'ADR-001 originale — **nuova tabella `public.interventions`** — ma rivediamo le azioni collaterali:

1. **Nessuna migrazione dati**: non c'è nulla da copiare da `spare_part_orders` (0 record `kind='intervento'`).

2. **Ricabliamo `InterventionRequestModal.jsx`** per scrivere su `interventions` invece di `spare_part_orders`. Mapping campi:
   - `spare_part_name` (titolo) → `title`
   - `notes` → `description`
   - `urgency` → `severity` (mapping `URGENCY_TO_SEVERITY` in `src/lib/interventions.js`)
   - `specialty` → `extra_data.specialty`
   - `scheduled_at` → `scheduled_start_at`
   - `duration_h` → `estimated_duration_min` (× 60)
   - `supplier_id` → `assigned_to` (resta `null` finché il modal non aggiunge un picker)
   - `report_id` → `report_id` + `origin='report'`
   - `images` → `media`
   - `requested_by` → `created_by`

3. **Rimuoviamo l'effetto collaterale** sul `report.status`: la pianificazione di un intervento NON cambia più lo status del report (in passato passava a `in_attesa_ricambi`). Il `planning_state` aggregato dalla nuova view `reports_with_planning` comunica visivamente che è pianificato.

4. **Restringiamo i 4 read-site** legacy che leggevano interventi da `spare_part_orders` a "solo ricambi":
   - `TicketSparePanel.jsx`
   - `RequestDetailPanel.jsx`
   - `AdminSpareParts.jsx`
   - `db/spareParts.js` (rami nelle stringhe attività)

5. **Schema di `spare_part_orders` invariato**: i campi `kind`, `scheduled_at`, `duration_h`, `location`, `specialty` restano come legacy. Un cleanup formale può avvenire in uno sprint dedicato di refactor schema; non lo facciamo qui per non rischiare regressioni in flow di ricambio non visibili.

## Consequences

**Pro**:
- Naming semantico chiaro (`interventions` contiene interventi, `spare_part_orders` contiene ricambi).
- Zero migrazione dati, zero downtime, zero rischio in produzione (0 record da spostare).
- View `reports_with_planning` può aggregare su `interventions` direttamente — più semplice di JOIN/filter su `spare_part_orders.kind`.
- Calendario admin query su `interventions` resta efficiente anche scalando: `idx_interventions_org_scheduled` mirato.

**Contro**:
- Lo schema `spare_part_orders` resta con 5 colonne ora inutili (`kind`, `scheduled_at`, `duration_h`, `location`, `specialty`). Andrea le deprecherà formalmente in uno sprint di pulizia futura.
- Doppio modello mentale per chi legge il codice storico (cosa fa migration 051? perché esistono questi campi?). Mitigato da questo ADR.
- `RequestKindChooser.jsx` continua a offrire l'opzione "Intervento esterno" → il chooser non ha bisogno di sapere il backend (`onPick('intervento')` continua a routare a `InterventionRequestModal`, che ora scrive su `interventions`).

## Verifica

```sql
-- Pre-deploy (su staging, su una replica della produzione):
SELECT kind, COUNT(*) FROM spare_part_orders GROUP BY kind;
-- Deve ritornare solo (ricambio, N). Se compaiono righe 'intervento', PAUSARE
-- e ridiscutere la strategia (potrebbero essere stati creati durante un test).

-- Post-deploy:
SELECT COUNT(*) FROM interventions;
-- Deve essere 0 finché non si pianifica il primo intervento via UI.
```

Pianificare un intervento via `ReportDetailModal` → "Pianifica intervento" deve creare una riga in `interventions`, NON in `spare_part_orders`.

## Riferimenti

- `supabase/migrations/053_create_interventions.sql` (forward)
- `supabase/migrations/053_create_interventions_down.sql` (down)
- `supabase/migrations/051_external_requests.sql` (la feature legacy che superseaiamo)
- `src/components/spare/InterventionRequestModal.jsx` (refactor write site)
- `docs/handoff/2026-05-13-sprint1-handoff-corrections.md` (Correction #6 documenta il discovery)
