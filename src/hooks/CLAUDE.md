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
| `useImageCompressor` | Comprime immagini e genera miniature prima dell'upload | Canvas API |
| `useMachineMedia` | Galleria foto/video di una macchina (feed + curata) | `supabase.js` |
| `useMachineUpload` | Scatta foto / carica documento sulla macchina dal campo | `supabase.js`, `useImageCompressor` |
| `useClosureEdit` | Correggere una chiusura o aggiungerle una nota dopo, con cronologia e reindex | `supabase.js`, `lib/closure.js` |
| `useClosureHelpful` | Voto "Mi è servita" su una chiusura (ManuCoin via trigger, migration 064) | `supabase.js` |

## Pattern auto-reward
`useAutoTokenReward(userId, badges, level)` accredita i traguardi del mese: ogni badge e ogni livello pagano una volta per mese di calendario (chiave `badge_<id>:YYYY-MM`). La deduplica vera la fa `credit_tokens` (migration 067), che accetta solo importi fissi e il mese corrente; il localStorage (`manutech_credited_{userId}`) evita solo chiamate inutili. Un badge nuovo in `useOperatorScore` va aggiunto anche all'elenco in `credit_tokens`, altrimenti non paga.
