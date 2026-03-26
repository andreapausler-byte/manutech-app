# src/hooks/ — Custom Hooks

## Convenzioni
- Un hook per file, nome `use*.js`
- Export named, mai default
- Documentazione JSDoc in testa al file

## Hook principali

| Hook | Scopo | Dipendenze |
|------|-------|------------|
| `useWallet` | Saldo ManuCoin, transazioni, premi, riscatto | `supabase.js` |
| `useOperatorScore` | Punteggio gamification, badge, livelli, classifica | `useMemo` su reports |
| `useKPIStats` | KPI avanzati: tempo risoluzione, trend, top operatori | `useMemo` su reports |
| `usePWA` | Service Worker, Web Push, install prompt | Browser APIs |
| `useAutoNotifications` | Controlla scadenze manutenzione, invia reminder | `supabase.js` |
| `useChatRealtime` | Messaggi chat realtime via Supabase channels | Supabase Realtime |
| `useDirectMessageRealtime` | DM realtime con conteggio unread | Supabase Realtime |
| `usePullToRefresh` | Gesture pull-to-refresh su mobile | Touch events |
| `useHaptic` | Feedback aptico: `light()`, `medium()`, `success()` | Navigator vibrate |
| `useOnlineStatus` | Stato connessione con detect reconnessione | `navigator.onLine` |
| `useToast` | Wrapper react-hot-toast con metodi `success/error/info` | `react-hot-toast` |
| `useAutosave` | Salva stato form in localStorage con debounce | `localStorage` |
| `useImageCompressor` | Comprime immagini prima dell'upload | Canvas API |

## Pattern auto-reward
`useAutoTokenReward(userId, badges, level)` accredita ManuCoin automaticamente.
Usa localStorage per deduplicazione tra sessioni (`manutech_credited_{userId}`).
