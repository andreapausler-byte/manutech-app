# ADR-006 — `intervention_reports`: relazione N→M intervento ↔ segnalazioni

**Status**: accepted · **Date**: 2026-05-14 · **Sprint**: 1c · **Schema**: γ

## Context

Sprint 1a (mig 053) introduceva una relazione 1:1 tra `interventions` e `reports` tramite la colonna `interventions.report_id`. Ogni intervento poteva nascere da al massimo 1 segnalazione.

Use case primario emerso post-1a: **PTS — Permesso Tecnico Settimanale**. L'elettricista PTS arriva in azienda per un intervento programmato; vuole "approfittare" della visita per chiudere TUTTE le segnalazioni elettriche aperte (es. 3-5 ticket dispersi). Con la 1:1 questo richiederebbe N interventi separati con lo stesso assignee/orario/macchina — duplicazione + perdita di leggibilità.

## Decision

Implementiamo **schema γ**: relazione N→M via tabella di join `intervention_reports`, single source of truth.

### Schema

```sql
CREATE TABLE public.intervention_reports (
  intervention_id   UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  report_id         UUID NOT NULL REFERENCES public.reports(id)       ON DELETE CASCADE,
  is_origin         BOOLEAN NOT NULL DEFAULT false,
  resolves_report   BOOLEAN NOT NULL DEFAULT true,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  added_by_name     TEXT,
  org_id            TEXT NOT NULL,
  PRIMARY KEY (intervention_id, report_id)
);
```

Più:
- Indice `idx_intervention_reports_report` (lookup per report)
- Indice parziale `idx_intervention_reports_resolves WHERE resolves_report=true`
- Indice unique parziale `uniq_intervention_origin WHERE is_origin=true` (max 1 per intervento)

### Semantica dei flag

- **`is_origin`**: il report da cui è nato l'intervento. Max 1 per intervento. Pre-popolato in fase di creazione "Pianifica intervento" da `ReportDetail`.
- **`resolves_report`**: se `true`, alla completazione dell'intervento il report viene chiuso automaticamente (trigger `on_intervention_completed`). Se `false`, il link è "di contesto": il fornitore lo vede menzionato ma non lo risolve.

### Auto-close via trigger PG

`on_intervention_completed` (SECURITY DEFINER) si attiva su `UPDATE OF status` quando `NEW.status='completato'`. Per ogni link `resolves_report=true`, update `reports.status='risolta'` + activity log `auto_closed_by_intervention` (user_id=NULL, user_name='Sistema').

Scelto trigger PG su Edge Function per:
- Atomicità nella stessa transaction (no drift)
- Affidabilità (no network failure)
- Performance (microsecondi vs decine di ms)

### View `reports_with_planning` aggiornata

JOIN su `intervention_reports` filtra `resolves_report=true` per il calcolo di `planning_state`. Aggiunta colonna informativa `linked_interventions_count` (subquery COUNT su tutti i link, anche di contesto) per UI "Segnalazioni associate (N)".

Motivazione del filtro `resolves_report=true`: un report associato "per contesto" deve restare `da_pianificare` perché serve ancora un intervento dedicato per risolverlo.

## Alternative scartate

- **α (drop `report_id`, sostituisci tutto con `intervention_reports`)**: equivalente a γ ma SENZA flag `resolves_report` né auto-close. Scartato perché use case PTS richiede distinzione tra link risolutivi e link di contesto.
- **β (dual-write: tieni `report_id` + aggiungi tabella di join)**: backward-compat totale, ma due fonti di verità → ambiguità persistente, codice duplicato per leggere/scrivere. Scartato per "single source of truth" principle.

## Conseguenze

### Pro
- Use case PTS supportato nativamente: 1 intervento → N segnalazioni chiuse insieme
- View aggregata corretta: report di contesto restano `da_pianificare`
- Audit trail completo: chi ha aggiunto/rimosso ogni link, quando, attivo/risolutivo
- Trigger atomico: niente window di inconsistenza

### Contro
- Down migration destructive: i link non-origin si perdono (ricreata solo `interventions.report_id` da `is_origin=true`). Documentato in `055_intervention_reports_down.sql` header con esempio scenario.
- Cross-table refactor di 6 punti del codice (DB layer, form, 2 shell, DetailPanel, hook). Sprint 1c interamente dedicato.
- Activity log `auto_closed_by_intervention` con `user_id=NULL` non risale immediatamente al vero umano. L'audit trail richiede di leggere l'activity precedente `intervention_status_changed` (che ha l'utente che ha completato l'intervento).

### Mitigazioni
- Schema γ è documentato in CHANGELOG + ADR + corrections doc.
- ADR-007 traccia il TECH DEBT su `org_id TEXT DEFAULT 'default'` per Sprint 1d.

## Verifica

Pre-apply:
```sql
SELECT COUNT(*) FROM interventions WHERE report_id IS NOT NULL;
-- atteso: N (es. 3 se ci sono 3 link 1:1 esistenti)
```

Post-apply (incluso nel DO block §5 della mig 055):
```sql
SELECT COUNT(*) FROM intervention_reports WHERE is_origin=true;
-- atteso: N (uguale al pre)
-- Mismatch → RAISE EXCEPTION abortisce la migration prima del DROP COLUMN
```

Smoke test funzionale:
1. Crea intervento manuale linkato a 3 report (R1, R2, R3) — R3 con `resolves_report=false`
2. Marca intervento `completato`
3. Verifica: R1 e R2 → `risolta`, R3 → invariato
4. Activity log: 2 righe `auto_closed_by_intervention` (user_id=NULL, user_name='Sistema') su R1 e R2

## Riferimenti

- `supabase/migrations/055_intervention_reports.sql` (forward)
- `supabase/migrations/055_intervention_reports_down.sql`
- `src/lib/db/interventions.js` (`createInterventionWithReports`, `linkReportToIntervention`, ecc.)
- `src/components/interventions/ReportMultiPicker.jsx` (UI selezione)
- `src/components/interventions/LinkedReportsSection.jsx` (UI lista + edit)
- `docs/decisions/ADR-001-bis-interventions-vs-spare-orders.md` (sezione mapping aggiornata)
- `docs/decisions/ADR-007-org-id-schema-hardening.md` (TECH DEBT collegato)
- CHANGELOG.md sezione Unreleased Sprint 1c
