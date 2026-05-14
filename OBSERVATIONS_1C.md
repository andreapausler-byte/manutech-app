# Osservazioni d'uso reale Sprint 1c (N→M intervention ↔ reports)

**Periodo di osservazione**: dal 2026-05-14 al _<data apertura 1c-bis — TBD>_

Branch deployato: `claude/intervention-reports-many-to-many-Vh3Mt` (merge PR #225 in `master`)
Migration applicata su Supabase: `055_intervention_reports.sql` v2 FIXED (3 link esistenti preservati come `is_origin=true`)

---

## Dati quantitativi da raccogliere

Aggiornare periodicamente con query SQL su Supabase:

### Conteggi base
```sql
-- Totale interventi esistenti
SELECT COUNT(*) FROM public.interventions;

-- Totale link in intervention_reports
SELECT COUNT(*) FROM public.intervention_reports;

-- Interventi con N report linkati (distribution)
SELECT cnt AS reports_per_intervention, COUNT(*) AS num_interventi
FROM (
  SELECT intervention_id, COUNT(*) AS cnt
  FROM public.intervention_reports
  GROUP BY intervention_id
) t
GROUP BY cnt
ORDER BY cnt;
```

### Casi PTS (più report sotto un intervento)
```sql
SELECT i.id, i.title, i.assigned_to_name, i.scheduled_start_at,
       COUNT(ir.report_id) AS reports_linked
FROM public.interventions i
JOIN public.intervention_reports ir ON ir.intervention_id = i.id
GROUP BY i.id, i.title, i.assigned_to_name, i.scheduled_start_at
HAVING COUNT(ir.report_id) > 1
ORDER BY reports_linked DESC, i.scheduled_start_at DESC;
```

### Distribuzione link risolutivi vs di contesto
```sql
SELECT
  resolves_report,
  COUNT(*) AS num_link
FROM public.intervention_reports
GROUP BY resolves_report;
```

### Auto-close triggerati
```sql
SELECT COUNT(*) AS auto_close_count,
       MIN(created_at) AS first_auto_close,
       MAX(created_at) AS last_auto_close
FROM public.activities
WHERE type = 'auto_closed_by_intervention';
```

### Shim deprecated_api_call (audit caller residui)
```sql
SELECT COUNT(*) AS deprecated_calls,
       MIN(created_at) AS first_call,
       MAX(created_at) AS last_call
FROM public.activities
WHERE type = 'deprecated_api_call';

-- Dettaglio caller (se count > 0)
SELECT created_at, user_name, detail
FROM public.activities
WHERE type = 'deprecated_api_call'
ORDER BY created_at DESC;
```

### Snapshot per data periodica (compilare manualmente)

| Data | Interventi tot | Link tot | Interventi N=1 | Interventi N>1 | Link contesto | Auto-close | Deprecated calls |
|------|----------------|----------|----------------|----------------|---------------|------------|------------------|
| 2026-05-14 (deploy) | 5 | 3 | 3 | 0 | 0 | 0 | 0 |
| | | | | | | | |
| | | | | | | | |

---

## Frizioni UX osservate

> Annotare ogni volta che un admin/operatore dice "è scomodo che..." o "mi aspettavo che..."

| Data | Chi | Contesto | Frizione | Note |
|------|-----|----------|----------|------|
| | | | | |
| | | | | |

### Aree note di possibile frizione (da verificare con uso reale)

- **Reschedule + link live**: il banner ambra dice "Le modifiche alle Segnalazioni associate vengono salvate immediatamente, anche se annulli la riprogrammazione". L'admin lo capisce al primo colpo? Aggiunge o rimuove link e si rende conto che è subito persistito?
- **Toggle resolves_report**: la checkbox "Risolve questa segnalazione al completamento" è chiara? L'utente capisce la differenza tra "risolutivo" e "contesto" senza spiegazioni?
- **"Già linkato a INT-XXXXXX"**: l'admin che vede il warning capisce che può comunque selezionare? Lo selezionano davvero o si fermano?
- **ReportMultiPicker filtro default "Solo questa macchina"**: utile o restrittivo? Quanto spesso lo disattivano?
- **Mini-card del report in LinkedReportsSection**: titolo + display_id + status + sev sono sufficienti, o servono più info (es. data apertura, ultimo commento)?
- **Apri segnalazione di origine**: manca il bottone "Apri →" sulle mini-card (Correction #5). Regressione UX rispetto a 1a — quanto pesa?

---

## Frizioni osservate giorno 1 (2026-05-14)

### #1 — Report appare "non gestito" anche con interventi pianificati

**Sintomo**: vado sul report, vedo "Aperta + Da assegnare", sembra non gestito, ma ha N interventi pianificati con assegnatario.

**Problema reale**: rappresentazione visiva inadeguata + coda admin "Da assegnare" non distingue tra report senza intervento vs report con intervento pianificato.

**NON è**: necessità di sync auto status report ← intervento. Rompe N→M (vedi conflitti PTS: in scenario "elettricista linka 5 report, di cui 2 routine bassa priorità", il sync auto farebbe perdere visibilità alla coda "Da assegnare" per i routine; al completion con `resolves_report=false` sui routine, restano assegnati a Krones senza intervento risolutivo = stato fantasma; caso opposto report già assegnato a Mario + intervento extra di contesto con Krones → conflitto sync). Correction #10 di Sprint 1a esiste per ragioni valide in N→M, non la rompiamo.

**Soluzione da progettare in 1c-bis**:
1. Banner planning_state prominente sul report sopra "Aperta + Da assegnare": "🔧 N interventi pianificati. Prossimo: <data> con <assegnatario>."
2. Segmentazione coda admin "Da assegnare" in due sezioni: "Senza intervento pianificato" (azione richiesta) vs "Con intervento pianificato" (gestito di fatto, sezione comprimibile/secondaria).
3. La view `reports_with_planning` aggrega già `planning_state` + `next_intervention_at`. Riutilizzare per banner + segmentazione.

### #2 — Interventi annullati creano rumore sul calendario

**Sintomo**: pillole annullate visibili nella griglia mese, confusione su stato reale.

**Risolto in hotfix**: nascosti di default + toggle "Mostra annullati" in toolbar (opzione B). Branch `hotfix/calendar-hide-cancelled-interventions`. Storico annullati resta accessibile via activity log del report e via toggle.

### #3 — Lista "Interventi pianificati" nel DetailPanel report tratta annullati come attivi

**Sintomo** (osservato nel DetailPanel del report con 1 annullato 11:30 + 1 pianificato 14:30):
1. Header "Interventi pianificati · 2" falsa: conta anche annullati
2. Ordinamento sbagliato: annullato 11:30 sopra al pianificato 14:30 (sort cronologico misto)
3. Visual weight identico tra card annullata e card attiva

**Filosofia distinta vs calendario** (frizione #2): qui il DetailPanel è strumento **investigativo**, non operativo. Storico annullato/completato è necessario per capire cos'è successo al ticket. Quindi NO nasconde, ma SUBORDINA.

**Risolto in hotfix**: branch `hotfix/intervention-list-historic-styling`. File: `InterventionsForReport.jsx` + `InterventionCard.jsx`.
1. Header: "**Interventi attivi · N**" con N = count interventi NOT IN ('annullato', 'completato'); badge secondario "(+M storici)" se M>0
2. Sort: split tra `active` (sort per `scheduled_start_at` ASC) e `historic` (sort per `updated_at` DESC, più recenti prima)
3. Card storiche: prop `dim` su `InterventionCard` → `opacity: 0.55` + `text-decoration: line-through` sul titolo + niente bordo rosso "in ritardo" + niente badge "⏰ In ritardo"
4. Separator "─ Storico ─" tra i due gruppi se entrambi presenti; assente se solo uno dei due

**Differenza chiave vs hotfix #2**:
- Calendario admin: annullati **nascosti** di default (strumento operativo)
- DetailPanel report: annullati **subordinati** sempre visibili (strumento investigativo)
Stessa filosofia ("annullati = info storica, non operativa") ma diversa implementazione perché diverso contesto.

---

## Bug minori incontrati

> Non bloccanti, ma da fixare in 1c-bis o 1d. Includere ID intervento/report se possibile.

| Data | Bug | Riproduzione | Severity | Branch fix |
|------|-----|--------------|----------|------------|
| | | | | |
| | | | | |

---

## Domande di design emerse per 1c-bis

> Da risolvere nel kick-off del branch 1c-bis. Lascia spazio anche per nuove idee che emergono dall'uso.

### Design preliminare scope 1c-bis (concordato 2026-05-14)

Pre-osservazione, il piano è:

1. **`interventions.completion_summary TEXT`** — riepilogo globale dell'intervento (mig 056).
2. **`intervention_reports.resolution_note TEXT`** — nota per-link opzionale (NULL → fallback su global summary).
3. **Trigger PG aggiornato**:
   - Per link `resolves_report=true`: `detail = COALESCE(ir.resolution_note, NEW.completion_summary, 'Chiuso automaticamente...')`
   - Per link `resolves_report=false`: nuova activity `intervention_completed_context` con `detail = 'Intervento associato (di contesto) completato. Questa segnalazione resta aperta.'`
4. **UI modal "Completa intervento"**:
   - Textarea global "Riepilogo intervento" (opzionale)
   - Per ogni report risolutivo: textarea opzionale "Nota specifica per questa segnalazione"
   - Media uploader (foto del lavoro fatto, certificati di conformità)
5. **Mobile visibility**: report chiuso da auto-close deve mostrare la nota nella timeline mobile (l'operatore deve sapere cosa è stato fatto).

### Domande aperte preliminari

- Completion summary obbligatorio o opzionale? **Default: opzionale** (più flessibile).
- Lunghezza max? **Default: 2000 caratteri** (come `notes` del modal).
- Markdown supportato? **Default: no** (testo semplice, coerente con `description` e `planning_notes`).
- Le foto vanno solo sull'intervento o anche replicate sui report associati? **Da decidere**.
- L'admin può completare un intervento senza riepilogo? **Sì, opzionale**.
- Notifica automatica all'operatore quando il suo report è chiuso da auto-close? **Probabile sì** (riapre il loop UX), ma decidere quando in 1c-bis.

### Nuove domande emerse durante osservazione

> _Da popolare con quello che osserviamo._

| Data | Domanda | Origine (frizione / utente) | Stato risposta |
|------|---------|-----------------------------|-----------------|
| | | | |
| | | | |

---

## Note operative

- **NON aprire branch 1c-bis** finché Andrea non dà segnale esplicito (~3-4 giorni di osservazione).
- Se servono hotfix puntuali (bug minori, fix UX) durante l'osservazione → nuovo branch `hotfix/...` partendo da `master`, NON modificare questo doc.
- Questo file vive su `master` ed è aggiornato periodicamente via commit diretto (è solo doc, non rompe niente).
- Quando 1c-bis parte: aggiornare "Periodo di osservazione" con la data di chiusura, poi linkare da `docs/handoff/<data>-sprint-1c-bis-decisions.md`.

---

## Riferimenti

- ADR-006: `docs/decisions/ADR-006-intervention-reports-many-to-many.md` — schema γ N→M
- ADR-007: `docs/decisions/ADR-007-org-id-schema-hardening.md` — TECH DEBT collegato (Sprint 1d)
- Corrections 1c: `docs/handoff/2026-05-14-sprint-1c-corrections.md` — 10 correzioni + minori
- CHANGELOG.md — sezione "Unreleased — Sprint 1c"
- Migration 055: `supabase/migrations/055_intervention_reports.sql` (v2 FIXED)
