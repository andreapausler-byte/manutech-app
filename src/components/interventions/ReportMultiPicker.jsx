import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Filter, Wrench, AlertTriangle, Link2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES } from '../../lib/constants'

/**
 * ReportMultiPicker — picker multi-segnalazioni per intervento (Sprint 1c).
 *
 * Mostra una lista di report selezionabili (checkbox), con search debounced,
 * filtri per type, toggle "solo macchina corrente" / "tutte le aperte".
 * Per i report già linkati ad altri interventi attivi, mostra warning
 * giallo "⚠ già linkato a INT-XXX" (l'admin decide se collegare comunque).
 *
 * Tap target ≥44px (regola guanti). Skeleton loading. Search debounced 300ms.
 * Feedback aptico (vibrate 10ms) su selezione mobile.
 *
 * Props
 *   value                 array di report_id selezionati
 *   onChange(reportIds, opts)  callback con la nuova lista + flags
 *                              opts = { addedReportId, removedReportId }
 *   currentMachineId      string|null — filtro default "solo questa macchina"
 *   currentInterventionId string|null — esclude i link su QUESTO intervento
 *                                       dal warning "already linked"
 *   excludeReportIds      array — report da non mostrare proprio
 *                                 (es. report già aggiunti dal form)
 *   maxResults            int — limite riga visibili (default 50)
 *
 * Esempio uso:
 *   <ReportMultiPicker
 *     value={selectedIds}
 *     onChange={(ids, {addedReportId}) => { ... }}
 *     currentMachineId={intervention.machine_id}
 *   />
 */
export default function ReportMultiPicker({
  value = [],
  onChange,
  currentMachineId = null,
  currentInterventionId = null,
  excludeReportIds = [],
  maxResults = 50,
}) {
  const [allReports, setAllReports] = useState([])
  const [linksMap, setLinksMap] = useState({}) // reportId → [{intervention_id, intervention_title, intervention_status}]
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [scopeMachineOnly, setScopeMachineOnly] = useState(!!currentMachineId)
  const [typeFilter, setTypeFilter] = useState(null)
  const debounceTimer = useRef(null)

  // Debounce search 300ms
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [search])

  // Caricamento iniziale: tutti i report (filtraggio client). Per org piccole
  // (<200 report) è ok. Se in futuro la lista esplode, paginare server-side.
  useEffect(() => {
    let alive = true
    setLoading(true)
    db.getReports().then(async (reports) => {
      if (!alive) return
      setAllReports(reports || [])
      // Carica i link attivi per gli stessi report (warning "already linked")
      const ids = (reports || []).map(r => r.id).filter(Boolean)
      if (ids.length > 0) {
        try {
          const links = await db.getActiveLinksByReports(ids)
          if (alive) setLinksMap(links || {})
        } catch (e) {
          console.warn('[ReportMultiPicker] active links load failed:', e?.message)
        }
      }
    }).catch(e => {
      console.warn('[ReportMultiPicker] reports load failed:', e?.message)
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // Lista filtrata e ordinata
  const filtered = useMemo(() => {
    const excludeSet = new Set(excludeReportIds || [])
    let list = (allReports || []).filter(r => r && !excludeSet.has(r.id))

    // Filtro scope: solo macchina corrente, oppure tutte
    if (scopeMachineOnly && currentMachineId) {
      list = list.filter(r => r.machine_id === currentMachineId)
    }

    // Filtro type
    if (typeFilter) {
      list = list.filter(r => r.type === typeFilter)
    }

    // Filtro search (titolo, machine, descrizione)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.machine || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.display_id || '').toLowerCase().includes(q)
      )
    }

    // Sort: aperte prima, poi per updated_at desc
    list.sort((a, b) => {
      const aOpen = a.status === 'aperta' || a.status === 'assegnata' || a.status === 'in_lavorazione'
      const bOpen = b.status === 'aperta' || b.status === 'assegnata' || b.status === 'in_lavorazione'
      if (aOpen !== bOpen) return aOpen ? -1 : 1
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    })

    return list.slice(0, maxResults)
  }, [allReports, scopeMachineOnly, currentMachineId, typeFilter, debouncedSearch, excludeReportIds, maxResults])

  const handleToggle = (reportId) => {
    const isSelected = value.includes(reportId)
    const newValue = isSelected
      ? value.filter(id => id !== reportId)
      : [...value, reportId]
    // Feedback aptico mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10) } catch { /* noop */ }
    }
    onChange?.(newValue, isSelected
      ? { removedReportId: reportId }
      : { addedReportId: reportId }
    )
  }

  const TYPE_FILTER_OPTS = useMemo(() => [
    { key: null, label: 'Tutti' },
    { key: 'correttiva', label: 'Correttiva' },
    { key: 'preventiva', label: 'Preventiva' },
    { key: 'migliorativa', label: 'Migliorativa' },
    { key: 'ispezione', label: 'Ispezione' },
  ], [])

  return (
    <div style={{
      background: 'var(--color-surface-2)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Toolbar: search + scope toggle */}
      <div style={{
        padding: 10,
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-secondary)',
          }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per titolo, macchina, descrizione, codice…"
            style={{
              width: '100%', padding: '10px 12px 10px 32px',
              minHeight: 44, // tap target regola guanti
              borderRadius: 8,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Cancella ricerca"
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: 6, color: 'var(--color-text-secondary)',
              }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {currentMachineId && (
            <button
              onClick={() => setScopeMachineOnly(s => !s)}
              className="press-scale"
              style={{
                padding: '6px 10px', minHeight: 28, borderRadius: 999,
                background: scopeMachineOnly ? 'var(--color-primary)' : 'var(--color-surface-2)',
                border: `1px solid ${scopeMachineOnly ? 'var(--color-primary)' : 'var(--color-border)'}`,
                color: scopeMachineOnly ? '#fff' : 'var(--color-text-secondary)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              <Wrench size={11} /> {scopeMachineOnly ? 'Solo questa macchina' : 'Tutte le segnalazioni'}
            </button>
          )}
          <span style={{
            fontSize: 10, color: 'var(--color-text-secondary)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            marginLeft: currentMachineId ? 8 : 0,
          }}>
            <Filter size={10} /> Tipo:
          </span>
          {TYPE_FILTER_OPTS.map(opt => {
            const active = typeFilter === opt.key
            return (
              <button key={String(opt.key)} onClick={() => setTypeFilter(opt.key)}
                style={{
                  padding: '4px 8px', borderRadius: 6,
                  background: active ? 'var(--color-primary)' : 'transparent',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista risultati */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {loading ? (
          <SkeletonList count={4} />
        ) : filtered.length === 0 ? (
          <p style={{
            padding: 20, textAlign: 'center',
            fontSize: 12, color: 'var(--color-text-secondary)',
            margin: 0, fontStyle: 'italic',
          }}>
            {debouncedSearch || typeFilter || scopeMachineOnly
              ? 'Nessuna segnalazione corrisponde ai filtri.'
              : 'Nessuna segnalazione disponibile.'}
          </p>
        ) : (
          filtered.map(report => (
            <ReportRow
              key={report.id}
              report={report}
              isSelected={value.includes(report.id)}
              activeLinks={(linksMap[report.id] || []).filter(l => l.intervention_id !== currentInterventionId)}
              onToggle={() => handleToggle(report.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ReportRow({ report, isSelected, activeLinks, onToggle }) {
  const status = STATUS[report.status] || STATUS.aperta
  const sev = SEVERITY[report.severity] || SEVERITY.media
  const type = report.type && REPORT_TYPES[report.type] ? REPORT_TYPES[report.type] : null
  const hasOtherLinks = activeLinks.length > 0
  const idLabel = report.display_id || `#${String(report.id).slice(0, 6)}`

  return (
    <button
      onClick={onToggle}
      className="press-scale"
      style={{
        width: '100%', padding: '10px 12px',
        minHeight: 44, // tap target regola guanti
        background: isSelected ? 'rgba(124,106,255,0.10)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--color-border)',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
      {/* Checkbox */}
      <span style={{
        width: 18, height: 18, borderRadius: 5,
        border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: isSelected ? 'var(--color-primary)' : 'transparent',
        color: '#fff',
        flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800,
      }}>
        {isSelected && '✓'}
      </span>

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
            maxWidth: 220,
          }}>{report.title}</span>
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          marginTop: 4,
        }}>
          <Pill bg={status.bg} color={status.color}>{status.label}</Pill>
          <Pill bg={sev.bg} color={sev.color}>{sev.label}</Pill>
          {type && <Pill bg={type.color + '22'} color={type.color}>{type.label}</Pill>}
          {report.machine && (
            <span style={{
              fontSize: 10, color: 'var(--color-text-secondary)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              <Wrench size={10} /> {report.machine}
            </span>
          )}
        </div>
        {hasOtherLinks && (
          <p style={{
            fontSize: 10, color: '#f59e0b',
            margin: '4px 0 0', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <AlertTriangle size={11} />
            Già linkato a {activeLinks.slice(0, 2).map(l => `INT-${String(l.intervention_id).slice(0, 6)}`).join(', ')}
            {activeLinks.length > 2 ? ` +${activeLinks.length - 2}` : ''}
          </p>
        )}
      </div>

      {isSelected && (
        <Link2 size={13} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 4 }} />
      )}
    </button>
  )
}

function Pill({ bg, color, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 6px', borderRadius: 999,
      background: bg, color,
      fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

function SkeletonList({ count = 4 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          padding: '12px', display: 'flex', gap: 10,
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: 5,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{
              width: `${50 + (i * 10) % 40}%`, height: 12, borderRadius: 4,
              background: 'var(--color-surface-2)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }} />
            <div style={{
              width: `${30 + (i * 7) % 30}%`, height: 8, borderRadius: 4,
              background: 'var(--color-surface-2)',
              marginTop: 6, opacity: 0.6,
              animation: 'pulse 1.4s ease-in-out infinite',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}
