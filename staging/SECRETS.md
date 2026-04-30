# Sprint 1 — Secrets staging Edge Function

Valori pronti da incollare in Supabase Dashboard staging
→ **Edge Functions** → **Manage secrets**.

⚠️ Tutti i secrets in questo file sono per **STAGING**. Per prod usa valori
   diversi (specialmente `IP_HASH_SALT` — DEVE essere unico per ambiente).

---

## Secrets richiesti

| Nome                          | Valore | Note |
|-------------------------------|--------|------|
| `SUPABASE_ENV`                | `staging` | Abilita IP_HASH_SALT soft-fail in dev |
| `IP_HASH_SALT`                | `a018159f00ea5bff28028eca433ed48bd9dc0d9b3791ce78e6c6a095e3e18d70` | 32 byte random generato per staging. Per prod genera un nuovo valore diverso. |
| `RESEND_API_KEY`              | `re_5s1B3BG7_CFXmnzjTu1wtxijsnhGhkqhv` | API key Resend già verificata su `manutech.app`. ⚠️ Ruota a fine Sprint 1. |
| `SIGNUP_NOTIFICATION_EMAIL`   | `andrea.pausler@gmail.com` | Destinatario email notifica nuovi signup |
| `SIGNUP_FROM_EMAIL`           | `ManuTech <noreply@manutech.app>` | Mittente. `manutech.app` è già verificato su Resend. |

## Secrets auto-gestiti da Supabase (NON aggiungere manualmente)

- `SUPABASE_URL` → iniettato runtime
- `SUPABASE_SERVICE_ROLE_KEY` → iniettato runtime

---

## Come aggiungerli (Dashboard)

1. Vai su https://supabase.com/dashboard/project/pfruqawzgoytgadvawnj/functions
2. Tab **Manage secrets** (alto destra)
3. Per ogni secret della tabella sopra:
   - Click "Add new secret"
   - Name: `<nome>`
   - Value: `<valore>` (copia esatto)
   - Save
4. Verifica: la lista deve mostrare 5 secrets ManuTech custom.

---

## Come aggiungerli (CLI alternativa)

Se hai installato `supabase` CLI (vedi EDGE-FUNCTION-DEPLOY.md Step 5 Opzione A):

```bash
cd /home/user/manutech-app

supabase secrets set \
  SUPABASE_ENV=staging \
  IP_HASH_SALT=a018159f00ea5bff28028eca433ed48bd9dc0d9b3791ce78e6c6a095e3e18d70 \
  RESEND_API_KEY=re_5s1B3BG7_CFXmnzjTu1wtxijsnhGhkqhv \
  SIGNUP_NOTIFICATION_EMAIL=andrea.pausler@gmail.com \
  "SIGNUP_FROM_EMAIL=ManuTech <noreply@manutech.app>" \
  --project-ref pfruqawzgoytgadvawnj
```

---

## Pre-prod checklist (NON staging — solo per quando deployerai prod)

Prima di deployare in prod Amarcord, prepara valori prod separati:

- [ ] Genera nuovo `IP_HASH_SALT` (`openssl rand -hex 32`) — NON riusare quello staging
- [ ] Crea nuova `RESEND_API_KEY` con nome `manutech-prod`
- [ ] Imposta `SUPABASE_ENV=production`
- [ ] Conferma `SIGNUP_NOTIFICATION_EMAIL` (può essere diversa, es. `signups@manutech.app`)
- [ ] Conferma `SIGNUP_FROM_EMAIL` (probabilmente uguale: `ManuTech <noreply@manutech.app>`)

Riferimento: `supabase/functions/signup-org/index.ts` linea 14-19 documenta
i secrets richiesti.
