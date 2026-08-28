# Proposta tecnica · Segnalazioni per componente, e la strada verso la gerarchia impianti

**Data**: 2026-08-26 · **Aggiornato**: 2026-08-28
**Branch**: `claude/machine-components-documents-wwle6b` → attuato su `claude/machinery-components-management-1h7kin`
**Stato**: **Passi 1-3 attuati in v5.21** (A + B + C + §5). Restano D, E e §4.
**Tipo**: docs-only alla stesura; l'attuazione porta la migration 063
**Prerequisito rilasciato**: v5.19 / ADR-012 (componenti con documentazione propria)

> **Stato di attuazione (28/8, v5.21)**
> - **A — mostrare il pezzo**: fatto. `ComponentPill` in `ReportDetail`,
>   `ReportsList`, `AdminReports`, `ReportDetailModal`, tab Segnalazioni
>   (admin e mobile), storico interventi e righe dei piani.
> - **B — attribuire e correggere dal ticket**: fatto. Bottom sheet nel
>   dettaglio mobile, select inline nel modal admin, campo componente nei due
>   form di chiusura, evento `component_change` in `ActivityTimeline`.
>   *Decisione 28/8*: il tecnico **non** crea componenti al volo — la
>   creazione resta admin-only (chiude la open question 1 di §7 con «no»).
> - **C — ereditarietà nei log**: fatto, su tutti e cinque i call-site.
> - **§5 — piani per componente**: fatto (migration 063).
> - **D — vocale collegato all'anagrafica**: non fatto.
> - **E — statistiche e filtri sul pezzo**: non fatto.
> - **§4 — gerarchia impianti**: non fatto, per scelta: si decide sui dati che
>   A-C cominciano a produrre adesso.

---

## 0. La domanda a cui risponde

Dal founder, 26/8: *"le segnalazioni potrebbero derivare dal solo componente di una macchina… quando apro una segnalazione dovrei poter coinvolgere solo il macchinario, ma se la segnalazione è di un determinato componente dovrei poterlo evidenziare"*. E, nella stessa conversazione, l'intenzione più ampia: i componenti **sono macchinari a loro volta**, con manutenzioni proprie (opzione «b» del confronto precedente).

Questo documento tratta le due cose insieme perché la prima produce i dati con cui si decide la seconda.

---

## 1. Stato di fatto, verificato nel codice

La sorpresa: **il campo esiste dal 2021 (migration 021) e in un punto si compila già.** Quello che manca non è raccoglierlo — è mostrarlo.

### 1.1 Chi scrive `reports.component_id`

| Canale di creazione | Componente? | Come |
|---|---|---|
| **`NewReport`** (segnalazione completa — mobile e admin) | **Sì** | Select *"Componente specifico"*, default *"Generico (intera macchina)"*, visibile solo se la macchina ha componenti. Scrive `component_id` **e** `component_name` |
| **`QuickReport`** (segnalazione rapida a template) | No | — |
| **`VoiceNewTicketFlow`** (tecnico, vocale) | Sì, ma scollegato | l'AI estrae `componente` come **testo libero** e lo deposita in `extra_data.componente`: nessun legame con `machine_components` |
| **Guest chat** (`guest-chat`) | No | — |

### 1.2 Chi lo legge

Nessuno, tranne una schermata sola.

- `ReportDetail` — non lo mostra
- `ReportsList` — non lo mostra
- `AdminReports` — non lo mostra, non ci filtra
- `MachineReportsTab` (mobile) — non lo mostra
- tab **Segnalazioni** della scheda macchina admin — non lo mostra, non ci filtra
- **`MachineComponentsTab`** (v5.19, ieri) — **unico punto dell'app che legge `reports.component_id`**

### 1.3 Dove si perde

Il ciclo di vita del ticket non porta avanti il pezzo:

- la **chiusura** (`closure_root_cause`, `closure_action`, `closure_parts`) non ha un campo componente: il tecnico dichiara *cosa* ha fatto ma non *su cosa*;
- tutti e cinque i punti che creano un `maintenance_log` (`MobileMachineDetail` ×2, `AdminMachines`, `AdminMaintenance`, `MobileDashboard`) lo creano **senza `component_id`**, anche quando nascono da una segnalazione che ce l'ha;
- `maintenance_logs.component_id` esiste dalla migration 024 e `LogFormModal` ha già il menu per compilarlo **a mano**.

**Conclusione**: il dato è *write-only*. Si raccoglie in un canale su quattro e non compare in nessuna vista dove serve. È il difetto da chiudere per primo — non perché sia il più ambizioso, ma perché è quello che genera le informazioni su cui si fonda ogni decisione successiva sulla gerarchia.

> **Correzione all'ADR-012**: la open question n. 2 diceva *"non c'è modo di scegliere il pezzo mentre si crea la segnalazione dal mobile"*. È sbagliata: `NewReport` è usato anche dal mobile (`MobileLayout`, `MobileMachineDetail`) e il selettore c'è. Il problema vero è a valle, non a monte.

---

## 2. Il principio di design

**Chi apre la segnalazione quasi mai sa qual è il pezzo rotto.**

L'operatore vede un sintomo: perde acqua, fa rumore, non parte. Il componente è una **diagnosi**, e la diagnosi la fa il tecnico — a volte dopo aver smontato. Un campo componente trattato come input di creazione raccoglie o vuoto, o sbagliato: il primo caso non serve, il secondo è peggio del primo perché sporca i conteggi guasti per pezzo.

Da qui tre regole vincolanti per tutto ciò che segue:

1. **In apertura è opzionale e non blocca mai.** Il default resta *"Generico (intera macchina)"*, e una segnalazione deve poter nascere in tre tap senza toccarlo.
2. **Il campo matura nel ciclo di vita del ticket.** Deve essere impostabile e correggibile in diagnosi e in chiusura, da tecnico e admin. È lì che diventa affidabile.
3. **Il pezzo dichiarato in chiusura è quello che conta per le statistiche.** Quello scelto in apertura è un'ipotesi dell'operatore, utile per l'assegnazione, non per il MTBF.

È lo stesso pattern già adottato per i documenti in v5.19: *Archivia esistente* esiste perché l'etichetta giusta arriva spesso dopo il file. Qui l'etichetta giusta arriva dopo il guasto.

---

## 3. Cosa costruire, in ordine

### A. Rendere visibile ciò che già si raccoglie *(piccolo)*

Pastiglia col nome del pezzo ovunque il ticket compaia: `ReportDetail`, `ReportsList`, `AdminReports`, `MachineReportsTab`, tab Segnalazioni della scheda macchina. Stesso ciano dei componenti, così l'occhio lo lega alla scheda del pezzo.

Da solo questo passo non aggiunge un dato — ma è ciò che convince chi compila che compilare serve. Finché il campo è invisibile, resterà vuoto.

### B. Assegnare e correggere il pezzo dal ticket *(piccolo)*

- Menu componente in `ReportDetail` per tecnico e admin, con "nessun componente" sempre disponibile.
- Campo componente nel **flusso di chiusura**, accanto a causa, azione e ricambi. È il punto naturale: chi chiude ha appena avuto il pezzo in mano.
- Ogni cambio finisce nella `ActivityTimeline` come gli altri cambi di stato: *"Marco ha attribuito il guasto a Pompa dosatrice CIP"*. Serve a due cose — capire quando la diagnosi è cambiata, e non far sparire in silenzio l'ipotesi dell'operatore.

**Da decidere**: il tecnico che chiude può **creare** il componente al volo se manca in anagrafica? Propendo per sì (senza il pezzo giusto in lista, il campo viene lasciato vuoto e torniamo al punto di partenza), con la creazione limitata a nome + tipo e il resto della scheda compilabile dopo dall'ufficio.

> **Deciso il 28/8: no.** La creazione di componenti resta admin-only (policy
> della 021 invariata). Il tecnico attribuisce fra i pezzi già in anagrafica;
> se il pezzo giusto manca, lascia "Generico" e lo segnala all'ufficio. È il
> rischio noto di questa scelta e va guardato: se dopo qualche mese i ticket
> "generici" su macchine con componenti restano la maggioranza, la causa da
> verificare per prima è proprio l'anagrafica incompleta, non la UI.

### C. Ereditarietà nel registro interventi *(piccolo, alto rendimento)*

Quando una segnalazione risolta genera un `maintenance_log`, il log eredita `component_id` dal ticket. Quando un piano con componente (vedi §5) viene confermato, idem.

È due righe per call-site, ma è il passo che fa **popolare lo storico per pezzo senza data entry**. Senza questo, la scheda del componente resta una pagina di documenti; con questo, in tre mesi diventa la storia di quel pezzo.

### D. Il vocale che parla con l'anagrafica *(medio)*

Oggi `extract-ticket-fields` restituisce `componente` come stringa e finisce in `extra_data`. Proposta: dopo l'estrazione, tentare il match con i `machine_components` della macchina scelta (nome e tipo, tolleranza sulle abbreviazioni) e **proporlo** al tecnico nella schermata di revisione, che è già lì e già mostra il campo. Se il match non c'è, il testo libero resta in `extra_data` come oggi — nessuna perdita.

Mai assegnare in automatico senza conferma: un componente sbagliato messo dall'AI è esattamente il dato che rovina i conteggi.

### E. Leggere i dati dal lato pezzo *(medio)*

Sulla scheda componente: guasti aperti, ultimo guasto, MTBF del pezzo, ricambi collegati (`spare_parts.component_id` esiste dalla migration 022 ed è oggi inutilizzato). Nel tab Segnalazioni della macchina: filtro per componente.

Qui il componente comincia a **comportarsi** come un macchinario pur restando un componente — e per la maggior parte dei pezzi questo è il punto d'arrivo, non una tappa.

### F. Quello che propongo di NON fare: il componente in `QuickReport`

Il quick è "tre tap con i guanti". Aggiungere una scelta lo snatura, e chi lo usa è proprio chi meno sa quale sia il pezzo. Il componente su un quick lo mette il tecnico dopo, con B.

---

## 4. Come questo si lega alla gerarchia impianti (opzione «b»)

### 4.1 Il criterio di promozione lo danno i dati, non l'intuito

Dopo A-E, ogni componente ha un profilo misurabile: quante segnalazioni **proprie**, quante manutenzioni **proprie**, quanti ricambi **propri**. La regola diventa verificabile invece che opinabile:

> **Promuovi a sotto-macchina solo il pezzo che ha bisogno di essere segnalato, assegnato e misurato per conto suo** — e i numeri dicono se è così.

Un pezzo che in sei mesi ha zero segnalazioni proprie non è un macchinario, per quanto costoso sia.

### 4.2 La regola che rende la gerarchia sostenibile: un solo concetto visibile

Il rischio grosso di `machines.parent_id` non è tecnico, è di comprensione: se esistono sia i "componenti" sia le "sotto-macchine", **l'utente deve scegliere ogni volta in quale delle due liste cercare** — e sbaglierà.

Proposta: **disaccoppiare il modello dati dalla scelta dell'utente.** Un unico selettore "punto d'impianto" che presenta un albero:

```
Tino Filtro (Lauter Tun)
├── Pompa dosatrice CIP          ← riga in machine_components
├── Motoriduttore agitatore      ← riga in machine_components
└── Centrale frigo               ← riga in machines, parent_id = tino filtro
```

Chi segnala non sa né deve sapere quale delle due tabelle sta dietro una voce. La promozione diventa così un fatto tecnico reversibile, non un cambio di esperienza per il reparto. È anche ciò che rende la promozione applicabile *dopo* aver raccolto i dati, invece di dover indovinare prima.

### 4.3 La migrazione dei dati va progettata adesso, non dopo

Promuovendo un componente:

- `reports.component_id` → `machine_id` del figlio (e `component_id` a NULL);
- `maintenance_logs` e `maintenance_plans`, stessa trasformazione;
- gli **allegati** cambiano solo etichetta: `component_id` sparisce dal JSONB e il file si sposta sotto la macchina figlia. Questo è indolore **proprio perché** in v5.19 i file sono rimasti sulla macchina con un'etichetta invece di finire in un archivio separato (ADR-012, §Decision 1). Gli URL non si muovono, la galleria non se ne accorge.

Una RPC `promote_component_to_machine(_component_id)` che fa tutto in transazione, più il suo inverso, è la forma giusta. Se invece si promuove "a mano" ricreando le righe, si perde lo storico — che era l'unico motivo per promuovere.

### 4.4 Le quattro regole già fissate, che restano

1. La lista impianti mostra i figli **annidati** sotto la madre, mai come righe pari — altrimenti torna il problema da cui è nata la v5.19.
2. I KPI contano **una volta sola**: il guasto è del figlio, la madre lo vede in rollup.
3. La segnalazione punta al figlio; la madre la mostra come "sulle sue parti".
4. La galleria e la biblioteca AI della madre includono i figli — spezzarle significa spezzare la memoria dell'impianto.

### 4.5 Il caso che probabilmente non è né l'uno né l'altro

Una centrale frigo o un compressore che serve **più** macchinari non è un componente e non è un figlio: è un impianto in relazione di **dipendenza**, non di contenimento. Un `parent_id` lo modella male (un padre solo) e la conseguenza pratica è sbagliata: fermando la centrale si fermano cinque linee, cosa che una gerarchia ad albero non sa dire. Se in stabilimento ce ne sono, meritano un ragionamento separato — probabilmente una tabella di dipendenze molti-a-molti — e non vanno usati come argomento per disegnare la gerarchia.

---

## 5. Il pezzo mancante sul fronte manutenzione

Indipendente da tutto quanto sopra, e già discusso: `maintenance_plans.component_id` opzionale. Il piano resta della macchina (scadenze, semaforo e agenda invariati) ma può nominare il pezzo, e il log confermato lo eredita (§C). È il gemello di questo studio sul lato preventivo, e vale la stessa regola: nessun cambiamento al calcolo delle scadenze.

---

## 6. Ordine consigliato

| # | Cosa | Taglia | Perché adesso |
|---|---|---|---|
| 1 | **A + B** — mostrare il pezzo e poterlo attribuire dal ticket | piccola | sblocca un dato già raccolto e oggi invisibile |
| 2 | **C** — ereditarietà nei log | piccola | fa popolare lo storico per pezzo da solo |
| 3 | **§5** — piani con componente | piccola | chiude il lato preventivo |
| 4 | **E** — statistiche e filtri sul pezzo | media | il componente inizia a comportarsi da macchinario |
| 5 | **D** — vocale collegato all'anagrafica | media | qualità del dato, non nuova funzione |
| 6 | **§4** — gerarchia e promozione | grande | **da decidere sui dati prodotti da 1-4**, non prima |

I passi 1-3 valgono circa una sessione di lavoro ciascuno e non toccano nulla di delicato: nessun KPI, nessuna scadenza, nessuna lista impianti.

---

## 7. Domande su cui decidere

1. ~~**Il tecnico può creare un componente al volo** mentre chiude un ticket?~~ **Deciso 28/8: no**, resta admin-only.
2. **Un guasto può riguardare più componenti?** Oggi il modello è 1:1. (io: tenerlo 1 — il secondo pezzo si nomina in descrizione. Molti-a-molti qui costa una tabella e complica ogni conteggio, per un caso raro)
3. **Chi promuove un componente a sotto-macchina?** Solo admin, immagino — ma è una decisione che cambia lo storico, quindi vale la pena renderla reversibile prima che frequente.
4. **Esistono in stabilimento impianti "di servizio" condivisi** (frigo, aria compressa, vapore)? Se sì, §4.5 va affrontato prima della gerarchia, non dopo.
