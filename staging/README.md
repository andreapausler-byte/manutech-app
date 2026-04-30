# Sprint 1 — Pacchetto deploy staging

Questa cartella contiene tutto il necessario per deployare ManuTech multi-tenant
v6.8 (Sprint 1) su un progetto Supabase staging fresco.

## File in ordine di utilizzo

| # | File | Cosa fare |
|---|------|-----------|
| 0 | [`EDGE-FUNCTION-DEPLOY.md`](./EDGE-FUNCTION-DEPLOY.md) | **LEGGI QUESTO PER PRIMO** — guida completa step-by-step |
| 1 | [`01-schema-base.sql`](./01-schema-base.sql) | Schema base — paste in SQL Editor |
| 2 | [`02-migrations-001-031.sql`](./02-migrations-001-031.sql) | Migration esistenti |
| 3 | [`03-migrations-032-036.sql`](./03-migrations-032-036.sql) | Sprint 1 (multi-tenant + approval) |
| 4 | [`SECRETS.md`](./SECRETS.md) | Valori secrets pronti per Edge Function |
| 5 | [`SMOKE-TESTS.md`](./SMOKE-TESTS.md) | Suite test A-E con curl pronti |

## TL;DR

```
1. Apri EDGE-FUNCTION-DEPLOY.md e seguilo
2. Step 1-3: paste 3 SQL in Dashboard SQL Editor
3. Step 4: crea super_admin user
4. Step 5: deploy Edge Function (CLI o Dashboard)
5. Step 6: configura secrets (vedi SECRETS.md)
6. Step 7-8: smoke test (vedi SMOKE-TESTS.md)
```

## Stato post-deploy atteso

- ✅ 1 organizzazione seed: **Birra Amarcord** (auto-approved, plan=enterprise)
- ✅ 1 utente super_admin: **andrea.pausler@gmail.com**
- ✅ Edge Function `signup-org` raggiungibile pubblicamente
- ✅ Email Resend funzionante da `noreply@manutech.app`
- ✅ Trigger `handle_new_user` con escape-hatch `_signup_via_edge`
- ✅ RLS attive su tutte le tabelle multi-tenant

## Cosa fare se qualcosa va storto

1. **Errore in apply SQL**: copia il messaggio integrale + linea SQL → manda a Claude
2. **Email non arriva**: vedi Resend → Logs (https://resend.com/logs)
3. **Edge Function 500**: Dashboard → Edge Functions → Logs → cerca `[signup-org]`
4. **Login post-approve fallisce**: ricontrolla `resolve_my_profile` ritorna
   `org_approval_status='approved'` con SQL `SELECT public.resolve_my_profile()` (richiede sessione admin)

## Pulizia post-Sprint 1

A green-light totale prima di applicare in prod:

1. Ruota credenziali in chat (Resend, service_role, DB password) — vedi
   EDGE-FUNCTION-DEPLOY.md Step 9
2. Valida DOWN scripts (Suite D di SMOKE-TESTS.md)
3. Documenta risultati smoke test (PASS/FAIL per suite)
4. Ripeti Step 1-7 sul progetto **prod Amarcord** con secrets distinti
