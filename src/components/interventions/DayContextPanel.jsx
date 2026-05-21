import { useMemo } from 'react'
import { X, Plus, Link2, ArrowUpRight } from 'lucide-react'
import InterventionCard from './InterventionCard'

/**
 * DayContextPanel — modalità "Day" della sidebar destra del calendario admin.
 *
 * Si apre cliccando una cella del mese (vuota o piena). Mostra:
 *   - Header: data leggibile + N interventi
 *   - Lista InterventionCard cliccabili (→ modalità Detail)
 *   - Per ogni card: bottone "+ Abbina" (→ modalità Create con baseIntervention)
 *   - CTA primaria in fondo: "+ Nuovo intervento per [data]" (→ modalità Create)
 *   - Empty state inline quando N=0 (no icona triste, solo CTA grande)
 *
 * Props
 *   date                  Date selezionata
 *   monthInterventions    array interventi del mese (filtra in memory)
 *   onClose()             chiudi pannello (→ sidebar 'pending' / 'hidden')
 *   onSelectIntervention(id)  passa a modalità Detail
 *   onCreateForDay(date)  passa a modalità Create con prefillDate
 *   onMatchIntervention(intervention)  passa a modalità Create con baseIntervention
 *   onOpenReport(reportId)  apre il report linkato (scorciatoia, solo se N=1
 *                           link risolutivo). Mantiene la simmetria col flow
 *                           card-report (Frizione #4 opt-A).
 */
export default function DayContextPanel({
  date,
  monthInterventions = [],
  onClose,
  onSelectIntervention,
  onCreateForDay,
  onMatchIntervention,
  onOpenReport,
}) {
  // Filtra interventi che coprono il giorno selezionato. Per gli interventi
  // multi-day questo include anche i giorni intermedi/finali dello span,
  // non solo quello di inizio.
  const dayInterventions = useMemo(() => {
    if (!date) return []
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime()
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime()
    return monthInterventions
      .filter(intv => {
        if (!intv.scheduled_start_at) return false
        const startT = new Date(intv.scheduled_start_at).getTime()
        if (startT > dayEnd) return false
        if (intv.scheduled_end_at) {
          return new Date(intv.scheduled_end_at).getTime() >= dayStart
        }
        return startT >= dayStart
      })
      .sort((a, b) => new Date(a.scheduled_start_at) - new Date(b.scheduled_start_at))
  }, [date, monthInterventions])

  const dateLabel = useMemo(() => {
    if (!date) return ''
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = date.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }, [date])

  const dateLabelLong = useMemo(() => {
    if (!date) return ''
    return date.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }, [date])

  const count = dayInterventions.length
  const isEmpty = count === 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-surface-1)',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
            textTransform: 'uppercase', color: 'var(--color-text-secondary)',
            margin: 0,
          }}>Giorno</p>
          <p style={{
            fontSize: 14, fontWeight: 600, color: 'var(--color-text)',
            margin: '2px 0 0', textTransform: 'capitalize',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {dateLabelLong}
          </p>
          <p style={{
            fontSize: 11, color: 'var(--color-text-secondary)',
            margin: '2px 0 0',
          }}>
            {count === 0
              ? 'Nessun intervento pianificato'
              : `${count} intervent${count === 1 ? 'o' : 'i'} pianificat${count === 1 ? 'o' : 'i'}`}
          </p>
        </div>
        <button onClick={onClose} aria-label="Chiudi pannello giorno" className="press-scale"
          style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
        {isEmpty ? (
          <p style={{
            fontSize: 13, color: 'var(--color-text-secondary)',
            margin: '0 0 12px', padding: '12px 4px',
            lineHeight: 1.5,
          }}>
            Nessun intervento pianificato per questo giorno.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dayInterventions.map(intv => (
              <DayInterventionRow
                key={intv.id}
                intervention={intv}
                onOpen={() => onSelectIntervention?.(intv.id)}
                onMatch={() => onMatchIntervention?.(intv)}
                onOpenReport={onOpenReport}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer con CTA Nuovo */}
      <div style={{
        flexShrink: 0,
        padding: '12px 14px',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}>
        <button
          onClick={() => onCreateForDay?.(date)}
          className="press-scale"
          style={{
            width: '100%', padding: 12, borderRadius: 12,
            background: 'var(--color-primary)',
            border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Plus size={15} /> Nuovo intervento per {dateLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * Riga giornaliera: card cliccabile (apre detail) + bottone "Abbina" laterale.
 * Wrapper sopra InterventionCard perché la card di default fa solo onClick;
 * qui serve un secondo bottone "match" non incluso nella card.
 *
 * Frizione #4 opt-A: se l'intervento ha esattamente 1 report linkato
 * risolutivo, aggiungiamo un terzo bottone "Apri report" come scorciatoia.
 * Per N=0 (intervento creato senza abbinamento) o N>1 (più report risolutivi)
 * il bottone non appare: il flow detail rimane l'unico modo per scegliere
 * quale report aprire.
 */
function DayInterventionRow({ intervention, onOpen, onMatch, onOpenReport }) {
  const linked = Array.isArray(intervention.linked_reports) ? intervention.linked_reports : []
  const resolvingLinks = linked.filter(l => l.resolves_report !== false)
  const singleResolvingReportId =
    resolvingLinks.length === 1 ? resolvingLinks[0].report_id : null
  const showOpenReport = Boolean(singleResolvingReportId && onOpenReport)

  return (
    <div style={{ position: 'relative' }}>
      <InterventionCard
        intervention={intervention}
        compact
        onClick={onOpen}
      />
      {/* Cluster bottoni laterali: posizionati in alto a destra sopra la
          card, affiancati orizzontalmente per non sovrapporsi al rigo
          assegnatario sul badge row sotto. */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {showOpenReport && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenReport(singleResolvingReportId) }}
            className="press-scale"
            title="Apri la segnalazione collegata a questo intervento"
            aria-label="Apri segnalazione collegata"
            style={{
              padding: '4px 8px', borderRadius: 8,
              background: 'rgba(16,185,129,0.14)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#10b981',
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
            <ArrowUpRight size={10} /> Apri report
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onMatch?.() }}
          className="press-scale"
          title="Abbina un nuovo intervento con stessi assegnatari/orario"
          aria-label="Abbina nuovo intervento"
          style={{
            padding: '4px 8px', borderRadius: 8,
            background: 'rgba(124,106,255,0.14)',
            border: '1px solid rgba(124,106,255,0.35)',
            color: '#7c6aff',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
          <Link2 size={10} /> Abbina
        </button>
      </div>
    </div>
  )
}
