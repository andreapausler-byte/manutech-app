# Sprint 1 — Deploy staging step-by-step

Guida operativa per deployare ManuTech Sprint 1 su staging Supabase
(`pfruqawzgoytgadvawnj.supabase.co`).

**Tempo stimato totale**: 30-45 minuti.
**Prerequisiti**: account Supabase + accesso al progetto staging.

---

## Step 0 — Verifica pre-deploy

Apri [Dashboard staging](https://supabase.com/dashboard/project/pfruqawzgoytgadvawnj)
e conferma:

- [ ] Region progetto = **eu-west-1 (Ireland)** (matching Resend)
- [ ] Database password salvata in password manager
- [ ] Nessuna tabella esistente (deve essere staging vuoto). Verifica con:
  - Sidebar → **Table Editor** → schema `public` → la lista deve essere vuota o
    avere solo le tabelle Supabase di sistema (`auth.*`).

Se non è vuoto: SQL Editor → `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
(⚠️ distruttivo — solo su staging).

---

## Step 1 — Apply schema base

1. Sidebar Supabase → **SQL Editor** → click "New query"
2. Apri il file `staging/01-schema-base.sql` di questo repo
3. Copia l'**intero contenuto** (Ctrl/Cmd+A → Ctrl/Cmd+C)
4. Incolla nel SQL Editor
5. Click **"Run"** (in basso a destra) o `Ctrl/Cmd+Enter`
6. Atteso: messaggio verde "Success. No rows returned" o lista di "CREATE
   TABLE/POLICY/FUNCTION..." nei dettagli

⚠️ Se vedi errore "relation X already exists" → schema non era vuoto, fai DROP
   come da Step 0 e riprova.

**Verifica**: SQL Editor → `SELECT count(*) FROM users;` → ritorna 0 o errore
"permission denied" (RLS attivo, lo eseguiamo come anon).

---

## Step 2 — Apply migrations 001..031

1. SQL Editor → "New query"
2. Apri `staging/02-migrations-001-031.sql`
3. Copia tutto (file lungo: ~3300 righe — ok)
4. Incolla → **Run**
5. Atteso: success. Dovrebbe terminare in 5-15 secondi.

⚠️ Se errore: copia il messaggio integrale e mandamelo. Spesso è una
   migration che presuppone uno stato leggermente diverso da schema.sql; si
   risolve commentando 1-2 righe.

**Verifica**: SQL Editor →
```sql
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public') AS tabelle,
  (SELECT count(*) FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace) AS funzioni;
```
Atteso: ~25-35 tabelle, ~30-50 funzioni.

---

## Step 3 — Apply Sprint 1 migrations 032..036

1. SQL Editor → "New query"
2. Apri `staging/03-migrations-032-036.sql`
3. Copia tutto → incolla → **Run**

**Verifiche**:
```sql
-- 3.a — Tabella organizations creata + Amarcord seed approvato
SELECT id, name, slug, plan, status, approval_status, approved_at
  FROM public.organizations;
-- Atteso: 1 riga "Birra Amarcord", plan=enterprise, approval_status=approved

-- 3.b — Constraint plan esteso
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'public.organizations'::regclass
    AND conname LIKE '%plan%';
-- Atteso: CHECK plan IN ('trial', 'free', 'base', 'pro', 'enterprise')

-- 3.c — Constraint role esteso con super_admin
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass AND conname = 'users_role_check';
-- Atteso: CHECK role IN ('operatore', 'tecnico', 'admin', 'super_admin')

-- 3.d — RPC moderazione presenti
SELECT proname FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('list_pending_orgs', 'approve_org', 'reject_org',
                    'check_slug_available', 'resolve_my_profile');
-- Atteso: 5 righe
```

---

## Step 4 — Crea utente super_admin

Servirà per testare il flow di moderazione.

**4.a — Crea utente via Auth Dashboard**
1. Sidebar → **Authentication** → **Users**
2. Click "Add user" → "Create new user"
3. Email: `andrea.pausler@gmail.com` (la tua, quella che riceverà notifiche)
4. Password: scegli una forte e salvala
5. ✅ Auto Confirm User (skip email verification)
6. Click "Create user"

**4.b — Promote a super_admin via SQL**
SQL Editor → "New query":
```sql
-- Inserisci il profilo applicativo per l'utente auth appena creato
-- e assegnalo a Birra Amarcord come super_admin
INSERT INTO public.users (auth_id, email, name, role, org_id, status)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'andrea.pausler@gmail.com'),
  'andrea.pausler@gmail.com',
  'Andrea Pausler',
  'super_admin',
  '00000000-0000-0000-0000-000000000001',
  'active'
)
ON CONFLICT (auth_id) DO UPDATE
  SET role = 'super_admin', status = 'active';

-- Verifica
SELECT id, email, name, role, status, org_id
  FROM public.users
  WHERE email = 'andrea.pausler@gmail.com';
```

Atteso: 1 riga, role='super_admin'.

---

## Step 5 — Deploy Edge Function `signup-org`

Supabase Dashboard NON supporta upload diretto Edge Function. Hai 2 opzioni:

### Opzione A — Via supabase CLI (consigliata, una volta)
```bash
# Installa CLI (una sola volta)
npm install -g supabase
# o: brew install supabase/tap/supabase

# Login con browser
supabase login

# Link al progetto staging
cd /home/user/manutech-app
supabase link --project-ref pfruqawzgoytgadvawnj

# Deploy edge function
supabase functions deploy signup-org --no-verify-jwt
```

`--no-verify-jwt` è necessario perché signup-org è no-auth (chi si registra
non ha ancora token).

### Opzione B — Via Dashboard (manuale, fallback)
1. Sidebar Supabase → **Edge Functions**
2. Click "Deploy a new function"
3. Nome: `signup-org`
4. Verify JWT: **off**
5. Per ogni file in `supabase/functions/signup-org/`:
   - `index.ts`
   - `lib/types.ts`
   - `lib/validation.ts`
   - `lib/ratelimit.ts`
   - `lib/crypto.ts`
   - `lib/provision.ts`
   - `lib/email.ts`
   crea il file con stesso path e incolla il contenuto
6. Click "Deploy"

---

## Step 6 — Configura secrets Edge Function

Sidebar Supabase → **Edge Functions** → **Manage secrets** → "New secret"

Aggiungi i seguenti (vedi `staging/SECRETS.md` per i valori):

- [ ] `IP_HASH_SALT` — random 32+ caratteri (genera nuovo)
- [ ] `SUPABASE_ENV` — `staging`
- [ ] `RESEND_API_KEY` — `re_5s1B3BG7_CFXmnzjTu1wtxijsnhGhkqhv`
- [ ] `SIGNUP_NOTIFICATION_EMAIL` — `andrea.pausler@gmail.com`
- [ ] `SIGNUP_FROM_EMAIL` — `ManuTech <noreply@manutech.app>`

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono auto-iniettate da Supabase.

---

## Step 7 — Smoke test

Vedi `staging/SMOKE-TESTS.md` per la suite completa con curl pronti.

Quick check immediato:
```bash
curl -X POST https://pfruqawzgoytgadvawnj.supabase.co/functions/v1/signup-org \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{
    "org_name": "Smoke Test Spa",
    "org_slug": "smoke-test",
    "admin_email": "test+smoke1@example.com",
    "admin_password": "TestPassword123",
    "admin_full_name": "Test User"
  }'
```

Atteso:
```json
{ "ok": true, "org_id": "...", "user_id": "..." }
```

E **email arriva su `andrea.pausler@gmail.com`** entro pochi secondi.

---

## Step 8 — Test E2E moderazione

1. Apri l'app in dev: `npm run dev` con `.env.staging` puntato allo staging
2. Fai logout se loggato
3. Click "Crea organizzazione" → compila form
4. Atteso: vedi `PendingApprovalScreen`
5. Logout → login come `andrea.pausler@gmail.com` (super_admin)
6. Atteso: vedi `SuperAdminPendingOrgs` con la nuova org
7. Click "Approva"
8. Logout → login come l'admin della nuova org
9. Atteso: vedi l'app normale (Admin V6 layout)

---

## Step 9 — Cleanup post-test

Quando finito (e prima di applicare in prod):

1. **Ruota credenziali esposte in chat**:
   - Resend: revoca `re_5s1B3BG7_*` → crea nuova
   - Supabase: rigenera `service_role` da Settings → API
   - Supabase: cambia DB password da Settings → Database
2. **Verifica DOWN scripts** (test rollback):
   ```sql
   -- File: supabase/migrations/036_super_admin_role_down.sql
   -- File: supabase/migrations/035_org_approval_down.sql
   -- (esegui in ordine inverso)
   ```
3. **Documenta risultato smoke test** (pass/fail per ogni suite)

Solo a green-light totale → ripeti Step 1-7 sul progetto **prod Amarcord**.
