# Changelog — ManuTech

Tutti i cambiamenti notabili a questo progetto sono documentati qui.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

---

## [Unreleased] — v5.11 — Reazioni chat e ringraziamenti

### Added
- **Reazioni sui messaggi chat** (`ChatPanel.jsx`): 👍 Utile, ✅ Confermo il problema, 🔧 Risolto per me — toggle per utente/tipo, attive su tutte le superfici (admin desktop, mobile; escluse in guest mode). L'autore del messaggio vede i nomi di chi ha reagito; sul proprio messaggio niente auto-like (chip visibili solo se qualcuno ha reagito, non cliccabili).
- **Ringraziamento 👏 a livello segnalazione**: banner "🎉 Intervento completato" nella chat quando `status ∈ {risolta, chiuso}` con CTA "Ringrazia {tecnico}" (toggle). Il tecnico assegnato vede il messaggio personale con i nomi di chi lo ringrazia (e nessun pulsante per auto-ringraziarsi).
- **Contatore "Grazie ricevuti"** nel profilo tecnico (`ProfilePage.jsx`), calcolato sulle segnalazioni assegnate (`db.getThanksReceived`).
- Migration **059** `reactions`: tabella unica per reazioni messaggio (comment_id NOT NULL) e ringraziamenti segnalazione (comment_id NULL), unique index partial per il toggle, RLS org-scoped in lettura e user-scoped in insert/delete (pattern 052). La migration droppa una versione preliminare della tabella creata fuori migration sul primo rollout.
- Nuovo modulo DB `src/lib/db/reactions.js` (`getReactions`, `addReaction`, `removeReaction`, `getThanksReceived`) registrato nel facade, con fallback demo embedded nel report come i commenti.
- Costante `REACTIONS` in `constants.js`.

### Out of scope (rinviato)
- Realtime sulle reazioni (publication + subscribe in ChatPanel) — oggi si caricano al mount come i messaggi.
- Integrazione ManuCoin (`credit_tokens` su 👏 ricevuto) e badge gamification "thanks" in `useOperatorScore`.

---

## [Unreleased — Hotfix Sprint 1a-bis] — v5.3.1

Hotfix sul branch `claude/hotfix-search-segnalazioni-SvhFt`. Solo cambi UI, nessuna migration DB.

### Fixed
- Search segnalazioni mobile (`src/components/reports/ReportsList.jsx`) ora cerca su tutti i campi visibili al manutentore: titolo, descrizione, nome macchinario (snapshot `r.machine` + fallback via lookup `machine_id` contro lo state `machines`), tecnico assegnato (`assigned_to_name`), creatore (`created_by_name`) e ID UUID raw. La ricerca per "etichettatrice" ora restituisce tutte le segnalazioni correlate anche quando il titolo è diverso (es. "Guasto improvviso").
- Search segnalazioni admin (`src/pages/admin/AdminReports.jsx`): estesa con gli stessi campi del mobile per coerenza UX su entrambe le interfacce. Prima cercava solo titolo, macchina e creatore — senza ID né descrizione.
- Debounce 200ms su entrambe le searchbar: evita re-render eccessivi durante digitazione rapida, invisibile all'utente.

### Documented
- Commento header in `ReportsList.jsx` documenta la convenzione schema asimmetrica: il nome macchinario è in `reports.machine` (TEXT snapshot), non `machine_name` come suggerirebbe la simmetria con `assigned_to_name`. Debito tecnico noto, da valutare normalizzazione in Sprint 1d insieme all'hardening `org_id` (ADR-007).

### Out of scope (rinviato)
- Full-text Postgres con `tsvector` (stemming italiano, ricerca server-side su tutto il dataset, ranking) → Sprint 1d post ADR-007.
- Fuzzy matching / typo tolerance (`pg_trgm`) → Sprint 3.3.

---

## [Unreleased — Sprint 1c]

Pronto per merge sul branch `claude/intervention-reports-many-to-many-Vh3Mt`. Migration 055 NON ancora applicata su Supabase (apply in finestra coordinata col push).

### Added
- Relazione N→M tra `interventions` e `reports` tramite nuova tabella `intervention_reports` (migration 055)
- Campo `is_origin BOOLEAN` (max 1 per intervento, unique partial index) per identificare il report di creazione
- Campo `resolves_report BOOLEAN DEFAULT true` per distinguere link "risolutivi" da link "di contesto"
- Trigger PG `on_intervention_completed` per auto-close dei report risolutivi quando l'intervento passa a `status='completato'`
- Activity log type `auto_closed_by_intervention` (`user_id=NULL`, `user_name='Sistema'`)
- Activity log type `report_linked_to_intervention` e `report_unlinked_from_intervention` per tracciare modifiche manuali ai link
- View `reports_with_planning` estesa con colonna informativa `linked_interventions_count` (include link di contesto)
- DB layer `db.createInterventionWithReports(intervention, links)` come API principale per la creazione di interventi con N link
- DB layer helpers: `db.linkReportToIntervention`, `db.unlinkReportFromIntervention`, `db.setResolvesReport`, `db.getReportsForIntervention`, `db.getActiveLinksByReports`
- Custom hook `useInterventionReports(interventionId)` con realtime subscription
- Componente `ReportMultiPicker.jsx`: selezione multi-segnalazioni con search debounced 300ms, skeleton loading, tap target ≥44px (regola guanti), feedback aptico mobile (vibrate 10ms), warning visivo "⚠ Già linkato a INT-XXX"
- Componente `LinkedReportsSection.jsx`: sezione UI uniforme N=0/1/N>1 per gestione link
- Integrazione in form intervento (`InterventionForm`): nuova sezione "Segnalazioni coperte" tra Specialty e Foto
- Integrazione in `InterventionDetailPanel`: sezione "Segnalazioni associate" con add/remove inline
- ADR-006 documenta scelta schema γ + alternative scartate
- ADR-007 placeholder per hardening `org_id` (Sprint 1d)
- CHANGELOG.md (questo file, primo cambio formale)

### Changed
- View `reports_with_planning` aggrega `planning_state` solo sui link con `resolves_report=true` (i link "di contesto" non contano per il calcolo dello stato)
- `interventions.report_id` rimosso (single source of truth: `intervention_reports`)
- `db.createIntervention(data)` ora è **shim deprecato**: se `data.report_id` valorizzato logga `console.warn` (con stack trace del caller) e delega a `createInterventionWithReports`. Audit dei callsite residui post-deploy via grep dei warning.
- `InterventionDetailPanel`: rimosso bottone "Apri segnalazione di origine" (vecchio basato su `intervention.report_id`). Sostituito con sezione "Segnalazioni associate".
- `InterventionRequestSidePanel` mode `reschedule`: i link sono mostrati read-only (modifiche strutturali via DetailPanel post-salvataggio)

### Migration steps
- **Backup di sicurezza**: `CREATE TABLE backup_055_interventions AS SELECT * FROM interventions`
- **Pre-migration count**: `SELECT COUNT(*) FROM interventions WHERE report_id IS NOT NULL` (catturalo per la verifica)
- **Apply** in transaction: `055_intervention_reports.sql`
- **Consistency check** automatico nella mig (DO block §5): RAISE EXCEPTION se mismatch pre/post, RAISE NOTICE con count migrato se OK
- **Verifica post**: `SELECT COUNT(*) FROM intervention_reports WHERE is_origin=true` deve essere uguale al pre-migration count

### Known limitations
- **`org_id` rimane `TEXT` con `DEFAULT 'default'` ovunque** (anti-pattern noto: causa "record invisibili da RLS mismatch"). Hardening tracked in **ADR-007**, da risolvere in Sprint 1d (subito dopo 1c, **pre-FASE 5 multi-tenant**)
- `intervention_reports.org_id` è `TEXT NOT NULL` (NO default) — pattern safer ma TEXT, allineamento con resto schema
- Down migration di 055 è destructive sui link `is_origin=false` (vengono persi col `DROP TABLE intervention_reports`)
- Activity log `auto_closed_by_intervention` ha `user_id=NULL` (azione di sistema). L'audit trail risale al vero umano via activity precedente `intervention_status_changed`
- **Auto-close è ONE-WAY**: se un intervento `completato` torna a stato precedente (via update DB diretto), i report chiusi dall'auto-close restano `risolta`. Decisione consapevole (cfr Correction #10). Nota UX runtime + eventuale "Riapri anche i report associati" pianificati quando aggiungeremo bottone "Riapri" nel DetailPanel
- Lo shim `db.createIntervention` con `data.report_id` ora scrive activity row `type='deprecated_api_call'` per audit SQL post-deploy. Console.warn rimane in produzione. Grep `db.createIntervention(` nel codebase corrente ritorna 0 risultati: nessun caller residuo identificato
- `InterventionDetailPanel` `onOpenReport` prop deprecato (non più consumato): lieve regression UX rispetto a Sprint 1a (no shortcut "Apri →" sulle mini-card). Da ripristinare in Sprint 1d (~10 LOC)
- 3 nuovi `activities.type` (`auto_closed_by_intervention`, `report_linked_to_intervention`, `report_unlinked_from_intervention`) non hanno mapping label/icon nell'UI Activity Timeline. Default a stringa raw. Aggiunta mapping pianificata Sprint 1d

---

<!--
Versioni precedenti (Sprint 1a, 1a-bis) non sono ancora state portate in
questo CHANGELOG. Da fare in fase di chiusura Sprint 1c oppure spostare a
Sprint 1d con bump di versione.
-->
