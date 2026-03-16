/**
 * MobileMachinesList — Lista macchinari
 * Design System: card macchina con status chip, codice JetBrains Mono
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { SkeletonReportsPage, EmptyState } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X } from 'lucide-react'

const MACHINE_STATUS = {
  operativa: { label: 'Operativa', color: 'var(--color-green)', bg: 'var(--color-green-bg)' },
  in_manutenzione: { label: 'In Manutenzione', color: 'var(--color-orange)', bg: 'var(--color-orange-bg)' },
  ferma: { label: 'Ferma', color: 'var(--color-red)', bg: 'var(--color-red-bg)' },
  dismessa: { label: 'Dismessa', color: 'var(--color-text-muted)', bg: 'var(--color-surface-3)' },
}

function MachineStatusChip({ status }) {
  const s = MACHINE_STATUS[status] || MACHINE_STATUS.operativa
  return (
    <span style={{
      fontSize: 12, padding: '3px 8px', borderRadius: 6, fontWeight: 500,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export default function MobileMachinesList({ onSelectMachine }) {
  const [machines, setMachines] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, r] = await Promise.all([db.getMachines(), db.getReports()])
      setMachines(m)
      setReports(r)
    } catch {}
    setLoading(false)
  }, [])

  const handleRefresh = useCallback(async () => {
    const [m, r] = await Promise.all([db.getMachines(), db.getReports()])
    setMachines(m)
    setReports(r)
  }, [])

  const { pullRef, refreshing, pullDistance, pullProgress, activated } = usePullToRefresh(handleRefresh)

  useEffect(() => { load() }, [load])

  const filtered = machines.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.name?.toLowerCase().includes(q) || m.department?.toLowerCase().includes(q) || m.manufacturer?.toLowerCase().includes(q)
  })

  const getActiveReports = (machineName) => reports.filter(r => r.machine === machineName && r.status !== 'risolta').length

  return (
    <div ref={pullRef} style={{ padding: '0 16px 16px' }}>
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />

      {/* Search */}
      <div className="relative" style={{ marginBottom: 12 }}>
        <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          placeholder="Cerca macchinario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: '10px 36px 10px 36px', fontSize: 14,
            color: 'var(--color-text)', outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: 12, background: 'var(--color-surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-secondary)',
          }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? <SkeletonReportsPage /> : filtered.length === 0 ? (
        <EmptyState icon="⚙️" title="Nessun macchinario" subtitle="I macchinari vengono configurati dall'admin" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m) => {
            const activeReports = getActiveReports(m.name)
            return (
              <button
                key={m.id}
                onClick={() => onSelectMachine(m)}
                className="press-scale"
                style={{
                  width: '100%', textAlign: 'left',
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12, padding: 14, cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-card-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-card)' }}
              >
                {/* Riga 1: nome + codice a sinistra, status chip a destra */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name}
                    </span>
                    {m.code && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                        {m.code}
                      </span>
                    )}
                  </div>
                  <MachineStatusChip status={m.status || 'operativa'} />
                </div>
                {/* Riga 2: area + produttore */}
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {m.department && <span>{m.department}</span>}
                  {m.department && m.manufacturer && ' · '}
                  {m.manufacturer && <span>{m.manufacturer}</span>}
                </div>
                {/* Riga 3: ticket aperti + prossima manutenzione */}
                {activeReports > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--color-orange)', marginTop: 4 }}>
                    ⚠ {activeReports} ticket aperti
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
