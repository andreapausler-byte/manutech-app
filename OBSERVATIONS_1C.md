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
