/**
 * AdminArchive — Archivio interventi: come sono state risolte le segnalazioni.
 *
 * La lista Segnalazioni risponde a "cosa c'è da fare"; questa pagina a
 * "com'è andata": ogni segnalazione conclusa con causa radice, azione
 * correttiva, ore, ricambi, chi l'ha chiusa e le note aggiunte dopo.
 * Prima l'archivio era una sezione ripiegata in fondo alla lista, con le
 * stesse righe dei ticket aperti (gravità, ultimo messaggio di chat) e
 * nessun modo di cercare dentro le chiusure.
 *
 * Tutto client-side sul set già caricato da db.getReports(), come la lista
 * Segnalazioni. Quando l'archivio crescerà oltre qualche migliaio di righe
 * la mossa è una ricerca lato server sull'indice FTS di migration 026, che
 * copre già title + description + closure_*.
 *
 * Spaziature inline: le utility p-* e m-* di Tailwind sono azzerate dal
 * reset globale di index.css (debito tecnico noto).
 */

import { useState, useEffect, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { TERMINAL_STATUSES, formatDate, formatDateParts, formatTicketId } from '../../lib/constants'
import {
  getClosure, closureOutcome, closedAtOf, closureSearchText,
  groupByClosureMonth, CLOSURE_OUTCOMES,
} from '../../lib/closure'
import { Spinner, EmptyState, TicketIdBadge } from '../../components/ui'
import ComponentPill from '../../components/machines/ComponentPill'
import ReportDetailModal from './reports/ReportDetailModal'
import { Search, X, Download, Clock, Package, User, StickyNote } from 'lucide-react'

const DAY_MS = 24 * 3600 * 1000

const PERIODS = [
  { id: 'all', label: 'Tutto il periodo', days: null },
  { id: '30', label: 'Ultimi 30 giorni', days: 30 },
  { id: '90', label: 'Ultimi 3 mesi', days: 90 },
  { id: '365', label: 'Ultimo anno', days: 365 },
]

const OUTCOME_FILTERS = ['', 'intervento', 'da_completare', 'senza']

const panelStyle = {
  background: 'var(--color-surface-1)',
  border: '1px solid var(--color-border-subtle)',
}

const selectStyle = (active) => ({
  background: 'var(--color-sidebar-bg)',
  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
  color: active ? 'var(--color-primary)' : 'var(--color-text)',
  padding: '8px 14px',
  maxWidth: 240,
})

const hoursLabel = (h) => `${Math.round(h * 10) / 10}h`

// CSV con `;` e BOM: Excel in italiano lo apre a colonne senza import guidato.
function downloadCsv(rows, machineOf) {
  const header = ['Ticket', 'Chiusa il', 'Macchina', 'Pezzo', 'Titolo', 'Esito', 'Tecnico', 'Ore', 'Ricambi', 'Causa radice', 'Azione correttiva', 'Note successive']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map(r => {
    const c = getClosure(r)
    const when = closedAtOf(r)
    return [
      formatTicketId(r),
      when ? formatDate(when) : '',
      machineOf(r) || '',
      r.component_name || '',
      r.title || '',
      CLOSURE_OUTCOMES[closureOutcome(r)].label,
      r.assigned_to_name || '',
      c.hours != null ? String(c.hours).replace('.', ',') : '',
      c.parts || '',
      c.rootCause || '',
      c.action || '',
      c.notes.map(n => `${n.user_name || 'Utente'}: ${n.text}`).join(' | '),
    ].map(esc).join(';')
  })
  const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `archivio-interventi-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ArchiveRow({ report, machineName, onOpen }) {
  const c = getClosure(report)
  const outcome = closureOutcome(report)
  const meta = CLOSURE_OUTCOMES[outcome]
  const { day, month } = formatDateParts(closedAtOf(report))
  const side = [
    c.hours != null && { icon: Clock, text: `${c.hours}h` },
    c.parts && { icon: Package, text: c.parts },
    report.assigned_to_name && outcome !== 'senza' && { icon: User, text: report.assigned_to_name },
    c.notes.length > 0 && { icon: StickyNote, text: `${c.notes.length} ${c.notes.length === 1 ? 'nota' : 'note'} dopo` },
  ].filter(Boolean)

  const line = (label, text) => (
    <div className="flex gap-3 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: 'var(--color-text-faint)', width: 50, paddingTop: 2 }}>
        {label}
      </span>
      <span
        className="text-[13px] leading-snug"
        style={{
          color: text ? 'var(--color-text-secondary)' : 'var(--color-text-faint)',
          fontStyle: text ? 'normal' : 'italic',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {text || 'Non indicata'}
      </span>
    </div>
  )

  return (
    <button
      onClick={() => onOpen(report)}
      className="w-full text-left rounded-xl flex items-stretch overflow-hidden transition-all hover:-translate-y-px"
      style={{ ...panelStyle, borderLeft: `3px solid ${meta.color}`, cursor: 'pointer' }}
    >
      {/* Data di chiusura */}
      <div className="w-[64px] shrink-0 flex flex-col items-center justify-center" style={{ borderRight: '1px solid var(--color-border-subtle)', padding: '12px 0' }}>
        <span className="text-[20px] font-bold leading-none tabular-nums" style={{ color: 'var(--color-text)', fontFamily: '"JetBrains Mono", monospace' }}>{day}</span>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>{month}</span>
      </div>

      {/* Cosa era e cosa è stato fatto */}
      <div className="flex-1 min-w-0 flex flex-col gap-2" style={{ padding: '12px 18px' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <TicketIdBadge report={report} className="text-[10px] font-bold shrink-0" style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 4, letterSpacing: 1,
            fontFamily: '"JetBrains Mono", monospace',
            background: 'var(--color-primary-glow)', color: 'var(--color-primary)',
          }} />
          {machineName && (
            <span className="text-[11px] font-semibold truncate" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'var(--color-primary)' }}>
              {machineName}
            </span>
          )}
          {report.component_name && <ComponentPill name={report.component_name} size="xs" className="shrink-0" />}
          <span
            className="text-[9px] font-bold uppercase tracking-wider rounded shrink-0"
            style={{ marginLeft: 'auto', background: `${meta.color}1A`, color: meta.color, padding: '3px 8px' }}
          >
            {meta.label}
          </span>
        </div>
        <div className="font-semibold text-[15px] leading-snug" style={{ color: 'var(--color-text)' }}>
          {report.title}
        </div>
        {outcome === 'senza' ? (
          <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Chiusa senza registrare un intervento
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            {line('Causa', c.rootCause)}
            {line('Azione', c.action)}
          </div>
        )}
      </div>

      {/* Ore, ricambi, tecnico, note */}
      {side.length > 0 && (
        <div
          className="hidden lg:flex w-[240px] shrink-0 flex-col justify-center gap-1.5"
          style={{ borderLeft: '1px solid var(--color-border-subtle)', background: 'var(--color-surface-0)', padding: '12px 16px' }}
        >
          {side.map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2 min-w-0 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
              <Icon size={13} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              <span className="truncate">{text}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

export default function AdminArchive({ initialMachine = '' }) {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [users, setUsers] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [machine, setMachine] = useState(initialMachine)
  const [component, setComponent] = useState('')
  const [technician, setTechnician] = useState('')
  const [period, setPeriod] = useState('all')
  const [outcome, setOutcome] = useState('')
  const [selected, setSelected] = useState(null)

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const [r, u, m] = await Promise.all([db.getReports(), db.getUsers(), db.getMachines()])
      setReports(r || []); setUsers(u || []); setMachines(m || [])
    } catch (e) {
      console.error('[AdminArchive] load failed:', e)
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(timer)
  }, [search])

  const machineNameById = useMemo(() => {
    const m = new Map()
    for (const x of machines) m.set(x.id, x.name)
    return m
  }, [machines])
  const machineOf = (r) => r.machine || (r.machine_id ? machineNameById.get(r.machine_id) : null) || ''

  // Le concluse, senza i duplicati uniti (mig 058): vivono dentro la principale.
  const concluded = useMemo(
    () => reports.filter(r => TERMINAL_STATUSES.includes(r.status) && !r.duplicate_of_id),
    [reports]
  )

  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps -- Date.now stabile dentro useMemo([reports])
  const nowMs = useMemo(() => Date.now(), [reports])

  const countBy = (list, keyFn) => {
    const m = new Map()
    for (const r of list) {
      const k = keyFn(r)
      if (k) m.set(k, (m.get(k) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it'))
  }
  const machineOptions = countBy(concluded, machineOf)
  // Il pezzo si sceglie dentro una macchina: "Motore" su due linee sono due pezzi.
  const componentOptions = machine
    ? countBy(concluded.filter(r => machineOf(r) === machine), r => r.component_name)
    : []
  const technicianOptions = countBy(concluded, r => r.assigned_to_name)

  // Tutti i filtri tranne l'esito: base per i conteggi dei chip e per i KPI.
  const periodDays = PERIODS.find(p => p.id === period)?.days
  const baseFiltered = concluded.filter(r => {
    if (machine && machineOf(r) !== machine) return false
    if (component && r.component_name !== component) return false
    if (technician && r.assigned_to_name !== technician) return false
    if (periodDays) {
      const ts = new Date(closedAtOf(r)).getTime()
      if (!Number.isFinite(ts) || nowMs - ts > periodDays * DAY_MS) return false
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim()
      const qNorm = q.replace(/[^a-z0-9]/g, '')
      const tk = formatTicketId(r).toLowerCase()
      const haystack = [
        r.title, r.description, machineOf(r), r.component_name,
        r.assigned_to_name, r.created_by_name, closureSearchText(r),
      ].filter(Boolean).join(' ').toLowerCase()
      const tkMatch = tk.includes(q) || (qNorm.length > 0 && tk.replace(/[^a-z0-9]/g, '').includes(qNorm))
      if (!haystack.includes(q) && !tkMatch) return false
    }
    return true
  })
  const outcomeCounts = baseFiltered.reduce((acc, r) => {
    const o = closureOutcome(r)
    acc[o] = (acc[o] || 0) + 1
    return acc
  }, {})
  const filtered = outcome ? baseFiltered.filter(r => closureOutcome(r) === outcome) : baseFiltered
  const groups = groupByClosureMonth(filtered)

  const totalHours = baseFiltered.reduce((s, r) => {
    const h = Number(getClosure(r).hours)
    return Number.isFinite(h) ? s + h : s
  }, 0)
  const withNotes = baseFiltered.filter(r => getClosure(r).notes.length > 0).length
  const activeFilters = [machine, component, technician, period !== 'all' && period, outcome, debouncedSearch.trim()].filter(Boolean).length

  const resetFilters = () => {
    setMachine(''); setComponent(''); setTechnician(''); setPeriod('all'); setOutcome(''); setSearch('')
  }

  const kpis = [
    { value: baseFiltered.length, label: <>Segnalazioni<br />concluse</>, color: 'var(--color-text)' },
    { value: outcomeCounts.intervento || 0, label: <>Con intervento<br />documentato</>, color: CLOSURE_OUTCOMES.intervento.color },
    { value: hoursLabel(totalHours), label: <>Ore<br />registrate</>, color: 'var(--color-primary)' },
    { value: outcomeCounts.da_completare || 0, label: <>Chiusure<br />da completare</>, color: CLOSURE_OUTCOMES.da_completare.color, onClick: () => setOutcome(o => o === 'da_completare' ? '' : 'da_completare') },
    { value: withNotes, label: <>Con note<br />aggiunte dopo</>, color: 'var(--color-text-secondary)' },
  ]

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-4">
        <nav className="flex text-[11px] font-medium uppercase tracking-widest gap-2" style={{ color: 'var(--color-text-muted)' }}>
          <span>Gestione</span>
          <span>/</span>
          <span style={{ color: 'var(--color-primary, #7c6aff)' }}>Archivio interventi</span>
        </nav>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Come sono state risolte
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)', marginTop: 6 }}>
              Ogni segnalazione conclusa con causa, azione, ore e ricambi. Apri una riga per correggere la chiusura o aggiungere quello che si è saputo dopo.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Cerca: guasto, causa, ricambio, macchina…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-80 text-sm rounded-full border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                style={{ background: 'var(--color-sidebar-bg)', color: 'var(--color-text)', padding: '10px 36px 10px 40px' }}
                aria-label="Cerca nell'archivio"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Cancella ricerca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white"
                  style={{ color: 'var(--color-text-muted)' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => downloadCsv(groups.flatMap(g => g.list), machineOf)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 text-sm font-semibold rounded-full transition-all press-scale disabled:opacity-40"
              style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)', background: 'var(--color-surface-2)', padding: '10px 18px' }}
              title="Esporta le righe filtrate in CSV (Excel)"
            >
              <Download size={15} /> Esporta CSV
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={machine} onChange={e => { setMachine(e.target.value); setComponent('') }}
            className="text-xs rounded-full focus:outline-none" style={selectStyle(!!machine)} aria-label="Filtra per macchina">
            <option value="">Tutte le macchine</option>
            {machineOptions.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select value={component} onChange={e => setComponent(e.target.value)} disabled={!machine || componentOptions.length === 0}
            className="text-xs rounded-full focus:outline-none disabled:opacity-40" style={selectStyle(!!component)} aria-label="Filtra per pezzo"
            title={!machine ? 'Scegli prima la macchina' : undefined}>
            <option value="">{machine && componentOptions.length === 0 ? 'Nessun pezzo indicato' : 'Tutti i pezzi'}</option>
            {componentOptions.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select value={technician} onChange={e => setTechnician(e.target.value)}
            className="text-xs rounded-full focus:outline-none" style={selectStyle(!!technician)} aria-label="Filtra per tecnico">
            <option value="">Tutti i tecnici</option>
            {technicianOptions.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="text-xs rounded-full focus:outline-none" style={selectStyle(period !== 'all')} aria-label="Filtra per periodo di chiusura">
            {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>

          <div className="h-4 w-px" style={{ background: 'var(--color-border)', margin: '0 4px' }} />

          {OUTCOME_FILTERS.map(key => {
            const active = outcome === key
            const meta = key ? CLOSURE_OUTCOMES[key] : { label: 'Tutti gli esiti', color: '#a594ff' }
            const count = key ? (outcomeCounts[key] || 0) : baseFiltered.length
            return (
              <button key={key || 'all'} onClick={() => setOutcome(key)} aria-pressed={active}
                className="text-xs rounded-full border flex items-center gap-2 transition-all press-scale"
                style={{
                  padding: '7px 14px',
                  background: active ? `${meta.color}18` : 'var(--color-surface-1)',
                  borderColor: active ? meta.color : 'var(--color-border)',
                  color: active ? meta.color : 'var(--color-text-muted)',
                }}>
                {key && <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
                {meta.label}
                <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{count}</span>
              </button>
            )
          })}

          {activeFilters > 0 && (
            <button onClick={resetFilters}
              className="text-xs rounded-full transition-colors hover:bg-white/5"
              style={{ color: 'var(--color-text-muted)', padding: '8px 12px' }}>
              Rimuovi filtri
            </button>
          )}
        </div>

        {/* KPI */}
        {!loading && concluded.length > 0 && (
          <div className="flex items-stretch gap-3 flex-wrap">
            {kpis.map((k, i) => {
              const Tag = k.onClick ? 'button' : 'div'
              return (
                <Tag key={i} onClick={k.onClick}
                  className={`flex items-center gap-3 rounded-xl min-w-[150px] text-left ${k.onClick ? 'press-scale hover:brightness-110' : ''}`}
                  style={{ ...panelStyle, padding: '14px 18px', cursor: k.onClick ? 'pointer' : 'default' }}>
                  <span className="text-[26px] font-bold leading-none tabular-nums" style={{ color: k.color }}>{k.value}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider leading-[1.4]" style={{ color: 'var(--color-text-muted)' }}>{k.label}</span>
                </Tag>
              )
            })}
          </div>
        )}
      </header>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div className="rounded-2xl" style={{ ...panelStyle, padding: '40px 24px' }}>
          <EmptyState
            icon="📦"
            title={concluded.length === 0 ? 'Ancora nessuna segnalazione conclusa' : 'Nessun risultato'}
            subtitle={concluded.length === 0
              ? 'Qui compariranno le segnalazioni risolte o chiuse, con il riepilogo di come sono andate.'
              : 'Prova a togliere qualche filtro o a cercare un\'altra parola (causa, ricambio, macchina).'}
          />
          {activeFilters > 0 && (
            <div className="flex justify-center" style={{ marginTop: 12 }}>
              <button onClick={resetFilters} className="text-sm font-semibold rounded-full"
                style={{ color: 'var(--color-primary)', border: '1px solid var(--color-primary)', padding: '8px 16px' }}>
                Rimuovi filtri
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(g => {
            const monthHours = g.list.reduce((s, r) => {
              const h = Number(getClosure(r).hours)
              return Number.isFinite(h) ? s + h : s
            }, 0)
            return (
              <section key={g.key} className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>{g.label}</h2>
                  <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    {g.list.length} {g.list.length === 1 ? 'conclusa' : 'concluse'}
                    {monthHours > 0 && ` · ${hoursLabel(monthHours)} di lavoro`}
                  </span>
                </div>
                {g.list.map(r => (
                  <ArchiveRow key={r.id} report={r} machineName={machineOf(r)} onOpen={setSelected} />
                ))}
              </section>
            )
          })}
        </div>
      )}

      {selected && (
        <ReportDetailModal
          selected={selected}
          user={user}
          users={users}
          machines={machines}
          allReports={reports}
          onClose={(deleted) => { setSelected(null); if (deleted) load({ silent: true }) }}
          onUpdate={(updates) => { setSelected(s => s ? { ...s, ...updates } : null); load({ silent: true }) }}
          onOpenReport={(id) => {
            const r = reports.find(x => x.id === id)
            if (r) setSelected(r)
          }}
        />
      )}
    </div>
  )
}
