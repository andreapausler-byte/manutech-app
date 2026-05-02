# Migration 037 — Optimization KPIs

> **Cosa fa**: aggiunge la funzione SQL `get_optimization_dashboard()` al database. Senza di essa, la pagina admin "Ottimizzazione" mostra l'errore *"Impossibile caricare i KPI"*.
>
> **Tempo stimato**: 5 minuti.
>
> **Rischio**: bassissimo. Non tocca tabelle, non sposta dati. Crea solo una funzione di sola lettura. Rollback istantaneo.

---

## 0. Quando applicarla

Subito dopo il merge del PR che porta il branch `claude/improve-manutech-1muuS` in main.

L'app frontend è già pronta (la pagina si carica), ma chiamerà una funzione che il database non conosce → errore visibile all'admin. Applica la migration **prima** di annunciare la feature al team.

---

## 1. Cosa serve

- [ ] Accesso al Dashboard Supabase del progetto ManuTech (ruolo Owner o Admin)
- [ ] Il file `supabase/migrations/037_optimization_kpis.sql` aperto da qualche parte (repo locale o GitHub web)

---

## 2. Backup (consigliato, non obbligatorio)

Visto che la migration non modifica tabelle né dati, il backup è precauzionale. Se vuoi farlo:

- Dashboard Supabase → *Database → Backups → Download*
- Salva il `.sql.gz` da qualche parte sicura

Se sei in un periodo di poco traffico puoi anche saltare questo step — il rollback (sezione 5) è banale.

---

## 3. Esegui la migration

1. Apri `supabase/migrations/037_optimization_kpis.sql` dal repo
2. **Copia tutto il contenuto** del file (Ctrl+A, Ctrl+C)
3. Vai su **app.supabase.com** → progetto ManuTech
4. Menu sinistra → **SQL Editor** → bottone **New query**
5. **Incolla** il contenuto nel pannello
6. Premi **Run** (o Ctrl+Enter)

Risultato atteso: messaggio verde *"Success. No rows returned"*.

Se vedi un errore rosso, **fermati**. Non rieseguire. Copia il messaggio di errore e leggilo: di solito è un problema di permessi o di una funzione dipendente mancante (`get_my_org_id`, `get_my_role`) — entrambe già presenti dato che le altre 36 migration sono state applicate.

---

## 4. Verifica

Esegui queste 3 query nel SQL Editor:

### 4.1 La funzione esiste ed è SECURITY DEFINER

```sql
SELECT proname, prosecdef, prokind
FROM pg_proc
WHERE proname = 'get_optimization_dashboard';
```

Atteso: 1 riga, `prosecdef = true`, `prokind = 'f'`.

### 4.2 Solo `authenticated` può eseguirla

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'get_optimization_dashboard';
```

Atteso: una riga con `grantee = 'authenticated'`, `privilege_type = 'EXECUTE'`. Nessuna riga per `anon` o `public`.

### 4.3 Test funzionale dall'app

- Apri ManuTech, login come **admin**
- Sidebar → **Ottimizzazione**
- Devi vedere i 4 KPI in alto (MTTR, MTBF, % preventiva, urgenti) caricati
- Se la tua org ha pochi dati negli ultimi 90gg vedrai *"Nessun dato negli ultimi 90 giorni"* — è normale, la migration funziona comunque

Se accedi come operatore o tecnico la voce non è visibile (pagina riservata admin a livello di NAV) e in caso di chiamata diretta la RPC restituisce `Accesso riservato agli admin`.

---

## 5. Rollback (se serve)

Se per qualsiasi motivo vuoi rimuovere la funzione (es. stai testando, o la pagina si comporta in modo strano):

1. SQL Editor → New query
2. Apri `supabase/migrations/037_optimization_kpis_down.sql`
3. Copia, incolla, **Run**

Il file contiene solo:

```sql
DROP FUNCTION IF EXISTS public.get_optimization_dashboard();
```

Zero impatto sui dati. Da quel momento la pagina "Ottimizzazione" tornerà a mostrare l'errore di caricamento — ma il resto dell'app funziona normalmente.

---

## 6. Promemoria multi-ambiente

Se hai più progetti Supabase (es. **staging** + **prod**), ricordati di applicare la migration **su entrambi**, partendo da staging.

Le altre 36 migration sono già state applicate manualmente in passato — questa segue lo stesso pattern. Vedi `docs/PROD-DEPLOY-SIGNUP-ORG.md` per un esempio più articolato di runbook multi-ambiente.

---

## 7. FAQ

**Q: Posso eseguire la migration anche se l'app non è ancora stata aggiornata su Vercel?**
Sì. La funzione SQL è inerte finché qualcuno non la chiama. Puoi applicarla in anticipo senza rischi.

**Q: Cosa succede se la eseguo due volte?**
Niente. Il file usa `CREATE OR REPLACE FUNCTION`, quindi la seconda esecuzione semplicemente sovrascrive con lo stesso codice.

**Q: Devo aggiornare anche lo schema.sql?**
No. `supabase/schema.sql` è uno snapshot del DB iniziale. Le migration applicate dopo non vanno riportate lì — vivono solo come file numerati in `supabase/migrations/`.

**Q: Quando avrò la prossima migration servirà rifare tutto questo?**
Sì, ogni migration nuova va applicata manualmente. Se vuoi automatizzarlo via GitHub Actions (`supabase db push`) è fattibile in ~30 minuti — chiedimi quando vuoi farlo.
