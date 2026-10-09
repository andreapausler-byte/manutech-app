/**
 * LogTable — gli interventi registrati, dal più recente: l'archivio delle
 * manutenzioni fatte. Un clic apre l'intervento (MaintenanceLogModal) per
 * leggerlo o aggiornarlo. Note e allegati si leggono da lib/maintenanceLog
 * e lib/logMedia, come ovunque.
 */

import { StickyNote } from 'lucide-react'
import { Avatar, Pill } from '../../../components/manutech'
import ComponentPill from '../../../components/machines/ComponentPill'
import LogAttachmentsList from '../../../components/machines/LogAttachmentsList'
import { formatDay, formatTime } from '../../../lib/constants'
import { formatMinutes, getLogRecord } from '../../../lib/maintenanceLog'
import { EmptyBox } from './MaintenanceBits'
import { MONO, monoLabel, ellipsis } from './planUi'

const COLS = '112px 130px minmax(0,1.6fr) minmax(0,1fr) minmax(0,0.9fr) 76px minmax(0,1fr)'

export default function LogTable({ logs, limit, onMore, onOpen, empty }) {
  if (!logs.length) return <EmptyBox text={empty.text} hint={empty.hint} />
  const rest = logs.length - limit

  return (
    <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: COLS, gap: 14, padding: '10px 16px',
        background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)', ...monoLabel,
      }}>
        <span>Data</span><span>Tipo</span><span>Intervento</span><span>Macchinario</span>
        <span>Eseguito da</span><span>Durata</span><span>Ricambi</span>
      </div>

      {logs.slice(0, limit).map(log => {
        const notes = getLogRecord(log).notes.length
        const planned = log.type === 'programmata'
        return (
          <div key={log.id} onClick={() => onOpen(log)} className="transition-colors hover:bg-white/[0.03]" style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 14, alignItems: 'center',
            padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
          }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{formatDay(log.performed_at)}</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-faint)' }}>{formatTime(log.performed_at)}</div>
            </div>

            <div><Pill tone={planned ? 'green' : 'amber'} size="sm">{planned ? 'Programmata' : 'Straordinaria'}</Pill></div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text)', ...ellipsis }}>{log.title}</div>
              {log.description && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, ...ellipsis }}>{log.description}</div>
              )}
              {(notes > 0 || log.is_external) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {log.is_external && <span>Ditta: {log.contractor_name || 'esterna'}</span>}
                  {notes > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <StickyNote size={12} /> {notes} {notes === 1 ? 'nota' : 'note'} dopo
                    </span>
                  )}
                </div>
              )}
              <LogAttachmentsList log={log} style={{ marginTop: 6 }} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', ...ellipsis }}>{log.machine?.name || '—'}</div>
              {log.component?.name && <ComponentPill name={log.component.name} size="xs" style={{ marginTop: 4 }} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {log.performed_by_name ? (
                <>
                  <Avatar name={log.performed_by_name} size={20} />
                  <span style={{ fontSize: 13, color: 'var(--color-text)', ...ellipsis }}>{log.performed_by_name}</span>
                </>
              ) : <span style={{ color: 'var(--color-text-faint)' }}>—</span>}
            </div>

            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {formatMinutes(log.duration_minutes) || '—'}
            </span>

            <span style={{ fontSize: 12, color: log.parts_replaced ? 'var(--color-text)' : 'var(--color-text-faint)', ...ellipsis }}>
              {log.parts_replaced || '—'}
            </span>
          </div>
        )
      })}

      {rest > 0 && (
        <button type="button" onClick={onMore} className="transition-colors hover:bg-white/[0.03]" style={{
          width: '100%', padding: '12px 0', cursor: 'pointer', background: 'transparent', border: 'none',
          fontFamily: MONO, fontSize: 12, letterSpacing: 0.5, color: 'var(--color-text-muted)',
        }}>
          MOSTRA ALTRI {Math.min(50, rest)} DI {rest}
        </button>
      )}
    </div>
  )
}
