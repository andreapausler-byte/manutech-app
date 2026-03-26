# src/lib/ — Core Logic

## supabase.js (1350+ righe)
Layer unificato per DB. Ogni metodo ha DOPPIA implementazione:
```js
async getReports() {
  if (supabase) { /* query Supabase */ }
  // Demo fallback
  return JSON.parse(localStorage.getItem('manutech_reports') || '[]')
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
`getMyOrgId()` è cached in `_cachedOrgId`. Si resetta SOLO al logout via `onAuthStateChange`.

## constants.js
Enum condivisi: `ROLES`, `STATUS`, `SEVERITY`, `REPORT_TYPES`, `QUICK_TEMPLATES`.
Helper: `formatDate(dateStr)`, `timeAgo(dateStr)` — usali sempre, mai formattare date manualmente.

## theme.js
`makeTheme(mode, accent)` genera 50+ CSS vars. `applyTheme()` le inietta in `:root`.
6 accent preset. NON hardcodare colori — usa `var(--color-*)`.

## notifPreferences.js
Cache in-memory con TTL 60s. `shouldShowNotification()` per check async, `shouldShowNotificationSync()` per sync.
