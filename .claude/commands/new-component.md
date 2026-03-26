Crea un nuovo componente React seguendo le convenzioni ManuTech.

## Input richiesto
Chiedi all'utente: nome componente, area (admin/mobile/ui), scopo.

## Template

Il componente DEVE:
- Essere una funzione React con export default
- Usare Tailwind inline + CSS variables (`var(--color-*)`)
- Avere label/testi in italiano
- Usare nomi variabili/funzioni in inglese
- Importare icone da `lucide-react`
- Usare `useToast()` per feedback utente
- Usare `useHaptic()` per interazioni mobile
- Avere `className="press-scale"` sui bottoni interattivi
- Seguire il pattern glass-morphism per card e modal

## Struttura file

```jsx
/**
 * NomeComponente — Descrizione breve
 */

import { useState } from 'react'
// ... altri import

export default function NomeComponente({ props }) {
  // hooks
  // state
  // handlers
  // render
}
```

## Checklist
- [ ] File creato nella cartella corretta (components/ o pages/)
- [ ] Import aggiunti nel layout parent (AdminLayout o MobileLayout)
- [ ] Se è un componente UI base, aggiunto a `ui/index.jsx`
- [ ] Se usa dati DB, aggiunta funzione in `supabase.js` CON demo fallback
- [ ] `npm run build` passa
