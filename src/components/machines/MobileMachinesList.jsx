/**
 * MobileMachinesList — Lista macchinari per operatori
 * 
 * Design: lista semplice, bottoni grandi, glove-friendly
 * Ogni card mostra: nome, reparto, semaforo manutenzione, segnalazioni attive
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { SkeletonReportsPage, EmptyState } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, ChevronRight, Cog, Factory, AlertTriangle, CheckCircle, X } from 'lucide-react'

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
    <div ref={pullRef} className="px-[4vw] pt-0 pb-4 space-y-[3vw]">
      <PullToRefreshIndicator pullDistance={pullDistance} pullProgress={pullProgress} refreshing={refreshing} activated={activated} />

      {/* Search */}
      <div className="relative">
        <Search size={22} className="absolute left-[4vw] top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="text"
          placeholder="Cerca macchinario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface-2 border border-token rounded-2xl pl-[12vw] pr-[12vw] py-[3.5vw] text-lg text-themed placeholder-current opacity-40 focus:outline-none focus:border-current"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-[3vw] top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-surface-3 text-secondary">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-sm text-faint px-1">{filtered.length} macchinari</p>

      {/* List */}
      {loading ? <SkeletonReportsPage /> : filtered.length === 0 ? (
        <EmptyState icon="⚙️" title="Nessun macchinario" subtitle="I macchinari vengono configurati dall'admin" />
      ) : (
        <div className="space-y-[2.5vw]">
          {filtered.map((m) => {
            const activeReports = getActiveReports(m.name)
            return (
              <button
                key={m.id}
                onClick={() => onSelectMachine(m)}
                className="w-full text-left flex items-center gap-[3.5vw] card-interactive rounded-2xl px-[4vw] py-[4vw] active:bg-surface-2 transition-colors press-scale"
              >
                {/* Machine icon / photo */}
                {m.photo_url ? (
                  <div className="w-[14vw] h-[14vw] max-w-14 max-h-14 rounded-xl overflow-hidden border border-token shrink-0">
                    <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-[14vw] h-[14vw] max-w-14 max-h-14 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                    <Cog size={24} className="text-blue-400" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-themed truncate">{m.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {m.department && (
                      <span className="text-sm text-muted truncate">{m.department}</span>
                    )}
                    {m.manufacturer && (
                      <span className="text-sm text-faint truncate">{m.manufacturer}</span>
                    )}
                  </div>
                </div>

                {/* Right side — status indicators */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeReports > 0 && (
                    <span className="min-w-[28px] h-[28px] bg-amber-500/20 rounded-full text-xs font-bold text-amber-400 flex items-center justify-center px-1.5">
                      {activeReports}
                    </span>
                  )}
                  <ChevronRight size={22} className="text-faint" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
