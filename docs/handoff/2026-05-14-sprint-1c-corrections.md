# Sprint 1c — Corrections doc

> Decisioni prese al volo o deviazioni dal piano originale di Sprint 1c
> (briefing N→M intervention ↔ reports + ADR-006 + mig 055).
>
> Versione: 1.0 · Data: 2026-05-14 · Branch: `claude/intervention-reports-many-to-many-Vh3Mt`

---

## Correction #1 — `org_id` rimane TEXT (non UUID)

**Briefing utente dice**: «BUG 1 — org_id: deve essere UUID NOT NULL senza default».

**Realtà ManuTech**: `interventions.org_id` è `TEXT NOT NULL DEFAULT 'default'` (verificato `053:29`). Stesso pattern in `reports`, `notifications`, `activities`, `comments`, ecc. Allineamento a UUID richiede refactor cross-table fuori scope 1c.

**File interessati**:
- `supabase/migrations/053_create_interventions.sql:29`
- `supabase/migrations/055_intervention_reports.sql:38` (mig 1c)

**Decisione applicata**:
- `intervention_reports.org_id TEXT NOT NULL` (allineato al resto).
- **`DEFAULT 'default'` RIMOSSO** (come da BUG 1 utente): se il client dimentica `org_id`, INSERT FAIL invece di valore fasullo.
- TECH DEBT documentato in **ADR-007** (org_id schema hardening cross-table) per Sprint 1d.

**Impatto su altri sprint**: ADR-007 da implementare prima di FASE 5 multi-tenant.

---

## Correction #2 — Trigger auto-close: autore = `Sistema`

**Briefing dice (prima rev)**: trigger usa `NEW.assigned_to` come autore dell'activity di auto-close.

**Realtà / decisione utente (BUG 2)**: l'auto-close è un'**azione di sistema**, non dell'assignee. Attribuire all'assignee falserebbe l'audit trail.

**File interessati**:
- `supabase/migrations/055_intervention_reports.sql` (function `on_intervention_completed`)

**Decisione applicata**: activity log con `user_id = NULL`, `user_name = 'Sistema'`. L'audit trail risale al vero umano leggendo l'activity precedente `intervention_status_changed` (scritta da `updateIntervention` quando l'admin completa).

**Impatto**: nessuno bloccante. Eventuale UI Activity Timeline dovrà gestire `user_name='Sistema'` come label visiva neutra (es. icona robot/cog).

---

## Correction #3 — Reschedule mode: link in sola lettura

**Briefing implicito**: il form in mode `reschedule` permette modifiche complete.

**Realtà 1c**: il form mostra TUTTI i campi (incluso `LinkedReportsSection`), ma in reschedule mode i link sono complessi (add/remove richiede chiamate DB diff). Per non complicare lo scope 1c, mantengo i link **read-only** durante reschedule.

**File interessati**:
- `src/components/interventions/InterventionRequestSidePanel.jsx` (`linksReadOnly={isReschedule}`)
- `src/components/interventions/InterventionForm.jsx` (prop `linksReadOnly`)
- `src/components/interventions/LinkedReportsSection.jsx` (rispetta `readOnly`)

**Decisione applicata**:
- Reschedule SidePanel passa `initialLinks` caricati da `db.getReportsForIntervention` + `linksReadOnly=true`.
- L'utente può cambiare il flag `resolves_report` (toggle checkbox) ma non aggiungere/rimuovere link.

   ⚠ **TODO** rivedere se `resolves_report` toggle in readOnly è coerente. Attualmente il toggle è abilitato perché il bottone X è quello che readOnly nasconde, mentre la checkbox resolves resta editabile. Da chiarire UX nei test produzione.
- Per modifiche strutturali ai link (add/remove), l'admin usa `InterventionDetailPanel` sezione "Segnalazioni associate" dopo il salvataggio reschedule.

**Impatto**: UX a 2 step per casi rari (riprogrammare + aggiungere link in stessa sessione). Coerente con principio "una cosa alla volta" del pannello sidebar.

---

## Correction #4 — `getInterventions({ report_id })` filtro rimosso

**Briefing dice (implicito)**: `getInterventions` accetta filtro `report_id`.

**Realtà 1c**: dopo mig 055, `interventions.report_id` non esiste più. Il filtro su `report_id` deve passare per `intervention_reports`. Per chiarezza, ho **rimosso** completamente il parametro `report_id` da `getInterventions(filters)`.

**File interessati**:
- `src/lib/db/interventions.js` (`getInterventions`)
- Caller `src/components/interventions/InterventionsForReport.jsx` (usa `getInterventionsForReport`, non `getInterventions({ report_id })`, quindi nessun impatto)

**Decisione applicata**:
- `getInterventions(filters)` non accetta più `filters.report_id`.
- Per query "interventi di un report" usa **sempre** `getInterventionsForReport(reportId)` che fa JOIN su `intervention_reports`.
- Commento esplicativo nel codice.

**Impatto**: nessun callsite legacy nel codebase corrente.

---

## Correction #5 — `prop onOpenReport` deprecato in DetailPanel

**Briefing implicito**: la prop `onOpenReport` del DetailPanel apriva il "report di origine" via `intervention.report_id`.

**Realtà 1c**: `intervention.report_id` non esiste più. L'origine è in `intervention_reports.is_origin=true`. La sezione "Segnalazioni associate" della LinkedReportsSection mostra già tutti i link.

**File interessati**:
- `src/components/interventions/InterventionDetailPanel.jsx`
- `src/pages/admin/AdminCalendar.jsx` (caller, passa `handleOpenReport`)

**Decisione applicata**:
- Prop `onOpenReport` **rimossa dalla destrutturazione** del DetailPanel. I caller continuano a passarla (React accetta props extra) per backward compat, ma viene ignorata.
- Sezione "Segnalazioni associate" (LinkedReportsSection) mostra le mini-card con titolo + display_id + status + sev + checkbox resolves. Per ora non c'è bottone "Apri →" sulla card (futura UX).

**Impatto**: l'admin che vuole aprire il report di origine deve farlo dalla lista admin segnalazioni o copiare l'ID dalla card. **Lieve regressione UX** rispetto a Sprint 1a; documentata come futuro miglioramento. Aggiungere "Apri →" sulle mini-card di LinkedReportsSection è ~10 LOC se prioritario.

---

## Correction #6 — `createInterventionWithReports` come API principale, `createIntervention` shim

**Briefing dice**: «layer DB deve esporre `createInterventionWithReports(intervention, links)` come API principale. La vecchia `createIntervention` con `report_id` nel payload va deprecata, non semplicemente sostituita: lascia uno shim che logga warning e chiama internamente la nuova».

**File interessati**:
- `src/lib/db/interventions.js`

**Decisione applicata**:
- Nuova funzione `createInterventionWithReports(data, links)` come API principale.
- `createIntervention(data)` è ora **shim**: se `data.report_id` valorizzato → `console.warn` (con stack trace del caller) + delega a `createInterventionWithReports(data, [{report_id, is_origin:true, resolves_report:true}])`.
- Se `data.report_id` non valorizzato → delega comunque a `createInterventionWithReports(data, [])`. Niente warning (caso legittimo).

**Impatto**: durante deploy preview/produzione, eventuali callsite residui produrranno warning in console (niente errori). Audit a 1-2 settimane post-deploy con grep dei warning per identificare callsite da bonificare.

---

## Correction #7 — Edge case "report già linkato": warning, non blocco

**Briefing dice**: «se l'admin tenta di linkare un report già linkato a un altro intervento attivo, mostra warning visivo nel picker, non bloccare».

**File interessati**:
- `src/lib/db/interventions.js` (`getActiveLinksByReports(reportIds)`)
- `src/components/interventions/ReportMultiPicker.jsx`

**Decisione applicata**:
- Helper `db.getActiveLinksByReports(reportIds)` ritorna mappa `{ reportId: [{intervention_id, intervention_title, intervention_status}] }` filtrando per status `pianificato/confermato/in_corso`.
- `ReportMultiPicker` carica al mount e mostra warning giallo "⚠ Già linkato a INT-XXXXXX +N" sotto la riga del report.
- Esclude `currentInterventionId` dal warning (quando l'admin sta editando lo stesso intervento).
- **Non blocca selezione**: l'admin può comunque linkare. Coerente con use case PTS dove un report potrebbe essere legittimamente in più interventi (es. uno preventivo + uno correttivo).

**Impatto**: nessuno bloccante. UX informativa.

---

## Correction #8 — Activity log tipi nuovi (`report_linked_*`/`auto_closed_*`)

**Briefing dice**: «activity log: per ogni link aggiunto post-creazione scrivi type='report_linked_to_intervention'. Per rimozione type='report_unlinked_from_intervention'».

**File interessati**:
- `src/lib/db/interventions.js` (`linkReportToIntervention`, `unlinkReportFromIntervention`)
- `supabase/migrations/055_intervention_reports.sql` (trigger function)

**Decisione applicata**:
- 3 nuovi `activities.type` introdotti:
  - `report_linked_to_intervention` (manuale, da `db.linkReportToIntervention`)
  - `report_unlinked_from_intervention` (manuale, da `db.unlinkReportFromIntervention`)
  - `auto_closed_by_intervention` (automatico, da trigger PG `on_intervention_completed`)
- `activities.type` è `TEXT NOT NULL` senza CHECK constraint (verificato `schema.sql:108`), quindi nessuna migration su CHECK necessaria.

**Impatto**: i 3 tipi sono inediti per l'UI Activity Timeline. Se la timeline rendering ha un mapping `type → label/icon`, i nuovi tipi cadono nel default (`type` raw stringa). Nice-to-have: aggiungere mapping in `src/lib/constants.js` o equivalente in Sprint 1d (~15 LOC).

---

## Correction #9 — `LinkedReportsSection` componente nuovo (vs UI inline nel form)

**Briefing implicito**: integra "Segnalazioni coperte" nel form senza specificare struttura.

**File interessati**:
- `src/components/interventions/LinkedReportsSection.jsx` (NUOVO ~280 LOC)
- `src/components/interventions/InterventionForm.jsx` (consumer)
- `src/components/interventions/InterventionDetailPanel.jsx` (consumer)

**Decisione applicata**:
- Estratto componente standalone `LinkedReportsSection` per evitare di gonfiare ulteriormente `InterventionForm.jsx` (già ~600 LOC) e per **riusarlo nel DetailPanel** (sezione "Segnalazioni associate").
- API uniforme: `value` (array link) + `onChange(arr)` + flag `readOnly`.
- Internalmente carica metadata report via `db.getReports` (cache locale) + monta `ReportMultiPicker` inline quando l'utente clicca "+ Aggiungi segnalazione".

**Impatto**: 1 file in più, ma maintainability + DRY tra form e detail. Coerente con pattern Sprint 1a-bis (UserPicker estratto come componente condiviso, Correction #3 di 1a-bis).

---

## Correzioni minori (no entry separata)

- **Sidebar SidePanel `existingLinks` state**: caricamento al mount via `db.getReportsForIntervention` solo in mode `reschedule`. Coerente con caricamento `users`/`supplierProfiles` esistente.
- **Form `linkedReports` state**: inizializzato lazy con seed da `context.report` (caso modal da ReportDetail). Se `initialLinks` arriva, usa quello (caso reschedule).
- **`linkedReports` passato come 3° argomento di `onSubmit`**: la firma del callback diventa `(payload, formContext, linkedReports)`. Cambia il contratto dello shell, ma le shell sono tutte aggiornate (Modal e SidePanel).
- **Empty state `LinkedReportsSection`**: testo "Nessuna segnalazione collegata. Aggiungine una qui sopra…". UI uniforme N=0/1/N>1 (decisions doc D4).
- **Down migration 055**: documentato esempio scenario perdita dati nel header (Q1 risolta in fase di review SQL).

---

## Da fare in Sprint 1d

- ADR-007 implementation: `org_id TEXT → UUID` cross-table (mig 056) **prima di FASE 5**.
- Mapping `activities.type → label/icon` per i 3 nuovi tipi (vedi Correction #8).
- "Apri →" sulle mini-card di `LinkedReportsSection` per ricuperare la regression UX di Correction #5.

## Da fare in Sprint 1b (rinviato da 1a-bis)

- Mobile calendar (week-strip + bottom sheet)
- Estensione tipi notifica (`intervention_assigned`, `intervention_rescheduled`, ecc.)
- Bump version label `ProfilePage.jsx` + entry CHANGELOG dei sprint precedenti

## Da fare in Sprint 2

- Magic link fornitori (riusa `users.invite_token`)
- Pagina pubblica `/supplier/intervention/{id}?token={invite_token}`
