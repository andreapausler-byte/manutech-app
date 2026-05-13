# Sprint 1a-bis — Corrections doc

> Vivo durante l'implementazione di Sprint 1a-bis. Ogni voce è una decisione
> presa al volo o una deviazione dal piano originale di 1a-bis
> (`2026-05-13-sprint-1a-bis-decisions.md`).
>
> Versione: 1.0 · Data: 2026-05-14

---

## Correction #1 — Durata via end-start invece di campo separato

**Decisions doc dice (§A1/B1)**: il form aveva input "Durata (h)" separato + `scheduled_at` come singolo campo (legacy 1a).

**Realtà 1a-bis**: con la decisione B1 (multi-day, `scheduled_start_at` + `scheduled_end_at`), un input "Durata" separato è ridondante: `(end - start) / 60000` produce lo stesso valore.

**File interessati**:
- `src/components/interventions/InterventionForm.jsx`

**Decisione applicata**: rimosso completamente il campo "Durata (h)" dal form. `payload.estimated_duration_min` viene calcolato automaticamente al submit quando entrambi `scheduled_start_at` e `scheduled_end_at` sono valorizzati. Se solo lo start è valorizzato, `estimated_duration_min = null` (l'utente può aggiungere fine in un secondo momento).

**Impatto**: nessuno schema change. La colonna `estimated_duration_min` resta nel DB e accetta `null`.

---

## Correction #2 — Chip "Oggi" con label dinamico

**Decisions doc dice (§A1)**: "Oggi 09:00 — se siamo già oltre le 9:00, scegli +1h dalla now arrotondato a 30'". Sottinteso: label fisso "Oggi 09:00".

**Realtà**: lasciare il label fisso ma cambiare il valore al click crea confusione (l'utente vede "Oggi 09:00" e si aspetta le 9:00, ma riceve 14:30 senza spiegazione).

**File interessati**:
- `src/lib/interventions.js` (`labelToday()`)

**Decisione applicata**: label dinamico. Se siamo prima delle 9, mostra "Oggi 09:00" come da spec. Se siamo dopo le 9, mostra l'ora effettiva (es. "Oggi 14:30") che il chip applicherebbe. L'utente capisce immediatamente che il chip darà quella slot.

**Impatto**: nessuno. Migliora la chiarezza UX senza cambiare il behavior.

---

## Correction #3 — UserPicker estratto come componente condiviso

**Decisions doc dice (§E)**: "stessa logica per entrambi (supervisore + esecutore)". Sottinteso: due picker simili inline nel form.

**Realtà**: i due picker condividono ~250 LOC di logica (search, lista enriched, ranking, chip ruolo, gestione collapsible). Duplicare inline è anti-DRY.

**File interessati**:
- `src/components/interventions/UserPicker.jsx` (NEW, ~270 LOC)
- `src/components/interventions/InterventionForm.jsx` (riusa 2 istanze)

**Decisione applicata**: estratto `UserPicker` come componente riusabile. Configurabile via prop:
- `collapsible` (false per assigned_to, true per supervised_by)
- `rolesFilter` (filtri ruolo diversi tra i due)
- `prioritySpecialty` (solo assigned_to)
- `inheritedFrom` (hint "Copiato da INT-XXX" per il caso "+ Abbina")

**Impatto**: 1 file in più, ma maintainability migliore. Futuro Sprint 6-7 (smart suggestions) può aggiungere un slot "Suggeriti" sopra la lista senza toccare il form.

---

## Correction #4 — `supervised_by` rolesFilter esclude fornitori

**Decisions doc dice (§E)**: "Sezione 'Persone' con chip role-filtered: `Admin · Tecnico · Fornitore`". Sottinteso: tutti e 3 i ruoli ammessi per entrambi i picker.

**Realtà**: un fornitore esterno NON può supervisionare la pianificazione: non ha visibilità sul calendario interno, non riceve notifiche admin, non può sollecitare se stesso. Concettualmente sbagliato.

**File interessati**:
- `src/components/interventions/InterventionForm.jsx` (rolesFilter prop)

**Decisione applicata**:
- `assigned_to` (esecutore) accetta `['admin', 'tecnico', 'fornitore']` — chi esegue può essere chiunque
- `supervised_by` (supervisore) accetta solo `['admin', 'tecnico']` — chi supervisiona è interno

**Impatto**: nessuno schema change. La FK `supervised_by → users(id)` accetta qualsiasi user (no CHECK su role), ma la UI restringe la scelta.

---

## Correction #5 — Operatori esclusi dal picker assigned_to

**Decisions doc dice (§E)**: implicito.

**Realtà**: gli operatori segnalano i problemi (ruolo "io vedo"), non eseguono interventi (ruolo "io faccio"). Mostrarli nel picker assigned_to genera assegnazioni sbagliate.

**File interessati**:
- `src/components/interventions/InterventionForm.jsx`

**Decisione applicata**: `assigned_to` rolesFilter è `['admin', 'tecnico', 'fornitore']` — operatori esclusi. Anche se gli admin tipicamente non eseguono, sono ammessi come fallback (es. piccola organizzazione con admin tuttofare).

**Impatto**: nessuno. Operatori restano visibili in altre liste (es. autori report).

---

## Correction #6 — Reschedule usa updateIntervention, non rescheduleIntervention

**Decisions doc dice (modal upgrade decisions Andrea)**: "Submit chiama `db.rescheduleIntervention` invece di `db.createIntervention`".

**Realtà**: `rescheduleIntervention(id, newStart, newEnd, reason, actor)` aggiorna **solo** `scheduled_start_at` + `scheduled_end_at`. Ma in edit mode il form mostra TUTTI i campi (riuso form puro), quindi l'utente potrebbe legittimamente cambiare anche assigned_to (riassegna fornitore) o description (aggiunge nota). Chiamando rescheduleIntervention quei cambi vengono persi silenziosamente.

**File interessati**:
- `src/components/interventions/InterventionRequestSidePanel.jsx`

**Decisione applicata**: submit edit mode chiama `db.updateIntervention(id, payload)` (update generico) invece di `rescheduleIntervention`.

Vantaggi:
- L'utente può modificare qualsiasi campo, inclusi assigned_to/supervised_by/description/media
- `updateIntervention` già logga `intervention_assigned/reassigned` e `intervention_status_changed`

Svantaggio noto:
- **Manca il log `intervention_rescheduled` specifico** quando solo start/end cambiano. La activity timeline mostra l'update generico ma non la "riprogrammazione" come evento distinto.

**Mitigation Sprint 1b**: aggiungere a `db.updateIntervention` la logica per loggare `intervention_rescheduled` quando rileva `before.scheduled_start_at !== after.scheduled_start_at`. ~10 LOC nel modulo `db/interventions.js`.

**Impatto**: nessuno bloccante. Toast UX rimane "Intervento riprogrammato" coerente con l'intent del bottone "Riprogramma" che apre questa modalità.

---

## Correction #7 — Sidebar width 380px (era 360px)

**Decisions doc dice**: implicito (non specificato).

**Realtà**: il form completo con 2 picker enriched + 2 sezioni date + foto split + description prefill non sta comodo a 360px. La lista users nel UserPicker (dropdown con search) si stringe troppo.

**File interessati**:
- `src/pages/admin/AdminCalendar.jsx` (`<aside style={{ width: 380 }}>`)

**Decisione applicata**: width sidebar 380px (+20px). Calendar centrale resta ampio su schermi >= 1280px.

**Impatto**: nessuno su schermi standard. Su risoluzioni <1280px (rare per admin desktop) la griglia mese ha meno spazio per le pillole — accettabile.

---

## Correzioni minori (no entry separata)

- **Bottone "Nuovo intervento" del toolbar**: prima mostrava toast "Crea da una segnalazione: apri il report → Pianifica intervento". Ora apre `InterventionRequestSidePanel` con `prefillDate = oggi`. UX coerente con il principio "tutto in sidebar".
- **Banner empty-state**: aggiornato il messaggio da "Crea da una segnalazione" a "Clicca un giorno per crearne uno o usa Nuovo intervento". L'utente ora ha più modi documentati.
- **`Foto della segnalazione` sezione**: il badge "DAL REPORT" è giallo (`#facc15` su sfondo nero traslucido). Decisions doc non specificava il colore — scelto giallo per coerenza con badge "TARGHETTA" già presente in `RequestDetailPanel`.
- **`prefillDate` con orario di default**: il SidePanel pre-popola `scheduled_start_at = date + 09:00`. Coerente con i chip "Domani 09:00".

---

## Da fare in Sprint 1b

- Log `intervention_rescheduled` in `db.updateIntervention` (cfr Correction #6)
- Calendario mobile con week-strip + bottom sheet (decisions doc 1a out-of-scope)
- Estensione notifiche: `intervention_supervised_change` quando supervised_by cambia
- Bump version + CHANGELOG (rinviato da Sprint 1a)

## Da fare in Sprint 2

- Magic link fornitori → la sezione "Fornitori per specialità" nel UserPicker
  diventerà più utile quando i fornitori avranno account attivi (oggi sono
  spesso senza account, quindi non appaiono nel picker)

## Da rivisitare Sprint 6-7

- Smart suggestions (livello B di §E): le 3 regole SQL (ha gestito report,
  matching specialty, meno carico) richiedono storico denso per generare
  suggerimenti utili. Riprenderemo quando avremo >= 50 interventi reali.
