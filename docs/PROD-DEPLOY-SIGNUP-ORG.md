# Production Deploy Runbook — signup-org Edge Function

> **Quando usare**: la prima volta che porti il flusso signup-org self-service in produzione, dopo che tutto è stato validato su staging.
>
> **Tempo stimato**: 30-45 minuti, esecuzione attenta. Non improvvisare.

---

## 0. Prerequisiti

- [ ] Sprint 1 completo su master (PR #135, #136, #137 mergiate)
- [ ] Smoke test signup-org passato su staging end-to-end (signup → email → approval → login)
- [ ] Accesso Dashboard Supabase progetto **prod** (non staging) con permessi Owner/Admin
- [ ] Account [Resend](https://resend.com) attivo con API key valida
- [ ] Email super_admin identificata (es. `andrea.pausler@gmail.com`) ed esistente in `auth.users` su prod
- [ ] Dominio mittente email verificato su Resend (es. `manutech.app`) — altrimenti l'invio fallisce

---

## 1. Pre-deploy checklist

- [ ] **Backup DB prod** scaricato (`Dashboard → Database → Backups → Download`) e salvato in luogo sicuro
- [ ] Backup verificato: file `.sql.gz` apribile, dimensione coerente (non 0 byte)
- [ ] Finestra a basso traffico identificata (es. notte/weekend, comunicata al team)
- [ ] Generato **nuovo** `IP_HASH_SALT` per prod (NON riusare il valore di staging):
  ```bash
  openssl rand -hex 32
  ```
  Salvalo temporaneamente in un password manager — serve allo step 4.
- [ ] **Rollback plan letto**: vedi sezione 7 sotto. Se uno step fallisce, fermati e segui il rollback, NON improvvisare fix on-the-fly.

---

## 2. Apply migrations (Supabase Dashboard → SQL Editor)

**Ordine obbligatorio** (alfabetico è la garanzia in Postgres, ma applichiamo manualmente per controllo):

| # | File | Effetto |
|---|---|---|
| 1 | `032_organizations.sql` | Crea tabella `organizations`, seed "Demo", backfill org_id='default' |
| 2 | `033_organizations_v2.sql` | Rinomina seed → "Birra Amarcord" (slug `amarcord`) |
| 3 | `034_signup_via_edge_escape_hatch.sql` | Modifica trigger `handle_new_user` per supportare flag `_signup_via_edge` |
| 4 | `035_grant_service_role_signup.sql` | GRANT a `service_role` su `organizations` e `users` (FIX bug "permission denied") |
| 5 | `035_org_approval.sql` | Aggiunge `approval_status` (default 'pending'), auto-approva Amarcord |
| 6 | `036_super_admin_role.sql` | Estende `role` con 'super_admin', RPC `list_pending_orgs` / `approve_org` / `reject_org` |

Per ognuna:
1. Apri il file dal repo (`supabase/migrations/<file>.sql`), copia tutto il contenuto
2. SQL Editor → New query → incolla → **Run**
3. Verifica "Success" — se errore, FERMATI e diagnostica prima di andare avanti

⚠️ **Critico**: applicare 035_grant **PRIMA** del deploy Edge Function. Senza questa migration, la function fallirà con `permission denied for table organizations` (il bug che ha richiesto la creazione di 035).

### Verifica migration applicate

```sql
SELECT name, slug, approval_status FROM public.organizations;
-- Atteso: 1 riga "Birra Amarcord" / slug='amarcord' / approval_status='approved'

SELECT conname FROM pg_constraint WHERE conname = 'users_role_check';
-- Atteso: 1 riga (vincolo che include 'super_admin')

SELECT proname FROM pg_proc WHERE proname IN ('list_pending_orgs','approve_org','reject_org');
-- Atteso: 3 righe
```

---

## 3. Deploy Edge Function `signup-org`

Il dashboard Supabase ha l'editor in-place per Edge Functions (vedi sezione "Code" della function). Due opzioni:

**A. Via Dashboard (no CLI richiesto)**
1. Edge Functions → **Create function** → nome: `signup-org`
2. Apri il file bundled single-file dello staging (può essere ricostruito copiando/incollando i file della cartella `supabase/functions/signup-org/` in un unico `index.ts`, con gli import di `lib/*` rimpiazzati dal codice inline)
3. Click **Deploy**

**B. Via Supabase CLI** (se preferito):
```bash
supabase login
supabase functions deploy signup-org --project-ref <PROD_PROJECT_REF>
```

Verifica endpoint: `https://<prod-ref>.supabase.co/functions/v1/signup-org` raggiungibile (curl con OPTIONS deve dare 200 + headers CORS).

---

## 4. Configura i 5 secrets

Edge Functions → **Manage secrets** (o `/functions/secrets`).

| # | Name | Value | Note |
|---|---|---|---|
| 1 | `APP_ENV` | `production` | ⚠️ NON `staging`. Attiva HARD FAIL se IP_HASH_SALT manca → safety net GDPR. |
| 2 | `IP_HASH_SALT` | `<output di openssl rand -hex 32>` | Valore generato allo step 1. NON quello di staging. |
| 3 | `RESEND_API_KEY` | `re_...` | API key Resend (può essere stessa di staging o dedicata prod) |
| 4 | `SIGNUP_NOTIFICATION_EMAIL` | `andrea.pausler@gmail.com` | Destinatario notifiche moderazione |
| 5 | `SIGNUP_FROM_EMAIL` | `ManuTech <noreply@manutech.app>` | Dominio deve essere verificato su Resend |

⚠️ **NON usare prefisso `SUPABASE_`** sui custom secrets — Supabase lo riserva ai system secrets.

### Verifica secrets

Dopo aver salvato, fai un test invocazione vuoto:
```
POST <prod-ref>.supabase.co/functions/v1/signup-org
Body: { "test": "boot" }
```

Atteso: `400 invalid_input` (body sbagliato) → significa boot OK, secrets letti correttamente.

Nei Logs **NON** deve apparire:
- `IP_HASH_SALT not configured in production` → secret mancante o vuoto
- `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` → impossibile in prod (sono auto-iniettati)

Se vedi una di queste righe, FERMATI: il deploy è incompleto.

---

## 5. Promuovi il super_admin

SQL Editor:

```sql
UPDATE public.users
   SET role = 'super_admin'
 WHERE email = 'andrea.pausler@gmail.com';

-- Verifica
SELECT email, role, org_id FROM public.users WHERE role = 'super_admin';
```

Atteso: 1 riga con email corretta. Senza super_admin, le RPC di moderazione daranno "Accesso negato".

---

## 6. Smoke test post-deploy

⚠️ **Usare email/slug evidenti come "test"** per poterli ripulire dopo.

```bash
curl -X POST 'https://<prod-ref>.supabase.co/functions/v1/signup-org' \
  -H 'apikey: <PROD_ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "org_name": "Smoke Test PROD",
    "org_slug": "smoke-test-prod-001",
    "admin_email": "smoketest+prod001@example.it",
    "admin_password": "SmokeTest123",
    "admin_full_name": "Smoke Test"
  }'
```

Atteso: `201 { "ok": true, "org_id": "...", "user_id": "..." }`.

Verifica:
- [ ] DB: org creata in `pending`, user admin linkato (stessa query usata su staging)
- [ ] Email: arrivata a `andrea.pausler@gmail.com` con dati corretti
- [ ] Approva via SQL (vedi pattern staging) o via UI moderazione una volta deployato il frontend
- [ ] Login utente smoke test funziona

### Cleanup smoke test

Una volta verificato:
```sql
DELETE FROM public.users WHERE email = 'smoketest+prod001@example.it';
DELETE FROM public.organizations WHERE slug = 'smoke-test-prod-001';
-- E rimuovi anche l'auth user dal Dashboard → Authentication → Users
```

Verifica che Amarcord NON sia stato toccato:
```sql
SELECT name, slug, plan, status, approval_status FROM public.organizations WHERE slug = 'amarcord';
-- Atteso: 1 riga, plan != 'trial', approval_status='approved'
```

---

## 7. Rollback procedure

Se uno step 2-6 fallisce in modo non recuperabile:

### 7a. Disabilita Edge Function (immediato)
Dashboard → Edge Functions → `signup-org` → Settings → **Disable** (o elimina)

### 7b. Rollback migrations in ordine inverso
```
036_super_admin_role_down.sql
035_org_approval_down.sql
035_grant_service_role_signup_down.sql
034_signup_via_edge_escape_hatch_down.sql
033_organizations_v2_down.sql
```

⚠️ NON esiste `032_down.sql`. Per rollback completo serve **restore da backup** (sezione 1).

### 7c. Restore da backup (worst case)
Dashboard → Database → Backups → Restore → seleziona il backup pre-deploy.

⚠️ Restore distrugge tutti i dati creati dopo il backup. Usa solo se il rollback delle migration non basta.

---

## 8. Post-deploy

- [ ] Comunica al team che il signup self-service è LIVE
- [ ] Monitor logs Edge Function per 24h: cerca pattern di errore, rate limit hit, signup falliti
- [ ] Aggiorna `docs/SPRINT-1-HANDOFF.md` con data deploy prod e link a primo signup reale
- [ ] **Pulisci** il test org "Smoke Test PROD" (se non già fatto)
- [ ] Pianifica Sprint 2: email verification real (oggi è auto-confirm), DB-backed `signup_attempts` per audit/rate limit cross-instance

---

## Note operative

- **Numerazione duplicata `035_*`**: `035_grant_service_role_signup` e `035_org_approval` coesistono come file separati. Postgres li applica in ordine alfabetico (`grant` prima di `org`), che è l'ordine corretto. Debito da pulire: rinominare `035_grant_*` → `037_grant_*` in una PR di igiene futura.
- **APP_ENV vs SUPABASE_ENV**: il rename è documentato in PR #136. Supabase vieta secrets custom con prefisso `SUPABASE_`.
- **Rate limit in-memory**: 5 signup/h/IP è effettivo solo per istanza Edge. Con scaling N istanze, il limite reale è 5×N. Sprint futuro: tabella `signup_attempts` DB-backed.
- **Email auto-confirm**: signup-org marca le email come confermate. Sprint 2 introdurrà email verification reale via Resend.
