# Diagnostica sistema ruoli — Fase 0 (sola lettura)

- **Data:** 2026-06-10
- **Branch:** `claude/diagnostica-ruoli-vgrf08`
- **Supabase project ref:** `jjrgrkxcnqltlkcnqyoi`
- **Autore:** Claude Code (sessione di ricognizione)
- **Scope:** ricognizione di come il ruolo è modellato OGGI (DB + frontend). **Nessuna modifica a schema o codice applicativo.** Unico write: questo file.

## Nota metodologica importante — leggere prima di tutto

Questa sessione gira in un container remoto **senza accesso diretto al database di produzione**. Le diagnostiche della **Sezione A** sono quindi state condotte sui **file versionati** che rispecchiano lo schema (`supabase/schema.sql` + le 56 migrazioni in `supabase/migrations/`), che sono la *fonte di verità del codice*. Per ogni query A1–A7 trovi:

1. la **query SQL esatta** da incollare nel SQL Editor di `jjrgrkxcnqltlkcnqyoi` (Andrea);
2. la **risposta prevista** ricavata dai file di migrazione, marcata _“previsto — da confermare in prod”_;
3. una **lettura sintetica**.

⚠️ Le sezioni che dipendono da **dati reali** (A2 distribuzione valori, A3 inventario auth.users, A5-bis verifica enforcement live, Sezione C conteggi righe) **richiedono l'esecuzione delle query in prod** e sono lasciate con i placeholder da compilare. Dove le migrazioni e il codice frontend **divergono** (e divergono in modo sostanziale), è segnalato in §Divergenze.

---

## ⭐ Dati di produzione confermati (2026-06-10)

> Query ①②③④ eseguite in prod da Andrea. **Questi dati hanno la precedenza** sulle previsioni "dai file" delle sezioni sottostanti, e rivelano un **drift sostanziale tra migrazioni versionate e DB reale**.

### Distribuzione ruoli reale (A2)

| role | count |
|---|---|
| `tecnico` | 24 |
| `admin` | 6 |
| `operatore` | 1 |
| **totale** | **31** |

- **`super_admin`: 0 righe. `fornitore`: 0 righe.** Nessuno detiene questi ruoli in produzione.
- Distribuzione **clamorosamente sbilanciata**: `tecnico` è di fatto il ruolo-default/discarica; un solo `operatore` a fronte di un'intera `OperatorApp` dedicata. Parte dei 6 admin + 24 tecnico sono **doppi account della stessa persona** (vedi Sezione C confermata).

### Constraint reale (A4) — 🔴 DRIFT

```
users_role_check                     → CHECK (role IN ('operatore','tecnico','admin'))
notification_preferences_role_check  → CHECK (role IN ('operatore','tecnico','admin'))
assistant_messages_role_check        → CHECK (role IN ('user','assistant'))   -- dominio LLM
```

**Il constraint in produzione ammette SOLO 3 ruoli.** La migrazione `036_super_admin_role.sql` (che estendeva il constraint a `super_admin`) **NON è applicata in prod** (o è stata fatta girare la sua `_down`). I file di migrazione **divergono dal DB reale**. Conseguenza: in prod `super_admin` è **impossibile da assegnare** (un `UPDATE ... SET role='super_admin'` fallirebbe il check) → tutta l'infrastruttura super_admin (RPC `list_pending_orgs`/`approve_org`/`reject_org`, ramo routing `App.jsx`) è **codice morto in produzione**.

### Policy `public.users` reali (A5 / A5-bis) — 🔴 SELF-ELEVATION + DRIFT

| policyname | cmd | qual | with_check |
|---|---|---|---|
| `users_insert_anyone` | INSERT | `null` | `true` |
| `users_select_same_org` | SELECT | `org_id = get_my_org_id()` | `null` |
| `users_update` | UPDATE | `auth_id = auth.uid() OR get_my_role() IN ('admin','super_admin')` | **`null`** |

Tre finding confermati dai dati reali:

1. **🔴 Self-elevation reale in produzione.** `users_update` ha `with_check = null` e `qual` include `auth_id = auth.uid()`. Senza `WITH CHECK`, Postgres riusa la `USING`: un utente autenticato può eseguire via API `update public.users set role='admin' where auth_id=auth.uid()` e **la RLS lo consente**. Tetto = solo il constraint (3 ruoli) → non può farsi `super_admin`, ma **può promuoversi ad `admin`**. Buco di privilege-escalation attivo. La UI non lo espone, ma la RLS è il confine reale.

2. **🔴 Stato incoerente su due fronti.** La policy `users_update` **nomina `super_admin`** (quindi la migrazione `039` *è* applicata) mentre il constraint **vieta `super_admin`** (`036` *non* applicata). 039 dipende logicamente da 036, ma in prod c'è 039 senza 036. Funzionalmente innocuo (`get_my_role()` non restituirà mai `super_admin`), ma è drift conclamato.

3. **🟠 Le policy reali divergono dai file anche nei nomi e nell'insieme.** In prod: `users_insert_anyone`, `users_select_same_org`; nei file (`schema.sql`): `users_insert`, `users_select`, `users_delete`. Solo `users_update` combacia nel nome. Inoltre:
   - **`users_insert_anyone` ha `with_check = true`** → l'INSERT su `public.users` non valida nulla (role/org_id/auth_id arbitrari). Secondo vettore di permissività (mitigato da `auth_id UNIQUE`); verificare se intenzionale per il signup.
   - **NON esiste policy `users_delete`** in prod (RLS attiva + nessuna policy DELETE = default-deny: nessuno cancella utenti via API). Diverge da `039`.
   - Implicazione: **la produzione è stata inizializzata da uno script diverso/più vecchio** di `schema.sql` committato, poi patchata da *alcune* migrazioni (039 sì) e non altre (036 no). I file in repo **non sono una rappresentazione affidabile dello stato DB reale** — assunzione da incorporare nella proposal.

### Inventario auth + doppi account (A3 / Sezione C)

Tutti gli account hanno `org_id='default'` (singola org "Amarcord"). Il ruolo nei metadata JWT è **solo seed**; i **ruoli reali** (`public.users.role`) e i **pesi** (righe collegate) sono stati misurati in prod.

**Doppi account — esito con ruoli reali + peso:**

| persona | account A (email · ruolo reale) | account B (email · ruolo reale) | peso A | peso B | verdetto preliminare |
|---|---|---|---|---|---|
| **Lorenzo Pupita** | `ctcantina@amarcord.it` · tecnico | `pupitalorenzo@gmail.com` · admin | ~5 righe (1 assegnato, 1 commento, 3 attività) | ~4 righe (1 creato, 3 assegnati) | ✅ **merge facile** — entrambi leggeri. È **il caso del briefing**. Tenere l'account personale come tetto admin, deprecare/rimappare la postazione tecnico. |
| **Andrea Pausler** | `andrea.pausler@amarcord.it` · admin (org-owner) | `andrea.pausler@gmail.com` · tecnico | **~627 righe** (7 report, 167 commenti, 436 attività, 24 interventi) | **~219 righe** (19 report, 7 assegnati, 77 commenti, 113 attività, 3 interventi) | ⚠️ **merge oneroso** — entrambi pesanti. Probabile **dual-use volontario del founder** (admin reale + account tecnico per test sul campo). Da decidere caso a sé: merge con rimappatura FK pesante, oppure mantenere separati e applicare il modello "tetto+modalità" così che basti un solo account. |
| **Aneta** | `aneta@gmail.com` · — (**orfano**: in `auth.users`, **nessun profilo** `public.users`) | `anetanwczk@gmail.com` · operatore | — (login mai completato) | **0 righe** | 🧹 **non è un vero doppione** — pulizia banale: `aneta@gmail.com` è una registrazione abbandonata; `anetanwczk` è l'unico `operatore` ma **completamente inattivo** (0 righe ovunque). |

**Pattern strutturale scoperto:** convivono **email funzionali di postazione/reparto** (`@amarcord.it`: `ctcantina`, `ctsalacotte`, `ctriempimenti`, `qc`, `manutenzione`, `magazzino`, `tank`) ed **email personali** (gmail/outlook/virgilio). Alcune persone hanno **entrambe** → la duplicazione non è "due email a caso", è **"account-postazione + account-personale"**. ✅ **Confermato da Andrea (Passo C):** le email-postazione (`qc@`, `manutenzione@`, `magazzino@`, …) sono **di una persona ciascuna**, NON caselle condivise. Quindi il principio **"identità unica"** del design di destinazione **regge senza eccezioni**: ogni email = una persona fisica; i doppioni sono semplicemente la stessa persona con due account (postazione + personale), da consolidare in uno solo col modello "tetto+modalità".

**🔴 Solo metà dei profili può fare login — CONFERMATO.** Query di riconciliazione: `totale_profili=31, profili_senza_auth=15, profili_con_auth=16`. Quindi **15 profili `public.users` su 31 hanno `auth_id` NULL** → sono **voci di anagrafica/roster senza account di login** (quasi tutti `tecnico`: spiega i 24 "tecnico" a fronte di soli ~16 login reali). Simmetricamente, `aneta@gmail.com` è l'inverso: account `auth.users` **senza** profilo (registrazione abbandonata). **Due implicazioni vincolanti per la proposal:**
> 1. **Distinguere *utente-login* da *voce-anagrafica*.** Un profilo roster ha un `granted_role` ma **nessuna sessione e nessun `active_mode`** (non logga). Il modello "tetto+modalità" deve reggere profili senza identità auth (es. tecnici nominabili su un intervento ma che non aprono l'app).
> 2. **La distribuzione ruoli "reale" va riletta:** dei 24 `tecnico`, la maggioranza è anagrafica non-loggante; gli utenti-app effettivi sono ~16. Il vero bacino su cui calibrare l'esperienza multi-ruolo è quello.

### Note correttive alle previsioni sottostanti

- A2/A4: il ruolo reale ha **3 livelli, non 4**. `super_admin` è previsto solo nei file, assente da constraint e dati prod.
- A5-bis: la previsione "self-elevation possibile" è **confermata** dai dati live (`with_check = null`).
- Divergenza #1 (`fornitore`): risolta come **scenario (c) — codice dormiente** (0 righe, non nel constraint).
- Nuova divergenza emersa: **drift migrazioni↔prod** su constraint (036), policy names/insert/delete (vedi §Divergenze #4-bis).

---

## Sezione A — Diagnostica database

### A1 — Dove vive il ruolo (colonne)

```sql
select table_schema, table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns
where (column_name ilike '%role%' or column_name ilike '%ruolo%')
  and table_schema in ('public', 'auth')
order by table_schema, table_name, ordinal_position;
```

**Previsto — da confermare in prod** (colonne `*role*` presenti nei file):

| schema | tabella | colonna | tipo | default | note |
|---|---|---|---|---|---|
| public | `users` | `role` | text | `'operatore'` | **la colonna che fa fede** (autorità) |
| public | `comments` | `user_role` | text | — | denormalizzazione (snapshot ruolo autore commento) |
| public | `direct_messages` | `sender_role` | text | — | denormalizzazione (snapshot ruolo mittente DM) |
| public | `push_subscriptions` | `role` | text | — | snapshot ruolo al momento della subscription (`007`) |
| public | `assistant_messages` | `role` | text | — | **NON è il ruolo applicativo**: enum `('user','assistant')` del bot AI (`026`) |
| auth | `users` | `raw_user_meta_data->>'role'` | jsonb (chiave) | — | **solo seed**: usato come default alla creazione riga `public.users`, non riletto a runtime |

**Lettura:** il ruolo applicativo vive in **`public.users.role`**. Le altre colonne `*role*` sono denormalizzazioni storiche (snapshot) o appartengono ad altri domini (`assistant_messages.role` è il ruolo della conversazione LLM, non dell'utente). La chiave `role` dentro `auth.users.raw_user_meta_data` è **solo un seme**: viene letta una volta sola alla prima materializzazione del profilo (`resolve_my_profile`, `handle_new_user`) con `COALESCE(... ->>'role', 'operatore')`, poi mai più. → **Risposta Q1: la colonna `public.users.role` fa fede; il metadata JWT è seed-only.**

### A2 — Distribuzione dei valori reali

```sql
select role, count(*) from public.users group by role order by count(*) desc;
```

**DA ESEGUIRE IN PROD — placeholder:**

| role | count |
|---|---|
| `…` | `…` |

**Stringhe-valore ammesse oggi** (dalla CHECK constraint, vedi A4): `'operatore'`, `'tecnico'`, `'admin'`, `'super_admin'` — tutte minuscole, inglese tranne `operatore`/`tecnico` (italiano). ⚠️ **`'fornitore'` NON è tra i valori ammessi dal constraint nei file**, eppure il frontend lo tratta come ruolo di prima classe (vedi §Divergenze #1). Questa query rivelerà se in prod esistono righe `role='fornitore'` (→ il constraint live diverge dai file) oppure no (→ il codice `fornitore` è dormiente).

### A3 — Metadati auth (claim JWT) + inventario account

```sql
select id, email, raw_app_meta_data, raw_user_meta_data, created_at
from auth.users
order by created_at;
```

**DA ESEGUIRE IN PROD** (~29 utenti attesi). Per ogni riga verificare: il ruolo compare in `raw_user_meta_data->>'role'`? Coincide con `public.users.role`? **Atteso dai file:** il metadata contiene il ruolo *iniziale* (seed al signup/invito) e può **divergere** da `public.users.role` se un admin ha successivamente cambiato ruolo via UI (che aggiorna solo `public.users`, non il metadata auth). Quindi: **in caso di disallineamento, fa fede `public.users.role`.**

Placeholder inventario:

| email | created_at | meta.role (seed) | users.role (autorità) | allineati? |
|---|---|---|---|---|
| `…` | `…` | `…` | `…` | `…` |

### A4 — Vincoli ed enum sul ruolo

```sql
select conrelid::regclass as tabella, conname, pg_get_constraintdef(oid) as definizione
from pg_constraint
where pg_get_constraintdef(oid) ilike '%role%';

select t.typname as enum_type, e.enumlabel as valore
from pg_type t join pg_enum e on t.oid = e.enumtypid
order by t.typname, e.enumsortorder;
```

**Previsto — da confermare in prod:**

- **`users_role_check`** (su `public.users`) — ultima definizione nei file da `036_super_admin_role.sql`:
  ```sql
  CHECK (role IN ('operatore', 'tecnico', 'admin', 'super_admin'))
  ```
- `push_subscriptions.role` ha un proprio check `('operatore','tecnico','admin')` (`007` — **non aggiornato a super_admin**, debito minore).
- `assistant_messages.role` check `('user','assistant')` — dominio LLM, ignorare.
- **Nessun tipo ENUM Postgres** per il ruolo: è modellato come `TEXT` + `CHECK`. La seconda query (enum) non dovrebbe restituire alcun `enum_type` legato ai ruoli applicativi.

**Lettura:** il ruolo è un `TEXT` libero protetto da una **CHECK constraint**, non un `ENUM`. → **Risposta Q2: 4 valori ammessi (`operatore/tecnico/admin/super_admin`), protetti da CHECK, nessun ENUM. `fornitore` non è protetto/ammesso nei file — verificare in prod (A2/A4).**

### A5 — Mappa RLS che cita il ruolo

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where coalesce(qual,'') ilike '%role%' or coalesce(with_check,'') ilike '%role%'
order by tablename, policyname;
```

**Previsto — da confermare in prod.** Tutte le policy applicative leggono il ruolo **esclusivamente tramite la funzione helper `public.get_my_role()`** (subquery `SELECT role FROM public.users WHERE auth_id = auth.uid()`, `SECURITY DEFINER STABLE`). **Nessuna** policy legge il ruolo dal claim JWT (`auth.jwt()`/`auth.role()`); `auth.role()` non compare. Inventario (da `schema.sql` + migrazioni), classificato per tabella — **tutti riferimenti al ruolo applicativo**:

| tabella | policy | cmd | come legge il ruolo |
|---|---|---|---|
| `users` | `users_update` | UPDATE | `auth_id = auth.uid() OR get_my_role() IN ('admin','super_admin')` |
| `users` | `users_delete` | DELETE | `get_my_role() IN ('admin','super_admin')` |
| `machines` | insert/update/delete | I/U/D | `get_my_role() = 'admin'` |
| `reports` | `reports_update` | UPDATE | `get_my_role() IN ('tecnico','admin')` (+ operatore sui propri) |
| `comments` | insert/update | I/U | `get_my_role() IN ('admin','tecnico')` |
| `notifications` | insert (`009`) | INSERT | `get_my_role() = 'admin'` |
| `maintenance_plans`/`logs` | insert/update (`005/017/020`) | I/U | `get_my_role() IN ('admin','tecnico')` |
| `areas` (`023`) | insert | INSERT | `get_my_role() = 'admin'` |
| `machine_components` (`021`) | insert | INSERT | `get_my_role() = 'admin'` |
| `spare_parts` (`022`) | I/U/D | I/U/D | `get_my_role() = 'admin'` |
| `supplier_profiles` (`030`) | I/U/D | I/U/D | `get_my_role() = 'admin'` |
| `token_*`/wallet (`018`) | insert | INSERT | `get_my_role() = 'admin'` |
| `interventions` e tabelle collegate (`053–056`) | varie | varie | mix `get_my_org_id()` + ruolo |

⚠️ Da **distinguere** nei risultati live: la colonna `roles` di `pg_policies` (spesso `{authenticated}`) e gli eventuali `auth.role()` sono il **ruolo di database Supabase** (anon/authenticated), **non** il ruolo applicativo — non contano per questa diagnostica.

**Lettura → Risposta Q3:** ~20+ policy dipendono dal ruolo applicativo, e lo leggono **in modo uniforme** tramite l'unica funzione `get_my_role()`. Questo è un **punto di forza per il refactint “tetto/modalità”**: cambiando `get_my_role()` per leggere `granted_role` si copre l'intera superficie RLS in un solo punto.

### A5-bis — Check critico: self-elevation possibile?

**SÌ — finding prioritario.** La policy `users_update` (definita in `schema.sql:338`, ridefinita in `039_users_admin_super_admin.sql`) ha **solo una clausola `USING`, nessun `WITH CHECK`**:

```sql
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    auth_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'super_admin')
  );
```

In Postgres, per un comando UPDATE: `USING` filtra le righe **leggibili/modificabili**, mentre `WITH CHECK` valida i **nuovi valori** dopo l'update. Quando `WITH CHECK` è assente, **Postgres riusa la condizione `USING` come check sui nuovi valori**. Poiché `auth_id = auth.uid()` resta vero anche dopo aver cambiato il campo `role` (l'utente non tocca `auth_id`), **nulla impedisce a un utente autenticato di promuoversi da sé**:

```sql
-- eseguibile da QUALSIASI utente loggato sulla PROPRIA riga:
update public.users set role = 'admin' where auth_id = auth.uid();  -- passa la RLS
```

L'unico limite è la CHECK constraint sui valori ammessi (quindi non può inventarsi un ruolo, ma può scegliere `admin`/`super_admin`). **Il frontend non espone questa azione** (la UI di cambio ruolo è riservata agli admin, `AdminUsers.jsx`), ma la RLS è il confine di sicurezza reale e **oggi è aperta**. → **Risposta Q5: SÌ, self-elevation strutturalmente possibile via API diretta. Da chiudere nella proposal** aggiungendo un `WITH CHECK` che vieti la modifica di `role` da parte del titolare della riga (es. consentire la modifica del proprio profilo solo se `role` resta invariato, e delegare i cambi-ruolo esclusivamente al path admin/super_admin). Questo si allinea naturalmente alla regola d'oro #2 del design di destinazione.

_(Da confermare in prod che nessuna migrazione successiva non versionata abbia già aggiunto un `WITH CHECK`: la query A5 lo mostrerà nella colonna `with_check` della riga `users_update`.)_

### A6 — Funzioni helper che citano il ruolo

```sql
select n.nspname as schema, p.proname as funzione, pg_get_functiondef(p.oid) as definizione
from pg_proc p join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%role%';
```

**Previsto — da confermare in prod:**

- **`get_my_role()`** — `SELECT role FROM public.users WHERE auth_id = auth.uid()`, `SECURITY DEFINER STABLE`. **Cuore del sistema**: unico lettore del ruolo per la RLS. _Questo è il punto in cui, in implementazione, `granted_role` sostituirà `role`._
- **`resolve_my_profile()`** (`014`, poi estesa) — materializza/restituisce `to_jsonb(public.users.*)` (quindi include `role`); seed iniziale del ruolo da `raw_user_meta_data->>'role'` (default `operatore`).
- **`handle_new_user()` / handle invito** (`031`, `032`, `034`) — trigger su signup: `INSERT INTO public.users(...role...)` con `COALESCE(raw_user_meta_data->>'role', 'operatore'|'admin')`. (Il default è `'admin'` nel ramo signup-organizzazione, `'operatore'` altrove.)
- **`list_pending_orgs()` / `approve_org()` / `reject_org()`** (`036`) — gating `IF get_my_role() <> 'super_admin' THEN RAISE EXCEPTION`. Sono il modo in cui il “potere meta” del super_admin è codificato (RPC `SECURITY DEFINER`, non policy speciali).

### A7 — Raggio d'azione FK verso gli utenti

```sql
select tc.table_name as tabella, kcu.column_name as colonna,
       ccu.table_schema as schema_rif, ccu.table_name as riferisce
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name in ('users', 'profiles')
order by tabella;
```

**Previsto — da confermare in prod** (FK verso `public.users(id)` rilevate nei file; **non esiste tabella `profiles`** — vedi §Divergenze #2). Colonne che puntano a `users.id` e che andrebbero rimappate in un eventuale merge di account duplicati:

| tabella | colonna(e) → `users.id` |
|---|---|
| `reports` | `created_by`, `assigned_to` |
| `comments` | `user_id` |
| `activities` | `user_id` |
| `machines`/varie | (campi audit dove presenti) |
| `maintenance_plans` / `maintenance_logs` | `assigned_to` / `performed_by` |
| `direct_messages` | `sender_id`, `recipient_id` |
| `dm_reads` | `user_id` |
| `push_subscriptions` | `user_id` |
| `token_transactions` / `reward_redemptions` | `user_id` |
| `supplier_profiles` | `user_id` (PK→FK 1-1) |
| `interventions` e collegate (`053–056`) | `assigned_to`, `supervised_by`, `created_by`, partecipanti |
| `organizations` (`032/033`) | `owner_user_id` (→ `auth.users`, non `public.users`) |

**Lettura:** il “raggio” di un merge è ampio ma meccanico (tutte FK su `users.id`). I conteggi reali per la Sezione C si ottengono contando le righe per `user_id` dei due account di una coppia.

---

## Sezione B — Diagnostica repository (frontend)

### B1 — Dove il client legge il ruolo

**Punto unico di lettura, MA nessun helper semantico.** Il ruolo entra nell'app da un solo posto: `AuthContext` → `useAuth().user.role`. Il profilo (incluso `role`) arriva dalla RPC `resolve_my_profile` (`db.getSession()` in `src/lib/db/auth.js:329`). Non esiste però un hook/helper tipo `useRole()`, `hasRole()`, `can()`: ogni consumer fa **confronto di stringa grezzo** su `user.role` (`user.role === 'admin'`, `['admin','tecnico'].includes(u.role)`, ecc.). → **La fonte è centralizzata, la *logica di autorizzazione* è sparsa.** Consolidamento consigliato in proposal: un hook `useRole()` che esponga `grantedRole`, `activeMode`, `is(mode)`, `atLeast(mode)`.

### B2 — Come si decide area mobile vs admin

Il branch sul ruolo è **in un solo componente**: `AuthenticatedApp` in `src/App.jsx:46-85`. Logica (in ordine):

```
super_admin                      → <SuperAdminPendingOrgs/>   (bypassa il flow approval)
org_approval_status pending      → <PendingApprovalScreen/>
org_approval_status rejected     → <RejectedScreen/>
admin                            → <V6App/>          (layout industrial desktop)
operatore                        → <OperatorApp/>     (app dedicata operatore)
default (tecnico, fornitore, …)  → <MobileLayout/>
```

Dentro `MobileLayout` c'è un **secondo livello** di branching per ruolo: `TABS_BY_ROLE` (`src/components/layout/MobileLayout.jsx:176`) definisce le tab per `admin`/`tecnico`/`operatore`, e `isTechnician = userRole === 'tecnico'` (`:52`) cambia alcune viste. **Non esiste un componente “guard”/route-protector** dedicato: la protezione è il semplice `if (user.role === …)` di `App.jsx`. Non c'è React Router (vedi §Divergenze #3); le route “profonde” (`/guest/...`, `/invite/...`, `/reports/:id`) sono parse a mano da `window.location.pathname`.

### B3 — Censimento literal hardcoded dei ruoli

I valori-ruolo compaiono come **stringhe letterali sparse** in tutto il client (nessuna costante condivisa per i confronti — `ROLES` in `constants.js` è usato solo per label/colore/icona, non nei branch logici). Conteggio literal di ruolo (`'operatore'|'tecnico'|'admin'|'super_admin'`): **56 occorrenze in 25 file** (più gli usi di `'fornitore'`, che si aggiungono). File coinvolti (lettura/branch logici principali):

- **Routing/layout:** `src/App.jsx` (super_admin, admin, operatore), `src/components/layout/MobileLayout.jsx` (tecnico, `TABS_BY_ROLE`)
- **Reports:** `components/reports/ReportDetail.jsx` (`role === 'tecnico' || 'admin'`, 3×), `NewReport.jsx`, `QuickReport.jsx` (filtro destinatari `tecnico||admin`)
- **Interventi/fornitori:** `InterventionForm.jsx` (`['admin','tecnico','fornitore'].includes`), `UserPicker.jsx`, `UserMultiSelect.jsx`, `InterventionRequestSidePanel.jsx`, `PendingSuppliersPanel.jsx`, `InterventionRequestModal.jsx` (`role === 'admin'` per `supervised_by`)
- **Admin:** `AdminUsers.jsx` (8 occorrenze — invito, cambio ruolo via `Object.entries(ROLES)`), `AdminTechnicians.jsx`, `AdminDashboard.jsx`, `TeamWorkload.jsx`, `AdminNotifSettings.jsx`
- **Messaging/chat:** `ConversationView.jsx`, `NewConversationModal.jsx`, `ChatPanel.jsx` (`role === 'admin'`)
- **DB/lib:** `lib/db/auth.js` (seed `role:'admin'`/default `'operatore'`, invito), `lib/db/messaging.js`, `lib/db/interventions.js` (`assigned_to_role === 'fornitore'`), `lib/notifPreferences.js`
- **Mobile:** `MobileDashboard.jsx` (4×), `ProfilePage.jsx`, `CalendarioMobile.jsx`

**Dimensione refactor:** medio-alta ma meccanica. La buona notizia: i confronti sono semanticamente semplici (quasi sempre “è admin?”, “è tecnico o admin?”, “è fornitore?”) → mappabili su pochi predicati di un hook `useRole()`.

### B4 — Da dove arriva il ruolo al client

Da **fetch sul DB via RPC**, non dal JWT. `db.getSession()` chiama `supabase.rpc('resolve_my_profile')` che ritorna `to_jsonb(public.users.*)` → `user.role` è **la colonna `public.users.role`** (coerente con A1/A6). `session.user.app_metadata` **non** è usato per il ruolo lato client. (Incrocio con A3: il metadata auth è solo seed, mai riletto.)

### B5 — Preferenze utente persistite client-side (precedente per `active_mode`)

Esiste già un **pattern consolidato** di preferenze per-dispositivo in `localStorage`:

- **`ThemeContext`** (`src/contexts/ThemeContext.jsx`) persiste tema/accent in `localStorage` — è il **precedente architetturale diretto** per `active_mode` (preferenza cosmetica, per-device, default sensato).
- `localStorage` è usato pervasivamente (110 occorrenze / 28 file), ma soprattutto per: demo-mode store (`_demoStore.js`), sessione demo, cache wallet/notifiche, draft autosave (`useAutosave.js`).
- **Nessun uso di IndexedDB per preferenze** (solo cache tecniche).

**Implicazione:** `active_mode` come preferenza per-device in `localStorage`, gestita da `ThemeContext`-style provider (o esteso in `AuthContext`), è **coerente con quanto già esiste**. Default suggerito dal briefing (desktop→admin, mobile→tecnico/operatore se concesso) è implementabile senza nuove dipendenze.

---

## Sezione C — Inventario doppi account

**DA ESEGUIRE IN PROD** (richiede l'output di A3, non disponibile in questo container). Procedura per Andrea:

1. Da A3, individuare le coppie `auth.users` riconducibili **alla stessa persona fisica** (stesso nome/cognome nell'email, o pattern tipo `nome@…` + `nome.ruolo@…`). Caso noto dal briefing: la persona che è **responsabile manutenzione + amministratore** con due email.
2. Per ogni coppia, mappare `users.id` dei due account e contare le righe collegate sulle FK principali emerse da A7:

```sql
-- sostituire :uid_a e :uid_b con i due public.users.id della coppia
select 'reports.created_by'  as rel, count(*) from public.reports  where created_by  = :uid_a
union all select 'reports.assigned_to', count(*) from public.reports  where assigned_to = :uid_a
union all select 'comments.user_id',    count(*) from public.comments where user_id    = :uid_a
union all select 'activities.user_id',  count(*) from public.activities where user_id  = :uid_a
union all select 'direct_messages',     count(*) from public.direct_messages where sender_id = :uid_a or recipient_id = :uid_a
union all select 'interventions',        count(*) from public.interventions where assigned_to = :uid_a or supervised_by = :uid_a or created_by = :uid_a;
-- ripetere con :uid_b
```

Tabella da compilare:

| persona | account A (email / role) | righe A | account B (email / role) | righe B | merge o deprecazione? |
|---|---|---|---|---|---|
| `…` | `…` | `…` | `…` | `…` | `…` |

**Razionale decisionale (per la proposal):** account con poche righe collegate → *deprecazione morbida* del secondo (riassegnare il pochissimo storico, disattivare). Account entrambi “pesanti” → *merge* con rimappatura FK. Il modello “tetto+modalità” elimina la causa a monte: una sola persona = un solo account con `granted_role` = soglia massima, e `active_mode` per scegliere l'esperienza.

---

## Risposte secche alla checklist §6

1. **Dove vive il ruolo?** In `public.users.role` (TEXT), che **fa fede**. `auth.users.raw_user_meta_data->>'role'` esiste ma è **solo seed** alla creazione del profilo, mai riletto a runtime. Altre colonne `*role*` (`comments.user_role`, `direct_messages.sender_role`, `push_subscriptions.role`) sono **snapshot denormalizzati**; `assistant_messages.role` è di un altro dominio (LLM).
2. **Quali stringhe esistono e c'è un vincolo?** Constraint CHECK `users_role_check` → `('operatore','tecnico','admin','super_admin')` (da `036`). **Nessun ENUM**, è TEXT+CHECK. ⚠️ `'fornitore'` è usato dal frontend ma **non è nei valori ammessi dai file** — confermare in prod con A2/A4. Distribuzione reale dei valori: **da eseguire (A2)**.
3. **Quante policy RLS dipendono dal ruolo e come lo leggono?** ~20+ policy applicative, **tutte** via la stessa funzione helper `get_my_role()` (subquery su `public.users`, `SECURITY DEFINER`). **Zero** lettura da claim JWT. → unico punto di intervento per il refactint.
4. **`super_admin`: quanti, chi, semantica?** **CONFERMATO in prod: 0 utenti, e il constraint reale NON ammette nemmeno il valore** (migrazione `036` non applicata). È ruolo *solo nei file*: semantica progettata = **ruolo di piattaforma** (modera le `organizations` via 3 RPC dedicate, bypassa l'app verso `SuperAdminPendingOrgs`), sopra `admin`. In produzione, però, è **inattivo/codice morto**. Il super_admin "atteso" (Andrea) in prod è di fatto un `admin` (`andrea.pausler@amarcord.it`, org-owner). La proposal deve decidere: riattivarlo correttamente (applicare `036`) o rimuoverne il codice.
5. **Il ruolo è auto-modificabile dall'utente?** **SÌ — CONFERMATO sui dati live.** `users_update` in prod ha `qual = (auth_id = auth.uid() OR get_my_role() IN ('admin','super_admin'))` e `with_check = null` → un utente può fare `update public.users set role='admin' where auth_id=auth.uid()` via API e la RLS lo consente (tetto: il constraint a 3 ruoli, quindi non `super_admin` ma sì `admin`). Self-elevation reale (mitigata solo dal fatto che la UI non lo espone). **Finding prioritario.** Inoltre `users_insert_anyone` ha `with_check=true` (insert non validata) e manca la policy `users_delete`.
6. **Quanti doppi account e quanto pesano?** **2 doppioni reali + 1 falso doppione**, misurati in prod: **Lorenzo Pupita** (`ctcantina` tecnico ~5 righe + `pupitalorenzo` admin ~4 righe → *merge facile*, è il caso del briefing); **Andrea Pausler** (`@amarcord.it` admin ~627 righe + `@gmail.com` tecnico ~219 righe → *entrambi pesanti*, probabile dual-use volontario del founder); **Aneta** (`anetanwczk` operatore 0 righe + `aneta@gmail.com` orfano senza profilo → *pulizia banale*). **Scoperta collaterale:** **15 profili su 31 non hanno login** (`auth_id` NULL, anagrafica/roster) → gli utenti-app reali sono ~16; il modello deve distinguere utente-login da voce-anagrafica. Pattern: account-postazione `@amarcord.it` + account-personale, **ciascuno di una sola persona** (confermato Andrea — nessuna casella condivisa) → "identità unica" applicabile senza eccezioni.
7. **Il frontend ha un punto unico di lettura?** Sì per la **fonte** (`useAuth().user.role` da `resolve_my_profile`), **no** per la **logica**: nessun `useRole()`/`hasRole()`, ma **56 confronti literal in 25 file**. Branch di routing centralizzato in `App.jsx`. Consolidamento raccomandato verso un hook unico in fase di implementazione.

---

## Divergenze e sorprese

Tutto ciò che contraddice le assunzioni del briefing.

1. **🔴 `fornitore` è un quarto/quinto ruolo “fantasma”.** Il briefing assume la gerarchia `operatore < tecnico < admin < super_admin`. Ma il frontend tratta **`fornitore`** (fornitore esterno) come ruolo di prima classe: `InterventionForm.jsx` filtra `['admin','tecnico','fornitore'].includes(u.role)`, `interventions.js` filtra `assigned_to_role === 'fornitore'`, `UserPicker`/`UserMultiSelect` hanno rami dedicati. **Però `'fornitore'` NON compare in nessuna CHECK constraint dei file** (l'ultima, `036`, ammette solo i 4 noti) e la UI di cambio-ruolo (`AdminUsers.jsx`) espone solo i 3 di `ROLES`. Tre scenari possibili, da dirimere con A2/A4 in prod:
   - (a) il constraint **in produzione** è stato esteso a `fornitore` fuori-migrazione → i file divergono dal DB reale;
   - (b) esistono righe `role='fornitore'` inserite prima/aggirando il constraint;
   - (c) il codice `fornitore` è **dormiente** (nessuna riga reale) — coerente col commento in `UserMultiSelect.jsx:8`: _“role === 'fornitore' (ADR-008 OQ #3 ancora aperta — fuori scope MVP)”_.
   In tutti i casi: **la gerarchia reale del prodotto ha ≥5 livelli potenziali e `fornitore` non è lineare** (è una categoria “laterale”, esterna), il che complica il modello “tetto” lineare del design di destinazione. **Va deciso in proposal dove collocare `fornitore`.**

2. **🟡 Non esiste tabella `profiles`.** Il briefing ipotizza “probabile `profiles`”. Il progetto usa **`public.users`** (con `auth_id` → `auth.users.id`). Le query A2/A5-bis/A7 vanno eseguite su `public.users`, non `profiles`. Nessun riferimento a `profiles` nel codice (solo `supplier_profiles`, tabella diversa).

3. **🟡 `react-router-dom` è in `package.json` ma NON è importato da nessun file `src/`.** Dipendenza morta. Il routing è davvero custom (`window.location` + switch su `user.role` in `App.jsx`), coerente col vincolo §8 del briefing, ma la dipendenza fantasma può confondere chi cerca le route.

4. **🟡 Il frontend conosce solo 3 ruoli.** `ROLES` in `constants.js` = `{operatore, tecnico, admin}`. **Manca `super_admin`** (e `fornitore`). Conseguenza: per un utente `super_admin`, label/icona/colore fanno fallback alla stringa grezza (`ROLES[role]?.label || role`), e il modal di cambio-ruolo (`AdminUsers.jsx`, `Object.entries(ROLES)`) **non può assegnare `super_admin`** né `fornitore`. (Curiosamente, qui il frontend è *più aderente alla realtà prod* del DB-secondo-i-file: in prod i ruoli sono davvero 3 — vedi #4-bis.)

4-bis. **🔴 DRIFT migrazioni ↔ produzione (confermato dalle query live).** Lo stato reale del DB **non corrisponde** ai file in `supabase/`. In particolare: (a) `users_role_check` in prod ammette 3 ruoli, non 4 → migrazione `036` non applicata; (b) ma `users_update` cita `super_admin` → migrazione `039` applicata (stato incoerente: 039 senza il suo prerequisito 036); (c) le policy `public.users` in prod hanno **nomi diversi** dai file (`users_insert_anyone`/`users_select_same_org` vs `users_insert`/`users_select`), `users_insert_anyone` è `WITH CHECK (true)`, e **manca `users_delete`**. → La produzione è stata bootstrappata da uno script diverso/precedente a `schema.sql` e patchata solo in parte. **Implicazione vincolante per la proposal:** non fidarsi dei file come specchio del DB; ogni migrazione del modello "tetto+modalità" va scritta verificando lo stato reale e va messa in conto una **riconciliazione del drift** (almeno: reintrodurre `users_delete`, decidere su `036`/super_admin, e chiudere `users_update`/`users_insert_anyone`).

5. **🟡 Default di ruolo asimmetrico nei trigger di signup.** Il ramo signup-**organizzazione** (`032`, `034`) usa `COALESCE(...->>'role', 'admin')` (chi crea l'org diventa admin), mentre il ramo invito/standard usa default `'operatore'`. Non un bug, ma una sottigliezza da tenere presente quando si ragiona su `granted_role` iniziale.

6. **🟢 Buona notizia per il refactint:** l'intera RLS legge il ruolo da **un solo punto** (`get_my_role()`). Sostituire lì `role` con `granted_role` (e introdurre `active_mode` come campo puramente client-side) copre tutta la superficie di sicurezza senza toccare le singole policy. Allo stesso modo, il branch di routing è quasi tutto in `App.jsx`. Il design “tetto+modalità” calza bene sull'architettura esistente; il grosso del lavoro applicativo è il consolidamento dei **56 confronti literal** in un hook.

7. **🟢 `push_subscriptions.role` CHECK non aggiornato a `super_admin`** (`007`, ancora `('operatore','tecnico','admin')`). Debito minore: una subscription push creata da un super_admin violerebbe il check. Non bloccante, da annotare.

---

## Appendice ADR-011 — non eseguita

Il file `docs/decisions/ADR-011-*.md` **non esiste** nel repo (presenti fino ad ADR-010). Come da istruzione “se il file non c'è, ignorare”, le 6 diagnostiche pre-flight del memory layer **non sono state eseguite**.

---

## Gate rispettato

Sessione di **sola ricognizione**: nessuna migrazione, nessun codice applicativo modificato. Unico write: questo file. L'implementazione del modello “tetto+modalità” partirà da una **proposal** scritta su questi fatti e approvata esplicitamente da Andrea. Le query SQL marcate _“DA ESEGUIRE IN PROD”_ vanno girate nel SQL Editor di `jjrgrkxcnqltlkcnqyoi` per completare A2/A3/A4/A5/A5-bis/A6/A7 e la Sezione C con i dati reali.
