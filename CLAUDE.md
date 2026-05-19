# ManuTech — Claude Code Context

## Current focus

*Aggiorna queste 3 righe quando inizi una sessione di lavoro. Sono il "tu sei qui" del progetto. Si aggiornano spesso — anche più volte a settimana.*

- **Fase**: Sprint 1b-A (Mobile Calendar Parity) implementato 19/5 — CalendarioMobile + week-strip + bottom sheet + micro-mese overlay + pillola 56px glove-friendly + toggle showCancelled effimero. Tab `calendar` sostituisce `assistant` per ruolo tecnico in MobileLayout. Parità Sprint 1c-bis ("Apri report" condizionale a N=1 risolutivo). Build pulito, 0 nuovi errori lint. Phase B (push event wiring) sospesa in attesa di smoke test Phase A.
- **Branch corrente**: `claude/sprint-1b-mobile-push` (Phase A)
- **Prossimo step**: smoke test Phase A su preview Vercel (tab Calendario per tecnico → strip settimanale + tap giorno → bottom sheet con pillole + swipe-down close + micro-mese overlay quick-jump). Poi Phase B: cablare insert in `notifications` per `interventions.assigned_to` change + filtro `severity='critica'` su new report. Mappa categorie 🔴🟡🔵 → gruppi JSONB esistenti (no migration breaking). D2/D3 assunti come raccomandazione CTO (solo nuovo assegnatario; fan-out totale role=admin per critica).

---

## Session opener

All'inizio di ogni sessione di lavoro, primo prompt:

> Leggi `ROADMAP.md`, l'ultima nota in `journal/`, e la sezione "Current focus" qui sopra. Dimmi dove sono nella roadmap, cosa stavo per fare nella prossima sessione, e se vedi incoerenze tra i tre segnalamele.

Questa è l'ancora che ti riallinea anche dopo settimane di stop.

---

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
<!-- update quando PR 2 mergia: vitest aggiunto, test in src/lib/*.test.js -->
Non ci sono test. Non c'è Prettier. Tailwind v4 senza config file.

## Architettura
```
src/
├── components/         # Componenti per area (chat, layout, machines, media, messaging, reports, ui)
├── contexts/           # AuthContext, ThemeContext (React Context, NO Redux)
├── hooks/              # 13 custom hooks (useWallet, useKPIStats, usePWA, ...)
├── lib/
│   ├── supabase.js     # Facade DB: riesporta supabase + compone `db` dai moduli db/
│   ├── db/             # Moduli DB per dominio (auth, reports, machines, wallet, ...)
│   ├── constants.js    # ROLES, STATUS, SEVERITY, QUICK_TEMPLATES, formatDate, timeAgo
│   ├── theme.js        # Engine temi: 6 accent presets, dark/light/auto, 50+ CSS vars
│   └── notifPreferences.js  # Preferenze notifiche per ruolo con cache 60s
├── pages/
│   ├── admin/          # 10+ pagine (Dashboard, Reports, Machines, Leaderboard, Rewards...)
│   ├── manutech-v6/    # V6App: layout admin unico (industrial dark)
│   └── mobile/         # MobileDashboard, ProfilePage, WalletPage
├── styles/index.css    # Design system: CSS vars, animazioni, utility classes (750+ righe)
└── App.jsx             # Routing: admin→V6App, altri→MobileLayout, guest→GuestChatPage
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
- **Eccezioni commit**: nel journal e nei doc di pianificazione (ROADMAP, PLAN) usa `journal: YYYY-MM` o `docs: <oggetto>` — non hanno sprint perché non sono codice di prodotto.

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

## AI Strategy

ManuTech evolve verso un layer AI trasversale (Sonnet per analisi, rielaborazione, tracciabilità), non come singola feature. Vision formalizzata in `docs/decisions/ADR-010-ai-strategy-vision.md`.

**Principio fondante (vincolante):** l'AI esiste per tutelare e aiutare in primis l'operatore e il tecnico. Test obbligatorio per ogni feature: *"rende più facile/sicura/comoda la giornata di operatore o tecnico?"*. Se no, non si fa.

**Sequencing 4 layer:**
- L0 Fondamenta — in corso (ADR-007 org_id, ADR-008 Interventi v2, ADR-009 Agenda mobile)
- L1 AI applicata — autunno 2026 (riassunti on-demand, classificazione automatica, voice creation)
- L2 AI memoria operativa — Q4 2026 (RAG storico macchina, anomaly detection)
- L3 AI commerciale — 2027 (post multi-tenant, insights cross-cliente — subordinato a L1/L2)

**Anti-pattern vincolanti:** (1) mai implementare feature AI prima che Layer 0 sia stabile in produzione; (2) mai costruire feature AI per impressionare chi non userà mai il prodotto in fabbrica.

**Use cases osservati** (15/5/2026 dal confronto manutentore): voice creation intervento, riassunto storico macchina, classificazione segnalazioni, anomaly detection, estrazione info da chat realtime. Tutti con beneficiario operativo esplicito.

## Debito tecnico
- Query N+1 in AdminDashboard e AdminMaintenance
- Componenti grandi (600+ LOC): AdminMachines, AdminReports, AdminDashboard
- Zero test, zero accessibilità (aria-*)
- Error handling inconsistente (.catch silenti)
