# org_id client audit — Sprint 1d prereq per mig 056

**Data**: 2026-05-20 · **Scope**: codice client (`src/`) prereq prima di applicare `056_org_id_hardening.sql` in produzione · **Mig collegata**: `supabase/migrations/056_org_id_hardening.sql` (ADR-007 opzione C, CHECK constraint UUID-shape)

## Metodo

Due grep cross-cutting:

```bash
grep -rn "'default'" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
grep -rn "org_id" src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

- Grep #1 — **8 hit totali, tutte CSS/Notification-permission**, nessuna su `org_id`. La stringa letterale `'default'` non appare mai come valore `org_id`. Verificato:
  - `PWABanners.jsx:260, 266`, `usePWA.js:60, 278` → `Notification.permission` (browser API)
  - `ReportDetail.jsx:148`, `useDraggable.js:65`, `AdminLeaderboard.jsx:42`, `dashboard/ActivityFeed.jsx:39` → `cursor: 'default'` (CSS)

- Grep #2 — **91 hit totali su `org_id`**, distribuite su 30 file. Categorizzate sotto.

Pattern architetturale ManuTech: ogni write nei moduli `db/*` ha doppia branch `if (supabase) { ... } else { /* localStorage */ }`. Il fallback `DEMO_ORG_ID = 'demo-org'` (definito in `_client.js:22`, **NON UUID-shape**) compare solo nella branch `else` — mai nei payload destinati a Supabase. La categorizzazione si basa su quale branch contiene la riga.

---

## (A) WRITES DA BONIFICARE

**Conteggio: 0**.

Nessuna `.insert()` / `.update()` / `.upsert()` su Supabase passa `org_id` con stringa letterale `'default'`, `'demo-org'`, `'demo'`, o qualunque altra stringa fissa hardcoded.

Pattern verificato su tutti i moduli con write Supabase:
- I write Supabase usano `await getMyOrgId()`, `user?.org_id`, `data.org_id`, `plan.org_id`, o variabili derivate (`orgId`, `insertOrgId`, `msgOrgId`, `after.org_id`) — sempre risolte a UUID-shape al runtime quando l'utente è autenticato.
- I `'demo-org'` / `DEMO_ORG_ID` letterali compaiono **solo** nella branch `else` (localStorage), mai dentro `supabase.from(...).insert(...)`.

Verifica spot-check sui 5 file con `DEMO_ORG_ID` referenziato:

| File:riga | Branch | Esito |
|---|---|---|
| `lib/db/interventions.js:111` | demo (`else` di Supabase) | Safe |
| `lib/db/interventions.js:646` | computed (`'demo-org'` solo se `supabase` null) | Safe |
| `lib/db/interventions.js:763` | computed (`'demo-org'` solo se `supabase` null) | Safe |
| `lib/db/messaging.js:65, 130` | demo (`localStorage.setItem`) | Safe |
| `lib/db/auth.js:164, 269` | demo (`getStore`/`push`) | Safe |
| `lib/db/guest.js:16` | demo (`localStorage.setItem`) | Safe |
| `lib/db/_demoStore.js:35` | demo retrofit utenti localStorage | Safe (vedi C.4) |

**Conclusione**: la mig 056 può essere applicata senza bonifica del client. Nessun write esistente verrà rotto dal nuovo CHECK constraint, *a meno* che si materializzi uno scenario di Zona Grigia (sezione C).

---

## (B) WRITES E LETTURE SICURE

**Conteggio: ~57 write Supabase con pattern UUID-safe + ~12 read filter / RPC**. Pattern coerente in 4 famiglie:

### B.1 — `await getMyOrgId()` esplicito (~15 occorrenze)

Modules in `lib/db/*` che risolvono `org_id` al momento dell'INSERT via cache helper:

```js
// src/lib/db/machines.js:85
const insertData = { ...area, org_id: await getMyOrgId() }
```

Esempi rappresentativi:
- `activities.js:9`, `machines.js:85, 147`, `spareParts.js:17, 77, 135, 165, 442`, `maintenance.js:78, 207`, `reports.js:142`, `guest.js:9`, `notifications.js:9`

### B.2 — `user?.org_id` da React context (10 occorrenze)

Pages admin/mobile che hanno `user` dal `AuthContext`:

```js
// src/pages/admin/AdminMaintenance.jsx:137
{ ..., performed_at: new Date().toISOString(), org_id: user?.org_id, ... }
```

Esempi rappresentativi:
- `AdminMachines.jsx:290, 368, 415`, `AdminMaintenance.jsx:137, 174, 204`, `AdminUsers.jsx:186` (`currentUser?.org_id`), `MobileMachineDetail.jsx:103, 133`, `MobileDashboard.jsx:176`

Sicuro perché `user.org_id` viene popolato al login Supabase con l'UUID reale dalla tabella `users`. NOT NULL constraint protegge da `undefined`.

### B.3 — `data.org_id || await getMyOrgId()` (fallback) (~6 occorrenze)

Pattern centralizzato in `lib/db/interventions.js` per i logger interni:

```js
// src/lib/db/interventions.js:21
org_id: org_id || (await getMyOrgId()),
```

Esempi rappresentativi:
- `interventions.js:21, 50, 93`, `maintenance.js:144, 206`, `messaging.js:43`

### B.4 — Variabile derivata da record DB (~26 occorrenze)

`plan.org_id`, `intervention.org_id`, `after.org_id`, `newOrg.id` ecc. — sempre letti da row Supabase, quindi sempre UUID-shape già validato dal DB.

```js
// src/hooks/useAutoNotifications.js:72
await db.addNotification({ ..., org_id: plan.org_id })
```

Esempi rappresentativi:
- `useAutoNotifications.js:72, 86`, `interventions.js:243, 695, 711, 723, 770, 817, 827, 858, 921, 931, 943, 983, 994, 1038, 1075`, `wallet.js:17, 90`, `auth.js:103, 261`, `notifications.js:73, 81, 129, 176`, `messaging.js:46, 103`

### B.5 — Read filter / RPC (~12 occorrenze)

`.eq('org_id', orgId)`, RPC `get_my_org_id`, URL params. Non sono writes, non interessano mig 056.

Esempi:
- `lib/db/_client.js:29`: `await supabase.rpc('get_my_org_id')`
- `notifications.js:152, 169, 189`
- `AdminNotifSettings.jsx:23`, `MobileLayout.jsx:448`

---

## (C) ZONA GRIGIA

**Conteggio: 7 occorrenze ambigue**, da valutare caso per caso. Nessuna **rompe** la mig 056, ma alcune sono semanticamente deboli e meritano cleanup pre o post.

### C.1 — `lib/db/interventions.js:646`

```js
const orgId = data.org_id || (supabase ? await getMyOrgId() : 'demo-org')
```

**Perché è ambigua**: il `'demo-org'` ternary è raggiungibile solo se `supabase` è null. Però se `data.org_id` arriva dal caller con valore arbitrario (es. un test che passa `data.org_id = 'qualcosa'`), va in `supabase.from('interventions').insert()` senza alcuna validazione client-side. Post-056 il CHECK rifiuta. Pattern semanticamente debole: il `|| ... : 'demo-org'` mescola due preoccupazioni (Supabase fallback + demo fallback).

**Fix candidato (post)**: refactor a `data.org_id || await getMyOrgId()`. Se `supabase` è null, `getMyOrgId()` ritorna già `DEMO_ORG_ID` (vedi `_client.js:28`).

### C.2 — `lib/db/interventions.js:763`

```js
const orgId = data.org_id || (supabase ? await getMyOrgId() : 'demo-org')
```

**Perché è ambigua**: identica a C.1, riapparso nello shim deprecato `createIntervention(data)`. Stesso pattern, stesso fix candidato.

### C.3 — `lib/db/interventions.js:111`

```js
list.push({ ..., org_id: orgId || 'demo-org', ... })
```

**Perché è ambigua**: dentro la demo path (localStorage write). Hardcoded `'demo-org'` letterale invece di `DEMO_ORG_ID` importato. Sicuro **oggi** (è demo path), ma se un refactor futuro fonde demo + supabase path, finisce in Supabase con stringa non-UUID. Inconsistenza nominale: gli altri demo path usano `DEMO_ORG_ID`, questo usa letterale.

### C.4 — `lib/db/_demoStore.js:35`

```js
if (!u.org_id) { u.org_id = DEMO_ORG_ID; changed = true }
```

**Perché è ambigua**: in `ensureDefaultAdmin`, retrofitta gli utenti localStorage senza `org_id` impostando `'demo-org'`. **Scenario teorico problematico**: se uno stesso user record passa poi a Supabase mode mantenendo `org_id = 'demo-org'` (es. switch demo→prod), gli INSERT con pattern B.2 (`org_id: user?.org_id`) finiscono con `'demo-org'` → post-056 CHECK fail. Improbabile in produzione (login Supabase popola `user` fresh), ma è il punto di rischio maggiore di tutto il client.

**Fix candidato (pre)**: nessuno strutturale. Aggiungere un check di consistenza al login (`if (user.org_id === 'demo-org') resetOrgIdCache() + logout`) sarebbe overkill. Documentare il rischio e fidarsi del flow `Supabase login → user dalla tabella users → org_id UUID dal DB`.

### C.5 — `lib/db/reports.js:13`

```js
if ((r.org_id || 'demo') !== (orgId || 'demo')) return false
```

**Perché è ambigua**: read filter in `computeDisplayIdDemo` (utility demo-only per replicare il trigger DB mig 049). Usa fallback `'demo'` (5 lettere) invece di `'demo-org'` o `DEMO_ORG_ID`. Inconsistenza nominale che non rompe nulla — è solo per filtrare un array localStorage. Però è confusing perché ci sono tre stringhe fallback diverse nel codebase: `'default'`, `'demo'`, `'demo-org'`.

**Fix candidato (post, cosmetico)**: usare `DEMO_ORG_ID` importato.

### C.6 — `lib/db/reports.js:57`

```js
const display_id = computeDisplayIdDemo(report.org_id, createdAt, list)
```

**Perché è ambigua**: chiamata a C.5. Se `report.org_id` è null/undefined viene passato e la utility fallback a `'demo'`. Demo-only, non rompe Supabase.

### C.7 — `components/layout/MobileLayout.jsx:448`

```js
const { ... } = usePWA(handleNotifClick, { userId: user?.id, orgId: user?.org_id })
```

**Perché è ambigua**: passa `user?.org_id` al hook `usePWA`. Se `user` non è caricato (race condition al mount), `orgId` è `undefined` → l'hook chiama `notifications.savePushSubscription` con `orgId: undefined` → `org_id: undefined` in Supabase upsert → fallisce su NOT NULL. Pre-056 fallisce uguale, quindi post-056 non peggiora. È borderline più che ambiguo.

**Fix candidato (post)**: il hook può chiamare `getMyOrgId()` se `orgId` arriva undefined. Già coperto da pattern B.1 in `notifications.js:9`.

---

## Conteggio finale

| Categoria | Conteggio |
|---|---|
| **(A) WRITES DA BONIFICARE** (org_id hardcoded a stringa fissa, su Supabase) | **0** |
| **(B) WRITES E LETTURE SICURE** (pattern UUID-safe) | **~57 write + ~12 read** |
| **(C) ZONA GRIGIA** (ambiguità semantica, scenario teorico, inconsistenza nominale) | **7** |

## Decisione operativa proposta

**Mig 056 applicabile senza bonifica client preventiva.** Nessun write in Supabase passa stringa fissa non-UUID. Tutti i `DEMO_ORG_ID` sono confinati a demo path.

Cleanup post-056 raccomandato (basso priorità, cosmetico):
- C.1 + C.2: unificare il pattern `data.org_id || (supabase ? await getMyOrgId() : 'demo-org')` → `data.org_id || await getMyOrgId()`. ~5 minuti.
- C.3: sostituire letterale `'demo-org'` con `DEMO_ORG_ID` importato. ~1 minuto.
- C.5: sostituire `'demo'` con `DEMO_ORG_ID`. ~1 minuto.

Cleanup pre-056 **non necessario**. Il caso C.4 (retrofit `_demoStore.js`) resta come documentazione del rischio teorico — il flow `Supabase login → user.org_id` è già robusto.

**Smoke test post-056 ancora obbligatorio**: `INSERT INTO public.activities (org_id, type, user_name) VALUES ('default', 'test', 'test')` deve fallire con `activities_org_id_uuid_check` violation. Conferma il CHECK è attivo.
