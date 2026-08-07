import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ArrowLeftRight, GitMerge, ChevronLeft, Wrench, Check } from 'lucide-react'
import { db } from '../../../lib/supabase'
import { STATUS, SEVERITY, TERMINAL_STATUSES, formatTicketId, formatDate } from '../../../lib/constants'
import { useMergeSegnalazione } from '../../../hooks/useMergeSegnalazione'


/**
 * MergeReportModal — unisce una segnalazione duplicata a una master.
 *
 * Flusso a due step:
 *   1. Picker  — scegli la segnalazione candidata (default: stesso macchinario,
 *                attiva, non-duplicata; la ricerca libera allarga a tutte).
 *   2. Direzione — decidi chi resta aperta (master) e chi viene chiusa come
 *                duplicato (default: la più vecchia è master), poi conferma.
 *
 * Props
 *   sourceReport  segnalazione di partenza (quella da cui parte l'azione)
 *   onClose()     chiusura senza azione
 *   onMerged(result, meta)  successo. meta = { duplicateId, masterId,
 *                           masterReport, dupReport }
 */
export default function MergeReportModal({ sourceReport, onClose, onMerged }) {
  const { merge, isLoading } = useMergeSegnalazione()
  const [step, setStep] = useState('pick')
  const [target, setTarget] = useState(null)
  const [masterId, setMasterId] = useState(null)

  const [allReports, setAllReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [scopeMachineOnly, setScopeMachineOnly] = useState(!!sourceReport?.machine_id)
  const debounceRef = useRef(null)

  // Debounce ricerca 250ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // Carica i candidati (filtro client-side, come ReportMultiPicker). db.getReports
  // ha già il fallback demo.
  useEffect(() => {
    let alive = true
    db.getReports()
      .then(list => { if (alive) setAllReports(list || []) })
      .catch(e => console.warn('[MergeReportModal] getReports fallito:', e?.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Quando c'è una ricerca, lo scope macchina viene ignorato ("allarga oltre il
  // macchinario"). Senza ricerca vale il toggle (default: solo questa macchina).
  const machineScopeActive = scopeMachineOnly && !debouncedSearch.trim()

  const candidates = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    let list = (allReports || []).filter(r =>
      r &&
      r.id !== sourceReport?.id &&
      !r.duplicate_of_id &&
      !TERMINAL_STATUSES.includes(r.status)
    )
    if (machineScopeActive && sourceReport?.machine_id) {
      list = list.filter(r => r.machine_id === sourceReport.machine_id)
    }
    if (q) {
      list = list.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.machine || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        formatTicketId(r).toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return list.slice(0, 50)
  }, [allReports, sourceReport, machineScopeActive, debouncedSearch])

  const selectTarget = (report) => {
    setTarget(report)
    // Default: la più vecchia è master.
    const sourceOlder = new Date(sourceReport.created_at || 0) <= new Date(report.created_at || 0)
    setMasterId(sourceOlder ? sourceReport.id : report.id)
    setStep('direction')
  }

  const invert = () => {
    if (!target) return
    setMasterId(prev => (prev === sourceReport.id ? target.id : sourceReport.id))
  }

  const handleConfirm = async () => {
    if (!target || !masterId) return
    const masterReport = masterId === sourceReport.id ? sourceReport : target
    const dupReport = masterId === sourceReport.id ? target : sourceReport
    try {
      const result = await merge(dupReport.id, masterReport.id)
      onMerged?.(result, {
        duplicateId: dupReport.id,
        masterId: masterReport.id,
        masterReport,
        dupReport,
      })
    } catch {
      // toast d'errore già mostrato dall'hook; resta sullo step direzione
    }
  }

  if (!sourceReport) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center"
      style={{ paddingTop: '6vh' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }} />
      <div
        className="relative bg-surface-1 border border-token rounded-2xl w-full animate-fade-in shadow-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: 760, maxHeight: '84vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-token shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <GitMerge size={18} className="text-violet-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-themed truncate">Unisci segnalazione duplicata</h2>
              <p className="text-[11px] text-faint truncate">
                {formatTicketId(sourceReport)} · {sourceReport.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {step === 'pick' ? (
          <PickStep
            loading={loading}
            candidates={candidates}
            search={search}
            setSearch={setSearch}
            setScopeMachineOnly={setScopeMachineOnly}
            machineScopeActive={machineScopeActive}
            hasMachine={!!sourceReport?.machine_id}
            onSelect={selectTarget}
          />
        ) : (
          <DirectionStep
            source={sourceReport}
            target={target}
            masterId={masterId}
            onInvert={invert}
            onBack={() => setStep('pick')}
            onConfirm={handleConfirm}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  )
}

// ─── Step 1: Picker ──────────────────────────────────────────────────────
function PickStep({
  loading, candidates, search, setSearch,
  setScopeMachineOnly, machineScopeActive, hasMachine, onSelect,
}) {
  return (
    <>
      <div className="px-6 py-4 border-b border-token shrink-0 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per codice, titolo o macchinario…"
            className="w-full text-sm rounded-xl pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            style={{ background: 'var(--color-surface-0)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            aria-label="Cerca segnalazione da unire"
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Cancella ricerca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
        {hasMachine && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setScopeMachineOnly(s => !s)}
              className="press-scale inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all"
              style={machineScopeActive
                ? { background: 'var(--color-primary)', border: '1px solid var(--color-primary)', color: '#fff' }
                : { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <Wrench size={11} /> {machineScopeActive ? 'Solo questo macchinario' : 'Tutte le segnalazioni'}
            </button>
            {search.trim() && (
              <span className="text-[11px] text-faint">La ricerca include tutti i macchinari</span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-y-auto" style={{ minHeight: 180 }}>
        {loading ? (
          <p className="text-center text-sm text-faint py-12">Caricamento segnalazioni…</p>
        ) : candidates.length === 0 ? (
          <p className="text-center text-sm text-faint py-12 px-6 italic">
            Nessuna segnalazione attiva corrisponde ai criteri.
          </p>
        ) : (
          candidates.map(r => <CandidateRow key={r.id} report={r} onSelect={() => onSelect(r)} />)
        )}
      </div>
    </>
  )
}

function CandidateRow({ report, onSelect }) {
  const sts = STATUS[report.status] || STATUS.aperta
  const sev = SEVERITY[report.severity] || SEVERITY.media
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-6 py-3 flex items-start gap-3 hover:bg-violet-500/5 transition-colors border-b border-token press-scale"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
            background: 'var(--color-primary-glow)', color: 'var(--color-primary)',
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5,
          }}>{formatTicketId(report)}</span>
          <span className="text-sm font-semibold text-themed truncate" style={{ maxWidth: 320 }}>{report.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <Pill color={sts.color}>{sts.label}</Pill>
          <Pill color={sev.color}>{sev.label}</Pill>
          {report.machine && (
            <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
              <Wrench size={10} /> {report.machine}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {report.assigned_to_name ? `🔧 ${report.assigned_to_name}` : 'Da assegnare'}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>{formatDate(report.created_at)}</span>
        </div>
      </div>
    </button>
  )
}

// ─── Step 2: Direzione ───────────────────────────────────────────────────
function DirectionStep({ source, target, masterId, onInvert, onBack, onConfirm, isLoading }) {
  const masterReport = masterId === source.id ? source : target
  const dupReport = masterId === source.id ? target : source

  return (
    <>
      <div className="overflow-y-auto p-6 space-y-4" style={{ minHeight: 180 }}>
        <p className="text-sm text-secondary">
          Scegli quale segnalazione <strong className="text-themed">resta aperta</strong> e quale viene
          <strong className="text-themed"> chiusa come duplicato</strong>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <DirectionCard kind="master" report={masterReport} />
          <div className="flex md:flex-col items-center justify-center">
            <button
              onClick={onInvert}
              aria-label="Inverti direzione"
              title="Inverti master e duplicato"
              className="press-scale p-2.5 rounded-full bg-surface-2 border border-token text-secondary hover:text-violet-400 hover:border-violet-500/40 transition-all"
            >
              <ArrowLeftRight size={18} />
            </button>
          </div>
          <DirectionCard kind="duplicate" report={dupReport} />
        </div>

        <div className="bg-surface-2/40 rounded-xl p-3 text-[12px] text-muted leading-relaxed">
          <strong className="text-secondary">{formatTicketId(dupReport)}</strong> verrà chiusa con motivo
          “duplicato” e collegata a <strong className="text-secondary">{formatTicketId(masterReport)}</strong>.
          Media e cronologia restano sulla duplicata. L'operazione è reversibile.
        </div>
      </div>

      {/* Footer azioni */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-token shrink-0">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all disabled:opacity-50"
        >
          <ChevronLeft size={15} /> Indietro
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all disabled:opacity-50"
        >
          {isLoading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><GitMerge size={15} /> Unisci segnalazioni</>}
        </button>
      </div>
    </>
  )
}

function DirectionCard({ kind, report }) {
  const isMaster = kind === 'master'
  const sts = STATUS[report.status] || STATUS.aperta
  const accent = isMaster ? '#3ddc84' : '#f59e0b'
  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{ background: `${accent}0d`, borderColor: `${accent}40` }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {isMaster
          ? <Check size={13} style={{ color: accent }} />
          : <X size={13} style={{ color: accent }} />}
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {isMaster ? 'Resta aperta (master)' : 'Viene chiusa come duplicato'}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
          background: 'var(--color-primary-glow)', color: 'var(--color-primary)',
          fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5,
        }}>{formatTicketId(report)}</span>
        <Pill color={sts.color}>{sts.label}</Pill>
      </div>
      <p className="text-sm font-semibold text-themed leading-snug">{report.title}</p>
      <p className="text-[11px] text-faint mt-1">
        {report.machine ? `${report.machine} · ` : ''}{formatDate(report.created_at)}
      </p>
    </div>
  )
}

function Pill({ color, children }) {
  return (
    <span
      className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: `${color}1f`, color }}
    >
      {children}
    </span>
  )
}
