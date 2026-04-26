# Edge Function — `signup-org`

Crea atomicamente una nuova **organizzazione** + **utente admin** in trial 30 giorni.

> ADR (architectural decision record) completo nell'header di [`index.ts`](./index.ts) e in [`/CLAUDE.md`](../../../CLAUDE.md) sezione "Multi-tenancy".

---

## Contratto API

### Request — `POST /functions/v1/signup-org`

```json
{
  "org_name": "Birrificio Test Srl",
  "org_slug": "test-brew",
  "admin_email": "owner@test.it",
  "admin_password": "Password123",
  "admin_full_name": "Mario Rossi"
}
```

### Validazioni (server-side)

| Campo | Vincolo |
|---|---|
| `org_name` | 2-80 char dopo trim |
| `org_slug` | regex `/^[a-z0-9-]{3,30}$/`, no leading/trailing/double dash |
| `admin_email` | RFC 5322 semplificata, max 254 char (normalizzato lowercase) |
| `admin_password` | min 8 char, ≥1 lettera + ≥1 numero |
| `admin_full_name` | 2-80 char dopo trim |

### Response — Success (HTTP 201)

```json
{
  "ok": true,
  "org_id": "8a3b...",
  "user_id": "7c1d..."
}
```

Con warning non bloccanti (rari, vedi Q3 decisione):

```json
{
  "ok": true,
  "org_id": "8a3b...",
  "user_id": "7c1d...",
  "warnings": ["owner_user_id_update_failed"]
}
```

> ⚠️ **Nessun session token nella response.** Il client deve fare `supabase.auth.signInWithPassword()` separatamente con le credenziali appena registrate.

### Response — Error

```json
{
  "ok": false,
  "error": "slug_taken",
  "message": "Slug \"test-brew\" già usato"
}
```

| `error` | HTTP | Quando |
|---|---|---|
| `invalid_input` | 400 | Validazione fallita (campo in `field`) |
| `slug_taken` | 409 | Slug già usato |
| `email_exists` | 409 | Email già registrata in auth |
| `rate_limited` | 429 | > 5 signup/ora dallo stesso IP |
| `internal` | 500 | Errore non gestito (rollback già eseguito) |

---

## Secrets richiesti

Configurare in **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Origine | Note |
|---|---|---|
| `SUPABASE_URL` | già esistente (altre Edge Functions) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | già esistente | — |
| `IP_HASH_SALT` | **nuovo** | 32+ random bytes — `openssl rand -hex 32` |
| `SUPABASE_ENV` | **nuovo** | `production` / `staging` / `development` |

### Comportamento environment-aware (Q2 decisione)

- `SUPABASE_ENV=production` + `IP_HASH_SALT` mancante → **HARD FAIL** (impedisce GDPR violation)
- `SUPABASE_ENV=development|staging` + `IP_HASH_SALT` mancante → **WARNING** + fallback salt fisso

---

## Esempio curl

```bash
# Success
curl -X POST 'https://<project>.supabase.co/functions/v1/signup-org' \
  -H 'Content-Type: application/json' \
  -H 'apikey: <ANON_KEY>' \
  -d '{
    "org_name": "Birrificio Test",
    "org_slug": "test-brew",
    "admin_email": "owner@test.it",
    "admin_password": "Password123",
    "admin_full_name": "Mario Rossi"
  }'
# → 201 { "ok": true, "org_id": "...", "user_id": "..." }

# Slug duplicato
curl ... -d '{"org_slug": "amarcord", ...}'
# → 409 { "ok": false, "error": "slug_taken", "message": "..." }

# Rate limit (dopo 5 tentativi nella stessa ora)
# → 429 { "ok": false, "error": "rate_limited", "message": "Riprova tra X minuti" }
```

---

## Sequenza atomica `provisionOrganization` (lib/provision.ts)

```
Step A: INSERT organizations (plan=trial, trial_ends_at=now+30d, owner_user_id=NULL)
        Fail → ritorna error, niente da pulire

Step B: auth.admin.createUser({ user_metadata._signup_via_edge='true' })
        Trigger handle_new_user vede il flag → return immediato senza INSERT
        Fail → DELETE org (Step A rollback)
        Email duplicata → ritorna 'email_exists' invece di 'internal'

Step C: INSERT users (auth_id, role='admin', org_id=new_org)
        Trigger validate_org_id_format verifica esistenza org (OK)
        Fail → admin.deleteUser + DELETE org (full rollback)

Step D: UPDATE organizations.owner_user_id (Q3: fail = warning, NO rollback)
        L'utente è admin valido, l'org esiste senza owner — recoverable
        warnings.push('owner_user_id_update_failed')
```

---

## Rate limiting policy

- **Limite**: 5 signup/ora per `hashIp(IP)` (sliding window)
- **Storage**: in-memory `Map<ipHash, timestamps[]>`
- **Ip hashing**: `SHA-256(ip + IP_HASH_SALT)` — IP grezzo MAI persistito o loggato
- **Ip extraction order**: `X-Forwarded-For` (primo hop) > `X-Real-IP` > `'unknown'`

### Quando viene incrementato il counter

Decisione esplicita: `recordAttempt(ipHash)` è chiamato **SEMPRE** dopo `provisionOrganization`, sia su successo che su fallimento (eccetto early-return su validazione/rate-limit/CORS).

**Perché anche su success?**
Se contassimo solo i fallimenti, un attacker che vuole creare 100 org bot-driven non sarebbe rallentato: ogni signup riuscito non incrementa il counter → loop infinito. Contando ANCHE i success, lo stesso IP è limitato a 5 org/ora → abuse vector chiuso.

**Effetto sul caso legittimo**: un utente che crea la propria org una volta non è penalizzato (1/5 attempts/h). Lo scenario "stesso utente crea 5 org legittime in 1h" è non realistico (≠ casi di test che vanno fatti con email/IP diversi).

### Limite noto

L'in-memory store è **perso al cold start** della Edge Function e **non è condiviso** tra istanze in scaling orizzontale. In pratica significa che 5 attempts/h diventano effettivi 5×N/h con N istanze attive. Per audit trail/abuse protection vero serve tabella `signup_attempts` con cleanup cron — Sprint futuro.

Stesso pattern di [`guest-chat`](../guest-chat/index.ts) (consistency interna).

---

## Troubleshooting

| Sintomo | Causa probabile | Fix |
|---|---|---|
| `internal` con log "Step C failed: org_id ... non esiste" | Migration 033 (validate_org_id_format trigger) non applicata | Apply 033 |
| `internal` con log "createUser failed: ... trigger" | Migration 034 (escape-hatch) non applicata | Apply 034 |
| `email_exists` su email mai usata | Race condition con altro signup concorrente | Retry dopo qualche secondo |
| `internal` su log "IP_HASH_SALT not configured in production" | Secret mancante in produzione | Configurare in Dashboard |
| Rate limit non funziona (sembra non resettare) | Cold start della Edge Function (vedi "Limite noto") | Atteso — futuro fix con DB-backed |
| HTTP 500 senza log specifici | Servizio Supabase Edge Functions DOWN | Check status Supabase |

---

## Test manuale staging (FASE 0 Sprint 1)

Sequenza canonica per validare l'integrazione completa in staging:

```bash
# 1. Pre-check: 032+033+034 applicate
psql "$STAGING_DB_URL" -c "SELECT count(*) FROM organizations;"  # >= 1 (Amarcord seed)

# 2. Signup nuova org
curl -X POST '<staging>/functions/v1/signup-org' \
  -H 'Content-Type: application/json' \
  -H 'apikey: <STAGING_ANON_KEY>' \
  -d '{
    "org_name": "Test Brewery",
    "org_slug": "test-brewery",
    "admin_email": "test@example.it",
    "admin_password": "TestPass123",
    "admin_full_name": "Test Admin"
  }'
# Expected: 201 { ok: true, org_id, user_id }

# 3. Verifica DB
psql "$STAGING_DB_URL" -c "
  SELECT o.name, o.slug, o.plan, o.status, o.trial_ends_at, u.role, u.email
    FROM organizations o JOIN users u ON u.org_id = o.id::text
   WHERE o.slug = 'test-brewery';
"
# Expected: 1 row con plan='trial', status='trial', role='admin'

# 4. Verifica login
curl -X POST '<staging>/auth/v1/token?grant_type=password' \
  -H 'apikey: <STAGING_ANON_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.it","password":"TestPass123"}'
# Expected: 200 con access_token

# 5. Smoke test Amarcord (regressione)
# Verifica che l'org seed non sia stata toccata
psql "$STAGING_DB_URL" -c "
  SELECT name, slug, plan, status FROM organizations WHERE slug = 'amarcord';
"
# Expected: name='Birra Amarcord', plan='enterprise', status='active'

# 6. Idempotenza signup → seconda chiamata con stesso slug
curl ... -d '{"org_slug":"test-brewery", ...}'
# Expected: 409 slug_taken

# 7. Rate limit → 6 chiamate consecutive con email diverse
for i in 1 2 3 4 5 6; do
  curl ... -d '{"org_slug":"test-'$i'", "admin_email":"t'$i'@x.it", ...}'
done
# Expected: prime 5 OK (o slug_taken), 6° è rate_limited
```

---

## Pre-go-live checklist

- [ ] `IP_HASH_SALT` configurato (32+ bytes random)
- [ ] `SUPABASE_ENV='production'` configurato (abilita HARD FAIL su salt mancante)
- [ ] Rate limit `/rest/v1/rpc/check_slug_available` configurato a 30/min/IP nel Dashboard
- [ ] Email verification con Resend (Sprint 2 — TODO)
- [ ] Audit DB-backed per signup_attempts (Sprint futuro — TODO)
- [ ] FASE 0 staging completata (sezione precedente)
- [ ] Backup Amarcord prod scaricato e verificato
