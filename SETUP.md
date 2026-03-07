# ManuTech — Guida Setup Completa

## Panoramica

Questa guida ti porta da "app demo su localStorage" a "app live con database reale".  
Tempo stimato: **30-45 minuti**.

Cosa otterrai:
- Database PostgreSQL su Supabase (gratis fino a 500MB)
- Autenticazione email/password reale
- Storage file (foto, video, audio) su cloud
- App deployata su Vercel con HTTPS (gratis)
- QR Scanner funzionante (richiede HTTPS)

---

## STEP 1 — Crea il progetto Supabase

1. Vai su **[supabase.com](https://supabase.com)** e registrati (gratis)
2. Clicca **"New Project"**
3. Compila:
   - **Name:** `manutech`
   - **Database Password:** scegli una password sicura (salvala!)
   - **Region:** scegli la più vicina a te (es. `West EU - Frankfurt`)
4. Clicca **"Create new project"** — attendi 2-3 minuti

---

## STEP 2 — Crea il database (Schema SQL)

1. Nel menu a sinistra, clicca **"SQL Editor"**
2. Clicca **"New Query"**
3. Apri il file `supabase/schema.sql` dal progetto
4. **Copia TUTTO il contenuto** e incollalo nell'editor SQL
5. Clicca il pulsante **"Run"** (▶)
6. Dovresti vedere: `Success. No rows returned` — è tutto OK!

Questo ha creato:
- 6 tabelle: `users`, `machines`, `reports`, `comments`, `activities`, `notifications`
- Indici per query veloci
- Row Level Security con policy per organizzazione
- Trigger automatico per `updated_at`
- Trigger per creare il profilo utente alla registrazione
- Bucket storage `attachments` per i file

---

## STEP 3 — Disabilita la conferma email (per sviluppo)

In produzione vorrai riabilitarla, ma per testare velocemente:

1. Vai in **Authentication** (menu a sinistra)
2. Clicca **"Providers"** (in alto)
3. Clicca su **"Email"**
4. **Disattiva** "Confirm email"
5. Clicca **"Save"**

---

## STEP 4 — Recupera le credenziali API

1. Vai in **Settings** (icona ingranaggio in basso a sinistra)
2. Clicca **"API"** nella sidebar
3. Copia:
   - **Project URL** → es. `https://abcdefgh.supabase.co`
   - **anon public key** → inizia con `eyJhbGci...`

---

## STEP 5 — Configura le variabili d'ambiente

### Per sviluppo locale:

1. Nella cartella del progetto, copia `.env.example` come `.env`:
   ```bash
   cp .env.example .env
   ```
2. Apri `.env` e sostituisci con i tuoi valori:
   ```
   VITE_SUPABASE_URL=https://abcdefgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. Salva il file

### Testa in locale:

```bash
npm run dev
```

Se nella console del browser NON vedi più `⚠️ Supabase non configurato`, sei collegato!

---

## STEP 6 — Crea il primo utente Admin

1. Con l'app in esecuzione, vai alla pagina di **Registrazione**
2. Registra un account con:
   - Nome: il tuo nome
   - Email: la tua email reale
   - Password: minimo 6 caratteri
3. Il trigger SQL creerà automaticamente il profilo con ruolo `operatore`
4. **Ora promuovilo ad admin.** Vai su Supabase:
   - Menu → **Table Editor** → tabella `users`
   - Trova il tuo utente
   - Clicca sulla cella `role` → cambia da `operatore` a `admin`
   - Premi Invio per salvare

5. **Esci e rientra** nell'app per caricare il nuovo ruolo

---

## STEP 7 — Crea utenti di test

Ora che sei admin, dalla **Dashboard Admin** dell'app puoi:

- Creare un **operatore** di test (chi fa le segnalazioni)
- Creare un **tecnico** di test (chi le risolve)

Oppure puoi registrare altri account dalla pagina di registrazione e poi cambiare i ruoli da Supabase Table Editor.

---

## STEP 8 — Deploy su Vercel

1. **Crea un repository Git** (se non l'hai già):
   ```bash
   git init
   git add .
   git commit -m "ManuTech v3.0 - ready for deploy"
   ```

2. **Pusha su GitHub:**
   - Crea un nuovo repo su [github.com](https://github.com/new)
   - Segui le istruzioni per "push an existing repository"

3. **Vai su [vercel.com](https://vercel.com)** e registrati con GitHub

4. Clicca **"Import Project"** → seleziona il tuo repo

5. Nella configurazione:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Environment Variables** (IMPORTANTE!):
     - `VITE_SUPABASE_URL` = il tuo URL Supabase
     - `VITE_SUPABASE_ANON_KEY` = la tua chiave anon

6. Clicca **"Deploy"**

7. In 1-2 minuti avrai l'URL: `https://manutech-xxx.vercel.app`

---

## STEP 9 — Configura Supabase per il dominio Vercel

1. Torna su **Supabase → Authentication → URL Configuration**
2. In **"Site URL"**, inserisci il tuo URL Vercel:
   ```
   https://manutech-xxx.vercel.app
   ```
3. In **"Redirect URLs"**, aggiungi:
   ```
   https://manutech-xxx.vercel.app/**
   ```
4. Salva

---

## STEP 10 — Testa tutto

### Checklist di verifica:

- [ ] **Registrazione:** crea un nuovo account → funziona senza errori
- [ ] **Login:** esci e rientra → sessione persiste
- [ ] **Crea report:** nuova segnalazione con foto → si salva nel database
- [ ] **QR Scanner:** ora funziona (HTTPS attivo!) → apre la fotocamera
- [ ] **Commenti:** aggiungi un commento a un report → visibile da altri utenti
- [ ] **Notifiche:** cambia stato → la campanella mostra la notifica
- [ ] **Multi-dispositivo:** apri l'app dal telefono e dal PC → stessi dati
- [ ] **Media upload:** foto/video caricati → visibili nel report

---

## Struttura Database

```
users
├── id (UUID, PK)
├── auth_id (→ auth.users)
├── name, email, role
├── org_id (per multi-tenant)
└── created_at, updated_at

machines
├── id (UUID, PK)
├── name, department, location, status
├── qr_code, attachments (JSONB)
├── org_id
└── created_at, updated_at

reports
├── id (UUID, PK)
├── title, description, severity, status
├── machine, machine_id (→ machines)
├── media (JSONB), extra_data (JSONB)
├── created_by (→ users), assigned_to (→ users)
├── is_quick, template_id
├── org_id
└── created_at, updated_at

comments
├── id (UUID, PK)
├── report_id (→ reports)
├── text, user_id, user_name, user_role
├── org_id
└── created_at

activities
├── id (UUID, PK)
├── report_id (→ reports)
├── type, from_status, to_status, detail
├── user_id, user_name
├── org_id
└── created_at

notifications
├── id (UUID, PK)
├── type, title, body
├── report_id, from_user, target_user
├── read (boolean)
├── org_id
└── created_at
```

---

## Sicurezza RLS

Ogni tabella ha Row Level Security attivo. Le regole:

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| users | Stessa org | Solo il proprio (via trigger) | Proprio profilo / Admin | Solo admin |
| machines | Stessa org | Solo admin | Solo admin | Solo admin |
| reports | Stessa org | Stessa org | Proprio report / Tecnico / Admin | — |
| comments | Stessa org | Stessa org | — | — |
| activities | Stessa org | Stessa org | — | — |
| notifications | Proprie + broadcast | Stessa org | Solo proprie | — |

Il campo `org_id` su ogni tabella è già pronto per la **Fase 5 (Multi-Tenant)**: basterà assegnare org_id diversi a organizzazioni diverse e i dati saranno automaticamente isolati.

---

## Troubleshooting

### "Supabase non configurato" nella console
→ Il file `.env` non esiste o le variabili sono vuote. Ricontrolla STEP 5.

### "Invalid API key"
→ Hai copiato la chiave sbagliata. Usa la **anon public** key, non la service_role.

### Errore "new row violates RLS policy"
→ L'utente non ha un profilo nella tabella `users`. Verifica che il trigger `on_auth_user_created` sia attivo (STEP 2).

### Upload file fallisce
→ Verifica che il bucket `attachments` esista: Supabase → Storage. Se non c'è, il SQL dello STEP 2 potrebbe non aver creato la policy. Crea il bucket manualmente e rendilo **Public**.

### QR Scanner non funziona
→ Serve HTTPS. In locale non funzionerà. Funziona dopo il deploy su Vercel (STEP 8).

### Utente registrato ma ruolo sbagliato
→ Il trigger assegna `operatore` di default. Cambia il ruolo da Table Editor in Supabase.
