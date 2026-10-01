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
