# Sprint 1a-bis — Modal upgrade decisions

**Data**: 2026-05-13 · **Status**: pacchetto completo definito, in attesa di merge Sprint 1a + test produzione (1-2 giorni)
**Versione**: 2 (aggiunte sezioni D + E dopo seconda iterazione decisioni)

Decisioni concordate con Andrea il 13/5 dopo prima demo del calendario. Lo Sprint 1a viene mergiato così com'è. Questo file conserva il sub-scope di 1a-bis per quando il branch ripartirà.

---

## A) Date picker più comodo — A1 only

**No popover custom** (A2 scartato: duplica il calendario principale).

Implementazione attesa: 5 chip quick-pick sopra l'input `<datetime-local>`:

```
[Oggi 09:00] [Domani 09:00] [+3 giorni] [Lunedì prossimo] [Altra data...]
```

L'ultimo chip "Altra data…" apre l'input `<datetime-local>` nativo come fallback.

Chips proposte (default orario 09:00):
- **Oggi 09:00** — se siamo già oltre le 9:00, scegli +1h dalla now arrotondato a 30'
- **Domani 09:00** — domani alle 9
- **+3 giorni** — oggi+3 alle 9
- **Lunedì prossimo** — il prossimo lunedì alle 9 (skip se oggi è già lunedì → lunedì successivo)
- **Altra data...** — toggle l'input `<datetime-local>` nativo

Stima: ~50 LOC + utility `quickDateChips()` in `src/lib/interventions.js`.

---

## B) Multi-giorno — B1 only

**Solo intervento singolo che dura più giorni** (es. revisione da lunedì a mercoledì = 1 record).

UI: due chip group separati per scheduled_start_at e scheduled_end_at, ognuno con gli stessi quickpick di A1. Validazione: end ≥ start.

**Scartati**:
- B2 (ricorrenza) → Sprint 4 (interventions ricorrenti via `maintenance_plans`)
- B3 (date alternative proposte al fornitore) → Sprint 2 con magic link

Schema: già supportato (`scheduled_start_at` + `scheduled_end_at` esistono in mig 053). Zero migration changes per B1.

---

## C) Assegnazione — C2 con naming `supervised_by`

Schema change in **migration 054**:

```sql
ALTER TABLE public.interventions
  ADD COLUMN supervised_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN supervised_by_name TEXT;
CREATE INDEX idx_interventions_supervised_by
  ON public.interventions(supervised_by) WHERE supervised_by IS NOT NULL;
```

Naming `supervised_by` (non `planner_id`): è il responsabile della pianificazione, segue lo stato, pungola il fornitore, decide rinvii.

### Default smart

- Se `created_by.role === 'admin'` → `supervised_by = created_by` automaticamente
- Picker supervisore **collassato** di default, espande con bottone "Cambia supervisore"
- Picker `assigned_to` (esecutore) **sempre visibile**

### UX dei picker

Stessa logica per entrambi (supervisore + esecutore):
- Sezione "Persone" con chip role-filtered: `Admin · Tecnico · Fornitore`
- Dropdown con search per nome
- Bonus picker esecutore: quando `extra_data.specialty` è scelta, mostra sezione "Fornitori per specialità" che pre-filtra per matching specialty

### Migration 054 down

```sql
DROP INDEX IF EXISTS idx_interventions_supervised_by;
ALTER TABLE public.interventions
  DROP COLUMN IF EXISTS supervised_by_name,
  DROP COLUMN IF EXISTS supervised_by;
```

---

## D) Riuso dati segnalazione — 1d-snapshot + description prefill strutturata

### D1) Foto: variante 1d-snapshot

All'apertura del modal:
- Per ogni item in `report.media`, viene COPIATO in `interventions.media` con flag `{from_report: true, source_report_id: report.id}`
- Da quel momento le foto sono **indipendenti** dal report: resistono a cancellazioni/modifiche/sostituzioni
- La sezione UI è suddivisa in due:
  - **"Foto della segnalazione"** (inline, read-only nel modal — chip mostrati con badge "dal report")
  - **"Foto intervento"** (uploader normale per nuove foto aggiunte direttamente, niente flag)

Solo `report.media` principale viene importato. **No foto della chat del report** (commenti.media): rumore, non valore.

Stima: ~80 LOC nel modal + 0 schema change (media è già JSONB).

### D2) Description prefill strutturata

Il textarea del modal si pre-popola al primo render con:

```
[Intervento per: {report.title}]

{report.description}

---
Note pianificazione:

```

Il cursore va posizionato dopo `Note pianificazione:` (più newline), così l'utente capisce immediatamente cosa è eredità dal report e cosa scrive lui. Editabile completamente.

Stima: ~20 LOC.

---

## E) Utenti enriched — livello A only

**No livello B** (suggerimenti smart): troppo poco storico in ManuTech per generarli utilmente. Si riprenderà a Sprint 6-7 con dati reali.

### Cosa mostrare per ogni utente nel picker

UI: il numero compare nella dropdown del picker, accanto al nome.
Es: `Marco Rossi · Tecnico · 2 attivi · 5 su questa macchina`

| Tipo dato | Visibile per | Query/fonte |
|---|---|---|
| Nome | Tutti | `users.name` |
| Chip ruolo | Tutti | `users.role` (Admin/Tecnico/Fornitore) |
| **N interventi attivi** | Solo Tecnici | `SELECT COUNT(*) FROM interventions WHERE assigned_to = X AND status IN ('pianificato','confermato','in_corso')` |
| **Specialty** + tariffa oraria | Solo Fornitori | `supplier_profiles.specialties` + `supplier_profiles.hourly_rate` |
| **N interventi storici su questa macchina** | Tutti (Admin/Tecnico/Fornitore) | `SELECT COUNT(*) FROM interventions WHERE machine_id = Y AND assigned_to = X AND status = 'completato'` |

### Ottimizzazione query

- Le 2 COUNT vanno fatte una sola volta al mount del modal, non per ogni utente (batch query con GROUP BY assigned_to)
- Risultati cachati in stato locale del modal per la durata della sessione
- Se in futuro la lista utenti diventa > 100, valutare RPC SECURITY DEFINER aggregata

Stima: ~120 LOC nel picker + 2 helper in `db/interventions.js` (`getActiveInterventionsCountByUser`, `getCompletedInterventionsCountByUserMachine`) + 2 query.

### Posizionamento UX

I picker `supervised_by` e `assigned_to` sono entrambi in stile:
```
[Etichetta picker: Supervisore della pianificazione]
[Search input: cerca per nome]
[Lista filtrata:]
  ◯ Marco Rossi      [chip Tecnico]  · 2 attivi · 5 su questa macchina
  ◯ Luigi Bianchi    [chip Admin]    ·             · 3 su questa macchina
  ◯ ElectroService   [chip Fornitore] elettricista · €45/h · 8 su questa macchina
```

Bonus per picker esecutore: se `extra_data.specialty` è valorizzata, riordinare i fornitori per matching specialty in cima.

---

## Scope: β (nuovo branch da master post-merge 1a)

Branch: `claude/calendar-modal-upgrade-...` (suffix da generare al kick-off).

**NON va in Sprint 1a corrente** — Andrea vuole testare in produzione 1-2 giorni prima di partire con i picker, così l'uso reale può rivelare aggiustamenti utili.

**NON va in Sprint 1b** (mobile + notifiche): resta scope separato.

### Pre-requisiti per il kick-off

1. Sprint 1a mergiato in `master`
2. Andrea conferma che ha testato in produzione e che vuole partire (1-2 giorni di osservazione)
3. Eventuali aggiustamenti UX raccolti durante la finestra di osservazione vanno inseriti in plan mode prima di scrivere codice

### Out of scope di 1a-bis

- Mobile calendar (→ Sprint 1b)
- Notifiche estese su intervention_supervised (→ Sprint 1b, aggiungere `intervention_assigned_supervisor`)
- Magic link fornitori (→ Sprint 2)
- View `reports_with_planning` non cambia (supervised_by non influenza planning_state)

---

## Quando ripartire

Andrea darà segnale esplicito dopo i 1-2 giorni di osservazione. Da fare allora:

1. `git checkout master && git pull` per partire fresh
2. Creare branch `claude/calendar-modal-upgrade-XXXXX`
3. Plan mode obbligatorio con questo file in input
4. Migration 054 (forward + down): `supervised_by` + `supervised_by_name`
5. Aggiornare `db/interventions.js`:
   - `createIntervention`/`updateIntervention` scrivono `supervised_by` + `supervised_by_name`
   - Nuovi helper: `getActiveInterventionsCountByUser`, `getCompletedInterventionsCountByUserMachine`
6. Refactor `InterventionRequestModal.jsx` con TUTTO il pacchetto:
   - Chips quick-pick date (A1) sopra `<datetime-local>` fallback, per start E end
   - Default smart su supervised_by (= created_by se admin)
   - Picker `supervised_by` (collassato di default, expand "Cambia supervisore")
   - Picker `assigned_to` (sempre visibile, con sezione "Fornitori per specialty" se valorizzata)
   - Sezione "Foto della segnalazione" inline read-only (1d-snapshot) + sezione "Foto intervento" uploader
   - Description prefill strutturata (D2)
   - Caricamento batch dei contatori al mount
7. Lint + build clean prima di commit + push
8. PR + deploy preview Vercel per smoke test

Stima totale 1a-bis: ~500 LOC distribuite in ~6 file (migration + db + lib + modal + 2 picker enriched).
