# src/components/ — Componenti UI

## Struttura
Ogni sottocartella raggruppa per area funzionale, non per tipo.

## Convenzioni componenti
- Export default per componente principale, named per helper
- Props destructurate — no `props.x`
- Stili: Tailwind inline + `style={{ color: 'var(--color-*)' }}`
- Interattività mobile: aggiungi `className="press-scale"` ai bottoni
- Haptic feedback: `useHaptic()` per azioni importanti

## ui/ — Componenti base riutilizzabili
Importa da `components/ui` (barrel export in `index.jsx`):
```js
import { Badge, Button, Input, Modal, Spinner, EmptyState, SkeletonDashboard } from '../components/ui'
```
NON creare componenti UI duplicati. Controlla prima `ui/index.jsx`.

## layout/ — Layout principali
- `MobileLayout`: bottom nav con tab per ruolo, FAB per nuovo report, transizioni pagina
- `LoginPage`: form login/registrazione

Per il layout admin desktop vedi `src/pages/manutech-v6/V6App.jsx` —
è l'unico layout admin (industrial dark). Aggiungere lì le nuove rotte
con un nuovo `case route.name === 'xxx'`.

## reports/ — Segnalazioni
- `NewReport`: form completo (titolo, macchina, severità, tipo, descrizione, foto)
- `QuickReport`: 6 template precompilati (perdita, rumore, blocco, surriscaldamento, vibrazione, usura)
- `ReportDetail`: vista singola con chat, timeline, stato
- `ReportsList`: lista filtrata per ruolo con badge unread

## Pattern navigazione mobile
```js
const navigateTo = (screen, data) => { setScreen(screen); setSelectedReport(data) }
const goBack = () => { setScreen(null); setSelectedReport(null) }
```
Transizioni: `.page-slide-in` / `.page-slide-back`
