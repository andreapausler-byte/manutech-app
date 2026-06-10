# Recon mirata — policy `public.users` (stato vivo vs repo)

- **Data:** 2026-06-10
- **Branch:** `claude/recon-policy-users` (docs-only)
- **Supabase project ref:** `jjrgrkxcnqltlkcnqyoi`
- **Scope:** SOLA LETTURA. Fotografia dello stato vivo delle policy/RLS su `public.users` + lista esatta delle divergenze rispetto al repo + mappa dei flussi applicativi che dipendono da quelle policy. **Nessun fix, nessun SQL di modifica.**
- **Premessa:** la Fase 0 ha rilevato drift file↔DB su `public.users`. Questo recon serve a far scrivere un hotfix di sicurezza su basi affidabili (lo stato VIVO), non sui file.

## Accesso DB

`psql` è presente nel container ma **non c'è connection string/credenziali** nell'ambiente → **Parte 1 va eseguita da Andrea** nel SQL Editor. Le query sono tutte `SELECT` (sola lettura). Parti 2 e 3 sono ricavate dal repo e sono complete; la Parte 1 incorpora già quanto noto dalla Fase 0 e va finalizzata con l'output grezzo.

---

## Parte 1 — Stato VIVO (da eseguire in prod)

### Query 1a — Tutte le policy su `public.users`
```sql
select policyname, permissive, roles, cmd,
       qual as using_expr, with_check as check_expr
from pg_policies
where schemaname='public' and tablename='users'
order by cmd, policyname;
```

**OUTPUT VIVO CONFERMATO (10/6):**

| policyname | permissive | roles | cmd | using_expr (`qual`) | check_expr (`with_check`) |
|---|---|---|---|---|---|
| `users_insert_anyone` | PERMISSIVE | **`{public}`** | INSERT | `null` | **`true`** |
| `users_select_same_org` | PERMISSIVE | `{authenticated}` | SELECT | `org_id = get_my_org_id()` | `null` |
| `users_update` | PERMISSIVE | `{authenticated}` | UPDATE | `auth_id = auth.uid() OR get_my_role() IN ('admin','super_admin')` | **`null`** |

> ✅ **Nessuna policy DELETE — CONFERMATO** (Q1a restituisce solo queste 3 righe). Con RLS attiva e nessuna policy DELETE, ogni `DELETE` è negato (0 righe, default-deny).
>
> 🔴 **NUOVO FINDING — `users_insert_anyone` è `TO {public}`, non `{authenticated}`.** Le altre due policy sono `{authenticated}`; solo l'INSERT è aperta a `public`, che in Postgres **include il ruolo `anon`** (non autenticato). Combinato con `WITH CHECK (true)`, significa che la RLS **non richiede login** per inserire in `public.users`. L'effettiva sfruttabilità da `anon` dipende dal **GRANT di tabella** verso `anon` (default Supabase: `anon`/`authenticated` hanno privilegi DML sulle tabelle `public`, con la RLS come unico cancello). Se il GRANT c'è, **un client con la sola anon key può creare righe arbitrarie in `users`** (qualsiasi `role`/`org_id`/`auth_id`). Da verificare con: `select has_table_privilege('anon','public.users','INSERT');` (SELECT, sola lettura).

### Query 1b — RLS attiva? forzata?
```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname='users';
```
**OUTPUT VIVO CONFERMATO:** `relrowsecurity = true`, `relforcerowsecurity = false`.
- RLS **attiva**, **non forzata**. `force=false` → il **proprietario della tabella** (ruolo `postgres`/owner) e i ruoli con `BYPASSRLS` (incluso `service_role`) **saltano le policy** — coerente con i percorsi P1/P2/P3 della Parte 3 (`SECURITY DEFINER` + `service_role` grant §035) che scrivono `users` aggirando la RLS.
- _(Nota: la query non filtra lo schema, quindi le 2 righe restituite sono `public.users` **e** `auth.users` — entrambe `rowsecurity=true, force=false`. Quella rilevante è `public.users`.)_

### Query 1c — Definizione viva di `get_my_role()` e helper `%role%`
```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on p.pronamespace=n.oid
where n.nspname='public' and p.proname ilike '%role%';
```
**OUTPUT VIVO CONFERMATO** — un solo match (`get_my_role`), corpo vivo:
```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1
$function$
```
- ✅ **Coincide ESATTAMENTE con la baseline** del repo (`schema.sql:303`): `LANGUAGE sql`, `STABLE`, **`SECURITY DEFINER`**. **Nessun drift sulla funzione** — l'helper è pulito; il drift è solo su policy e constraint.
- `SECURITY DEFINER` confermato (necessario: legge `users` aggirando la RLS di `users` stessa → evita ricorsione infinita nelle policy che lo chiamano).
- **Un solo helper** con `role` nel nome: nessun altro `get_my_*role*`/wrapper nascosto. (`list_pending_orgs`/`approve_org`/`reject_org` non matchano `%role%` nel *nome* → non compaiono qui, ma usano `get_my_role` nel corpo — già mappate in Fase 0.)

> 📌 **Cosa ha aggiunto la Parte 1 rispetto alla Fase 0:** `permissive`+`roles` (Q1a) → ha scoperto l'INSERT `TO {public}`; `relforcerowsecurity=false` (Q1b); corpo vivo di `get_my_role` identico alla baseline (Q1c). Il finding più pesante è il **`{public}` sull'INSERT**, emerso solo grazie alla colonna `roles`.

---

## Parte 2 — Migrazioni che toccano le policy di `users` o `get_my_role` (in ordine) + divergenze

### Inventario cronologico (solo ciò che tocca **policy di `users`**, **`get_my_role`**, o le **funzioni SECURITY DEFINER che scrivono `users`**)

| # | File | Cosa tocca su `users`/ruolo | Riflesso nel vivo? |
|---|---|---|---|
| base | `supabase/schema.sql` | Definisce `get_my_role()` (`:303`); policy **`users_select`** (`:328`, USING `org_id=get_my_org_id()`), **`users_insert`** (`:333`, WITH CHECK `auth_id=auth.uid()`), **`users_update`** (`:338`, USING `auth_id=auth.uid() OR get_my_role()='admin'`, **no WITH CHECK**), **`users_delete`** (`:343`, USING `get_my_role()='admin' AND org`); trigger `handle_new_user()` (`:556`) | **PARZIALE / NO** — vedi divergenze D1,D2 |
| 014 | `014_resolve_profile_rpc.sql` | `resolve_my_profile()` (SECURITY DEFINER, materializza riga `users`) | superato da 029/035 |
| 029 | `029_invite_only_system.sql` | Colonne `users` (`invite_token`,`status`), indici; aggiorna `resolve_my_profile` (richiede `status='active'`). **Non altera le policy** | n/d (non policy) |
| 031 | `031_fix_handle_new_user_invite.sql` | Riscrive `handle_new_user()` per invito | superato da 032/034 |
| 032 | `032_organizations.sql` | Riscrive `handle_new_user()` (Caso A nuova org→`admin`, Caso B org esistente→`operatore`) | base del vivo (vedi 034) |
| 034 | `034_signup_via_edge_escape_hatch.sql` | Riscrive `handle_new_user()` aggiungendo escape-hatch `_signup_via_edge` | **versione viva attesa** del trigger |
| 035 | `035_grant_service_role_signup.sql` | `GRANT SELECT,INSERT,UPDATE,DELETE ON public.users TO service_role` (`:29`) | **privilegio**, non policy — da confermare con `\dp users` se serve |
| 035 | `035_org_approval.sql` | Estende `resolve_my_profile` con `org_approval_status` | versione viva attesa della RPC |
| 036 | `036_super_admin_role.sql` | **Constraint** `users_role_check` → 4 ruoli; RPC super_admin (usano `get_my_role`) | 🔴 **NO — non applicata** (vivo = 3 ruoli) |
| 039 | `039_users_admin_super_admin.sql` | DROP+CREATE **`users_update`** (aggiunge `super_admin`); DROP+CREATE **`users_delete`** (aggiunge `super_admin`) | 🟡 **PARZIALE**: update sì, delete no — vedi D3 |

> Nota: `get_my_role()` è **definita una sola volta** (in `schema.sql:303`); **nessuna migrazione la ridefinisce** — la usano e basta. Quindi il corpo vivo (Q1c) dovrebbe combaciare con la baseline, salvo patch manuali.

### 🎯 Lista esatta delle divergenze (vivo ≠ repo)

**D1 — `users_select`: nome diverso, logica uguale.**
Repo: policy chiamata **`users_select`** (`schema.sql:328`). Vivo: **`users_select_same_org`**. Stessa espressione (`org_id = get_my_org_id()`), ma **il nome non esiste da nessuna parte nel repo** (verificato: `grep users_select_same_org` → 0 risultati in `supabase/`). → La policy SELECT viva **non proviene dai file committati**.

**D2 — `users_insert`: nome diverso, logica più permissiva, E ruolo `public`.** 🔴🔴
Repo: policy **`users_insert`**, `TO authenticated`, **`WITH CHECK (auth_id = auth.uid())`** (`schema.sql:333`) — solo la *propria* riga, solo da loggato. Vivo: **`users_insert_anyone`**, **`TO {public}`**, **`WITH CHECK (true)`** — chiunque (incluso `anon`) può inserire **qualsiasi** riga (role/org_id/auth_id arbitrari). Il nome `users_insert_anyone` **non esiste nel repo** (`grep` → 0). → La policy INSERT viva **non proviene dai file** ed è **doppiamente più larga** della baseline: (a) nessun vincolo sui valori (`true` vs `auth_id=auth.uid()`), (b) **estesa a `public`/`anon`** (vs `authenticated`). Le altre due policy `users` sono `{authenticated}`: l'INSERT è l'unica `{public}`, indizio che è stata creata da uno script di bootstrap diverso. (Razionale applicativo legittimo: vedi Parte 3 — serve a creare voci-anagrafica senza `auth_id`; ma né `public`, né l'assenza di gate admin sono giustificati da quel flusso.)

**D3 — `users_update`: applicata (039); `users_delete`: assente.** 🔴
- `users_update` vivo (`qual = auth_id=auth.uid() OR get_my_role() IN ('admin','super_admin')`, `with_check=null`) **coincide con `039`** (nome + espressione) → **039 §1 applicata**.
- `users_delete`: **nessuna policy DELETE nel vivo** (da confermare Q1a integrale). Ma `039 §2` la (ri)definisce e anche `schema.sql:343` la definisce. → Né la baseline né `039 §2` risultano riflesse: la DELETE policy **è stata rimossa/mai applicata** in prod. Incoerenza interna: 039 è metà applicata (update sì, delete no).

**D4 — Constraint `036` non applicata.** 🔴 (già da Fase 0, qui per completezza del filo `users`)
`users_role_check` vivo = `('operatore','tecnico','admin')` (3 ruoli) mentre `036` lo porta a 4. → Le policy/funzioni vive **nominano `super_admin`** (`users_update`, RPC) ma il **constraint lo vieta** → stato logicamente incoerente (`get_my_role()` non potrà mai restituire `super_admin`).

**Sintesi divergenze:** la tripletta viva di `users` è **`users_select_same_org` / `users_insert_anyone` / `users_update`** — di cui **due nomi (`*_same_org`, `*_anyone`) non esistono nel repo** e una (`users_update`) proviene da `039`. **Manca `users_delete`.** Conclusione: **la produzione è stata inizializzata da uno script di bootstrap diverso dal `schema.sql` committato** (probabilmente una versione precedente/ad-hoc), e poi patchata solo da *alcune* migrazioni (`039 §1` sì; `036` e `039 §2` no). I file `supabase/` **non sono un'immagine fedele del DB** per questa tabella.

---

## Parte 3 — Flussi applicativi che dipendono dalle policy di `users`

### Chi scrive in `public.users` — 4 percorsi, solo 1 passa dalla RLS

| # | Percorso | File · entrypoint | Ruolo DB di esecuzione | Soggetto a RLS `users_*`? |
|---|---|---|---|---|
| P1 | **Trigger `handle_new_user`** su `auth.users` INSERT (signup) | `032`→`034` (vivo); `schema.sql:556` | `SECURITY DEFINER` (owner) | **No** — bypassa RLS |
| P2 | **RPC `resolve_my_profile`** (materializza/linka riga al login) | `014`→`029`→`035` | `SECURITY DEFINER` | **No** — bypassa RLS |
| P3 | **Edge `signup-org`** (provisioning org+admin) | `supabase/functions/signup-org/lib/provision.ts:137` | `service_role` (grant DML, `035_grant_service_role_signup.sql:29`) | **No** — `service_role` bypassa RLS |
| P4 | **Client `db.createUser`** (INSERT diretto) | `src/lib/db/auth.js:19` (`supabase.from('users').insert`) | `authenticated` (utente loggato) | **SÌ** — unico path che dipende da `users_insert_*` |

**Conclusione chiave (la domanda del briefing):** `users_insert_anyone WITH CHECK(true)` **non serve alla registrazione** (P1/P2/P3 la gestiscono tutte via SECURITY DEFINER/`service_role`, aggirando la RLS). Serve **esclusivamente a P4**, e P4 ha **un solo chiamante**:

- **`src/pages/admin/AdminUsers.jsx:182`** → crea un utente **fornitore/anagrafica** con `db.createUser({ name, email: <…>@esterno.local (fake), role:'tecnico', org_id, status:'active' })` — **senza `auth_id`** (è una voce-roster, non un account di login).

Questo spiega due cose della Fase 0:
1. **I 15 profili su 31 senza `auth_id`** (anagrafica) sono creati da questo flusso (admin che aggiunge fornitori/tecnici esterni).
2. **Perché il vivo diverge dalla baseline:** la policy repo `users_insert` con `WITH CHECK (auth_id = auth.uid())` **rifiuterebbe** questi insert (la riga ha `auth_id` NULL ≠ `auth.uid()`). Chi ha configurato la prod ha quindi (deliberatamente o per copia di uno script più vecchio) una policy INSERT **senza vincolo**. → `users_insert_anyone` **non è puro residuo: abilita una feature reale** (creazione anagrafica esterni). Ma è **implementata troppo larga**: non c'è gate `get_my_role()='admin'` né `org_id = get_my_org_id()`, quindi *qualunque* `authenticated` (non solo admin) potrebbe inserire righe arbitrarie. La feature è raggiunta in-app solo da admin (pagina sotto `V6App`), ma **la RLS non lo impone**.

### Altri flussi che dipendono dalle policy `users`

- **`db.updateUser`** (`auth.js:42`, INSERT→UPDATE su `users`, ruolo `authenticated`, soggetto a **`users_update`**). Chiamanti:
  - `AdminUsers.jsx:146` — **cambio ruolo** utente (`{ role: newRole }`) → richiede `get_my_role() IN ('admin','super_admin')` del vivo.
  - `AdminUsers.jsx:194` — rinomina fornitore.
  - `technicians/TechnicianDetailSheet.jsx:53` — aggiorna scheda tecnico.
  - ⚠️ La `users_update` viva ha **`with_check=null`** → il ramo `auth_id=auth.uid()` consente all'utente di modificare la *propria* riga **senza validazione del nuovo valore**, incluso `role` (self-elevation; già finding Fase 0). Nessun chiamante app fa self-update di `role`, ma la RLS lo permette via API.
- **`db.deleteUser`** (`auth.js:32`, DELETE su `users`, soggetto a **`users_delete`**). Chiamanti:
  - `AdminUsers.jsx:212` e `AdminUsers.jsx:223` — **eliminazione utente da UI admin**.
  - 🔴 **Conseguenza viva:** poiché nel vivo **manca la policy DELETE** (D3), con RLS attiva un `DELETE` da `authenticated` colpisce **0 righe** (PostgREST non solleva errore su 0 righe cancellate) → l'azione "Elimina utente" nell'app admin è **un no-op silenzioso** in produzione (toast di successo, utente non rimosso). È una **conseguenza funzionale del drift**, non solo formale. _(Da confermare con Q1a integrale che DELETE sia davvero assente.)_
- **Letture `users`** in Edge (tutte `service_role`, bypassano RLS, solo SELECT): `send-email-notification/index.ts:187,194`, `send-push-notification/index.ts:372`, `send-weekly-digest/index.ts:422`. Non dipendono dalle policy `authenticated`. `interventions.js:1225` legge `users` (SELECT, soggetto a `users_select_same_org`).

---

## Fotografia sintetica (per l'autore dell'hotfix)

1. **Tripletta viva (RLS on, force off):** `users_select_same_org` (SELECT, `{authenticated}`, org-scoped) · `users_insert_anyone` (INSERT, **`{public}`**, **WITH CHECK true**) · `users_update` (UPDATE, `{authenticated}`, `auth_id=auth.uid() OR get_my_role() IN(admin,super_admin)`, **WITH CHECK null**). **Nessuna DELETE.** `get_my_role()` vivo = identico alla baseline.
2. **Due delle tre policy vive hanno nomi che non esistono nel repo** → bootstrap da script non versionato; i file non sono affidabili come specchio.
3. **`036` non applicata** (constraint a 3 ruoli) e **`039 §2`/`users_delete` non riflessa** → stato incoerente (policy nominano `super_admin` vietato; delete mancante rende la cancellazione utenti in-app un **no-op silenzioso**).
4. **`users_insert_anyone` ha una ragione applicativa reale** (P4 = creazione anagrafica esterni senza `auth_id`, `AdminUsers.jsx:182`): **non si può semplicemente ripristinare** la versione repo `WITH CHECK (auth_id=auth.uid())` senza **rompere** quella feature. Qualsiasi irrigidimento deve preservare l'insert di righe senza `auth_id` **da parte di un admin**.
5. **Tre buchi su `users`**, nessuno richiesto da un flusso app legittimo: (a) 🔴🔴 **INSERT aperta a `public`/`anon` con `WITH CHECK true`** (potenziale insert non autenticato — verificare `has_table_privilege('anon','public.users','INSERT')`); (b) 🔴 **self-elevation** (`users_update` senza `with_check`, l'utente può cambiarsi `role` sulla propria riga); (c) 🟠 **DELETE mancante** (rompe la feature, non un rischio di sicurezza). La priorità d'impatto è (a) → (b) → (c).

---

## Gate

Sola lettura. Nessuna modifica a schema/codice; unico write: questo file. Nessun fix proposto, nessun SQL di modifica. **Parte 1 completata** con output vivo (Q1a/Q1b/Q1c): tripletta policy con `permissive`/`roles`, `relrowsecurity=true`/`relforcerowsecurity=false`, corpo vivo di `get_my_role()` identico alla baseline, **assenza policy DELETE confermata**. Unico residuo opzionale (SELECT, sola lettura): `select has_table_privilege('anon','public.users','INSERT');` per quantificare la sfruttabilità da `anon` del finding D2.
