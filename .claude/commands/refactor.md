Analizza e refactora codice ManuTech con plan mode obbligatorio.

## Fase 1: ANALISI (non toccare codice)
1. Leggi il file/area target
2. Identifica:
   - Duplicazioni
   - Componenti >400 righe che possono essere splittati
   - Pattern demo/prod ripetuti in supabase.js
   - Query N+1 (loop con await individuali → Promise.all)
   - Stato che potrebbe essere derivato (useMemo vs useState ridondante)
3. Presenta il PIANO all'utente con:
   - Cosa cambierà
   - Cosa NON cambierà
   - Rischi
   - File coinvolti

## Fase 2: ESECUZIONE (solo dopo approvazione)
Regole ferree:
- **NON cambiare comportamento** — solo struttura
- **NON rinominare export pubblici** senza aggiornare tutti gli import
- **NON toccare il demo mode** — deve continuare a funzionare
- **NON aggiungere dipendenze** nuove
- **NON cambiare la lingua** (UI italiano, codice inglese)
- **Split componente**: nuovo file nella stessa cartella, import nel parent

## Fase 3: VERIFICA
1. `npm run build` — deve passare
2. `npm run lint` — deve passare
3. Verifica che i componenti splittati siano importati correttamente
4. Se hai toccato supabase.js, verifica sia il path Supabase che il path localStorage

## Target comuni di refactoring
- `AdminMachines.jsx` (657 LOC) → split form modal, detail sheet, list
- `AdminReports.jsx` (611 LOC) → split filtri, lista, detail modal
- `supabase.js` (1350+ LOC) → possibile split per area (reports, machines, wallet...)
