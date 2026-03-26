# ManuTech — Claude Code Context

## Cos'è
PWA gestione manutenzione industriale. Operatori segnalano guasti, tecnici gestiscono interventi, admin monitorano KPI e pianificano manutenzione preventiva.

## Stack
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4 (plugin `@tailwindcss/vite`)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Deploy**: Vercel — **PWA**: Service Worker custom (`public/sw.js`)
- **UI**: Mobile-first, Lucide React icons, react-hot-toast, glass-morphism

## Comandi
```bash
npm run dev      # Dev server (porta 5173, host=true)
npm run build    # Build produzione — ESEGUI SEMPRE prima di push
npm run lint     # ESLint — deve passare senza errori
```
Non ci sono test. Non c'è Prettier. Tailwind v4 senza config file.

## Architettura
```
src/
├── components/         # Componenti per area (chat, layout, machines, media, messaging, reports, ui)
├── contexts/           # AuthContext, ThemeContext (React Context, NO Redux)
├── hooks/              # 13 custom hooks (useWallet, useKPIStats, usePWA, ...)
├── lib/
│   ├── supabase.js     # Layer DB unico (1350+ righe) — pattern: if(supabase){...}else{localStorage}
│   ├── constants.js    # ROLES, STATUS, SEVERITY, QUICK_TEMPLATES, formatDate, timeAgo
│   ├── theme.js        # Engine temi: 6 accent presets, dark/light/auto, 50+ CSS vars
│   └── notifPreferences.js  # Preferenze notifiche per ruolo con cache 60s
├── pages/
│   ├── admin/          # 10+ pagine (Dashboard, Reports, Machines, Leaderboard, Rewards...)
│   └── mobile/         # MobileDashboard, ProfilePage, WalletPage
├── styles/index.css    # Design system: CSS vars, animazioni, utility classes (750+ righe)
└── App.jsx             # Routing: admin→AdminLayout, altri→MobileLayout, guest→GuestChatPage
```

## Ruoli e flusso
- **Operatore**: crea report (normali o quick) → `aperta`
- **Admin**: assegna a tecnico → `assegnata`
- **Tecnico**: lavora → `in_lavorazione` → completa → `risolta`
- Stati: `aperta → assegnata → in_lavorazione → in_attesa_ricambi → risolta → chiuso`

## Convenzioni codice — SEGUILE SEMPRE
- **Lingua UI**: italiano — **Lingua codice**: inglese
- **Componenti**: funzioni React + hooks, MAI classi
- **Stili**: Tailwind inline + CSS variables (`var(--color-*)`) — MAI file CSS per componente
- **Stato**: React Context + useState — NO Redux/Zustand
- **Date**: `formatDate()` e `timeAgo()` da `constants.js`
- **Icone**: solo `lucide-react`
- **Toast**: `react-hot-toast` via `useToast()`
- **Import**: path relativi, no alias
- **Commit**: `vX.Y: Sprint N - Descrizione feature`

## Design System
- **Font**: Outfit (UI) + JetBrains Mono (numeri/codice)
- **Primary default**: `#7c6aff` — 6 preset accent configurabili via ThemeContext
- **Modalità**: dark-first, supporta light e auto
- **Pattern**: glass-morphism (`.glass`), card `border-radius: 16-24px`, `.press-scale` per tap
- **Componenti base** in `ui/index.jsx`: Badge, Button, Input, Select, Modal, Spinner, Skeleton
- **20+ animazioni** in `index.css` (fadeIn, slideUp, pulseRing, shimmer...)

## Supabase — Pattern critici
- **Demo mode**: OGNI funzione in `supabase.js` ha fallback localStorage. Rispetta sempre.
- **RLS**: tabelle usano `get_my_org_id()` e `get_my_role()` — funzioni `SECURITY DEFINER`
- **RPC**: per INSERT su tabelle RLS complesse, usa RPC (vedi `create_maintenance_plan`, `credit_tokens`)
- **org_id**: SEMPRE incluso nelle insert. Usa `getMyOrgId()` (cached, reset al logout)
- **Migration**: file numerati in `supabase/migrations/` — schema base in `supabase/schema.sql`

## Database — Tabelle
`users`, `machines`, `reports`, `maintenance_plans`, `maintenance_logs`, `activities`, `notifications`, `comments`, `conversations`, `direct_messages`, `dm_reads`, `push_subscriptions`, `token_config`, `token_transactions`, `reward_catalog`, `reward_redemptions`

## Gamification (v5.4-5.5)
- **Punteggio**: `useOperatorScore` — punti per report, foto, severità, quick, streak
- **Badge**: 16 achievement in 5 categorie — **Livelli**: Bronzo→Argento→Oro→Platino→Diamante
- **ManuCoin**: wallet token interno con catalogo premi riscattabili (`useWallet`)

## Errori da evitare
1. **NON dimenticare demo mode** — ogni funzione DB nuova DEVE avere fallback localStorage
2. **NON usare insert diretto** su tabelle RLS complesse — usa RPC `SECURITY DEFINER`
3. **NON aggiungere file CSS** — Tailwind inline + CSS vars esistenti
4. **NON importare librerie UI esterne** — usa `ui/index.jsx`
5. **NON usare Redux/Zustand** — Context + useState
6. **NON scrivere inglese nell'UI** — tutto italiano
7. **Build DEVE passare** prima di ogni push

## Debito tecnico
- Query N+1 in AdminDashboard e AdminMaintenance
- supabase.js: pattern demo/prod duplicato 20+ volte
- Componenti grandi (600+ LOC): AdminMachines, AdminReports, AdminDashboard
- Zero test, zero accessibilità (aria-*)
- Error handling inconsistente (.catch silenti)
