# src/lib/ — Core Logic

## supabase.js (facade) + db/ (moduli per dominio)
`supabase.js` è la facade pubblica: riesporta `supabase`, `isSupabaseConfigured`,
`DEMO_ORG_ID`, `ensureDefaultAdmin` e compone `db` dai moduli in `db/`.
**Non aggiungere metodi qui** — vai nel modulo del dominio giusto.

```
db/
├── _client.js       # supabase client + getMyOrgId + cache
├── _demoStore.js    # KEYS, getStore, setStore, demoToken, ensureDefaultAdmin
├── auth.js          # users, login, signup, inviti, sessione, suppliers, orgs
├── reports.js       # reports + comments
├── machines.js      # machines + areas + components
├── maintenance.js   # plans + logs + knowledge base
├── spareParts.js    # parts + orders + compatibility
├── storage.js       # uploadFile
├── activities.js    # activity log
├── notifications.js # notifications + push + prefs + assessments
├── guest.js         # guest tokens + chat senza login
├── messaging.js     # conversations + DM
└── wallet.js        # ManuCoin + rewards + redemptions
```

Ogni metodo ha DOPPIA implementazione:
```js
async getReports() {
  if (supabase) { /* query Supabase */ }
  // Demo fallback
  return getStore(KEYS.reports)
}
```
**REGOLA**: nuova funzione DB = DEVI aggiungere entrambi i path.

### Pattern RPC per INSERT sicure
Per tabelle con RLS complessa (maintenance_plans, token_transactions):
```js
const { data, error } = await supabase.rpc('nome_funzione', { params })
if (!error && data) return data
// Fallback insert diretto se RPC non deployata
```

### Cache org_id
`getMyOrgId()` (in `db/_client.js`) è cached. Si resetta al logout via
`onAuthStateChange`. Per reset manuale dopo signup: `resetOrgIdCache()`.

### Aggiungere un nuovo metodo
1. Apri il modulo di dominio (es. `db/reports.js`)
2. Aggiungi il metodo all'oggetto esportato (es. `reports`)
3. Niente da modificare in `supabase.js` — il facade lo espone già via spread

## constants.js
Enum condivisi: `ROLES`, `STATUS`, `SEVERITY`, `REPORT_TYPES`, `QUICK_TEMPLATES`.
Helper: `formatDate(dateStr)`, `timeAgo(dateStr)` — usali sempre, mai formattare date manualmente.

## theme.js
`makeTheme(mode, accent)` genera 50+ CSS vars. `applyTheme()` le inietta in `:root`.
6 accent preset. NON hardcodare colori — usa `var(--color-*)`.

## notifPreferences.js
Cache in-memory con TTL 60s. `shouldShowNotification()` per check async, `shouldShowNotificationSync()` per sync.
