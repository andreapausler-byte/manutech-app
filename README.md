# 🔧 ManuTech — Sistema di Gestione Manutenzione

App web per la gestione delle segnalazioni di manutenzione industriale.

## 🚀 Quick Start (Modalità Demo)

```bash
# 1. Installa dipendenze
npm install

# 2. Avvia il server di sviluppo
npm run dev
```

Apri `http://localhost:5173` nel browser.
**Credenziali demo:** `admin@manutech.it` / `admin123`

> In modalità demo i dati sono salvati nel localStorage del browser.

## ⚙️ Setup con Supabase (Produzione)

### 1. Crea progetto Supabase
- Vai su [supabase.com](https://supabase.com) e crea un nuovo progetto gratuito

### 2. Configura il database
- Apri **SQL Editor** nel pannello Supabase
- Copia e incolla il contenuto di `supabase/schema.sql`
- Clicca **Run**

### 3. Configura lo storage
- Vai in **Storage** → **New Bucket**
- Nome: `attachments`, seleziona **Public**

### 4. Configura le variabili d'ambiente
```bash
cp .env.example .env
```
Modifica `.env` con URL e chiave dal pannello Supabase (Settings → API).

### 5. Avvia
```bash
npm run dev
```

## 📱 Accesso da telefono

Il server Vite espone sulla rete locale: `http://192.168.1.X:5173`

## 🏗️ Struttura

```
manutech/
├── src/
│   ├── components/
│   │   ├── layout/     # Login, MobileLayout, AdminLayout
│   │   ├── ui/         # Button, Modal, Badge, Input...
│   │   ├── reports/    # ReportsList, NewReport, ReportDetail
│   │   └── media/      # MediaCapture (foto/video/audio)
│   ├── contexts/       # AuthContext
│   ├── lib/            # Supabase client, constants
│   ├── pages/
│   │   ├── mobile/     # Dashboard, Profile
│   │   └── admin/      # Dashboard, Reports, Machines, Users, Technicians
│   └── styles/
├── supabase/schema.sql
└── .env.example
```

## 👥 Ruoli
- **Operatore** (Mobile): crea segnalazioni con foto/video/audio
- **Tecnico** (Mobile): come operatore + aggiorna stato
- **Admin** (Desktop): dashboard KPI, gestione completa

## 📦 Deploy
```bash
npm run build   # → cartella dist/ pronta per Netlify/Vercel
```
