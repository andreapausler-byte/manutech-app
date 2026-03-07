# ManuTech - Contesto Progetto

## Cos'è ManuTech
App web/PWA per la gestione della manutenzione industriale. Permette a operatori di segnalare guasti, a tecnici di gestire interventi, e agli admin di monitorare KPI e pianificare manutenzione preventiva.

## Stack Tecnologico
- **Frontend**: React 19 + Vite 7 + Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Deploy**: Vercel
- **PWA**: Service Worker custom con cache strategy
- **UI**: Mobile-first, icone Lucide React, toast con react-hot-toast

## Architettura

### Struttura cartelle
```
src/
├── components/       # Componenti riutilizzabili
│   ├── chat/         # Chat integrata
│   ├── layout/       # LoginPage, AdminLayout, MobileLayout
│   ├── machines/     # Dettaglio macchine, QR
│   ├── media/        # Upload foto con compressione
│   ├── reports/      # Segnalazioni (NewReport, ReportDetail, QuickReport)
│   └── ui/           # Componenti base (StatusBadge, ecc.)
├── hooks/            # Custom hooks (useAutoNotifications, useAutosave, usePWA, ecc.)
├── lib/              # Logica core
│   ├── supabase.js   # Layer di astrazione DB (556 righe)
│   ├── constants.js  # Ruoli, stati, severità, template quick report
│   ├── theme.js      # Engine temi dark/light/auto + accent colors
│   └── notifPreferences.js  # Preferenze notifiche per ruolo
├── pages/
│   ├── admin/        # Dashboard, Macchine, Report, Manutenzione, Tecnici, Utenti, Notifiche
│   └── mobile/       # Dashboard mobile, Profilo
└── App.jsx           # Routing (admin → AdminLayout, altri → MobileLayout)
```

### Ruoli utente
- **Operatore**: segnala guasti (report rapidi o completi), vede stato segnalazioni
- **Tecnico**: riceve assegnazioni, aggiorna stato interventi, chat
- **Admin**: dashboard KPI, gestione macchine/utenti/tecnici, manutenzione preventiva

### Flusso segnalazione
1. Operatore crea report (normale o quick con template predefiniti)
2. Report nasce con stato "aperta"
3. Admin assegna a tecnico → stato "assegnata"
4. Tecnico lavora → stato "in_lavorazione"
5. Tecnico completa → stato "risolta"

### Database (Supabase/PostgreSQL)
Schema in `supabase/schema.sql`. Tabelle principali:
- `profiles` (utenti con ruolo e org_id)
- `machines` (macchinari con QR code)
- `reports` (segnalazioni con severità, stato, foto)
- `maintenance_plans` (piani preventivi con frequenza)
- `maintenance_logs` (log esecuzioni manutenzione)
- `activities` (feed attività)
- `notifications` (notifiche con preferenze per ruolo)

### Demo Mode
Il progetto supporta una modalità demo senza Supabase, usando localStorage. Il pattern in `supabase.js` è: `if (supabase) { /* query reale */ } else { /* fallback localStorage */ }`.

## Convenzioni di Codice
- Lingua UI: **italiano** (label, messaggi, placeholder)
- Lingua codice: **inglese** (nomi variabili, funzioni, componenti)
- Componenti React: funzioni con hooks, no classi
- Stili: Tailwind utility classes inline, no CSS separato
- Stato: React Context (AuthContext) + useState locale, no Redux
- Date: `date-fns` + helper custom `formatDate`/`timeAgo` in constants.js
- Commit message: `vX.Y: Sprint N - Descrizione feature`

## Cronologia Versioni
- **v5.3** (Sprint 3.7): Preferenze notifiche per ruolo (mobile + admin)
- **v5.2**: Notifiche realtime + suono + Web Notifications + PWA installabile + guida Safari
- **v5.0**: Theme Engine - dark/light/auto + 6 accent colors + controlli admin

## Problemi Noti / Debito Tecnico
- **Performance**: Query N+1 in AdminDashboard e AdminMaintenance (loop sequenziali su macchine → piani → log)
- **Test**: Nessun test presente, nessun framework di test configurato
- **Componenti grandi**: AdminMachines (657 righe), AdminReports (611), AdminDashboard (567)
- **Accessibilità**: Nessun attributo aria-*, mancano tag semantici HTML
- **Error handling**: Inconsistente - alcuni .catch(() => {}) silenti in supabase.js
- **supabase.js**: Pattern demo/produzione duplicato 20+ volte

## Come Lavorare su Questo Progetto
- `npm run dev` per avviare in locale
- `npm run build` per verificare che il build funzioni
- `npm run lint` per controllare errori ESLint
- Le variabili Supabase sono in `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Senza `.env` il progetto parte in modalità demo (localStorage)

---

> **NOTA PER IL MAINTAINER**: Arricchisci questo file con:
> - Decisioni architetturali prese e perché (es. "perché Supabase e non Firebase")
> - Feature richieste dai clienti / roadmap
> - Problemi ricorrenti in produzione
> - Dettagli sull'ambiente di produzione (dominio, Supabase project ID, ecc.)
> - Integrazioni esterne previste (ERP, sensori IoT, ecc.)
