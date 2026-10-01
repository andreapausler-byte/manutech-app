/**
 * MachineReportsTab — Le segnalazioni della macchina
 *
 * Il tab d'apertura: cosa non va adesso. In cima la striscia di stato
 * (manutenzioni scadute · segnalazioni aperte per gravità), poi le righe,
 * poi le concluse ripiegate in fondo — ognuna con causa e azione, perché
 * davanti alla macchina la domanda è "com'è stato risolto l'ultima volta?".
 *
 * Misure guanti: righe da 76px, titolo 18px, tasto risolvi 56×56 staccato
 * dalla riga così non si sbaglia il bersaglio con il dito grosso.
 */

import { useState } from 'react'
import { AlertTriangle, ClipboardList, CheckCircle, Wrench, ChevronDown } from 'lucide-react'
import { SEVERITY, timeAgo } from '../../lib/constants'
import { closedAtOf, closureOutcome } from '../../lib/closure'
import { TabActionRow, TabEmptyFrame } from './MachineTabParts'
import { padX, padRow } from './machineTabs'
import { EmptyState } from '../ui'
import ComponentPill from './ComponentPill'
import ResolvedReportCard from '../reports/ResolvedReportCard'
import { useHaptic } from '../../hooks/useHaptic'

const PAGE = 5

export default function MachineReportsTab({
  reports, resolved, urgentCount, onOpenReport, onResolveReport, onGoToPlans,
}) {
  const haptic = useHaptic()
  const [limit, setLimit] = useState(PAGE)
  const [showResolved, setShowResolved] = useState(false)
  const [resolvedLimit, setResolvedLimit] = useState(PAGE)

  const visible = reports.slice(0, limit)
  const rest = reports.length - visible.length
  // Concluse dalla chiusura più recente: è l'ordine in cui servono.
  const resolvedSorted = [...resolved].sort((a, b) => new Date(closedAtOf(b)) - new Date(closedAtOf(a)))
  const resolvedVisible = resolvedSorted.slice(0, resolvedLimit)
  const resolvedRest = resolvedSorted.length - resolvedVisible.length
  const toComplete = resolved.filter(r => closureOutcome(r) === 'da_completare').length

  return (
    <div>
      {/* ═══ Striscia di stato ═══ */}
      <div className="grid gap-px" style={{
        background: 'var(--color-border-subtle)',
        gridTemplateColumns: urgentCount > 0 ? '1fr 1fr' : '1fr',
      }}>
        {urgentCount > 0 && (
          <button
            onClick={() => { haptic.light(); onGoToPlans?.() }}
            className="h-[56px] flex items-center gap-2.5 active:bg-surface-3"
            style={{ ...padX, background: 'rgba(239,68,68,0.10)' }}
          >
            <AlertTriangle size={18} className="text-red-400 shrink-0" />
            <span className="font-mono text-[11.5px] uppercase tracking-wider text-red-400 truncate">
              {urgentCount} scadut{urgentCount === 1 ? 'a' : 'e'}
            </span>
          </button>
        )}
        <div
          className="h-[56px] flex items-center gap-2.5"
          style={{ ...padX, background: reports.length > 0 ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)' }}
        >
          {reports.length > 0 ? (
            <>
              <ClipboardList size={18} className="text-amber-400 shrink-0" />
              <span className="font-mono text-[11.5px] uppercase tracking-wider text-amber-400">
                {reports.length} apert{reports.length === 1 ? 'a' : 'e'}
              </span>
              <span className="flex items-center gap-1.5" style={{ marginLeft: 'auto' }}>
                {['critica', 'alta', 'media', 'bassa'].map(key => {
                  const count = reports.filter(r => r.severity === key).length
                  if (!count) return null
                  return (
                    <span
                      key={key}
                      className="font-mono text-[11px] px-1.5 rounded-md"
                      style={{ background: SEVERITY[key].color + '22', color: SEVERITY[key].color }}
                    >
                      {count}
                    </span>
                  )
                })}
              </span>
            </>
          ) : (
            <>
              <CheckCircle size={18} className="text-emerald-400 shrink-0" />
              <span className="font-mono text-[11.5px] uppercase tracking-wider text-emerald-400">
                Nessuna segnalazione aperta
              </span>
            </>
          )}
        </div>
      </div>

      {/* ═══ Righe ═══ */}
      {reports.length === 0 && resolved.length === 0 && (
        <TabEmptyFrame>
          <EmptyState
            icon={<ClipboardList size={44} style={{ margin: "0 auto" }} className="text-faint" />}
            title="Nessuna segnalazione"
            subtitle="Quando qualcosa non va, usa Rapido o Segnala qui sotto."
          />
        </TabEmptyFrame>
      )}

      {visible.map(r => {
        const sev = SEVERITY[r.severity] || SEVERITY.media
        return (
          <div
            key={r.id}
            className="flex items-center gap-[3vw] border-b"
            style={{ minHeight: 76, paddingLeft: '4vw', paddingRight: '2vw', borderColor: 'var(--color-border-subtle)' }}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: sev.color, boxShadow: `0 0 10px ${sev.color}80` }}
            />
            <button
              onClick={() => { haptic.light(); onOpenReport?.(r) }}
              className="flex-1 min-w-0 text-left"
              style={padRow}
            >
              <p className="text-[18px] font-medium text-themed truncate">{r.title}</p>
              {r.component_name && (
                <span className="block" style={{ marginTop: 6 }}>
                  <ComponentPill name={r.component_name} size="sm" />
                </span>
              )}
              <p className="font-mono text-[11px] text-faint truncate" style={{ marginTop: 6 }}>
                {r.created_by_name} · {timeAgo(r.created_at)}
              </p>
            </button>
            {/* La gravità sta fuori dalla riga di testo: dentro veniva
                tagliata dall'ellissi proprio quando serviva leggerla. */}
            <div className="flex items-center gap-[2vw] shrink-0">
              <span
                className="font-mono text-[10.5px] uppercase tracking-wider"
                style={{ color: sev.color }}
              >
                {sev.label}
              </span>
              <button
                onClick={() => { haptic.medium(); onResolveReport?.(r) }}
                aria-label={`Risolvi e registra: ${r.title}`}
                className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center active:bg-emerald-500/15 transition-colors"
                style={{ border: '1px solid var(--color-border)' }}
              >
                <Wrench size={22} className="text-emerald-400" />
              </button>
            </div>
          </div>
        )
      })}

      {rest > 0 && (
        <TabActionRow
          label={`Altre ${rest} segnalazion${rest === 1 ? 'e' : 'i'}`}
          onClick={() => { haptic.light(); setLimit(l => l + PAGE) }}
        />
      )}

      {/* ═══ Concluse ═══ */}
      {resolved.length > 0 && (
        <>
          <button
            onClick={() => { haptic.light(); setShowResolved(v => !v) }}
            aria-expanded={showResolved}
            className="w-full h-[68px] flex items-center gap-2.5 border-t border-b active:bg-surface-3 transition-colors"
            style={{ ...padX, background: 'var(--color-surface-1)', borderColor: 'var(--color-border-subtle)' }}
          >
            <CheckCircle size={20} className="text-emerald-400 shrink-0" />
            <span className="font-mono text-[12px] uppercase tracking-wider text-muted">
              Concluse ({resolved.length})
            </span>
            {toComplete > 0 && (
              <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: '#f59e0b' }}>
                · {toComplete} da completare
              </span>
            )}
            <ChevronDown
              size={22}
              className="text-faint"
              style={{
                marginLeft: 'auto',
                transform: showResolved ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.25s var(--ease-out-expo)',
              }}
            />
          </button>

          {showResolved && (
            <div className="flex flex-col" style={{ ...padX, gap: 8, paddingTop: 10, paddingBottom: 10 }}>
              {resolvedVisible.map(r => (
                <ResolvedReportCard
                  key={r.id}
                  report={r}
                  showMachine={false}
                  onSelect={(rep) => { haptic.light(); onOpenReport?.(rep) }}
                />
              ))}
            </div>
          )}
          {showResolved && resolvedRest > 0 && (
            <TabActionRow
              label={`Altre ${resolvedRest} conclus${resolvedRest === 1 ? 'a' : 'e'}`}
              onClick={() => { haptic.light(); setResolvedLimit(l => l + PAGE) }}
            />
          )}
        </>
      )}
    </div>
  )
}
