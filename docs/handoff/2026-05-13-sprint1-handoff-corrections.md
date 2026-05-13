# Sprint 1 — Handoff corrections

> Vivo documento durante l'implementazione di Sprint 1a. Ogni voce è una
> deviazione tra il briefing originale (`docs/handoff/SPRINT-1-HANDOFF.md` o
> file equivalente v1.1) e la realtà del codebase ManuTech. Va integrato nel
> briefing v2.0 a fine Sprint 1b.
>
> Versione: 0.1 (Sprint 1a in corso) · Data: 2026-05-13

---

## Correction #1 — Migration filename pattern

**Briefing dice**: file migration con nome `YYYYMMDDHHMMSS_create_interventions.sql` (formato timestamp).

**Realtà ManuTech**: la convention è `NNN_descriptive_name.sql` (sequenziale a 3 cifre zero-padded). L'ultima esistente è `052_report_stars.sql`. Esistono anche file `_down` per migration reversibili (`052_report_stars_down.sql`).

**File interessati**:
- `supabase/migrations/052_report_stars.sql` (ultimo esistente)
- Tutti i file in `supabase/migrations/` per pattern

**Decisione applicata**: nominato il file `053_create_interventions.sql` + `053_create_interventions_down.sql`. Header comment block in stile delle migration precedenti.

**Impatto su altri sprint**: tutti gli sprint futuri usano lo stesso pattern. Sprint 2 sarà `054_*.sql`.

---

## Correction #2 — Trigger function name

**Briefing dice**: `CREATE TRIGGER ... EXECUTE FUNCTION public.set_updated_at()`.

**Realtà ManuTech**: la funzione si chiama `public.handle_updated_at()` (definita in `supabase/schema.sql:252-258`). Usata da tutti i trigger BEFORE UPDATE delle tabelle ManuTech (users, reports, machines, maintenance_plans, maintenance_logs, notification_preferences, ecc.).

**File interessati**:
- `supabase/schema.sql:252-258`

**Decisione applicata**: la migration 053 usa `handle_updated_at()` per il trigger `trg_interventions_updated`.

**Impatto su altri sprint**: nessuno.

---

## Correction #3 — RLS helpers

**Briefing dice**: policy RLS con subquery inline `org_id = (SELECT org_id FROM public.users WHERE auth_id = auth.uid())`.

**Realtà ManuTech**: esistono 3 helper functions `SECURITY DEFINER STABLE` definite in `supabase/schema.sql:296-312`:

```sql
public.get_my_org_id()  → TEXT
public.get_my_role()    → TEXT
public.get_my_user_id() → UUID
```

Tutte le RLS policy di ManuTech (`reports`, `maintenance_plans`, `machines`, ecc.) le usano. Le subquery inline non sono mai utilizzate.

**File interessati**:
- `supabase/schema.sql:296-312` (definizione helpers)
- `supabase/schema.sql:367-384` (esempio uso in reports policies)

**Decisione applicata**: la migration 053 usa `public.get_my_org_id()`, `public.get_my_role()`, `public.get_my_user_id()` nelle 4 policy di `interventions`. Pattern mirror di `maintenance_plans`.

**Impatto su altri sprint**: tutte le future tabelle ManuTech devono usare questi helpers, non subquery inline.

---

## Correction #4 — Routing admin

**Briefing dice**: registrare le nuove pagine admin con React Router e path string come `/admin/calendar`.

**Realtà ManuTech**: l'admin desktop usa un router custom in `src/pages/manutech-v6/V6App.jsx` con switch case su `route.name`. Esempio (`V6App.jsx:156`):

```jsx
{route.name === 'reports' && <AdminReports initialReportId={initialReportId} />}
{route.name === 'calendar' && <AdminCalendar onNavigate={...} />}
```

Le voci nav sono registrate in `src/lib/adminNav.js`. NON c'è React Router per l'admin.

**File interessati**:
- `src/pages/manutech-v6/V6App.jsx:79-173` (router custom)
- `src/lib/adminNav.js` (registro voci nav)

**Decisione applicata**:
1. Aggiunta voce `{ id: 'calendar', label: 'Calendario', desc: 'Pianificazione interventi', icon: Calendar }` in `adminNav.js` tra `reports` e `assistant` (vedi Correction #11 per posizione finale).
2. Aggiunto `const AdminCalendar = lazy(...)` e relativo case `{route.name === 'calendar' && ...}` in `V6App.jsx`.
3. Esteso `AdminPageFrame` con prop `fullBleed` (no padding, no maxWidth 1280) per la pagina calendario.

**Impatto su altri sprint**: nessuno. Pattern già noto per chi modifica V6App.

---

## Correction #5 — PianificaInterventoSheet non esiste

**Briefing dice**: «riusa il componente `PianificaInterventoSheet` esistente, pre-popolato con `{ report_id, machine_id, severity, title_suggestion }`».

**Realtà ManuTech**: il componente `PianificaInterventoSheet` non esiste nel codebase. La grep `find . -name "Pianifica*"` ritorna 0 risultati.

Esiste invece `src/components/spare/InterventionRequestModal.jsx`, il modal usato da `ReportDetail` (mobile chat panel) per richiedere un intervento esterno tramite il flow di "richiesta esterna" (chooser `Ricambio | Intervento esterno`). Questo componente scriveva su `spare_part_orders` con `kind='intervento'` (cfr. Correction #6).

**File interessati**:
- `src/components/spare/InterventionRequestModal.jsx`
- `src/components/spare/RequestKindChooser.jsx` (il chooser che lo invoca)
- `src/components/reports/ReportDetail.jsx:1119` (caller)

**Decisione applicata**:
1. Refactor di `InterventionRequestModal.jsx` per scrivere su `interventions` invece di `spare_part_orders.kind='intervento'`.
2. Aggiunto un secondo entry point al modal: dalla nuova sezione `<InterventionsForReport>` in `ReportDetailModal` (admin). Il modal accetta sempre `report` come prop e fa internamente il mapping `report_id`/`machine_id`/`severity`/`type` ereditato.
3. Aggiornata l'intestazione del modal da "Richiesta intervento" a "Pianifica intervento" e il bottone da "Invia richiesta" a "Pianifica intervento" per allineare il nuovo vocabolario.

**Impatto su altri sprint**: in Sprint 2 (magic link fornitori) il modal sarà esteso con un picker fornitore che pre-popola `assigned_to` + `assigned_to_role='fornitore'`.

---

## Correction #6 — Migration 051 aveva già `kind='intervento'` su spare_part_orders

**Briefing dice**: ADR-001 motiva la nuova tabella `interventions` perché «spare_part_orders contiene 5 record reali in produzione, tutti con kind='ricambio'. Forzarla a contenere anche interventi creerebbe confusione semantica».

**Realtà ManuTech**: la `migration 051_external_requests.sql` aveva già esteso `spare_part_orders` con `kind`, `scheduled_at`, `duration_h`, `location`, `specialty`. La feature era predisposta e implementata nel frontend (`InterventionRequestModal.jsx` scrive su `spare_part_orders.kind='intervento'`), ma non risulta mai entrata in flow operativo. Verifica utente: `SELECT kind, COUNT(*) FROM spare_part_orders GROUP BY kind` ritorna solo `ricambio: 5`.

**File interessati**:
- `supabase/migrations/051_external_requests.sql`
- `src/components/spare/InterventionRequestModal.jsx` (write site legacy)
- `src/components/spare/TicketSparePanel.jsx` (read site, mostrava sia ricambi che interventi)
- `src/components/spare/RequestDetailPanel.jsx` (read site dettaglio)
- `src/pages/admin/AdminSpareParts.jsx` (lista admin, mostrava entrambi)
- `src/lib/db/spareParts.js` (rami `kind === 'intervento'` nelle stringhe attività)
- `src/lib/constants.js` linee 63-89 (`REQUEST_KIND`, `statusLabel(status, kind)`)

**Decisione applicata**: vedi `docs/decisions/ADR-001-bis-interventions-vs-spare-orders.md`. Sintesi:
1. Procediamo con la nuova tabella `interventions`.
2. NESSUNA migrazione dati (0 record da spostare).
3. Refactor `InterventionRequestModal` write site → nuova tabella.
4. Narrow di 4 read site a `kind='ricambio'` only.
5. Schema `spare_part_orders` invariato (campi `kind`/`scheduled_at`/`duration_h`/`location`/`specialty` restano legacy, deprecabili in sprint dedicato).

**Impatto su altri sprint**: Sprint 4 (manutenzione tecnica) potrebbe valutare la rimozione formale dei campi legacy in `spare_part_orders`.

---

## Correction #7 — Vocabolario type/severity allineato a reports

**Briefing dice**: `interventions.type ∈ ('reattivo','preventivo','ispezione')`, `interventions.severity ∈ ('bassa','media','alta')`.

**Realtà ManuTech**: `reports.type ∈ ('correttiva','preventiva','migliorativa','ispezione')`, `reports.severity ∈ ('bassa','media','alta','critica')`. Le costanti `REPORT_TYPES` e `SEVERITY` sono già definite (con icona e colore) in `src/lib/constants.js:16-28`.

**File interessati**:
- `src/lib/constants.js:16-28`
- `supabase/schema.sql:62-67` (CHECK su reports)

**Decisione applicata**: allineamento completo (vedi `docs/decisions/ADR-005-vocabulary-alignment.md`).
- `interventions.type` riusa i 4 valori di `reports.type`.
- `interventions.severity` riusa i 4 valori di `reports.severity` (incluso `critica`).
- Mapping `urgency → severity`: bassa/media/alta passano 1:1, `urgente` → `critica`.
- `interventions.status` resta specifico (`bozza|pianificato|confermato|in_corso|completato|annullato`).
- Ereditarietà da origine via `defaultsForOrigin()` in `src/lib/interventions.js`.

**Impatto su altri sprint**: in Sprint 3 (workspace pianificazione avanzato) il form di creazione manuale dovrà offrire l'override esplicito di `type`/`severity` quando l'origine è `report`.

---

## Correction #8 — SupplierDetailModal: sezione interventi separata

**Briefing dice**: (implicito) nessuna istruzione su come integrare gli interventi nella scheda fornitore.

**Decisione utente** (Phase 3): aggiungere una sezione "Interventi pianificati" nel `SupplierDetailModal`, tenendola **separata** dai ricambi storici (NON merging in una lista unica).

**File interessati**:
- `src/components/SupplierDetailModal.jsx`

**Decisione applicata**: nuovo `useEffect` che carica `db.getInterventionsForSupplier(supplier.id)` all'apertura. Render di una sezione con header "Interventi pianificati · N", mostrando fino a 5 `<InterventionCard compact>` + "…e altri N" se overflow. La sezione si sovrappone alla sezione "Dallo storico ricambi" e alla sezione "Note", come pari livello.

**Impatto su altri sprint**: in Sprint 2 (magic link) il fornitore avrà un account utente attivo; questa sezione mostrerà anche gli interventi confermati con `assigned_to_role='fornitore'`.

---

## Correction #9 — Mapping urgency → severity

**Briefing dice**: (implicito) urgency e severity sono campi diversi, nessuna conversione documentata.

**Decisione utente** (Phase 3): mapping esplicito `URGENCY_TO_SEVERITY`:

```js
bassa   → bassa
media   → media
alta    → alta
urgente → critica
```

**File interessati**:
- `src/lib/interventions.js` (export `URGENCY_TO_SEVERITY`)
- `src/components/spare/InterventionRequestModal.jsx` (uso in submit)

**Decisione applicata**: costante esportata da `lib/interventions.js`, applicata nel submit del modal. Il valore originale di `urgency` viene salvato in `extra_data.urgency` per audit.

**Impatto su altri sprint**: nessuno. Se in futuro il form esporrà direttamente `severity`, l'urgency picker può essere rimosso senza migrazione (i record esistenti hanno comunque la severity giusta).

---

## Correction #10 — Status workflow report quando si pianifica un intervento

**Briefing dice**: (implicito; il codice esistente di `InterventionRequestModal` portava il report a `status='in_attesa_ricambi'` quando creava un intervento esterno).

**Decisione utente** (Phase 3): la pianificazione di un intervento NON tocca lo status del report. Il report resta nel suo status corrente (`aperta`, `assegnata`, ecc.). Il `planning_state` aggregato dalla view `reports_with_planning` comunica visivamente che la segnalazione ha un intervento programmato.

**File interessati**:
- `src/components/spare/InterventionRequestModal.jsx:94-127` (vecchio update + notifications, rimosso)
- `supabase/migrations/053_create_interventions.sql` §8 (view)
- `src/pages/admin/AdminReports.jsx` (badge planning_state)

**Decisione applicata**:
1. Rimosso `db.updateReport(report.id, { status: 'in_attesa_ricambi' })` e le notifiche correlate dal modal.
2. Rimosso il blocco `addActivity(type:'status_change')` collegato.
3. View `reports_with_planning` (mig 053 §8) calcola `planning_state` ∈ (`da_pianificare`|`pianificato`|`in_corso`|`risolta`|`altro`) aggregando gli interventi attivi del report.
4. `AdminReports` mostra un chip `planning_state` sotto il titolo nelle righe della tabella (solo per gli stati informativi `da_pianificare`, `pianificato`, `in_corso`).

**Impatto su altri sprint**: nessuno. NON introdurre nuovi valori in `reports.status` per la pianificazione.

---

## Correction #11 — Posizione voce sidebar "Calendario"

**Briefing dice**: «posizione consigliata nel menu: dopo "Segnalazioni", prima di "Macchinari"».

**Realtà ManuTech**: tra `reports` e `machines` c'è già `assistant` (Assistente AI). Il briefing è leggermente sopravvalutato — la posizione naturale è subito dopo "Segnalazioni" (e quindi PRIMA di "Assistente AI"), dato che il calendario è la pianificazione delle segnalazioni stesse.

**Decisione utente** (Phase 3): confermata posizione tra `reports` e `assistant` (più stretta del «prima di Macchinari» del briefing, ma equivalente in spirito). Icona `Calendar` da `lucide-react`.

**File interessati**:
- `src/lib/adminNav.js`

**Decisione applicata**: aggiunta entry `{ id: 'calendar', icon: Calendar, label: 'Calendario', desc: 'Pianificazione interventi' }` immediatamente dopo `reports` e prima di `assistant`.

**Impatto su altri sprint**: nessuno.

---

## Correzioni minori (no entry separata)

- **`set_interventions_updated_at`** del briefing → `trg_interventions_updated` per coerenza naming con gli altri trigger ManuTech (`trg_reports_updated`, `trg_machines_updated`, ecc.).
- **`activities.report_id NOT NULL`**: la migration 053 lo rende NULLABLE per supportare activity log di interventi con `origin='manuale'` (senza report di riferimento). Il down esegue cleanup preventivo `DELETE FROM activities WHERE report_id IS NULL` prima di ripristinare il NOT NULL.
- **Realtime**: il briefing dava per scontato `FOR ALL TABLES`. In ManuTech la publication `supabase_realtime` è per-table (oggi solo `notifications`, `comments`, `direct_messages`). La migration 053 aggiunge esplicitamente `interventions` via `ALTER PUBLICATION supabase_realtime ADD TABLE`.

---

## Da fare in Sprint 1b

- ADR-002 (activities come audit log)
- ADR-003 (suppliers = users con role='fornitore')
- ADR-004 (org_id resta text)
- Aggiornamento `CHANGELOG.md` + bump version label in `ProfilePage.jsx`
- Estensione tipi notifica (`intervention_assigned`, `intervention_rescheduled`, ecc.) in `notification_preferences` defaults org-wide

## Da fare in Sprint 2

- Magic link fornitori — riusa il sistema `users.invite_token` esistente (verificare durata token e scope)
- Pagina pubblica `/supplier/intervention/{id}?token={invite_token}`
