# Sprint 1c-bis — Frizione #4: Calendar Navigation (BRIEF VERIFICATO)

**Stato**: piano in attesa, NON aprire feature branch prima del 17-18/5 (vincolo `OBSERVATIONS_1C.md:218`).
**Verifica codebase**: 2026-05-14, branch `claude/calendar-next-steps-KVIST`.
**Autore brief originale**: utente.
**Verifica read-only**: questo doc — sostituisce assunzioni con nomi reali estratti dal codice attuale.

---

## ⚠️ Cambio strutturale rispetto al brief originale

Il brief originale assumeva navigazione URL-based via `react-router-dom` (`useNavigate`, `useLocation`, `useSearchParams`, URL `/admin/calendar?month=...`, `/admin/reports/:id`).

**Realtà ManuTech**: `react-router-dom@7.13.1` è in `package.json` ma **non è effettivamente usato per routing app**. `src/App.jsx` parsea `window.location.pathname` con regex (solo per `/guest/:id/:token`, `/invite/:token`, `/design-preview`, `/reports/:id`). Tutto il resto è state-based:

- `V6App` mantiene `route = { name, ...params }` con `setRoute` locale.
- Pagine admin ricevono `onNavigate(name, params)` come prop callback.
- Non esistono path come `/admin/calendar` o `/admin/reports/:id` — solo `route.name === 'calendar'` / `route.name === 'reports'` interni a `V6App`.

**Conseguenza**: tutto l'approccio "URL params vs router state" del brief originale **non si applica**. Si usa il pattern V6App esistente: parametri di arrivo passati come props alla pagina target tramite il `route` object di V6App.

---

## Obiettivo (invariato)

1. Card intervento nel `InterventionsForReport` (dentro `ReportDetailModal`) → naviga al calendario admin sul mese di `scheduled_start_at`, apre il `DayContextPanel` sulla cella, evidenzia la pillola dell'intervento target.
2. Simmetria: dal `DayContextPanel` → click su un intervento → apre il report associato (NON l'intervention detail, che è il comportamento attuale). **Vedi BLOCKER #1 sotto** — questa simmetria è un breaking change rispetto al flow corrente.

**Stima rivista**: ~120-150 LOC (più di 80 perché bisogna threadare `onNavigate` attraverso `AdminReports`, `AdminMachines`, `TechnicianDetailSheet` → `ReportDetailModal` → `InterventionsForReport`).

---

## Verifica 6 punti del brief

### 1. Pattern auth

**File**: `src/contexts/AuthContext.jsx`
**Import**: `import { useAuth } from '../../contexts/AuthContext'` (path relativo — `CLAUDE.md` proibisce alias `@/`).
**Hook**: `useAuth()` ritorna `{ user, loading, login, acceptInvite, signupOrganization, logout, refreshProfile }`.
**Ruolo**: `user.role` — valori da `src/lib/constants.js`: `operatore`, `tecnico`, `admin`. **Non esiste `manager`**. Esiste anche `super_admin` ma viene redirezionato fuori da V6App in `App.jsx:59`.

**Check `isNavigable`**: `user?.role === 'admin'`. Punto.

### 2. AdminCalendar.jsx — setter reali

**File**: `src/pages/admin/AdminCalendar.jsx`
**Componente**: `export default function AdminCalendar({ onNavigate })` (riceve già `onNavigate` da V6App.jsx:165).
**Setter reali**:

| Brief originale | Reale | Riga |
|---|---|---|
| `setActiveMonth` | `setCurrentMonth` | `AdminCalendar.jsx:47` |
| `setShowCancelled` | `setShowCancelled` ✅ | `AdminCalendar.jsx:53` |
| `setSelectedDay` | `setSidebar({ mode: 'day', date })` via `openDay(date)` | `AdminCalendar.jsx:105` |

**State sidebar**: state machine `sidebar = { mode, ...payload }` con modes `hidden/pending/detail/day/create/reschedule`. Per aprire un giorno: `setSidebar({ mode: 'day', date })`. Per evidenziare un intervento sulla griglia: la prop esiste già — `CalendarMonthGrid` accetta `selectedInterventionId` (`AdminCalendar.jsx:303`).

**Highlight della pillola sulla griglia**: già implementato come `highlightedInterventionId = sidebar.mode === 'detail' ? sidebar.interventionId : null` (`AdminCalendar.jsx:128`). Per Frizione #4 va esteso: anche in `mode === 'day'` con highlight target arrivante.

**Persistenza `showCancelled`**: localStorage `manutech_calendar_show_cancelled`. Se forziamo a `true` per un intervento `annullato` in arrivo, dobbiamo **NON sovrascrivere la preference utente**: usare un flag effimero parallelo (es. `forceShowCancelledOnce`) che non passa da localStorage.

### 3. date-fns

**package.json**: `"date-fns": "^4.1.0"` ✅ presente.
**Convenzione ManuTech**: `formatDate()` e `timeAgo()` da `src/lib/constants.js:210` (definizioni native, no date-fns). `date-fns` è usato sporadicamente in feature recenti (interventions).

**Per Frizione #4**: non servono import di date-fns. Tutto si fa con `Date` nativo:
- mese target: `intervention.scheduled_start_at → new Date(...)` → si passa la Date a V6App `route.calendarInitialMonth`.
- giorno target: stessa Date → V6App `route.calendarOpenDay`.
- highlight id: stringa UUID → V6App `route.calendarHighlightInterventionId`.

### 4. Classi themed

**Brief originale**: `bg-surface`, `border-themed`, `text-themed-muted`, `hover:bg-surface-hover`, `border-accent`, `ring-accent`.
**Realtà ManuTech**: **non esistono** queste utility class. Il design system usa CSS vars inline:
- `style={{ background: 'var(--color-surface-1)' }}` (oppure `surface-2`, `bg`, `app-bg`)
- `style={{ border: '1px solid var(--color-border)' }}`
- `style={{ color: 'var(--color-text)' / 'var(--color-text-secondary)' / 'var(--color-text-muted)' }}`
- `style={{ background: 'var(--color-primary)' }}` per accent
- Effetto press: `className="press-scale"`

**Mappatura 1:1 per Frizione #4** (clickable card):

```jsx
style={{
  cursor: isNavigable ? 'pointer' : 'default',
  // ... resto degli stili esistenti di InterventionCard
}}
className="press-scale"
```

Niente hover-bg dinamico via classe: il pattern ManuTech è `press-scale` (transform: scale al tap) + opzionalmente bordo che cambia su `:hover` via inline style + onMouseEnter, ma raramente usato. **Non aggiungere CSS in `index.css`** — il pattern `animate-highlight-pulse` del brief originale può essere replicato inline con `style={{ animation: '...' }}` ma vedi punto 6 sotto: l'highlight via `selectedInterventionId` esiste già nella griglia.

### 5. Route report

**Path `/admin/reports/:id`**: **non esiste**.
**Pattern reale**: `onNavigate('reports', { reportId })`. V6App legge `route.reportId` e lo passa come `initialReportId` ad `AdminReports` (`V6App.jsx:164`). `AdminReports.jsx:132` apre automaticamente il `ReportDetailModal` su quel report.

`AdminCalendar` già implementa questo pattern in `handleOpenReport`:
```js
const handleOpenReport = (reportId) => {
  if (onNavigate) onNavigate('reports', { reportId })
}
```
(`AdminCalendar.jsx:112-114`).

### 6. DayContextPanel — props reali

**File**: `src/components/interventions/DayContextPanel.jsx`
**Props attuali**: `{ date, monthInterventions, onClose, onSelectIntervention, onCreateForDay, onMatchIntervention }`. **Non `interventions`** — è `monthInterventions` (il pannello filtra internamente con `dayInterventions`).

**Card list interna**: `DayInterventionRow` (componente locale nello stesso file) wrappa `InterventionCard` e aggiunge un bottone "Abbina" laterale. La card stessa fa `onClick={onOpen}` → `onSelectIntervention(intv.id)` → in `AdminCalendar` apre `mode: 'detail'`.

**Per la simmetria del brief** (DayContextPanel pillola → report): la card chiama già `onSelectIntervention` per aprire il detail. Per Frizione #4 ci sono **due opzioni** (BLOCKER #1 sotto).

---

## BLOCKER #1 — Semantica click in DayContextPanel

Il brief originale dice:
> Simmetria: implementata. DayContextPanel → click pillola → /admin/reports/:report_id

Ma il comportamento attuale del click sulla card in `DayContextPanel` è:
> click card → `onSelectIntervention(id)` → AdminCalendar `openDetail` → sidebar passa a mode `detail` (`InterventionDetailPanel`)

E `InterventionDetailPanel` ha già un bottone "Apri report" che porta al report associato (via `onOpenReport` → `handleOpenReport` → `onNavigate('reports', { reportId })`). Cambiare il click della card per fare "jump al report" **rompe il flow esistente**: come fa l'admin a vedere il detail dell'intervento?

**Sotto-decisioni da chiudere prima dell'implementazione**:

- **A**: card click invariato (apre detail). Aggiungere un secondo bottone laterale tipo "Abbina" ma con icona `ArrowUpRight` → "Apri report". Mantiene il flow attuale + aggiunge shortcut.
- **B**: card click → apre report (breaking). Sposta "apri intervention detail" su un secondo bottone laterale. Rompe muscle memory chi usa già il flow.
- **C**: card click → apre detail se l'intervento ha N>1 report linkati (resolves_report=true), apre direttamente il report se N=1. Smart ma poco prevedibile.

**Raccomandazione**: **opzione A**. Aggiunge senza rompere. Il flow `DayContextPanel → InterventionDetailPanel → onOpenReport` rimane (e in `InterventionDetailPanel` c'è già la lista dei report linkati per casi N>1).

**Conseguenza per InterventionDetailPanel**: per intervento con N>1 report linkati, il bottone laterale "Apri report" sulla card di `DayContextPanel` è ambiguo (quale report?). Forse l'opzione A va limitata a intervento con esattamente 1 report linkato; per N>1 niente bottone (l'admin passa per detail). Da chiudere.

---

## BLOCKER #2 — Propagazione `onNavigate`

Per fare partire la navigazione "calendar → report" dalla card in `InterventionsForReport`, serve threadare `onNavigate` attraverso 3-4 strati:

```
V6App (ha navigate) → AdminReports (NON riceve onNavigate) → ReportDetailModal (NON riceve onNavigate) → InterventionsForReport (NON riceve)
```

E lo stesso da `AdminMachines` (che apre `ReportDetailModal` in `AdminMachines.jsx:865`) e da `TechnicianDetailSheet` (`TechnicianDetailSheet.jsx:336`).

**Modifiche minime**:

1. `V6App.jsx:164` → passare `onNavigate` ad `AdminReports`:
   ```jsx
   {route.name === 'reports' && <AdminReports
     initialReportId={initialReportId || route.reportId}
     onNavigate={navigate}
   />}
   ```
2. `AdminReports.jsx:36` → accettare `onNavigate` nei prop e passarlo a `ReportDetailModal`.
3. `ReportDetailModal.jsx:29` → accettare `onNavigate` e passarlo a `InterventionsForReport`.
4. `InterventionsForReport.jsx:21` → accettare `onNavigate` (o un callback più specifico tipo `onCardClick`).
5. **Idem per `AdminMachines.jsx`** (riceve già `onOpenAssistant` da V6App; va aggiunto `onNavigate`).
6. **Idem per `TechnicianDetailSheet.jsx`** — verificare se è invocato con `onNavigate` disponibile (sotto AdminTechnicians che riceve solo prop da V6App).

**Alternativa più pulita**: V6App esporta un Context `<NavigateContext.Provider value={navigate}>` e ogni componente nidificato fa `useContext(NavigateContext)`. Aggiunge 1 file (`src/contexts/NavigateContext.jsx`) ma evita threading di 5 file e blinda il pattern per il futuro.

**Raccomandazione**: **Context**. ManuTech usa già Context per Auth e Theme — pattern coerente. Si chiamerà `V6NavigateContext` per chiarezza (è specifico del V6App admin layout, non funziona in MobileLayout).

---

## BLOCKER #3 — Operatore/tecnico vedono mai `InterventionsForReport`?

Il brief originale prevede:
> Mobile/operatore: card non-cliccabile per ruolo operatore/tecnico. Nessuna freccia, nessun handler.

**Verifica**: grep di `InterventionsForReport` mostra che è importato SOLO da `ReportDetailModal.jsx`, che a sua volta è usato SOLO in pagine admin (`AdminReports`, `AdminMachines`, `TechnicianDetailSheet`). Tutti dentro `V6App` (ramo `user.role === 'admin'`).

**Operatore** → `OperatorApp`. **Tecnico (+ ruoli non-admin)** → `MobileLayout`. Nessuno dei due monta `ReportDetailModal`.

**Conclusione**: la sotto-decisione "mobile/operatore non-clickable" è **N/A**. Il componente non viene mai renderizzato per ruoli non-admin. Il check `isNavigable = user?.role === 'admin'` resta utile come **guard difensiva** ma non è una vera decisione UX. Va comunque inserito per blindare futuri usi del componente.

---

## File 1/N — NUOVO: `src/contexts/V6NavigateContext.jsx`

```jsx
import { createContext, useContext } from 'react'

// Context per la navigazione interna al V6App (state-based, non URL).
// Pattern: navigate(routeName, params) — params confluiscono in route.{...}.
const V6NavigateContext = createContext(null)

export const V6NavigateProvider = V6NavigateContext.Provider

// eslint-disable-next-line react-refresh/only-export-components
export function useV6Navigate() {
  // Ritorna noop fuori da V6App, così i componenti shared (es. ReportDetailModal
  // se mai usato altrove) non crashano. Coerente con pattern useAuth che throw,
  // qui no perché il navigate è opzionale per definizione.
  return useContext(V6NavigateContext) || (() => {})
}
```

## File 2/N — MODIFICA: `src/pages/manutech-v6/V6App.jsx`

Aggiungere `V6NavigateProvider` wrapping interno + estendere `route` per i parametri calendario, e passarli ad `AdminCalendar`:

```jsx
// import
import { V6NavigateProvider } from '../../contexts/V6NavigateContext'

// dentro V6App, sotto <Shell> e dentro <AdminPageFrame>:
<V6NavigateProvider value={navigate}>
  {/* ... routes esistenti ... */}
  {route.name === 'calendar' && <AdminCalendar
    onNavigate={navigate}
    initialMonth={route.calendarInitialMonth || null}
    initialOpenDay={route.calendarOpenDay || null}
    initialHighlightInterventionId={route.calendarHighlightInterventionId || null}
    forceShowCancelledOnce={Boolean(route.calendarForceShowCancelled)}
  />}
</V6NavigateProvider>
```

## File 3/N — MODIFICA: `src/pages/admin/AdminCalendar.jsx`

Accettare i nuovi prop + hydration al mount:

```jsx
export default function AdminCalendar({
  onNavigate,
  initialMonth,
  initialOpenDay,
  initialHighlightInterventionId,
  forceShowCancelledOnce,
}) {
  // ...
  const [currentMonth, setCurrentMonth] = useState(() => initialMonth || new Date())
  // ...
  const [arrivedHighlightId, setArrivedHighlightId] = useState(initialHighlightInterventionId || null)

  // Hydration una sola volta al mount: forza showCancelled se richiesto,
  // apre sidebar in mode 'day' se openDay passato. Non persiste a localStorage.
  const didHydrateRef = useRef(false)
  useEffect(() => {
    if (didHydrateRef.current) return
    didHydrateRef.current = true
    if (forceShowCancelledOnce) setShowCancelled(true)
    if (initialOpenDay) setSidebar({ mode: 'day', date: initialOpenDay })
  }, [forceShowCancelledOnce, initialOpenDay])

  // Estendi l'highlight della griglia: se in detail, l'id detail;
  // altrimenti se in day mode e c'è un highlight in arrivo, mostra quello.
  const highlightedInterventionId =
    sidebar.mode === 'detail' ? sidebar.interventionId :
    sidebar.mode === 'day' ? arrivedHighlightId :
    null
}
```

**Nota**: `showCancelled` ha già il proprio effect che persiste a localStorage; forzandolo a `true` da hydration, il prossimo render persiste. Per **non persistere il forzato**, soluzione: estrarre uno state effimero `showCancelledOverride` e calcolare `effectiveShowCancelled = showCancelledOverride ?? showCancelled` (override usato solo se non null). Da chiudere come sotto-decisione (semplice vs corretto).

## File 4/N — MODIFICA: `src/components/interventions/InterventionsForReport.jsx`

```jsx
import { useV6Navigate } from '../../contexts/V6NavigateContext'
import { useAuth } from '../../contexts/AuthContext'

export default function InterventionsForReport({ report, user, onOpenIntervention }) {
  const navigate = useV6Navigate()
  const { user: authUser } = useAuth()  // o usa il prop `user` se già fornisce role
  const isNavigable = (user?.role || authUser?.role) === 'admin'

  const handleCardClick = (intv) => {
    if (isNavigable && intv.scheduled_start_at) {
      navigate('calendar', {
        calendarInitialMonth: new Date(intv.scheduled_start_at),
        calendarOpenDay: new Date(intv.scheduled_start_at),
        calendarHighlightInterventionId: intv.id,
        calendarForceShowCancelled: intv.status === 'annullato',
      })
    } else {
      onOpenIntervention?.(intv.id)
    }
  }

  // ... resto invariato, ma sostituisci onClick delle InterventionCard:
  // onClick={() => handleCardClick(intv)}
}
```

**Nota**: la `InterventionCard` mostra già `<ChevronRight>` quando ha `onClick` (`InterventionCard.jsx:68-70`). Non serve aggiungere `ArrowUpRight`. Il ChevronRight diventa semanticamente coerente (= "vai a"). Se vogliamo distinguere visivamente "vai al calendario" da "apri detail", possiamo passare un prop `icon` opzionale a `InterventionCard` — sotto-decisione bassa priorità.

## File 5/N — MODIFICA: `src/components/interventions/DayContextPanel.jsx`

Per simmetria opzione A (BLOCKER #1): aggiungere un terzo bottone laterale sulla card "Apri report" accanto a "Abbina". Solo se l'intervento ha **esattamente 1 report linkato risolutivo**.

```jsx
// DayInterventionRow — aggiungi prop:
function DayInterventionRow({ intervention, onOpen, onMatch, onOpenReport }) {
  // Calcola se l'intervento ha esattamente 1 report linkato
  const linkedReports = intervention.linked_reports || []  // verifica struttura reale del payload
  const singleReportId = linkedReports.length === 1 ? linkedReports[0].report_id : null

  return (
    <div style={{ position: 'relative' }}>
      <InterventionCard intervention={intervention} compact onClick={onOpen} />
      {/* Abbina (esistente) */}
      <button onClick={(e) => { e.stopPropagation(); onMatch?.() }} ...>Abbina</button>
      {/* Nuovo: Apri report (solo se N=1) */}
      {singleReportId && (
        <button onClick={(e) => { e.stopPropagation(); onOpenReport?.(singleReportId) }}
          aria-label="Apri segnalazione collegata"
          title="Apri segnalazione collegata"
          style={{ /* simile al pattern di Abbina, posizionato sotto */ }}
        >
          <ArrowUpRight size={10} /> Apri report
        </button>
      )}
    </div>
  )
}
```

**Verifica obbligatoria prima di scrivere**: la struttura del payload `intervention` in `monthInterventions` (da `useInterventionsCalendar`). Se non contiene `linked_reports`, c'è da estendere la query / fetch. **Vedi BLOCKER #4 sotto.**

## File 6/N — MODIFICA: `src/pages/admin/reports/ReportDetailModal.jsx`

Linea 353 attuale:
```jsx
<InterventionsForReport report={selected} user={user} />
```

Nessuna modifica strettamente necessaria — `InterventionsForReport` legge `useV6Navigate()` direttamente. **Però** se `ReportDetailModal` è invocato da contesti non-V6 in futuro (improbabile per ora), `useV6Navigate` ritorna noop e il click non fa nulla. Comportamento accettabile.

---

## BLOCKER #4 — Struttura payload `intervention` in calendario

Il punto sopra (BLOCKER #1 opzione A) richiede che `intervention` esposto da `useInterventionsCalendar` contenga la lista dei report linkati. Da verificare in `src/hooks/useInterventionsCalendar.js` e `src/lib/db/interventions.js`. **Non verificato in questa fase** — richiede lettura ulteriore prima di implementare il file 5/N.

Azione consigliata al kick-off 1c-bis: prima leggere `useInterventionsCalendar.js` + `db.getInterventionsForCalendar()` (o equivalente) per capire se serve estendere il join con `intervention_reports`.

---

## Checklist integrazione (rivista)

- [x] Pattern auth verificato (`useAuth` da `contexts/AuthContext`, `user.role`, no `manager`)
- [x] Setter `AdminCalendar` verificati (`setCurrentMonth`, `setShowCancelled`, `setSidebar` via `openDay`)
- [x] `date-fns` presente — ma non necessario per Frizione #4 (Date nativo basta)
- [x] Classi themed rimappate su CSS vars inline (no `bg-surface` etc.)
- [x] Route `/admin/reports/:id` → `onNavigate('reports', { reportId })`
- [x] Prop reale in DayContextPanel è `monthInterventions`, non `interventions`
- [ ] **Decidere BLOCKER #1**: simmetria opzione A/B/C (raccomandato A)
- [ ] **Decidere BLOCKER #2**: threading prop vs Context (raccomandato Context)
- [ ] **Decidere BLOCKER #3**: guard `isNavigable` resta come safety even if N/A oggi (raccomandato sì)
- [ ] **Decidere BLOCKER #4**: estendere il payload calendario con `linked_reports` (da verificare codice prima)
- [ ] **Decidere sotto-decisione `showCancelled` ephemeral**: override state separato vs accettare persist (raccomandato override, è 5 righe)
- [ ] Test edge case annullato: arrivo da card status `annullato` → `forceShowCancelled` ON → pillola visibile sulla cella di destinazione
- [ ] Test arrivo + scroll/highlight: la pillola nella griglia mese si evidenzia visibilmente quando `selectedInterventionId` matcha (verificare `InterventionPill` border/glow esistente — ora `border` solo se `active`)
- [ ] Aggiornare `CLAUDE.md` "Current focus" prima del kick-off
- [ ] Loggare chiusura Frizione #4 in `OBSERVATIONS_1C.md`

---

## Stima rivista

**~120-180 LOC** (vs 80 originale), distribuiti su:

- `V6NavigateContext.jsx` — 12 LOC
- `V6App.jsx` — 8 LOC (provider + extra props a AdminCalendar)
- `AdminCalendar.jsx` — 20 LOC (4 nuovi prop + hydration effect + showCancelled override)
- `InterventionsForReport.jsx` — 18 LOC (auth + navigate + handleCardClick)
- `DayContextPanel.jsx` — 25 LOC (opt-A: 3° bottone "Apri report" condizionale)
- `ReportDetailModal.jsx` — 0 LOC (no-op grazie a Context)
- `useInterventionsCalendar.js` / `db/interventions.js` — TBD se BLOCKER #4 richiede join

Niente migration, niente DB change. Build deve passare, lint pulito.

---

## Vincolo procedurale (invariato)

Da `OBSERVATIONS_1C.md:218`: non aprire il branch `feature/calendar-detail-navigation` prima del **17-18/5** (3-4 giorni di osservazione post-deploy 1c del 14/5), salvo chiamata diversa.

Al kick-off, partire da questo doc verificato + chiudere i 5 punti di decisione aperti sopra.

---

## Blocker #4 — Validazione (2026-05-14, mini read-only)

Validazione richiesta su tre fronti: schema relazione, hook calendario, sanity check produzione.

### 1. Schema relazione intervention ↔ reports

**Fonte**: `supabase/migrations/053_create_interventions.sql` (definizione tabella), `supabase/migrations/055_intervention_reports.sql` (relazione N→M, applicata in produzione il 14/5).

**Cardinalità reale supportata dallo schema dopo mig 055**:

- **FK diretta `interventions.report_id`**: **rimossa**. La mig 055 fa `ALTER TABLE public.interventions DROP COLUMN IF EXISTS report_id` (riga 167). Non esiste più.
- **Junction table `intervention_reports`** (definita in mig 055 righe 42-52):
  ```sql
  CREATE TABLE public.intervention_reports (
    intervention_id   UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
    report_id         UUID NOT NULL REFERENCES reports(id)       ON DELETE CASCADE,
    is_origin         BOOLEAN NOT NULL DEFAULT false,
    resolves_report   BOOLEAN NOT NULL DEFAULT true,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    added_by_name     TEXT,
    org_id            TEXT NOT NULL,
    PRIMARY KEY (intervention_id, report_id)
  );
  ```
- **Cardinalità**: **N↔M piena**. Un intervento può legare 0..N report. Un report può essere legato a 0..N interventi. Vincolo unico: `is_origin=true` può essere true per al massimo 1 link per intervento (unique partial index `uniq_intervention_origin`, mig 055 riga 69-71). Niente vincolo equivalente sul lato report.
- **`resolves_report`** discrimina link **risolutivi** (default true, auto-close al completamento) da link **di contesto** (false, intervento associato per consultazione).

**Conseguenza per BLOCKER #1 opt-A**: l'assunzione "un intervento ha 1 solo report linkato risolutivo" che giustificherebbe il bottone "Apri report" come scorciatoia è **strutturalmente non garantita**. Lo schema permette N>1 risolutivi senza limite. Il filtro per N=1 va calcolato runtime, non assunto.

### 2. Hook `useInterventionsCalendar` — payload attuale

**Fonte**: `src/hooks/useInterventionsCalendar.js` + `src/lib/db/interventions.js:294-329` (`db.getInterventionsCalendar`).

**Query attuale** (riga 299):
```js
supabase.from('interventions').select('*')
  .gte('scheduled_start_at', startISO)
  .lte('scheduled_start_at', endISO)
  .order('scheduled_start_at', { ascending: true })
```

**Payload per ogni intervento**: solo le colonne native di `public.interventions` (`id`, `title`, `scheduled_start_at`, `assigned_to`, `assigned_to_name`, `assigned_to_role`, `status`, `type`, `severity`, `machine_id`, `machine_name`, `org_id`, `created_at`, `created_by`, ecc.). **NESSUNA INFORMAZIONE sui report linkati**. La struttura `intervention.linked_reports` non esiste nel payload corrente.

**Costo di aggiungere `linked_reports`** (per supportare opt-A o opt-C del BLOCKER #1):

Soluzione minima (un singolo round-trip aggiuntivo, no nested select Supabase):
```js
// dopo la fetch interventions:
const ids = data.map(i => i.id)
const { data: links } = await supabase
  .from('intervention_reports')
  .select('intervention_id, report_id, is_origin, resolves_report')
  .in('intervention_id', ids)
// raggruppo client-side:
const byIntv = new Map()
for (const l of links || []) {
  if (!byIntv.has(l.intervention_id)) byIntv.set(l.intervention_id, [])
  byIntv.get(l.intervention_id).push(l)
}
return data.map(i => ({ ...i, linked_reports: byIntv.get(i.id) || [] }))
```

- **Round-trip extra**: 1 (`SELECT FROM intervention_reports WHERE intervention_id IN (...)`).
- **Righe extra**: pari al numero totale di link sugli interventi del mese visualizzato. Su un mese tipico con ~5-50 interventi e N medio di link 1-2, ordine di grandezza 5-100 righe. Trascurabile.
- **Alternativa nested select Supabase** (1 round-trip):
  ```js
  .select('*, intervention_reports(report_id, is_origin, resolves_report)')
  ```
  RLS su `intervention_reports` filtra già per `org_id`. Più pulito ma fan-out via PostgREST embedding — performance simile su volumi attuali.

**Decisione operativa**: estendere il payload del calendario è **a basso costo** (~5-10 LOC + zero migration). Non blocca l'implementazione.

### 3. Sanity check produzione — BLOCCATO da credenziali

**Status**: **non eseguibile da questo ambiente**. Nessun `.env`, nessuna `SUPABASE_SERVICE_ROLE_KEY`, nessun connection string `DATABASE_URL` disponibile. Il sandbox ha `psql` e `supabase` CLI ma senza credenziali sono inutilizzabili.

**Query pronte da incollare manualmente in Supabase Dashboard → SQL Editor** (target org `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`):

```sql
-- Q1: totale interventi (org filtrato)
SELECT COUNT(*) AS interventi_totali
FROM public.interventions
WHERE org_id = '1235103f-45e5-4fa5-a256-3ca5f39dcf1e';

-- Q2: distribuzione count report linkati per intervento
-- (include interventi con 0 link grazie a LEFT JOIN)
SELECT
  COALESCE(t.n, 0) AS reports_linkati_per_intervento,
  COUNT(i.id)      AS num_interventi
FROM public.interventions i
LEFT JOIN (
  SELECT intervention_id, COUNT(*) AS n
  FROM public.intervention_reports
  WHERE org_id = '1235103f-45e5-4fa5-a256-3ca5f39dcf1e'
  GROUP BY intervention_id
) t ON t.intervention_id = i.id
WHERE i.org_id = '1235103f-45e5-4fa5-a256-3ca5f39dcf1e'
GROUP BY COALESCE(t.n, 0)
ORDER BY 1;

-- Q3: max N osservato + lista degli interventi con N>1 (per ispezione)
SELECT
  i.id, i.title, i.status, i.scheduled_start_at,
  COUNT(ir.report_id) AS n_link,
  COUNT(ir.report_id) FILTER (WHERE ir.resolves_report = true) AS n_risolutivi
FROM public.interventions i
JOIN public.intervention_reports ir ON ir.intervention_id = i.id
WHERE i.org_id = '1235103f-45e5-4fa5-a256-3ca5f39dcf1e'
GROUP BY i.id, i.title, i.status, i.scheduled_start_at
HAVING COUNT(ir.report_id) > 1
ORDER BY n_link DESC, i.scheduled_start_at DESC;

-- Q4 (bonus): max N osservato in numero secco
SELECT MAX(n) AS max_link_per_intervento
FROM (
  SELECT COUNT(*) AS n
  FROM public.intervention_reports
  WHERE org_id = '1235103f-45e5-4fa5-a256-3ca5f39dcf1e'
  GROUP BY intervention_id
) t;
```

**Risultato query eseguita 2026-05-14** (org `1235103f-45e5-4fa5-a256-3ca5f39dcf1e`):

| Metric | Valore |
|---|---|
| Interventi totali | **0** |
| Interventi con N=0 link | 0 |
| Interventi con N=1 link | 0 |
| Interventi con N>1 link | 0 |
| Max N osservato | 0 |
| Interventi con N risolutivi > 1 | 0 |
| Max risolutivi osservato | 0 |

### ⚠️ Discrepanza con OBSERVATIONS_1C.md:81

`OBSERVATIONS_1C.md` snapshot del 2026-05-14 (deploy day) riporta: **5 interventi totali, 3 link totali, 3 con N=1, 0 con N>1**. La query di sanity check ritorna invece **0 in tutto**.

Tre ipotesi:

1. **Org_id sbagliato**: i 5 interventi vivono in un altro org_id. Probabile se la dashboard è connessa a un progetto multi-tenant e l'org `1235103f-…` non è quella dove sono state osservate le frizioni 1c.
2. **Env sbagliato**: la dashboard è su staging mentre OBSERVATIONS si riferisce a prod (o viceversa).
3. **Dati cancellati/spostati tra il momento dello snapshot e adesso**: improbabile nello stesso giorno senza azione esplicita.

**Diagnostico veloce** (incolla sul SQL Editor per scoprire dove vivono i 5 interventi):

```sql
SELECT
  org_id,
  COUNT(*)                                  AS n_interventi,
  MAX(created_at)                           AS ultimo_creato,
  COUNT(DISTINCT created_by_name)           AS n_creatori
FROM public.interventions
GROUP BY org_id
ORDER BY n_interventi DESC;
```

Se ritorna 1+ riga, il `org_id` con interventi è quello da usare (sostituire in tutte le query). Se ritorna 0 righe, **i 5 interventi di OBSERVATIONS_1C.md non sono in questo progetto** — è probabile che lo snapshot fosse riferito a staging o demo locale.

### Conclusione di questa mini-validazione

**Punti 1 e 2 chiusi**: schema N↔M pieno (non N:1), payload calendario oggi privo di info report, estensione a basso costo (~5-10 LOC).

**Punto 3 eseguito ma sospetto**: i numeri ritornano tutti zero. Prima di trarre conclusioni serve risolvere la discrepanza con OBSERVATIONS via la query diagnostica sopra.

### Riga finale richiesta — verdetto onesto sotto due interpretazioni

- **Se la dashboard è davvero connessa all'org di produzione**: **N>1 non è significativo** (è zero su zero interventi). L'opzione A del BLOCKER #1 regge **per assenza di dati contrari**, ma la decisione è priva di valore predittivo finché non c'è uso reale. Da rivalutare al kick-off 1c-bis (17-18/5) — se anche allora N>1 = 0 con 5-10 interventi accumulati, opt-A è confermato. Se emergono N>1 frequenti, **pivot a opt-C** (smart: card → report se N=1, → detail se N>1).

- **Se l'org_id `1235103f-…` non è quella reale**: la validazione è inconcludente. Eseguire la diagnostica sopra e rilanciare le 4 query con l'org_id corretto prima di prendere qualunque decisione di rotta.

---

## Riferimenti

- Brief originale: nella history della conversazione del 14/5 su `claude/calendar-next-steps-KVIST`.
- Sorgenti chiave: `src/pages/manutech-v6/V6App.jsx`, `src/pages/admin/AdminCalendar.jsx`, `src/components/interventions/InterventionsForReport.jsx`, `src/components/interventions/DayContextPanel.jsx`, `src/components/interventions/InterventionCard.jsx`, `src/contexts/AuthContext.jsx`.
- Filosofia simmetria vs detail: `OBSERVATIONS_1C.md:148-162` (Frizione #4).
