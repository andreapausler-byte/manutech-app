Workflow di debugging strutturato per ManuTech.

## 1. RIPRODUCI
- Chiedi all'utente: cosa succede, cosa dovrebbe succedere, quale ruolo/pagina
- Identifica se è un problema Supabase (RLS, RPC, schema) o frontend (state, render, navigation)

## 2. ISOLA
- Se errore Supabase: controlla la funzione in `src/lib/supabase.js`, verifica RLS policy in `supabase/schema.sql` e migration
- Se errore UI: leggi il componente, cerca il state flow (Context → hook → component)
- Se errore demo mode: verifica il fallback localStorage nella funzione DB
- Se errore di build: esegui `npm run build` e analizza l'output
- Se errore RLS "violates row-level security": quasi sempre mancanza di org_id o ruolo non autorizzato → usa RPC SECURITY DEFINER

## 3. RISOLVI
- Applica il fix minimale — non refactorare codice circostante
- Se è un pattern ricorrente (es. RLS), crea una RPC in una nuova migration
- Se è un bug di stato, verifica le dipendenze degli hook

## 4. VERIFICA
- Esegui `npm run build` — deve passare
- Verifica che il demo mode non sia rotto (se hai toccato supabase.js)
- Se hai creato una migration SQL, riportala all'utente per esecuzione su Supabase Dashboard

## Problemi frequenti ManuTech
| Sintomo | Causa probabile | Fix |
|---------|----------------|-----|
| "violates row-level security" | org_id mancante o ruolo non in policy | Usa RPC SECURITY DEFINER |
| Componente non appare | Manca nel switch di renderPage() in Layout | Aggiungi case + import |
| Dati vuoti in produzione ma ok in demo | Funzione supabase non restituisce .select() | Aggiungi .select() alla query |
| Toast non appare | Manca import useToast o Toaster | Verifica main.jsx ha Toaster |
