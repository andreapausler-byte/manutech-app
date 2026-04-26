# Sprint 1 — Handoff Note

**Branch**: `claude/setup-organizations-belEh`
**Stato sessione**: PAUSA per checkpoint review umano
**Ultimo commit**: `23b7881` (working tree pulito)

---

## Status sintetico

### ✅ Fatto (backend completo, NON deployato)
- **Migration 032** `organizations` table base + signup self-service v1 (commit `d3b9b73`)
- **Migration 033** organizations v2: trial/enterprise, validate_org_id_format trigger, check_slug_available RPC, rinomina seed → "Birra Amarcord" (commit `146a495`)
- **Migration 034** escape-hatch `_signup_via_edge` nel trigger handle_new_user (commit `91a43ab`)
- **Edge Function `signup-org`** atomica con rollback chirurgico (commit `3001c55`)
- **Fix post-hoc Edge Function** dopo review umana (commit `23b7881`):
  - Slug race condition (Postgres 23505) → `slug_taken` invece di `internal`
  - `recordAttempt` su success documentato come anti-abuse intenzionale
  - `email_exists` detection robusto (cascade: error.code → status 422 → string match)

### ⏸ Sospeso (in attesa di OK umano)
- **FASE 0 staging deploy** — bloccata in attesa decisioni setup ambiente
- **Step 3 frontend** — SignupPage.jsx + useCurrentOrg hook + header org in AdminLayout
- **Step 4 documentazione** — CLAUDE.md sezioni nuove + payload TODO accumulati

### ❌ Non fatto / fuori scope Sprint 1
- Trial enforcement (deferrato a sprint billing)
- Org Settings page admin (deferrato a Sprint 2)
- Email verification con Resend (deferrato a Sprint 2)
- Audit signup_attempts DB-backed (deferrato sprint futuro)
- Conversione `org_id` da TEXT a UUID strict (deferrato sprint dedicato)

---

## Commit prodotti — sequenza completa

| SHA | Tipo | Messaggio breve |
|---|---|---|
| `d3b9b73` | feat | v6.6: Organizations table + signup multi-tenant (mig. 032 + cleanup `'default'` + SignupPage v1) |
| `146a495` | feat(db) | v6.7: Migration 033 organizations v2 + DOWN |
| `91a43ab` | feat(db) | Migration 034 escape-hatch `_signup_via_edge` |
| `3001c55` | feat(api) | Edge function signup-org per signup self-service (7 file) |
| `23b7881` | fix(api) | Edge function signup-org review post-hoc (3 fix) |

**Totale**: 5 commit, ~1300 righe (SQL + TypeScript + Markdown).

---

## Stato file di lavoro

### File scritti su disco e committati ✅

```
supabase/migrations/032_organizations.sql                      (commit d3b9b73)
supabase/migrations/033_organizations_v2.sql                   (commit 146a495)
supabase/migrations/033_organizations_v2_down.sql              (commit 146a495)
supabase/migrations/034_signup_via_edge_escape_hatch.sql       (commit 91a43ab)
supabase/migrations/034_signup_via_edge_escape_hatch_down.sql  (commit 91a43ab)
supabase/functions/signup-org/index.ts                          (commit 3001c55, mod. 23b7881)
supabase/functions/signup-org/lib/types.ts                      (commit 3001c55)
supabase/functions/signup-org/lib/validation.ts                 (commit 3001c55)
supabase/functions/signup-org/lib/ratelimit.ts                  (commit 3001c55)
supabase/functions/signup-org/lib/crypto.ts                     (commit 3001c55)
supabase/functions/signup-org/lib/provision.ts                  (commit 3001c55, mod. 23b7881)
supabase/functions/signup-org/README.md                         (commit 3001c55, mod. 23b7881)
docs/SPRINT-1-HANDOFF.md                                        (questo file)
```

Inoltre, modifiche client React (commit `d3b9b73`):
```
src/contexts/AuthContext.jsx                  (added signupOrganization)
src/components/layout/LoginPage.jsx           (rimosso demo creds, link signup)
src/components/layout/SignupPage.jsx          (form signup v1)
src/lib/supabase.js                           (db.signupOrganization + cleanup 'default')
[+15 altri file con cleanup hardcoded 'default']
```

### Stato deploy
- **Database produzione (Amarcord)**: NIENTE applicato. 032/033/034 esistono solo come file SQL nel branch.
- **Database staging**: progetto staging NON ancora creato.
- **Edge Function `signup-org`**: NIENTE deployata su Supabase (né prod né staging).
- **Frontend client**: branch non mergiato in main, app prod gira ancora senza multi-tenancy.

---

## NEXT ACTION dettagliata (al ritorno dalla pausa)

### Primo step: FASE 0 staging deploy

Bloccata in attesa di **3 risposte utente**:

1. **Setup staging — quale opzione?**
   - A. Nuovo progetto Supabase free tier "manutech-staging"
   - B. Branch database Supabase (richiede Pro plan)
   - C. Locale con `supabase start` (Docker)

2. **Backup Amarcord prod — modalità?**
   - Via Supabase Dashboard → Database → Backups → Download
   - Folder target: `~/manutech-backups/YYYY-MM-DD-amarcord-prod.sql.gz`
   - Verifica restore su DB pulito locale prima di ANY apply

3. **Smoke test esistenti?**
   - Se sì: lista test da eseguire
   - Se no: parto da quelli proposti nel README di `signup-org` (sezione "Test manuale staging")

### Sequenza FASE 0 (da eseguire AL RITORNO)

```
1. Backup Amarcord prod (Dashboard → Download .sql.gz)
2. Verifica restore backup su DB locale
3. Crea progetto Supabase staging
4. Carica dump anonimizzato Amarcord in staging (opzionale ma raccomandato)
5. Apply migrations su staging IN ORDINE: 032 → 033 → 034
6. Verifica: SELECT * FROM organizations WHERE slug='amarcord' (deve esistere, plan='enterprise')
7. Deploy Edge Function signup-org su staging
8. Configura secrets staging: IP_HASH_SALT, SUPABASE_ENV='staging'
9. Smoke test signup nuova org (vedi README signup-org §Test manuale)
10. Smoke test login admin Amarcord (regressione)
11. Test DOWN scripts: 034_down → 033_down → restore backup → verifica
```

Solo dopo PASS di tutti gli step si procede con apply prod.

### Secondo step: Step 3 frontend (SOLO dopo staging OK)

- `src/hooks/useCurrentOrg.js` — fetch + cache organizations row dell'utente loggato
- `src/components/layout/AdminLayout.jsx` — header con nome org sotto il logo
- `src/pages/operator/OperatorApp.jsx` + `MobileLayout.jsx` — riuso dello stesso hook
- `src/components/layout/SignupPage.jsx` — refactor per chiamare la nuova Edge Function `signup-org` invece dell'attuale `db.signupOrganization` (path client-side legacy)

### Terzo step: Step 4 documentazione (CLAUDE.md)

Sezioni da aggiungere/modificare:

- **Nuova sezione "Multi-tenancy"** — pattern `org_id TEXT`, validate_org_id_format come soft-FK, ADR Edge Function (3 opzioni trigger), flag `_signup_via_edge`
- **Nuova sezione "Migration discipline"** — TODO 1: drift risk DOWN script (vedi sotto)
- **Sezione esistente "Errori noti / debt tecnico"** — TODO 2: TOCTOU race in slug generation (vedi sotto)
- **Nuova sezione "Operational debt"** — annotazioni minori della review post-hoc:
  - CORS Allow-Origin '*' → restringere a dominio app prod
  - TRIAL_DAYS hardcoded → parametrizzare con piani diversi
  - Comment "stessa transazione" in provision.ts:Step C → "sequential consistency"
  - Orphan auth user cleanup cron (caso rollback Step C fallito)
  - Method check ritorna 400 invece di 405 (semantica HTTP corretta)
- **Nuova sezione "Pre go-live checklist"** — IP_HASH_SALT, SUPABASE_ENV, rate limit /rpc/check_slug_available, email verification Sprint 2

---

## TODO accumulati nel mio todo interno (snapshot al pause)

```
✅ Sprint 1 backend: organizations table + edge function signup-org + post-hoc fixes
🔄 Scrittura SPRINT-1-HANDOFF.md
⏳ [RESUME] FASE 0 staging deploy
⏳ [RESUME] Step 3: SignupPage.jsx + useCurrentOrg + header AdminLayout
⏳ [RESUME] Step 4: CLAUDE.md sezioni multiple
```

Contesto aggiuntivo già nei messaggi precedenti che NON ricordo automaticamente al resume:

- Decisioni Q1/Q2/Q3 sull'Edge Function (commit separati, IP_HASH_SALT environment-aware, Step D no rollback con warnings)
- Le 3 opzioni trigger handle_new_user con motivazione completa per Opzione 3 scelta
- Le 5 annotazioni minori 🟢 della review post-hoc da inserire in CLAUDE.md "Operational debt"

---

## ⚠️ TODO da inserire in CLAUDE.md durante Step 4

### TODO 1 — Drift risk DOWN script (sezione "Migration discipline" da creare)

Quando una migration N (es. 034) modifica una funzione SQL via `CREATE OR REPLACE` che duplica logica da una migration precedente (es. 032), il DOWN di N rischia di diventare stale se la migration originale viene poi modificata.

> ⚠️ **MIGRATION DISCIPLINE — DOWN script drift**
> Se modifichi `handle_new_user` (definita in 032 e ridichiarata in 034), AGGIORNA ANCHE `034_*_down.sql` per riflettere la nuova versione base. Pattern alternativo per future migration: estrarre la logica base in funzione separata (es. `_handle_new_user_base`) chiamata sia da 032 sia da 034, così il DOWN ha un singolo punto di verità.

### TODO 2 — TOCTOU race nello slug generation (sezione "Errori noti / debt tecnico")

Nel Caso A di `handle_new_user` (signup nuova org), il pattern `WHILE EXISTS + INSERT` ha race condition teorica. Bassa probabilità ma user-experience subottimale (crash invece di retry).

> **TOCTOU race in slug generation (handle_new_user, Caso A)**
> - Tra `WHILE EXISTS` check e `INSERT`, signup concorrente può rubare lo slug
> - UNIQUE constraint protegge integrità ma errore poco user-friendly
> - Non introdotto da 034 (preesistente da 032)
> - Da fixare in sprint futuro con pattern:
>   ```sql
>   LOOP
>     generate_slug();
>     BEGIN
>       INSERT ... RETURNING id;
>       EXIT;
>     EXCEPTION WHEN unique_violation THEN
>       CONTINUE;
>     END;
>   END LOOP;
>   ```
> - Priorità: bassa (probabilità ~1/65000)

---

## Riferimenti rapidi

### Link GitHub raw file critici (commit `23b7881`)
- Migration 032: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/migrations/032_organizations.sql
- Migration 033 UP: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/migrations/033_organizations_v2.sql
- Migration 033 DOWN: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/migrations/033_organizations_v2_down.sql
- Migration 034 UP: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/migrations/034_signup_via_edge_escape_hatch.sql
- Migration 034 DOWN: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/migrations/034_signup_via_edge_escape_hatch_down.sql
- Edge Function index.ts: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/functions/signup-org/index.ts
- Edge Function provision.ts: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/functions/signup-org/lib/provision.ts
- Edge Function README.md: https://raw.githubusercontent.com/andreapausler-byte/manutech-app/23b7881/supabase/functions/signup-org/README.md

### Diff completi tra commit
- `d3b9b73..146a495` (mig. 033): https://github.com/andreapausler-byte/manutech-app/compare/d3b9b73..146a495
- `146a495..91a43ab` (mig. 034): https://github.com/andreapausler-byte/manutech-app/compare/146a495..91a43ab
- `91a43ab..3001c55` (Edge Function): https://github.com/andreapausler-byte/manutech-app/compare/91a43ab..3001c55
- `3001c55..23b7881` (post-hoc fix): https://github.com/andreapausler-byte/manutech-app/compare/3001c55..23b7881
