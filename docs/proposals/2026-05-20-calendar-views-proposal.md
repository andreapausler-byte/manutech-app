# Proposta tecnica · Viste Calendario Admin (Settimana / Giorno / Agenda / Risorse)

**Data**: 2026-05-20
**Branch**: `claude/calendar-views-proposal-vK7mx` (da `claude/ical-feed-phase-4-proposal-dWwYu`)
**Stato**: Proposta — richiede approvazione prima di scrivere codice
**Tipo**: docs-only (nessun componente, nessun edit a codice applicativo)

---

## 0. Scopo

L'admin calendar (`src/pages/admin/AdminCalendar.jsx`) ha oggi un toggle 5-viste in toolbar — **Mese**, **Settimana**, **Giorno**, **Agenda**, **Risorse** — ma solo Mese è funzionante. Le altre 4 sono dichiarate `enabled: false` (righe 36-42) e mostrano toast *"Vista X disponibile prossimamente"*. Questa proposta scopre le 4 viste e propone sequenza, layout, riuso e costi.

**Non in scope** per questo documento:
- Estensione alle stesse 4 viste sul mobile (`CalendarioMobile.jsx`) — discovery a parte se serve
- Cambiamenti al fetch (`useInterventionsCalendar`) — la stessa hook serve tutte le viste cambiando solo `rangeStart`/`rangeEnd`
- Cambiamenti alla sidebar state machine di AdminCalendar (`hidden/pending/detail/day/create/reschedule`) — resta identica, le nuove viste vivono nello stesso slot centrale

---

## 1. Contesto ricostruito dal repo

### 1.1 Cosa è già stato deciso e fatto

- **State machine sidebar inviolabile** (commento `AdminCalendar.jsx:14`): *"NIENTE modal sopra il calendario. Tutto in sidebar."* — le nuove viste rispetteranno la stessa regola.
- **Vista Mese funzionante**: `CalendarMonthGrid` (`src/components/interventions/CalendarMonthGrid.jsx`) — CSS Grid 7×N, settimana inizia lunedì, indice `byDay[YYYY-MM-DD]`, max 3 pillole per cella + overflow `+N altri`. Riusabilità: `InterventionPill` è già il componente "pillola intervento" condiviso.
- **Sidebar contestuale già implementata** per:
  - `DayContextPanel` — lista interventi di un singolo giorno (essenzialmente è già una vista "Giorno" in formato sidebar)
  - `InterventionDetailPanel` — dettaglio singolo
  - `PendingSuppliersPanel` — lista fornitori in attesa
  - `InterventionRequestSidePanel` — create/reschedule (sidepanel, non modal)
- **Hook `useInterventionsCalendar`** (`src/hooks/useInterventionsCalendar.js`): accetta `rangeStart`/`rangeEnd` arbitrari + filtra scope `all|mine|pending_supplier` + sottoscrive realtime. **Generalizzato già**: ogni nuova vista cambia solo il range, non il dato.
- **Toggle "Mostra annullati"** in toolbar (hotfix calendar #2) — preference utente persistita in localStorage. Le nuove viste devono rispettarlo.

### 1.2 Cosa è aperto

- **ADR-008** `intervention_participants` resta Proposed. La vista **Risorse** è quella che soffre di più: oggi `assigned_to` è singolo (1 tecnico) + `supervised_by` (1 supervisore). Vista Risorse con N partecipanti richiede ADR-008 migrata. **Decisione critica**: implementare Risorse v1 su `assigned_to` solo (semplice, forward-compatible) oppure aspettare.
- **Vincolo orario operativo**: nessuna decisione esplicita sul range orario da mostrare in viste timeline (Settimana/Giorno). Default proposto: 6:00-22:00 (turni industriali tipici). Da confermare.
- **Mobile parity**: non c'è decisione sul fatto che le stesse 4 viste debbano esistere anche su mobile. Discovery 20/5 (CLAUDE.md current focus) parla di "agenda mobile lista settimanale" — è la stessa cosa della vista Agenda desktop? **Apriamo la domanda** in §5.
- **Granularità slot**: i client iCal/calendar usano slot di 30min o 1h. ManuTech interventi tipici durano 1-4h. Default: 1h. Da confermare.

### 1.3 File chiave per le 4 viste

- `src/pages/admin/AdminCalendar.jsx` — host, sostituire `handleView()` toast con switch real
- `src/components/interventions/CalendarMonthGrid.jsx` — pattern per le altre Grid
- `src/components/interventions/InterventionPill.jsx` — riusato in tutte le viste
- `src/components/interventions/DayContextPanel.jsx` — non riusato direttamente ma fornisce template logica giornaliera
- `src/hooks/useInterventionsCalendar.js` — fetch + realtime, già pronto
- `src/pages/mobile/calendar/CalendarioMobile.jsx` — vista mobile mese/settimana/giorno mobile, da consultare per design timeline (se esiste lì già una timeline implementata si può estrarre componente shared)

---

## 2. Le 4 viste, una per una

### 2.1 Vista Agenda

**Cos'è**: lista cronologica degli interventi del periodo (default: prossimi 30 giorni), raggruppati per giorno, ordinati per ora. Niente griglia, niente timeline. Layout simile a "Inbox unificata" o "feed temporale".

**Layout proposto**:
```
[Toolbar AdminCalendar invariata]
┌──────────────────────────────────────────────┐
│ ──── Oggi, Mar 20 Mag ─────────────────── 3  │
│ 09:00 │ Intervento omnia               🟢 ↦  │
│ 14:30 │ Richiesto il supporto da Remoto  🔴 ↦│
│ 18:30 │ Intervento Pulizia             🟣 ↦  │
│                                              │
│ ──── Mer 21 Mag ──────────────────────── 2  │
│ 08:00 │ Prominent: manutenzione filtro  🟢 ↦ │
│ 09:00 │ Sopralluogo formica            🔵 ↦  │
│                                              │
│ ──── Gio 22 Mag ──────────────────────── 0  │
│         (Nessun intervento)                  │
│                                              │
│ ──── Settimana prossima ─────────────────── │
│ Lun 26 Mag │ 09:00 Controllo Antincendio... │
│ ...                                          │
└──────────────────────────────────────────────┘
```

**Range**:
- Default: oggi → +30 giorni
- Toggle/select: "Settimana corrente", "Mese corrente", "Prossimi 3 mesi"
- Picker custom: bypass per tecnici power user

**Click su riga**: apre InterventionDetailPanel nella sidebar (riuso).

**Empty state per giorno**: mostra "Nessun intervento" + bottone inline "Crea per questo giorno" → openCreateForDay(date).

**Stima**: **0.5 giorni**
**Riuso**: 100% del fetch hook, InterventionPill (variante orizzontale)
**Decisioni aperte specifiche**:
- (A) Mostrare anche giorni vuoti come `Mer 22 Mag · (nessuno)` o saltarli del tutto?
- (B) Includere interventi `completato` retroattivi? (es. "Ieri, eseguiti: X, Y") oppure solo futuri?
- (C) Sticky header del giorno mentre scrolli, o solo header inline?

---

### 2.2 Vista Giorno

**Cos'è**: timeline verticale di **un singolo giorno** con orari sulla colonna sinistra e interventi posizionati come "blocchi" proporzionali alla durata.

**Layout proposto**:
```
[Toolbar invariata · titolo "Mar 20 Maggio 2026"]
┌────┬─────────────────────────────────────────┐
│06:00│                                         │
│07:00│                                         │
│08:00│ ┌─────────────────────────────────┐    │
│09:00│ │ 08:00-09:30 Controllo Antinc.  │    │
│10:00│ └─────────────────────────────────┘    │
│11:00│                                         │
│12:00│                                         │
│13:00│                                         │
│14:00│ ┌─────────────────────────────────┐    │
│15:00│ │ 14:30-15:30 Richiesto supporto │    │
│16:00│ └─────────────────────────────────┘    │
│17:00│                                         │
│18:00│ ┌─────────────────────────────────┐    │
│19:00│ │ 18:30-20:00 Intervento Pulizia │    │
│20:00│ └─────────────────────────────────┘    │
│21:00│                                         │
│22:00│                                         │
└────┴─────────────────────────────────────────┘
```

**Range orario default**: 6:00-22:00. Auto-extend se ci sono interventi fuori orario (es. turno notte → estende a 0:00-23:59).

**Posizionamento blocco**: top = `(start_hour - rangeStartHour) * slotHeight`, height = `duration * slotHeight`. Slot height suggerito: 48px per ora (~24px per 30min).

**Click su blocco**: apre InterventionDetailPanel sidebar.
**Click su slot vuoto**: openCreateForDay(date) con prefill ora (es. drag → durata).

**Overlap interventi**: se 2+ interventi si sovrappongono, side-by-side a metà larghezza (pattern Google Calendar). Algoritmo: lane assignment greedy.

**Linea "Ora attuale"**: sottile linea rossa orizzontale che indica "now" sul giorno corrente. Aggiornata ogni minuto via interval.

**Stima**: **1 giorno** (timeline da zero + overlap algorithm)
**Riuso**: useInterventionsCalendar con range giornaliero, sidebar invariata
**Decisioni aperte specifiche**:
- (D) Range orario fisso (6:00-22:00) o configurabile per org (es. `org_settings.calendar_day_start_hour`)?
- (E) Drag per ridimensionare/spostare un intervento dalla vista giorno? Quanto costa = mezza giornata extra.
- (F) Mostrare "ombra" delle manutenzioni programmate del giorno (intervention origin='maintenance_plan') con colore distintivo, o uniforme con il resto?

---

### 2.3 Vista Settimana

**Cos'è**: estensione di Giorno × 7 colonne (lun-dom). Stessa timeline verticale a sinistra, 7 colonne giorno con blocchi.

**Layout proposto**:
```
[Toolbar · "Settimana 18-24 Maggio · W21"]
┌────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│    │  Lun  │  Mar  │  Mer  │  Gio  │  Ven  │  Sab  │  Dom  │
│    │  18   │  19   │  20   │  21   │  22   │  23   │  24   │
├────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│06:00│       │       │       │       │       │       │       │
│07:00│       │       │       │       │       │       │       │
│08:00│       │       │       │       │       │       │       │
│09:00│       │ [Cnt] │       │ [Omn] │       │ [Vrf] │       │
│10:00│       │       │       │       │       │       │       │
│11:00│       │       │       │       │       │       │       │
│12:00│       │       │       │       │       │       │       │
│13:00│       │       │       │       │       │       │       │
│14:00│       │       │ [Sup] │       │       │       │       │
│15:00│       │       │       │       │       │       │       │
│ ...
└────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

**Settimana ISO 8601**: lunedì-domenica. Numero settimana in toolbar (es. `W21`). Coerente con `CalendarMonthGrid` (settimana inizia lunedì).

**Stessa logica di Giorno** ma 7 colonne. Blocco posizionato per `(getDay() + 6) % 7` colonna + same vertical positioning.

**Today highlight**: colonna del giorno corrente leggermente evidenziata (background `rgba(124,106,255,0.04)`).

**Header sticky**: scrolla la timeline ma l'header weekday+date resta visibile.

**Stima**: **1-1.5 giorni** se condivide componente Timeline con Giorno (1 giorno se ben fattorizzato)
**Riuso**: lo stesso componente `<DayTimeline>` viene mappato 7 volte
**Decisioni aperte specifiche**:
- (G) Mostrare anche dom (week-end full) o solo lun-ven? Default proposto: tutta la settimana, ma in ambiente industriale spesso sab/dom sono vuoti — costo zero mostrarli.
- (H) Nei blocchi mostrare solo `[Titolo]` o anche assegnatario? Spazio limitato (≈80-120px wide per colonna).

---

### 2.4 Vista Risorse

**Cos'è**: griglia con **tecnici sulle righe** e **giorni sulle colonne** (default: settimana corrente). Ogni cella mostra gli interventi di quel tecnico in quel giorno.

**Layout proposto**:
```
[Toolbar · "Settimana 18-24 Mag · 5 tecnici"]
┌──────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│              │ Lun  │ Mar  │ Mer  │ Gio  │ Ven  │ Sab  │ Dom  │
│              │ 18   │ 19   │ 20   │ 21   │ 22   │ 23   │ 24   │
├──────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ M. Rossi     │      │ [09] │      │ [09] │      │ [09] │      │
│ TECNICO      │      │ Cnt  │      │ Omn  │      │ Vrf  │      │
├──────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ L. Bianchi   │      │      │ [08] │      │      │      │      │
│ TECNICO      │      │      │ Prom │      │      │      │      │
├──────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ A. Verdi     │      │      │ [14] │      │      │      │      │
│ TECNICO      │      │      │ Sup  │      │      │      │      │
├──────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ — Fornitore  │      │      │      │      │      │      │      │
│ Prominent    │      │ [08] │      │      │      │      │      │
│ FORNITORE    │      │ Mant │      │      │      │      │      │
├──────────────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│ Non assegnati│ [TK45]│      │      │      │      │      │      │
│              │ Cnt  │      │      │      │      │      │      │
└──────────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

**Righe**:
- Una riga per ogni `user` con role IN (`tecnico`, `admin`) della org che ha **almeno 1 intervento** nel periodo (riga "vuota" = non mostrata)
- Una riga "Non assegnati" finale per `assigned_to IS NULL`
- (v2 quando ADR-008 migrato) Una riga per ogni fornitore in `intervention_participants` con `role='fornitore'`

**Carico per tecnico**: badge a destra del nome con `N interventi questa settimana` (es. `M. Rossi · 3`).

**Click su cella con interventi**: openDay(date) MA con sidebar filtrata su quel tecnico — richiede piccola estensione di DayContextPanel con prop `userIdFilter`.

**Click su intervento**: openDetail (sidebar).

**Range**: settimana di default. Toggle "Mese" disponibile ma diventa molto largo (28-31 colonne) → non default.

**Stima**: **1.5-2 giorni** (componente nuovo, no riuso diretto da Giorno/Settimana)
**Riuso**: hook fetch + InterventionPill (variante mini)
**Decisioni aperte specifiche**:
- (I) **Forward-compatible con ADR-008?** v1 implementata su `assigned_to` solo è semplice, ma quando `intervention_participants` arriverà devo riscrivere le righe (oggi 1 intervento = 1 riga assignee; domani 1 intervento = N righe partecipanti). Trade-off: implementare ora con interface preparata (`getRowsForIntervention(intv): user[]`) lo rende drop-in replacement.
- (J) Tecnici "sempre visibili" (anche zero interventi) o "solo quelli con interventi nel periodo"? Default proposto: solo con interventi (riduce rumore).
- (K) Ordinare tecnici per carico (più impegnati in alto) o alfabetico? Per pianificazione admin, **carico decrescente** ha più senso.

---

## 3. Sequenza di implementazione raccomandata

| Step | Vista | Stima | Razionale ordine |
|---|---|---|---|
| **1** | Agenda | 0.5 gg | Massimo valore / costo. Sblocca subito un caso d'uso (lista cronologica leggibile). |
| **2** | Giorno | 1 gg | Costruisce il componente `<DayTimeline>` che la Settimana riusa. |
| **3** | Settimana | 0.5-1 gg | Riusa Timeline × 7. Marginal cost basso una volta fatto step 2. |
| **4** | Risorse | 1.5-2 gg | Più costosa, più "manageriale", meno usata. Last. |
| **Totale** | — | **3.5-4.5 gg** | Sequenza ottimizza per riuso e priorità valore. |

**Alternativa "MVP rapido"**: solo step 1+2 = 1.5 gg → sblocca subito il caso d'uso senza il costo di Settimana/Risorse. Settimana è la più "wanted" dai pattern calendari business, ma Agenda copre lo stesso bisogno operativo ("cosa farò dopo").

---

## 4. Decisioni trasversali

### 4.1 Range orario timeline (Giorno + Settimana + Risorse-mese-mode)

**Raccomandazione**: 6:00-22:00 hardcoded. Auto-extend a 0:00-23:59 se uno o più interventi sono fuori (interventi notturni rari ma esistono).

**Alternativa scartata**: setting per org. Aggiunge complessità senza beneficio osservabile sul target attuale (1 org pilota, tutti turni diurni standard).

### 4.2 Slot height + granularità

**Raccomandazione**: 1h = 48px (12px per 15min). Snap visivo a 15min. Mostra label oraria ogni ora.

### 4.3 Realtime updates

Le 4 viste usano lo stesso hook `useInterventionsCalendar` che già sottoscrive realtime su `interventions`. Quando arriva un INSERT/UPDATE/DELETE l'evento riarriva e re-render della vista corrente. **Zero lavoro extra**.

### 4.4 Mobile parity

**Raccomandazione**: queste 4 viste sono **desktop only** in v1.

**Razionale**: il mobile calendar (`CalendarioMobile.jsx`) ha già mese/settimana/giorno (vista calendario classica) + agenda è il next-step nella discovery 20/5 (CLAUDE.md current focus). Mantenere mobile semplice ≠ desktop richiede meno riuso e meno "complicazione cross-target". Quando le viste desktop saranno stabili, valuteremo se estrarre componenti shared per mobile.

### 4.5 Filtri condivisi

Tutte e 4 le viste rispettano:
- Toggle "Mostra annullati" (hotfix calendar #2)
- Scope intrinseco `scope='all'` (admin vede tutti)
- Tutti i filtri futuri (es. per execution_mode quando ADR-008 migrato)

### 4.6 Performance budget

Stima carico worst-case:
- Settimana = 7 giorni × ~5 interventi/giorno = ~35 blocchi → trascurabile
- Mese = 30 × 5 = ~150 → già funzionante con `CalendarMonthGrid`
- Risorse settimana = 5 tecnici × 7 giorni × ~1 intervento = ~35 celle non vuote → trascurabile

Nessuna preoccupazione di rendering. Se in futuro esplodono (org grandi con 50+ tecnici), valuteremo virtualizzazione.

---

## 5. Domande dove preferisco che decida tu prima di procedere

### 5.A. Scope sprint

**Decisione critica**: quanto implementiamo nello sprint? Tre opzioni:

- **(i) Solo Agenda** (0.5 gg) — quick win, sblocca subito il caso d'uso "lista cronologica" simile al bisogno "Agenda mobile" della FASE 3 roadmap
- **(ii) Agenda + Giorno** (1.5 gg) — MVP solido, prepara terreno per Settimana
- **(iii) Agenda + Giorno + Settimana** (2.5-3 gg) — copre 3 viste "calendar standard", lascia Risorse a parte
- **(iv) Tutte e 4** (3.5-4.5 gg) — sprint dedicato completo

Mia preferenza: **(iii)**. Risorse è la più costosa e la meno utilizzata in giornata operativa. Le altre 3 sono coerenti e si testano insieme. **Confermi o preferisci diverso?**

### 5.B. Risorse: implementare ora su `assigned_to` o aspettare ADR-008?

Se vai per opzione (iv), Risorse oggi può essere implementata su `assigned_to` solo (1 tecnico per intervento). Quando ADR-008 (`intervention_participants`) sarà migrato, ogni intervento sarà visibile su N righe (lead + supporto + fornitore + operatore_linea). **Domande**:

- (a) Implementiamo ora come "v1 su assigned_to" sapendo che sarà rewritten quando ADR-008 atterra in produzione?
- (b) Rimandiamo Risorse a post-ADR-008?
- (c) Implementiamo ora con interface forward-compatible (`getParticipantRows(intv): user[]` che oggi ritorna `[intv.assigned_to]` e domani ritornerà tutti i partecipanti)?

Mia preferenza: **(c)**. Costo marginale ~30min, evita rewrite.

### 5.C. Range orario configurabile per org?

In §4.1 raccomando 6:00-22:00 hardcoded. Se hai org con turni notturni o orari atipici (es. caseificio che inizia alle 4:00), conviene aggiungere `org_settings.calendar_day_start_hour` / `calendar_day_end_hour` ora?

Mia preferenza: **no, hardcoded**. Aggiungiamo setting solo se emerge il bisogno reale. Anti-pattern CLAUDE.md: "Don't design for hypothetical future requirements".

### 5.D. Allineamento con sprint iCal Feed

Il branch parent è `claude/ical-feed-phase-4-proposal-dWwYu`. Le calendar views e l'iCal feed sono **complementari ma indipendenti**: si possono mergiare in qualsiasi ordine. Conferma che procedere con calendar views prima/durante iCal va bene.

---

## 6. Anti-pattern vincolanti per l'implementazione

- **NO** modal sopra il calendario centrale. Tutte le interazioni passano da sidebar (riga 14 di AdminCalendar.jsx).
- **NO** componenti nuovi che duplicano logica di `CalendarMonthGrid` o `useInterventionsCalendar`. Si **estraggono** helper se necessario (es. `buildDayMatrix`, `buildWeekMatrix`).
- **NO** file CSS per le nuove viste. Tailwind inline + `var(--color-*)`.
- **NO** state separato per le 4 viste oltre a `view` corrente. Le decisioni utente (range, filtri) sono nei loro store esistenti o derivate.
- **NO** drag&drop in v1 (D in §2.2 → fuori scope salvo richiesta esplicita).
- **NO** modifica a `useInterventionsCalendar` se non necessaria. Se serve allargare range arbitrariamente l'hook lo supporta già.
- **SÌ** ogni vista deve rispettare `effectiveShowCancelled` (toggle "Mostra annullati").
- **SÌ** ogni click su intervento → openDetail (sidebar). Pattern coerente con vista Mese.
- **SÌ** ogni vista deve avere uno stato "loading" minimo + uno stato empty esplicito.

---

## 7. Implementation outline (per orientamento, non scope)

File nuovi previsti se vai full-scope:

```
src/components/interventions/
  AgendaView.jsx           # vista 2.1, ~150 righe
  DayTimeline.jsx          # componente shared timeline, ~200 righe
  DayView.jsx              # vista 2.2, ~80 righe (usa DayTimeline)
  WeekView.jsx             # vista 2.3, ~120 righe (usa DayTimeline × 7)
  ResourcesGrid.jsx        # vista 2.4, ~250 righe
  calendarMath.js          # helpers: buildDayMatrix, getISOWeek, etc.
```

File modificati:

```
src/pages/admin/AdminCalendar.jsx
  - VIEWS array: enabled: true per tutti
  - body switch su `view` → render del componente corretto
  - rangeStart/rangeEnd diventano dinamici per vista
  ~30 righe modificate
```

Test manuale obbligatorio:
- 3 viste su dataset reale (org pilota)
- Realtime update mentre vista è aperta (crea intervento da altra finestra)
- Toggle "Mostra annullati" su ogni vista
- Click intervento → sidebar detail aperta
- Click cella vuota → create flow
- Cambio mese/settimana/giorno via toolbar prev/next/oggi

---

## 8. Sequenza approvazione

1. Tu leggi questa proposta
2. Rispondi alle 4 domande di §5
3. Decidi scope (i/ii/iii/iv)
4. Approvi o richiedi revisione
5. Apro PR di implementazione (1 PR per vista o 1 PR totale a tua scelta)

Nessun codice applicativo viene scritto prima del go.

---

## 9. Riferimenti

- `src/pages/admin/AdminCalendar.jsx` — host attuale, righe 36-42 (VIEWS array stub)
- `src/components/interventions/CalendarMonthGrid.jsx` — pattern Grid riusabile
- `src/components/interventions/InterventionPill.jsx` — pillola condivisa
- `src/components/interventions/DayContextPanel.jsx` — template logica giornaliera
- `src/hooks/useInterventionsCalendar.js` — fetch + realtime, già pronto per range arbitrari
- `docs/decisions/ADR-008-interventions-v2-data-model.md` — schema δ partecipanti (Proposed)
- `docs/proposals/2026-05-20-ical-feed-proposal.md` — proposta complementare (iCal feed)
- ROADMAP.md FASE 3 — Agenda tecnico mobile (caso d'uso simile per mobile, sequenziale post-Interventi v2)
