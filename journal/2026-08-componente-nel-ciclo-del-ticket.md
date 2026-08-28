# 2026-08 — Il componente nel ciclo di vita del ticket (v5.21)

## Richiesta (dal founder, 28/8)
"I macchinari sono complessi e spesso si distinguono in sotto-macchinari. Ad
esempio l'imbottigliatrice è formata dalla sciacquatrice, dalla riempitrice
propriamente detta e dal tappatore. Una rottura di norma coinvolge uno di
questi componenti, quindi la segnalazione dovrebbe sottolineare anche il
componente interessato, se c'è, oppure rimanere generale. Il componente poi ha
suoi documenti, foto, interventi nel tempo e manutenzioni: dovrebbe poter
essere gestito come un macchinario vero, sfruttando il fatto che fa parte di
un macchinario."

## Cosa c'era già (e la sorpresa)
Lo studio del 26/8 (`docs/proposals/2026-08-26-segnalazioni-per-componente.md`)
aveva già verificato il codice: **`reports.component_id` esiste dalla migration
021**, e `NewReport` — che è anche il flusso mobile — lo compila già con un
select "Componente specifico".

Il problema non era raccogliere il dato: era che **non lo leggeva nessuno**.
Nessuna vista del ticket mostrava il pezzo, la chiusura non lo chiedeva, e
nessuno dei cinque punti che creano un `maintenance_log` lo ereditava. Dato
write-only: raccolto in un canale su quattro, invisibile ovunque servisse.
Finché il campo è invisibile, chi compila non ha motivo di compilarlo.

## Decisioni prese (28/8)
1. **Scope**: passi 1-3 dello studio (A visibilità + B attribuzione + C
   ereditarietà) più §5 (piani di manutenzione per componente). La gerarchia
   impianti (`machines.parent_id`) resta **dopo**, da decidere sui dati che
   questi passi producono, non prima.
2. **Chi crea un componente**: resta **admin-only**. Il tecnico attribuisce il
   guasto a un pezzo esistente ma non ne registra di nuovi dal campo. Chiude
   la open question 3 dell'ADR-012. Conseguenza da tenere d'occhio: se in
   chiusura il pezzo giusto manca in anagrafica, il tecnico lascia "generico"
   — è il modo in cui questa feature può tornare a raccogliere poco.

## Il principio di design che regge tutto
**Chi apre la segnalazione quasi mai sa qual è il pezzo rotto.** L'operatore
vede un sintomo — perde acqua, fa rumore, non parte. Il componente è una
*diagnosi*, e la diagnosi la fa il tecnico, a volte dopo aver smontato.

Da qui: in apertura il campo è opzionale e non blocca mai (default "Generico —
intera macchina", tre tap con i guanti restano tre tap); matura durante il
ciclo di vita del ticket; e **il pezzo dichiarato in chiusura è quello che
conta** — quello scelto in apertura è un'ipotesi, utile per assegnare, non per
il MTBF. Ogni cambio finisce in cronologia (`component_change`), così l'ipotesi
dell'operatore non sparisce in silenzio.

## Cosa è stato fatto
- **`ComponentPill`** (nuovo, `components/machines/`): una sola pastiglia ciano
  con l'icona Package per tutta l'app, tre taglie. Stesso colore del tab
  Componenti, così l'occhio la lega alla scheda del pezzo senza leggerla.
- **A — il pezzo si vede**: `ReportDetail` (card "Pezzo interessato"),
  `ReportsList`, `AdminReports`, `ReportDetailModal`, tab Segnalazioni della
  scheda macchina (admin e mobile), storico interventi, righe dei piani.
- **B — il pezzo si attribuisce**: bottom sheet dal dettaglio mobile
  (tecnico/admin), select inline nel modal admin, campo "Pezzo interessato"
  nei due form di chiusura. Sempre con "Generico" a portata di pollice.
- **C — il pezzo si eredita**: `handleResolveAndLog` passa il `component_id`
  del ticket al `maintenance_log`; le conferme di manutenzione programmata
  (mobile machine detail, dashboard mobile, AdminMaintenance, AdminMachines)
  lo ereditano dal piano. Nessun data entry in più: lo storico del pezzo si
  popola da solo.
- **§5 — migration 063**: `maintenance_plans.component_id` opzionale, con la
  RPC `create_maintenance_plan` che verifica che il pezzo sia di *quella*
  macchina. Il piano resta della macchina: scadenze, semaforo e agenda non
  cambiano di una riga.

## Cosa ho imparato
Il difetto non era di modello dati — il modello c'era da tre anni. Era che il
dato non aveva un posto dove **essere letto**, e un campo che nessuno rilegge
smette di essere compilato nel giro di poche settimane. La regola che ne esce:
prima di aggiungere un campo, guarda dove comparirà; se la risposta è "da
nessuna parte", il campo non serve ancora.

Corollario per la gerarchia impianti: non c'è ancora un solo numero che dica
quali pezzi meritano di diventare sotto-macchine. Fra tre mesi di uso ci sarà,
ed è per questo che §4 dello studio resta in coda.

## Cosa resta aperto
1. **Il vocale non parla con l'anagrafica**: `extract-ticket-fields` estrae
   `componente` come testo libero in `extra_data`, senza match con
   `machine_components` (§D dello studio).
2. **`QuickReport` non chiede il pezzo**, e va bene così: il quick è tre tap
   con i guanti, e chi lo usa è chi meno sa quale sia il pezzo. Lo mette il
   tecnico dopo.
3. **`spare_parts.component_id`** esiste dalla 022 ed è ancora inutilizzato.
4. **Gerarchia impianti e promozione a sotto-macchina** (§4 dello studio) —
   da decidere sui dati, con la RPC `promote_component_to_machine` come forma
   giusta per non perdere lo storico.
5. **Impianti di servizio condivisi** (centrale frigo, aria compressa, vapore):
   non sono componenti e non sono figli, sono una dipendenza molti-a-molti.
   Domanda ancora senza risposta: in stabilimento ce ne sono?
