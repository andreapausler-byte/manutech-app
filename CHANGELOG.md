# Changelog — ManuTech

Tutti i cambiamenti notabili a questo progetto sono documentati qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

---

## [Unreleased — Sprint 1c]

In sviluppo sul branch `claude/intervention-reports-many-to-many-Vh3Mt`.

### Added
- Relazione N→M tra `interventions` e `reports` tramite nuova tabella `intervention_reports` (migration 055)
- Campo `is_origin BOOLEAN` (max 1 per intervento, unique partial index) per identificare il report di creazione
- Campo `resolves_report BOOLEAN DEFAULT true` per distinguere link "risolutivi" da link "di contesto"
- Trigger PG `on_intervention_completed` per auto-close dei report risolutivi quando l'intervento passa a `status='completato'`
- Activity log type `auto_closed_by_intervention` (`user_id=NULL`, `user_name='Sistema'`) per tracciare la chiusura automatica
- View `reports_with_planning` estesa con colonna informativa `linked_interventions_count` (include link di contesto)

### Changed
- View `reports_with_planning` aggrega `planning_state` solo sui link con `resolves_report=true` (i link "di contesto" non contano per il calcolo dello stato)
- `interventions.report_id` rimosso (single source of truth: `intervention_reports`)

### Migration steps
- Backup di sicurezza: `CREATE TABLE backup_055_interventions AS SELECT * FROM interventions`
- Apply: `055_intervention_reports.sql`
- Verifica: `SELECT COUNT(*) FROM intervention_reports WHERE is_origin=true` deve essere uguale al COUNT pre-migration di `interventions WHERE report_id IS NOT NULL`

### Known limitations
- **`org_id` rimane `TEXT` con `DEFAULT 'default'` ovunque** (anti-pattern noto: causa "record invisibili da RLS mismatch"). Hardening tracked in **ADR-007**, da risolvere in Sprint 1d (subito dopo 1c, **pre-FASE 5 multi-tenant**).
- Down migration di 055 è destructive sui link `is_origin=false` (vengono persi col `DROP TABLE intervention_reports`).

---

<!--
Versioni precedenti (Sprint 1a, 1a-bis) non sono ancora state portate in
questo CHANGELOG. Da fare in fase di chiusura Sprint 1c oppure spostare a
Sprint 1d con bump di versione.
-->
