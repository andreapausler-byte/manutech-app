# Sprint 1 — Smoke Test Suite

Test manuali da eseguire dopo aver completato `EDGE-FUNCTION-DEPLOY.md`
Step 1-6. Verifica end-to-end del flow signup-org + approval + super_admin.

**Ambiente target**: staging (`pfruqawzgoytgadvawnj.supabase.co`)
**Tempo stimato**: 30-40 minuti
**Prerequisiti**: schema applicato, edge function deployed, secrets configurati,
super_admin user creato.

---

## Setup variabili shell

Esegui una volta in terminale, poi tutti i curl funzioneranno:

```bash
export SUPA_URL="https://pfruqawzgoytgadvawnj.supabase.co"
export ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmcnVxYXd6Z295dGdhZHZhd25qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Njg1NzYsImV4cCI6MjA5MzA0NDU3Nn0.ubbZYVEwxN9IsBv_ycBfISVDPJ2F1UfgEiTrSTqoM3E"
export SIGNUP_URL="$SUPA_URL/functions/v1/signup-org"
```

---

## Suite A — Signup nuova org (happy path)

### A.1 — POST signup valido
```bash
curl -s -X POST "$SIGNUP_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "org_name": "Acme Manufacturing",
    "org_slug": "acme-mfg",
    "admin_email": "admin+acme@example.com",
    "admin_password": "SecurePass123",
    "admin_full_name": "Mario Rossi"
  }' | jq .
```
**Atteso**: HTTP 201, body `{ "ok": true, "org_id": "...", "user_id": "..." }`

**Salva l'org_id**: `export ORG_ID_ACME=<valore>`

### A.2 — Verifica DB: organizations
SQL Editor:
```sql
SELECT id, name, slug, plan, status, approval_status, trial_ends_at, owner_user_id
  FROM public.organizations WHERE slug = 'acme-mfg';
```
**Atteso**:
- `plan = 'trial'`
- `status = 'trial'`
- `approval_status = 'pending'` ⭐ (mig. 035 funziona)
- `trial_ends_at` ≈ now() + 30 giorni
- `owner_user_id` non NULL (Step D non fallito)

### A.3 — Verifica DB: auth + profile users
```sql
-- auth.users: email_confirmed_at deve essere set (skip verification)
SELECT id, email, email_confirmed_at, raw_user_meta_data
  FROM auth.users WHERE email = 'admin+acme@example.com';

-- public.users: profilo applicativo
SELECT id, email, name, role, status, org_id
  FROM public.users WHERE email = 'admin+acme@example.com';
```
**Atteso**:
- `auth.users.email_confirmed_at` non NULL
- `public.users.role = 'admin'`
- `public.users.status = 'active'`
- `public.users.org_id` matcha l'org creata

### A.4 — Verifica email arrivata su Gmail
- Apri `andrea.pausler@gmail.com`
- Cerca subject `[ManuTech] Nuovo signup in attesa: Acme Manufacturing`
- ⏱ Tempo arrivo: < 30 secondi tipicamente
- ✅ HTML formattato + link "Apri console moderazione"

⚠️ Se non arriva: vai su https://resend.com → Logs e verifica delivery status.
   Se "delivered" ma non in inbox → controlla Spam.

### A.5 — Test login admin (org pending)
Apri l'app frontend (locale o staging Vercel) → Login con
`admin+acme@example.com` / `SecurePass123`.
**Atteso**: vedi `PendingApprovalScreen` (icona orologio + testo
"In attesa di approvazione"), NON il dashboard admin.

---

## Suite B — Errori signup (sad path)

### B.1 — Email già registrata
Ripeti A.1 con stessa email `admin+acme@example.com`:
```bash
curl -s -X POST "$SIGNUP_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "org_name": "Different Co",
    "org_slug": "different-co",
    "admin_email": "admin+acme@example.com",
    "admin_password": "AnotherPass123",
    "admin_full_name": "Another User"
  }' | jq .
```
**Atteso**: HTTP 409, body `{ "ok": false, "error": "email_exists", "message": "..." }`

### B.2 — Password troppo debole
```bash
curl -s -X POST "$SIGNUP_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "org_name": "Weak Pwd Co",
    "org_slug": "weak-pwd",
    "admin_email": "test+weak@example.com",
    "admin_password": "abc",
    "admin_full_name": "Weak User"
  }' | jq .
```
**Atteso**: HTTP 400, `{ "ok": false, "error": "invalid_input", "field": "admin_password" }`

### B.3 — Slug già preso
Crea prima un signup con slug "taken-slug" (vedi A.1), poi riprova:
```bash
curl -s -X POST "$SIGNUP_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "org_name": "Same Slug Co",
    "org_slug": "acme-mfg",
    "admin_email": "test+sameslug@example.com",
    "admin_password": "GoodPass123",
    "admin_full_name": "Same Slug"
  }' | jq .
```
**Atteso**: HTTP 409, `error: "slug_taken"`

### B.4 — Slug formalmente invalido
```bash
curl -s -X POST "$SIGNUP_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "org_name": "Bad Slug Co",
    "org_slug": "INVALID slug!",
    "admin_email": "test+badslug@example.com",
    "admin_password": "GoodPass123",
    "admin_full_name": "Bad Slug"
  }' | jq .
```
**Atteso**: HTTP 400, `error: "invalid_input"`, field: `org_slug`

### B.5 — Rate limit
Esegui A.1 con email/slug diversi 6 volte di fila in <1 minuto:
```bash
for i in 1 2 3 4 5 6; do
  curl -s -X POST "$SIGNUP_URL" \
    -H "Content-Type: application/json" \
    -H "apikey: $ANON_KEY" \
    -d "{
      \"org_name\": \"RL Test $i\",
      \"org_slug\": \"rl-test-$i\",
      \"admin_email\": \"test+rl$i@example.com\",
      \"admin_password\": \"GoodPass123\",
      \"admin_full_name\": \"RL $i\"
    }" | jq -c '{ok, error}'
done
```
**Atteso**: i primi 5 ok=true, il 6° HTTP 429 `error: "rate_limited"`.

---

## Suite C — Approval workflow (super_admin)

### C.1 — Login super_admin
Apri app frontend → Login con `andrea.pausler@gmail.com` + password creata
in Step 4 di EDGE-FUNCTION-DEPLOY.md.
**Atteso**: vedi `SuperAdminPendingOrgs` (NON dashboard admin Amarcord).

### C.2 — Lista pending visibile
- Devi vedere "Acme Manufacturing" (creata in A.1) tra le pending.
- Click "Refresh" funziona.

### C.3 — Approva org
Click "Approva" su Acme → conferma nel browser.
**Atteso**:
- Toast verde "Acme Manufacturing approvata"
- Card sparisce dalla lista
- SQL check:
  ```sql
  SELECT approval_status, approved_at, approved_by
    FROM organizations WHERE slug = 'acme-mfg';
  ```
  → `approved`, `approved_at` recente, `approved_by` = id auth super_admin

### C.4 — Admin approvato vede l'app
- Logout super_admin
- Login con `admin+acme@example.com`
- **Atteso**: vedi dashboard admin V6 normale (non più PendingApprovalScreen)

### C.5 — Rifiuta org (richiede nuovo signup)
Crea seconda org via curl A.1 (slug `reject-test`, email diversa).
Login super_admin → click "Rifiuta" → modal motivazione.

- C.5.a — Motivazione vuota → bottone disabilitato ✓
- C.5.b — Motivazione 2 char ("Ko") → toast errore "min 3 caratteri"
- C.5.c — Motivazione "Test rifiuto" → success
- C.5.d — Card sparisce
- SQL check:
  ```sql
  SELECT approval_status, rejection_reason
    FROM organizations WHERE slug = 'reject-test';
  ```
  → `rejected`, rejection_reason = "Test rifiuto"

### C.6 — Admin rifiutato vede RejectedScreen
- Logout, login con email dell'org `reject-test`
- **Atteso**: `RejectedScreen` con motivazione "Test rifiuto" visibile.

### C.7 — Sicurezza RPC: utente non super_admin non può chiamare
SQL Editor (esegui come utente normale, NON service_role):
- Login Dashboard Supabase con account `admin+acme@example.com` (auth)
- Authentication → Users → click email → "Impersonate user" (se disponibile)
- Oppure: chiama RPC dal client app dopo login

```javascript
// Dal browser console su app loggata come admin (non super_admin)
const { error } = await supabase.rpc('list_pending_orgs')
console.log(error)
```
**Atteso**: errore `Accesso negato: super_admin richiesto`

---

## Suite D — Rollback DOWN scripts

⚠️ Esegui solo dopo aver completato Suite A-C. Distrugge tabella organizations.

### D.1 — Rollback 036 (super_admin role + RPCs)
SQL Editor:
```sql
-- Demote eventuali super_admin a admin
UPDATE public.users SET role = 'admin' WHERE role = 'super_admin';

-- Apply DOWN
-- (paste contenuto file: supabase/migrations/036_super_admin_role_down.sql)
```
**Atteso**: success. RPC `list_pending_orgs` non più presente:
```sql
SELECT count(*) FROM pg_proc
  WHERE proname IN ('list_pending_orgs', 'approve_org', 'reject_org');
-- atteso: 0
```

### D.2 — Rollback 035 (approval workflow)
SQL Editor:
```sql
-- Apply DOWN
-- (paste contenuto file: supabase/migrations/035_org_approval_down.sql)
```
**Atteso**: success. Colonne approval rimosse:
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'organizations' AND column_name LIKE 'approval%';
-- atteso: 0 rows
```

### D.3 — Verifica resolve_my_profile pre-035
SQL Editor:
```sql
SELECT pg_get_functiondef(oid)
  FROM pg_proc WHERE proname = 'resolve_my_profile';
```
**Atteso**: il body NON contiene `org_approval_status` (versione 029 ripristinata).

### D.4 — Re-apply per restore staging
Dopo aver verificato il rollback, re-applica 035 + 036 (paste UP scripts) per
lasciare staging in stato corretto per i prossimi test.

---

## Suite E — ManuTech-specific

### E.1 — Demo mode fallback
Test che il pattern `if(supabase){...}else{localStorage}` regge con nuova
tabella `organizations`:

1. Crea `.env.demo` senza `VITE_SUPABASE_URL` (commenta le 2 righe)
2. `npm run dev` → l'app deve partire senza crash
3. Click "Crea organizzazione" → form funziona
4. Submit → utente creato in localStorage (`manutech_users`,
   `manutech_organizations`)
5. PendingApprovalScreen mostrata
6. Apri DevTools → `localStorage.getItem('manutech_organizations')` →
   nuova org con `approval_status: 'pending'` (vedi `db.signupOrganization`
   demo branch in `src/lib/supabase.js`)

**Atteso**: zero errori console, flow consistente con prod (modulo limiti
demo come la non-disponibilità del super-admin).

### E.2 — Onboarding end-to-end (golden path)
Test integrato del prodotto, simulando una nuova azienda reale:

1. **Signup**: crea via app "Pizzeria del Sole" come operatore Marco
   - Atteso: PendingApprovalScreen
2. **Approve**: super_admin approva
3. **Login admin**: Marco fa login → vedi dashboard
4. **Crea macchina**: Admin → Macchinari → "Forno a legna"
5. **Invita tecnico**: Admin → Utenti → Invita `tecnico+sole@example.com`
   come `tecnico`
6. **Tecnico signup**: tecnico apre invite link → setta password → login
7. **Crea report**: tecnico → Nuova segnalazione → "Forno surriscaldato"
8. **Workflow**: report `aperta` → admin assegna → tecnico cambia
   `in_lavorazione` → completa → `risolta`

**Atteso**: zero errori console, ogni step funziona, dati salvati con
`org_id` corretto, NON visibili da Amarcord (RLS isolamento).

### E.3 — Isolamento RLS cross-org (CRITICO)
Verifica che dopo Suite E.2 e Suite C.3, l'admin Amarcord NON vede dati delle
nuove org.

1. Login `admin@manutech.it` (admin Amarcord — credenziali standard)
2. Naviga: Macchinari, Utenti, Segnalazioni
3. **Atteso**: vedi SOLO dati Amarcord (Forno a legna NON deve apparire)
4. SQL bypass test:
   ```sql
   -- Esegui come admin Amarcord (NON service_role!)
   SELECT name, org_id FROM public.machines;
   ```
   → ritorna SOLO righe con `org_id` = UUID Amarcord

---

## Riepilogo PASS/FAIL

Compila questa checklist man mano che esegui:

| Suite | Test | Risultato |
|-------|------|-----------|
| A | A.1 Signup happy path | ☐ PASS / ☐ FAIL |
| A | A.2 DB org pending | ☐ PASS / ☐ FAIL |
| A | A.3 DB user admin | ☐ PASS / ☐ FAIL |
| A | A.4 Email arrivata | ☐ PASS / ☐ FAIL |
| A | A.5 PendingApprovalScreen | ☐ PASS / ☐ FAIL |
| B | B.1-B.5 errori | ☐ PASS / ☐ FAIL |
| C | C.1-C.4 approva | ☐ PASS / ☐ FAIL |
| C | C.5-C.6 rifiuta | ☐ PASS / ☐ FAIL |
| C | C.7 RPC sicurezza | ☐ PASS / ☐ FAIL |
| D | D.1-D.4 rollback | ☐ PASS / ☐ FAIL |
| E | E.1 Demo fallback | ☐ PASS / ☐ FAIL |
| E | E.2 Onboarding E2E | ☐ PASS / ☐ FAIL |
| E | E.3 RLS isolamento | ☐ PASS / ☐ FAIL |

**Soglia per applicare in prod**: tutte PASS, oppure FAIL solo su edge cases
documentati.
