# 2026-10 — Perché i push non arrivavano (v5.24)

## Richiesta (dal founder, 1/10)
"Vorrei ottimizzare gli allarmi di scadenze e quant'altro direttamente sul
cellulare. Quando qualcuno scrive o aggiorna la situazione, un pop up del
cellulare sarebbe ottimo. Al momento questo pecca... non sempre compare."

## Come ci siamo arrivati
L'analisi del codice ha trovato sette punti deboli lungo la catena
(notifica → trigger → edge function → servizio push → service worker). Poi
due query in produzione hanno cambiato le priorità:

1. `net._http_response`: ogni notifica fa **tre** chiamate. Push ed email
   rispondono 200; la terza, senza intestazione, prende 401 — un vecchio
   Database Webhook doppione, presente da prima del deploy di quella mattina.
2. Il push risponde sempre `sent: 0`. I log della funzione: **Google 403,
   Mozilla 401, Apple 400 su ogni dispositivo**. Nessun push è mai arrivato:
   i "pop up ogni tanto" erano gli avvisi interni dell'app aperta.

Verifica del codice di firma (JWT VAPID) fuori da Deno: con una coppia
coerente la firma è valida; con una coppia incoerente l'import della chiave
fallisce prima di contattare Google. Siccome Google veniva contattato, la
coppia del server era coerente. Restava una sola spiegazione per il 403:
**i telefoni si erano iscritti con una chiave pubblica diversa** (quella
della build su Vercel) da quella con cui il server firmava (secrets di
Supabase), e l'app riusava l'iscrizione senza mai controllarla.

## Decisioni
1. **Una sola fonte della chiave**: il server. L'app la chiede con un GET
   alla funzione; la chiave della build resta solo come ripiego. Due copie
   da tenere uguali in due pannelli diversi sono un guasto che aspetta di
   ripetersi.
2. **Riparazione automatica**: a ogni apertura l'app confronta la chiave
   dell'iscrizione con quella del server e la rifà se diversa (o se non può
   saperlo). Nessun gesto richiesto ai ragazzi.
3. **La funzione si difende da sola**: `verify_jwt = false` per il GET
   dall'app (login custom, nessun JWT utente), e un controllo interno che
   accetta solo la chiave del trigger. Messo in `config.toml`, così il
   workflow di deploy non lo riaccende.
4. **Operatori e console iscritti**: `OperatorApp` non chiedeva mai il
   permesso — chi apre le segnalazioni era il primo a non sapere quando
   rispondevano.

## Cosa resta aperto
1. **Scadenze dal server**: `useAutoNotifications` gira sul telefono di chi
   apre l'app (niente app aperta = niente allarme; più telefoni = doppioni;
   lo scaduto si segnala una volta sola). Va un job `pg_cron` con un registro
   degli avvisi inviati — richiede una migration.
2. **Destinatari**: un messaggio avvisa solo chi ha aperto e l'assegnato;
   mancano chi ha scritto in chat e i partecipanti dell'intervento. Meglio un
   trigger su `comments` che una regola ripetuta in ogni canale (nota
   vocale e coda offline oggi non avvisano).
3. Se dopo la riparazione Apple risponde ancora 400, il motivo ora è
   leggibile da SQL (`errors` nella risposta della funzione).

---

## Seconda parte (1/10) — chi manca e le scadenze (v5.25)

Dopo il deploy la notifica di prova arriva. La query sui telefoni iscritti
però dice: **admin 0/6, operatori 0/2, tecnici 5/27**. Le iscrizioni rotte
sono state cancellate dal server; si rifanno solo quando la persona apre
l'app e accetta. Per i tecnici c'era un ostacolo in più: il banner del
permesso compare una volta, e chi l'aveva chiuso o aveva toccato "Blocca"
non aveva nessun altro posto dove riattivare le notifiche.

### Decisioni
1. **Card fissa nel Profilo** (`PushStatusCard`), non un altro banner:
   lo stato si vede sempre, con l'istruzione giusta per ogni caso (attiva,
   bloccate su Android/Chrome, iPhone senza app sulla Home) e i tasti
   Prova e Ripara.
2. **Scadenze dal server** con `pg_cron` (come il digest della 011). Il
   registro `maintenance_alerts` per piano + ciclo sostituisce il "già
   inviato" che stava su ogni telefono.
3. **Lo scaduto si ripete ogni 3 giorni**, ma tace se il piano è in corso:
   chi ci sta lavorando non ha bisogno di sentirselo dire.
4. **Partenza senza raffica**: alla migration le scadenze di oggi sono
   registrate come già avvisate (i telefoni le avevano appena mandate).
   Con i push che da oggi arrivano davvero, venti avvisi tutti insieme il
   mattino dopo sarebbero stati il modo migliore per farli spegnere.
5. Funzione provata su un Postgres locale con dati simulati: nessuna
   raffica all'avvio, promemoria e scaduto per i piani nuovi, niente
   doppioni nello stesso giorno, richiamo a 3 giorni, silenzio se in corso,
   ciclo nuovo dopo l'intervento; rollback e riapplicazione puliti.

### Cosa resta aperto
- Un avviso per piano: se gli scaduti sono tanti, meglio un riepilogo
  unico per persona ("3 manutenzioni scadute").
- Destinatari dei messaggi (trigger su `comments`), come da prima parte.

---

## Terza parte (1/10) — le email agli admin (v5.26)

### Richiesta
"La versione desktop, gli admin mi segnalano che non ricevono sempre le
notifiche via email."

### Cosa dice il codice
La catena è la stessa del push: riga in `notifications` → trigger della 010
→ `send-email-notification` → batch di Resend. Il "rispondono 200" della
prima parte non provava niente: la funzione rispondeva 200 anche quando
Resend rifiutava tutto (`sent: 0, failed: N`). Tre modi in cui un'email
spariva senza traccia:

1. **Chiamate parallele oltre il limite di Resend** (429): le notifiche
   nascono a gruppi — due righe per ogni cambio stato, N per un intervento,
   tutte le scadenze insieme alle 06:45 — e nessun nuovo tentativo.
2. **Batch "strict"** (default di Resend): un solo indirizzo non valido fa
   scartare l'intero invio a tutti.
3. **Quota del piano Resend**: un nuovo ticket è un broadcast che di default
   va per email ad admin **e tecnici** (`email_new_report: true` per
   entrambi): con 6 admin e 27 tecnici, una trentina di email a ticket. Il
   piano gratuito ne consente 100 al giorno: dal terzo ticket in poi, fino a
   mezzanotte UTC, non parte più niente. È il sospetto principale per il
   "non sempre", ma dipende dal piano: **da verificare** sul pannello Resend.

### Decisioni
1. Nuovi tentativi solo su `rate_limit_exceeded` (la richiesta non è stata
   elaborata: nessun doppione). Sulle quote no: riprovare non serve.
2. Batch `permissive` e indirizzi malformati scartati prima: partono le
   email buone, le rifiutate vanno nel log con l'indirizzo.
3. Solo account `active`: inviti pendenti e disattivati non ricevono più.
4. Zero email partite = **502** con il motivo, e `"channel":"email"` in ogni
   risposta. Da ora la diagnosi si fa da SQL senza aprire i log.

### Come verificare (SQL Editor)
```sql
-- Esito delle chiamate email delle ultime ~6 ore (pg_net non tiene di più).
-- Prima del deploy della v5.26: le email sono le righe con "total" e senza "expired".
SELECT created, status_code, content
  FROM net._http_response
 WHERE content LIKE '%"channel":"email"%'
    OR (content LIKE '%"total"%' AND content NOT LIKE '%"expired"%')
 ORDER BY created DESC LIMIT 50;

-- Email stimate al giorno per i nuovi ticket (broadcast × admin e tecnici attivi).
SELECT created_at::date AS giorno,
       count(*) AS nuovi_ticket,
       count(*) * (SELECT count(*) - 1 FROM public.users
                    WHERE status = 'active' AND role IN ('admin', 'tecnico')) AS email_stimate
  FROM public.notifications
 WHERE target_user IS NULL AND type IN ('new_report', 'new_report_critical')
   AND created_at > now() - interval '14 days'
 GROUP BY 1 ORDER BY 1 DESC;
```

### Cosa resta aperto
- **Volume**: se la quota è la causa, o si passa a un piano Resend a
  pagamento o si toglie l'email dei ticket non critici ai tecnici (il push
  per loro è già spento di default; l'email di default è più rumorosa del
  push, contro la regola scritta sopra gli `EMAIL_ROLE_DEFAULTS`).
- **Destinatari**: un admin riceve cambi stato, messaggi e richieste ricambi
  solo se ha aperto o ha in carico il ticket. "Risolta" e "In attesa
  ricambi" sui ticket dei tecnici non gli arrivano né in app né per email:
  per scelta o da allargare? Va deciso con gli admin.
- Le email finite in spam non si vedono da qui: pannello Resend → Emails.
