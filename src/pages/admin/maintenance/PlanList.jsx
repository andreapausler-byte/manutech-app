/**
 * PlanList — i piani di manutenzione come lista, dal più urgente.
 *
 * Senza filtro di stato i piani sono divisi in Scadute / In scadenza /
 * In regola. La riga apre il pannello del piano; "Ultimo" apre l'ultima
 * esecuzione (cosa è stato fatto), "+ Assegna" il modulo del piano.
 */

import { Avatar } from '../../../components/manutech'
import ComponentPill from '../../../components/machines/ComponentPill'
import { formatDay, timeAgo } from '../../../lib/constants'
import { CycleBar, EmptyBox } from './MaintenanceBits'
import { MONO, TONES, STATUS_GROUPS, cyclePercent, monoLabel, ellipsis } from './planUi'

const COLS = '136px minmax(0,1.7fr) minmax(0,1fr) 44px minmax(0,0.9fr) 100px 100px'

export default function PlanList({ tasks, grouped, selectedId, onSelect, onOpenLog, onAssign, empty }) {
  if (!tasks.length) return <EmptyBox text={empty.text} hint={empty.hint} />

  const groups = grouped
    ? STATUS_GROUPS
      .map(g => ({ ...g, items: tasks.filter(t => t.light.status === g.id) }))
      .filter(g => g.items.length)
    : [{ id: 'all', label: null, items: tasks }]

  return (
    <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '10px 16px',
        background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)', ...monoLabel,
      }}>
        <span>Scadenza</span><span>Attività</span><span>Macchinario</span><span>Ogni</span>
        <span>Responsabile</span><span>Ultimo</span><span />
      </div>

      {groups.map(g => (
        <div key={g.id}>
          {g.label && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
              background: 'var(--color-app-bg)', borderBottom: '1px solid var(--color-border)',
            }}>
              <span style={{ width: 6, height: 6, background: TONES[g.id].color }} />
              <span style={{ ...monoLabel, color: TONES[g.id].color }}>{g.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-faint)' }}>{g.items.length}</span>
            </div>
          )}
          {g.items.map(task => (
            <PlanRow
              key={task.plan.id}
              task={task}
              selected={selectedId === task.plan.id}
              onSelect={() => onSelect(task.plan.id)}
              onOpenLog={() => onOpenLog(task)}
              onAssign={() => onAssign(task.plan)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function PlanRow({ task, selected, onSelect, onOpenLog, onAssign }) {
  const { plan, machine, lastLog, light } = task
  const tone = TONES[light.status]
  const urgent = light.status !== 'ok'
  const inProgress = plan.current_status === 'in_corso'
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }

  return (
    <div
      onClick={onSelect}
      className={selected ? undefined : 'transition-colors hover:bg-white/[0.03]'}
      style={{
        display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center',
        padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
        background: selected ? 'var(--color-surface-2)' : undefined,
      }}
    >
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: tone.color, whiteSpace: 'nowrap' }}>
          {light.label}
        </div>
        <CycleBar percent={cyclePercent(task)} color={tone.color} style={{ marginTop: 6 }} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text)', ...ellipsis }}>{plan.name}</div>
        {(inProgress || plan.component?.name || plan.instructions) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 3 }}>
            {inProgress && (
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                ● IN CORSO{plan.taken_by_name ? ` · ${plan.taken_by_name.toUpperCase()}` : ''}
              </span>
            )}
            {plan.component?.name && <ComponentPill name={plan.component.name} size="xs" />}
            {plan.instructions && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', ...ellipsis }}>{plan.instructions}</span>
            )}
          </div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text)', ...ellipsis }}>{machine.name}</div>
        {machine.department && (
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
            color: 'var(--color-text-faint)', marginTop: 2, ...ellipsis,
          }}>{machine.department}</div>
        )}
      </div>

      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)' }}>{plan.frequency_days}g</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {plan.assigned_to_name ? (
          <>
            <Avatar name={plan.assigned_to_name} size={22} />
            <span style={{ fontSize: 13, color: 'var(--color-text)', ...ellipsis }}>{plan.assigned_to_name}</span>
          </>
        ) : (
          <button type="button" onClick={stop(onAssign)} title="Scegli chi è responsabile del piano" style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: 'var(--color-warning)',
          }}>+ ASSEGNA</button>
        )}
      </div>

      {lastLog ? (
        <button type="button" onClick={stop(onOpenLog)}
          title={`${timeAgo(lastLog.performed_at)} · apri l'ultima esecuzione: cosa è stato fatto`}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
            fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
            textDecoration: 'underline dotted', textUnderlineOffset: 4,
          }}>{formatDay(lastLog.performed_at)}</button>
      ) : (
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-faint)' }}>Mai</span>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={stop(onSelect)} style={{
          padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          background: urgent ? 'var(--color-primary-dark)' : 'transparent',
          color: urgent ? '#fff' : 'var(--color-text-muted)',
          border: `1px solid ${urgent ? 'var(--color-primary)' : 'var(--color-border)'}`,
          fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
        }}>{urgent ? '✓ REGISTRA' : 'DETTAGLI'}</button>
      </div>
    </div>
  )
}
