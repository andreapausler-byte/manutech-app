*Dettaglio tattico della Fase 0 di ROADMAP.md. Si svuota e riscrive a inizio Fase 1.*

# Piano Revamping UI Segnalazioni - Kanban Style

## Scope
Ridisegno completo del flusso segnalazioni: ReportsList, ReportDetail, NewReport, QuickReport.

## 1. ReportsList.jsx — Vista Kanban Swipeable
**Obiettivo**: Trasformare la lista piatta in colonne Kanban orizzontali per stato.

### Modifiche:
- **Kanban Board**: Scroll orizzontale con colonne per ogni stato (Aperta → Assegnata → In Corso → Attesa Ricambi → Completato → Chiuso)
- **Column Header**: Nome stato + contatore + dot colorato, sticky in alto
- **Card ridisegnate**:
  - Avatar cerchio con iniziali del tecnico assegnato (o icona se non assegnato)
  - Mini progress indicator (dot chain degli stati)
  - Severity badge più visibile con glow
  - Tempo trascorso con icona orologio
  - Unread badge migliorato con pulse animation
- **Swipe orizzontale** tra colonne con snap scroll CSS (`scroll-snap-type`)
- **Tab pills** in alto per navigazione rapida tra colonne (tappando si scrolla alla colonna)
- **Barra di ricerca** mantenuta ma con design aggiornato (pill shape, icon animata)
- **Empty column state**: Illustrazione minimalista per colonne vuote
- **Pull-to-refresh** mantenuto

### Nuove animazioni CSS (in index.css):
- `@keyframes kanbanSlideIn` per ingresso cards
- `@keyframes countPulse` per aggiornamento contatori

## 2. ReportDetail.jsx — Detail Page Moderna
**Obiettivo**: Layout più immersivo e leggibile.

### Modifiche:
- **Hero header**: Severity color come accento in alto (gradient sottile), titolo grande
- **Status pill** prominente con animazione pulse quando cambia
- **Info cards**: Layout a chip orizzontali scrollabili invece di badges compatti
- **Sezione media**: Gallery con layout masonry-like, thumbnails più grandi
- **Status actions**: Ridisegnate come stepper orizzontale (flow visivo del processo)
  - Stato attuale evidenziato, stati futuri sfumati, stati passati con checkmark
- **Closure form**: Bottom sheet con design migliorato, field più spaziati
- **Tab Chat/Timeline**: Pill toggle invece di tab con underline

## 3. NewReport.jsx — Form Moderno Multi-step Look
**Obiettivo**: Form più invitante e meno "burocratico".

### Modifiche:
- **Progress bar** in alto che mostra completamento form (quanti campi compilati)
- **Tipo intervento**: Card più grandi con icona + descrizione breve, layout 2x2 invece di 4x1
- **Priorità**: Slider visuale o card colorate più espressive con gradients
- **Machine selector**: Card con icona macchinario invece di dropdown piatto
- **Submit button**: Gradient animato con shimmer effect quando valido
- **Transizioni** tra sezioni più fluide

## 4. QuickReport.jsx — Quick Flow Rinfrescato
**Obiettivo**: Esperienza ancora più veloce e visivamente appagante.

### Modifiche:
- **Step 1 (Template)**: Card più grandi con subtle gradient background, hover lift effect
- **Step 2 (Dettagli)**: Layout più pulito con sezioni separate da divider sottili
- **Step indicator**: Progress bar segmentata invece di dots
- **Machine buttons**: Chip orizzontali scrollabili invece di grid 2 colonne
- **Submit**: Button con countdown visuale o progress ring

## 5. Nuove animazioni CSS (index.css)
- `kanbanSlideIn`: per cards che entrano nelle colonne
- `shimmerButton`: effetto shimmer sul pulsante submit
- `statusPulse`: pulse quando lo stato cambia
- Scroll snap utilities per le colonne kanban

## File da modificare:
1. `src/components/reports/ReportsList.jsx` — redesign completo
2. `src/components/reports/ReportDetail.jsx` — redesign layout
3. `src/components/reports/NewReport.jsx` — redesign form
4. `src/components/reports/QuickReport.jsx` — refresh design
5. `src/styles/index.css` — nuove animazioni e utility classes

## Vincoli:
- Mantenere compatibilità con tema dark/light esistente (usare CSS vars)
- Mantenere tutte le funzionalità esistenti (search, filter, pull-to-refresh, media, chat, timeline)
- Mobile-first, tocco con guanti (target ≥ 48px)
- Nessuna nuova dipendenza
