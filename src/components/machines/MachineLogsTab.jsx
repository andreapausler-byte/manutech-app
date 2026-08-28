/**
 * MachineLogsTab — Lo storico degli interventi
 *
 * Cosa è già stato fatto su questa macchina, in ordine di data. La
 * colonna data a sinistra rende il ritmo leggibile a colpo d'occhio:
 * quattro interventi in un mese si vedono senza leggere i titoli.
 *
 * MTBF: distanza media fra due guasti (solo interventi straordinari —
 * le manutenzioni programmate non sono guasti). Sotto i tre guasti la
 * media non dice niente e non si mostra.
 *
 * Misure guanti: righe da 88px, titolo 18px.
 */

import { useMemo, useState } from 'react'
import { Wrench, Shield, AlertTriangle } from 'lucide-react'
import { formatDateParts } from '../../lib/constants'
import { TabHeading, TabActionRow, TabEmptyFrame } from './MachineTabParts'
import { padX, padRow } from './machineTabs'
import { EmptyState } from '../ui'
import ComponentPill from './ComponentPill'
import { useHaptic } from '../../hooks/useHaptic'

const PAGE = 6
const DAY_MS = 24 * 60 * 60 * 1000

function computeMtbf(logs) {
  const faults = logs
    .filter(l => l.type !== 'programmata' && l.performed_at)
    .map(l => new Date(l.performed_at).getTime())
    .sort((a, b) => a - b)
  if (faults.length < 3) return null
  const span = faults[faults.length - 1] - faults[0]
  return Math.round(span / (faults.length - 1) / DAY_MS)
}

export default function MachineLogsTab({ logs, loading }) {
  const haptic = useHaptic()
  const [limit, setLimit] = useState(PAGE)

  const mtbf = useMemo(() => computeMtbf(logs), [logs])
  const visible = logs.slice(0, limit)
  const rest = logs.length - visible.length

  if (loading) {
    return (
      <div className="flex flex-col gap-[3vw]" style={{ ...padX, paddingTop: '4vw', paddingBottom: '4vw' }}>
        {[0, 1, 2].map(i => <div key={i} className="h-[88px] rounded-2xl skeleton-shimmer" />)}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <TabEmptyFrame>
        <EmptyState
          icon={<Wrench size={44} style={{ margin: "0 auto" }} className="text-faint" />}
          title="Nessun intervento registrato"
          subtitle="Ogni segnalazione risolta da qui finisce nello storico, con durata e ricambi."
        />
      </TabEmptyFrame>
    )
  }

  return (
    <div>
      <TabHeading>
        Ultimi {logs.length}{mtbf ? ` · MTBF ${mtbf} giorni` : ''}
      </TabHeading>

      {visible.map(log => {
        const { day, month, year } = formatDateParts(log.performed_at)
        const planned = log.type === 'programmata'
        const meta = [
          log.performed_by_name,
          log.duration_minutes ? `${log.duration_minutes} min` : null,
          log.parts_replaced,
        ].filter(Boolean)

        return (
          <div
            key={log.id}
            className="flex items-center gap-[3.5vw] border-t"
            style={{ ...padX, minHeight: 88, borderColor: 'var(--color-border-subtle)' }}
          >
            <div className="w-[54px] shrink-0" style={padRow}>
              <p className="font-mono text-[11px] text-secondary leading-tight">{day} {month}</p>
              <p className="font-mono text-[11px] text-faint leading-tight" style={{ marginTop: 2 }}>{year}</p>
            </div>
            <div
              className="flex-1 min-w-0 border-l"
              style={{ ...padRow, paddingLeft: '3.5vw', borderColor: 'var(--color-border)' }}
            >
              <p className="flex items-start gap-2">
                {planned
                  ? <Shield size={16} className="text-violet-400 shrink-0" style={{ marginTop: 4 }} />
                  : <AlertTriangle size={16} className="text-amber-400 shrink-0" style={{ marginTop: 4 }} />}
                <span className="text-[18px] font-medium text-themed break-words">{log.title}</span>
              </p>
              {log.component?.name && (
                <span className="block" style={{ marginTop: 6 }}>
                  <ComponentPill name={log.component.name} size="sm" />
                </span>
              )}
              {log.description && (
                <p className="text-sm text-muted line-clamp-2" style={{ marginTop: 4 }}>{log.description}</p>
              )}
              {meta.length > 0 && (
                <p className="font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 6 }}>
                  {meta.join(' · ')}
                </p>
              )}
            </div>
          </div>
        )
      })}

      <div className="border-b" style={{ borderColor: 'var(--color-border-subtle)' }} />

      {rest > 0 && (
        <TabActionRow
          label={`Altri ${rest} intervent${rest === 1 ? 'o' : 'i'}`}
          onClick={() => { haptic.light(); setLimit(l => l + PAGE) }}
        />
      )}
    </div>
  )
}
