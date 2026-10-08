# 2026-10 — L'archivio diventa il registro degli interventi (v5.22)

## Richiesta (dal founder, 1/10)
"Le segnalazioni una volta risolte vengono segnate completate oppure chiuse e
dopo qualche giorno vanno in archivio. Se vengono selezionate completate,
compare una finestra dove si riportano i riepiloghi finali, eventuali pezzi di
ricambio etc. Mi piacerebbe creare un punto in cui si potesse accedere a
questo archivio per consultare come le segnalazioni siano state completate,
col fine di eventualmente integrare nuove informazioni o comunque accedervi in
modo semplice ma efficace."

## Cosa c'era già (e due sorprese)
1. **I dati di chiusura si salvavano ma non si vedevano.** Foglio mobile,
   modal admin e chiusura vocale scrivono ore, ricambi, causa e azione nelle
   colonne `closure_*` di `reports` (migration 012/019). Il dettaglio mobile,
   il modal admin e la cronologia li cercavano in `extra_data.closure_*`,
   dove nessuno li scrive: il riquadro "Dati chiusura" non compariva mai.
   Li leggevano solo assistente, statistiche e "casi simili". Stessa lezione
   di agosto, in un altro punto: un dato che nessuna schermata rilegge.
2. **L'archivio misurava la cosa sbagliata.** Un ticket concluso andava in
   archivio 24 ore dopo l'ultimo `updated_at`, non dopo la chiusura — e il
   trigger 050 aggiorna `updated_at` a ogni commento. Quindi aggiungere
   un'informazione a un ticket archiviato lo riportava tra i "Recenti": il
   caso d'uso richiesto era proprio quello che il sistema scoraggiava.

Un terzo buco, trovato strada facendo: **"Risolvi e registra" dalla scheda
macchina** chiudeva il ticket con il solo `status: 'risolta'` — niente
`closed_at`, niente `closure_*`. Il racconto finiva solo nel `maintenance_log`;
il ticket restava muto in archivio e fuori dal MTTR.

## Decisioni prese (1/10, "procedi come faresti tu")
1. **Finestra dell'archivio**: resta di 24 ore, ma dalla chiusura
   (`closed_at`), non dall'ultimo aggiornamento. Per `chiuso` — che
   `closed_at` non lo scrive, e non deve, sennò entrerebbe nelle statistiche
   come risolta — vale l'ultimo aggiornamento.
2. **Chi integra**: tecnico e admin, come per l'attribuzione del pezzo.
   Nessuna notifica, tutto in cronologia.
3. **Correggere e aggiungere sono due gesti diversi.** "Correggi" riapre i
   campi della chiusura e scrive in cronologia il prima → dopo di ogni campo
   (`closure_edit`). "Aggiungi un'informazione" accoda una nota senza toccare
   niente (`extra_data.closure_notes`, attività `closure_note`). Per chi
   legge lo storico tra un anno, "il vero problema era l'allineamento" vale
   più di una causa corretta in silenzio.
4. **Nessuna migration.** `extra_data` è già JSONB; le note stanno lì.

## Cosa è stato fatto
- **`lib/closure.js`** (nuovo): unica porta di lettura della chiusura
  (colonne con fallback su `extra_data`), esito (`intervento` /
  `da_completare` / `senza`), momento di chiusura, appartenenza all'archivio,
  testo per la ricerca, raggruppamento per mese, descrizione delle modifiche.
- **`useClosureEdit`** (nuovo hook) + `db.addClosureNote`: correggi e
  aggiungi, con cronologia e reindex della macchina — così assistente e casi
  simili imparano la versione corretta.
- **Dettaglio mobile**: card "Come è stato risolto" in cima ai Dettagli, con
  avviso "Manca la causa radice…" e tasto Completa, note aggiunte dopo, foglio
  di chiusura riusato in modalità "Integra chiusura".
- **Modal admin**: `ClosurePanel` con lo stesso contenuto, form in linea.
- **Tab Archivio mobile**: card orientate alla risoluzione
  (`ResolvedReportCard`), raggruppate per mese di chiusura, filtri per esito
  (Risolta / Da completare / Senza intervento), ricerca dentro causa, azione,
  ricambi e note.
- **Archivio interventi admin** (nuova voce di menu, `AdminArchive`): filtri
  per macchina, pezzo, tecnico, periodo ed esito; KPI (concluse, con
  intervento, ore, da completare, con note); export CSV per Excel.
- **Lista Segnalazioni admin**: sui ticket conclusi il pannello destro mostra
  causa e azione al posto dell'ultimo messaggio; link "Apri l'archivio
  interventi" dalla sezione Archivio.
- **Scheda macchina**: le Concluse (mobile) usano la stessa card; il tab
  Segnalazioni admin mostra causa → azione e porta all'archivio filtrato
  sulla macchina; la scheda del pezzo mostra causa → azione.
- **`ingest-knowledge`** legge anche le note successive (va ri-deployata).

## Cosa ho imparato
Due volte in due mesi il problema non era un dato mancante ma un dato senza
lettore. La verifica da fare prima di ogni feature "di consultazione": apri la
schermata dove il dato dovrebbe comparire e guarda se compare davvero.

## Cosa resta aperto
1. **Ricambi strutturati**: `closure_parts` è testo libero. In chiusura si
   potrebbero proporre come chip i ricambi già richiesti sul ticket
   (`TicketSparePanel`) — con `spare_parts.component_id` (dalla 022, ancora
   inutilizzato) diventa "quante volte abbiamo cambiato quel cuscinetto su
   quella linea". Richiede una migration: va con §E dello studio componenti.
2. **Ricerca lato server**: archivio e liste filtrano client-side su tutto
   `getReports()`. Quando le concluse saranno migliaia, la mossa è l'indice
   FTS di migration 026 (title + description + closure_*), più paginazione.
3. **"Risolvi e registra" non chiede la causa**: quei ticket nascono "da
   completare". È onesto, ma se diventano tanti conviene aggiungere il campo
   al foglio della scheda macchina invece di rincorrerli dopo.
4. **Vocale "Completa" su un ticket già risolto** riscrive la chiusura e
   `closed_at` invece di integrarla: andrebbe instradato su "Integra".

---

## Seconda parte (1/10) — le chiusure che servono (v5.23)

Dalle idee proposte dopo il merge, il founder ha scelto tre: il voto sulle
chiusure, la voce per integrarle, la foto del pezzo.

### Decisioni
1. **Il voto premia la qualità, non la compilazione.** Premiare "chiusura
   compilata" produce testo di riempimento; premiare "un collega ci ha
   risolto un guasto" no. 5 ManuCoin al tecnico della chiusura, una volta
   per collega, mai sulla propria. L'accredito sta in un **trigger**
   (migration 064) perché il client potrebbe ripeterlo.
2. **Il voto riusa `reactions`** (059) con un tipo nuovo, `servito`, a
   livello segnalazione: stessa RLS, stesso indice anti-doppione.
3. **La dettatura è un aiuto alla scrittura, non un flusso vocale.**
   Niente outbox né estrazione campi: un tocco per parlare, il testo si
   accoda al campo. Senza rete lo dice prima di registrare — un audio perso
   dopo è peggio di un campo da scrivere a mano.
4. **"Completa" su un ticket risolto diventa "Integra".** La chiusura
   vocale riscriveva causa, azione e `closed_at`: era il punto 4 dei
   "resta aperto" di stamattina.
5. **La foto del pezzo vive due volte, un solo file**: nel ticket (flag
   `closure` in `media`) e nella galleria della macchina sotto il pezzo
   (stesso URL, via `add_machine_attachment`).
6. **Niente notifica per il voto**, per ora: le preferenze notifiche sono
   specchiate nelle edge function push/email, e un tipo nuovo va aggiunto in
   tre posti. Il riconoscimento arriva nel wallet.

### Cosa resta aperto
- Notifica "la tua chiusura è servita" (vedi sopra).
- La dettatura non c'è nel modal admin: sul desktop si scrive.
- Il conteggio dei voti non pesa ancora nei "casi simili" né nell'assistente:
  una chiusura votata da cinque colleghi dovrebbe salire per prima.

---

## Terza parte (8/10) — i documenti dell'intervento (v5.30)

### Richiesta
"Sarebbe utile poter allegare anche dei file (PDF) o foto, anche dopo che
l'intervento è stato risolto, insieme magari alle note aggiuntive. Utili per
allegare il foglio di intervento finale o la fattura. Consigliami tu." E poi:
"più che altro fai in modo che sia disponibile anche sull'applicazione
desktop".

### Decisioni
1. **Sulla chiusura, non in chat né in `media`.** In chat un PDF si perde
   tra i messaggi; `media` il resto dell'app lo tratta come foto da mettere
   in griglia. `extra_data.closure_docs`, accanto alle note: nessuna
   migration, stessa rilettura prima di scrivere.
2. **Il tipo si sceglie prima del file**, perché decide dove va: il foglio
   d'intervento è memoria tecnica e finisce anche nella cartella "Ditta
   Esterna" della macchina (e nella biblioteca dell'assistente); la fattura
   è amministrazione e resta sul ticket.
3. **Nota e documento nello stesso foglio**, con la nota facoltativa: la
   fattura arriva spesso senza niente da aggiungere. Anche in chiusura, perché
   il foglio firmato dalla ditta si ha in mano in quel momento.
4. **Desktop alla pari del telefono**: l'admin allega dal pannello della
   segnalazione e dal modulo di chiusura, e la fattura arrivata per email si
   trascina sul riquadro.
5. **Fatture visibili a tecnici e admin.** Filtro d'interfaccia, detto
   chiaramente: il bucket `attachments` è pubblico per tutti gli allegati,
   contratti compresi.
6. **Si può togliere** (chi l'ha allegato o un admin): un PDF sbagliato è
   l'errore più facile. Il file resta nello storage, in cronologia resta
   che c'era.

### Cosa resta aperto
- **Chi vede le fatture**: deciso tecnici + admin senza chiederlo. Se devono
  essere solo dell'admin è una riga (`canSeeInvoices`); se devono essere
  davvero riservate serve un bucket privato con link firmati.
- **Costo dell'intervento**: con le fatture allegate viene naturale un
  campo importo in chiusura e il costo di manutenzione per macchina
  nell'archivio. Da decidere se serve davvero o se basta il CSV.
- Togliere un foglio dalla chiusura non lo toglie dalla cartella della
  macchina: lì lo elimina l'admin dalla scheda.

