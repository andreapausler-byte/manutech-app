import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Link2, AlertTriangle } from 'lucide-react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY } from '../../lib/constants'
import ReportMultiPicker from './ReportMultiPicker'

/**
 * LinkedReportsSection — sezione "Segnalazioni coperte" del form intervento.
 *
 * Usata da InterventionForm (create + edit) e da InterventionDetailPanel
 * (gestione link post-creazione, nel Sprint 1c parte 2).
 *
 * Mostra:
 *   - Lista mini-card dei link correnti (uno per riga):
 *     * badge "ORIGINE" se is_origin
 *     * checkbox "Risolve" (modificabile)
 *     * bottone X (rimuove se !is_origin && !readOnly)
 *   - Bottone "+ Aggiungi segnalazione" (toggle picker inline)
 *   - ReportMultiPicker con excludeReportIds dei link correnti
 *
 * Props
 *   value          [{report_id, is_origin?, resolves_report?}]
 *   onChange(arr)  callback con la nuova lista
 *   currentMachineId       per il picker (filtro default)
 *   currentInterventionId  per il warning "already linked" del picker
 *   readOnly       se true, niente picker, niente X. Solo lista + checkbox
 *                  resolves_report editabile.
 */
export default function LinkedReportsSection({
  value = [],
  onChange,
  currentMachineId = null,
  currentInterventionId = null,
  readOnly = false,
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [reportsCache, setReportsCache] = useState({}) // reportId → report object

  // Carica i metadata dei report referenziati dai link, per le mini-card.
  // Solo quelli che non abbiamo già in cache.
  useEffect(() => {
    let alive = true
    const ids = value.map(l => l.report_id).filter(id => id && !reportsCache[id])
    if (ids.length === 0) return undefined
    db.getReports().then(allReports => {
      if (!alive) return
      const next = { ...reportsCache }
      for (const id of ids) {
        const r = (allReports || []).find(x => x.id === id)
        if (r) next[id] = r
      }
      setReportsCache(next)
    }).catch(e => console.warn('[LinkedReportsSection] cache load:', e?.message))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleAddReports = (newIds, { addedReportId }) => {
    if (!addedReportId) {
      // Caso "deselezione dal picker": il report era nel picker, ora rimosso
      // → lo togliamo anche dai link
      const removedReportId = value.find(l => !newIds.includes(l.report_id))?.report_id
      if (removedReportId) {
        onChange?.(value.filter(l => l.report_id !== removedReportId))
      }
      return
    }
    // Aggiungi il nuovo link (default: non-origin, resolves=true)
    if (value.some(l => l.report_id === addedReportId)) return
    onChange?.([...value, { report_id: addedReportId, is_origin: false, resolves_report: true }])
  }

  const handleRemove = (reportId) => {
    onChange?.(value.filter(l => l.report_id !== reportId))
  }

  const handleToggleResolves = (reportId, newValue) => {
    onChange?.(value.map(l => l.report_id === reportId ? { ...l, resolves_report: newValue } : l))
  }

  const pickerSelectedIds = useMemo(() => value.map(l => l.report_id), [value])
  const pickerExcludeIds = useMemo(() => value.map(l => l.report_id), [value])

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
          Segnalazioni coperte
          {value.length > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>
              · {value.length}
            </span>
          )}
        </label>
        {!readOnly && (
          <button
            onClick={() => setShowPicker(s => !s)}
            className="press-scale"
            style={{
              padding: '5px 10px', minHeight: 28, borderRadius: 999,
              background: showPicker ? 'var(--color-primary)' : 'transparent',
              border: `1px solid ${showPicker ? 'var(--color-primary)' : 'var(--color-border)'}`,
              color: showPicker ? '#fff' : 'var(--color-text-secondary)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            {showPicker ? <X size={11} /> : <Plus size={11} />}
            {showPicker ? 'Chiudi' : 'Aggiungi segnalazione'}
          </button>
        )}
      </div>

      {/* Lista link correnti */}
      {value.length === 0 ? (
        <p style={{
          fontSize: 12, color: 'var(--color-text-secondary)',
          margin: '0 0 8px', fontStyle: 'italic',
          padding: '8px 4px',
        }}>
          Nessuna segnalazione collegata. {readOnly ? '' : 'Aggiungine una qui sopra per legare l\'intervento ai ticket che risolverà.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.map(link => (
            <LinkCard
              key={link.report_id}
              link={link}
              report={reportsCache[link.report_id]}
              readOnly={readOnly}
              onRemove={() => handleRemove(link.report_id)}
              onToggleResolves={(v) => handleToggleResolves(link.report_id, v)}
            />
          ))}
        </div>
      )}

      {/* Picker inline (toggle) */}
      {showPicker && !readOnly && (
        <div style={{ marginTop: 10 }}>
          <ReportMultiPicker
            value={pickerSelectedIds}
            onChange={handleAddReports}
            currentMachineId={currentMachineId}
            currentInterventionId={currentInterventionId}
            excludeReportIds={pickerExcludeIds}
          />
          <p style={{
            fontSize: 11, color: 'var(--color-text-secondary)',
            margin: '6px 2px 0', fontStyle: 'italic',
          }}>
            ↳ Le segnalazioni selezionate vengono linkate al submit del form. Per default, l'auto-close è attivo (la chiusura dell'intervento risolve i report).
          </p>
        </div>
      )}
    </div>
  )
}

function LinkCard({ link, report, readOnly, onRemove, onToggleResolves }) {
  const status = report?.status ? (STATUS[report.status] || STATUS.aperta) : null
  const sev = report?.severity ? (SEVERITY[report.severity] || SEVERITY.media) : null
  const idLabel = report?.display_id || `#${String(link.report_id).slice(0, 6)}`
  const isLoading = !report

  return (
    <div style={{
      padding: '10px 12px',
      background: link.is_origin ? 'rgba(245,158,11,0.06)' : 'var(--color-surface-2)',
      border: `1px solid ${link.is_origin ? 'rgba(245,158,11,0.30)' : 'var(--color-border)'}`,
      borderRadius: 10,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <Link2 size={14} style={{
        color: link.is_origin ? '#f59e0b' : 'var(--color-text-secondary)',
        flexShrink: 0, marginTop: 2,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
            padding: '1px 5px', borderRadius: 4,
            background: 'var(--color-primary-glow, rgba(124,106,255,0.14))',
            color: 'var(--color-primary)',
            fontFamily: '"JetBrains Mono", monospace',
          }}>{idLabel}</span>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 200,
          }}>
            {isLoading ? 'Caricamento…' : report.title}
          </span>
          {link.is_origin && (
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
              padding: '1px 5px', borderRadius: 4,
              background: 'rgba(245,158,11,0.18)', color: '#f59e0b',
              textTransform: 'uppercase',
            }}>origine</span>
          )}
        </div>
        {report && (status || sev) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
            {status && <Pill bg={status.bg} color={status.color}>{status.label}</Pill>}
            {sev && <Pill bg={sev.bg} color={sev.color}>{sev.label}</Pill>}
          </div>
        )}
        {/* Checkbox resolves_report */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          marginTop: 6, cursor: 'pointer',
          fontSize: 11, color: 'var(--color-text)',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={!!link.resolves_report}
            onChange={e => onToggleResolves(e.target.checked)}
            style={{ cursor: 'pointer', width: 14, height: 14 }}
          />
          <span style={{ fontWeight: 600 }}>Risolve questa segnalazione al completamento</span>
          {!link.resolves_report && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
              padding: '1px 4px', borderRadius: 4,
              background: 'rgba(156,163,175,0.18)', color: '#9ca3af',
              textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <AlertTriangle size={9} /> contesto
            </span>
          )}
        </label>
      </div>
      {/* Bottone rimuovi (solo per link non-origin e non readOnly) */}
      {!readOnly && !link.is_origin && (
        <button
          onClick={onRemove}
          aria-label="Rimuovi segnalazione"
          className="press-scale"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer', padding: 4, flexShrink: 0,
          }}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 5px', borderRadius: 999,
      background: bg, color,
      fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}
