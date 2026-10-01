# Migration 066 — Email dei ticket non critici: ai tecnici non più

> **Cosa fa**: spegne `email_new_report` nelle preferenze **già salvate** dei tecnici e nel default aziendale del ruolo tecnico. Da qui in avanti un nuovo ticket **non critico** va per email solo agli admin; i **critici** arrivano a tutti come prima. Serve alla v5.26, che cambia lo stesso default nella funzione email.
>
> **Tempo stimato**: 2 minuti.
>
> **Rischio**: basso. Cambia una sola chiave in una manciata di righe di `notification_preferences` e ne tiene una copia (`_backup_066_notif_prefs`) per il rollback.

---

## 0. Perché serve, oltre al default nel codice

Le Impostazioni salvano **tutte** le preferenze al primo interruttore toccato, default compresi. Un tecnico che ha spento anche solo "Nuovo messaggio chat" ha `email_new_report = true` memorizzato senza averlo mai scelto, e il nuovo default non lo raggiunge. La 066 corregge quei valori.

**Quando applicarla**: prima o dopo il merge, non importa. Servono entrambe le cose: il default nella funzione (per chi non ha mai salvato preferenze) e la 066 (per chi le ha salvate).

---

## 1. Esegui la migration

1. Apri `supabase/migrations/066_tecnici_email_new_report_off.sql` dal repo e copia tutto.
2. Supabase → **SQL Editor** → **New query** → incolla → **Run**.

Risultato atteso: `Success. No rows returned`.

---

## 2. Verifica

```sql
-- Quante righe sono state spente (copia per il rollback)
SELECT count(*) AS righe_spente FROM public._backup_066_notif_prefs;

-- Nessun tecnico deve avere più email_new_report = true memorizzato
SELECT count(*) AS ancora_accese
  FROM public.notification_preferences np
  LEFT JOIN public.users u ON u.id = np.user_id
 WHERE np.prefs->>'email_new_report' = 'true'
   AND ((np.is_org_default AND np.role = 'tecnico') OR u.role = 'tecnico');
```

Atteso: `righe_spente` ≥ 0 (zero se nessun tecnico aveva mai salvato preferenze); `ancora_accese` = **0**.

Se un tecnico vuole di nuovo l'email di ogni ticket: Impostazioni → Notifiche email → "Nuova segnalazione creata". Rieseguire la 066 non gliela rispegne.

---

## 3. Rollback

Esegui `supabase/migrations/066_tecnici_email_new_report_off_down.sql`: riaccende la chiave sulle righe spente dalla 066 (solo quella chiave, le altre preferenze restano) e cancella la copia. Per tornare del tutto al comportamento di prima va ripristinato anche il default nella funzione (`EMAIL_ROLE_DEFAULTS.tecnico.email_new_report` in `send-email-notification`).
