/**
 * MobileMachinesList — Lista macchinari
 * Design System: card macchina con status chip, codice JetBrains Mono
 */

import { useState, useEffect, useCallback } from 'react'
import { db } from '../../lib/supabase'
import { SkeletonReportsPage, EmptyState } from '../ui'
import PullToRefreshIndicator from '../ui/PullToRefreshIndicator'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import { Search, X, Save, Cog } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

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

const emptyMachineForm = { name: '', department: '', manufacturer: '', model: '', year: '', notes: '' }

export default function MobileMachinesList({ onSelectMachine, showNewMachine, onCloseNewMachine }) {
  const [machines, setMachines] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [machineForm, setMachineForm] = useState(emptyMachineForm)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const haptic = useHaptic()

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

  const handleSaveMachine = async () => {
    if (!machineForm.name.trim()) return
    setSaving(true)
    try {
      await db.createMachine({
        name: machineForm.name.trim(),
        department: machineForm.department.trim() || null,
        manufacturer: machineForm.manufacturer.trim() || null,
        model: machineForm.model.trim() || null,
        year: machineForm.year ? parseInt(machineForm.year) : null,
        notes: machineForm.notes.trim() || null,
        status: 'operativa',
        sort_order: machines.length + 1,
      })
      haptic.success()
      toast.success('Macchinario aggiunto!')
      setMachineForm(emptyMachineForm)
      onCloseNewMachine()
      await load()
    } catch (e) {
      toast.error('Errore: ' + e.message)
    }
    setSaving(false)
  }

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

      {/* ═══ MODAL — Nuovo macchinario ═══ */}
      {showNewMachine && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCloseNewMachine}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-surface-1 border-t border-token rounded-t-3xl animate-slide-up safe-area-bottom overflow-y-auto"
            style={{ maxHeight: '85vh', padding: '20px 5vw 32px' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)', margin: '0 auto 20px' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: '#22c55e18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Cog size={22} style={{ color: '#22c55e' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Nuovo Macchinario</h3>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aggiungi un macchinario all'impianto</p>
              </div>
            </div>

            {/* Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Nome macchinario *</label>
                <input value={machineForm.name} onChange={e => setMachineForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="es. Pressa idraulica #3" className="w-full input-field"
                  style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Reparto</label>
                  <input value={machineForm.department} onChange={e => setMachineForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="es. Linea 1" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Produttore</label>
                  <input value={machineForm.manufacturer} onChange={e => setMachineForm(f => ({ ...f, manufacturer: e.target.value }))}
                    placeholder="es. Siemens" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Modello</label>
                  <input value={machineForm.model} onChange={e => setMachineForm(f => ({ ...f, model: e.target.value }))}
                    placeholder="es. XR-500" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Anno</label>
                  <input type="number" value={machineForm.year} onChange={e => setMachineForm(f => ({ ...f, year: e.target.value }))}
                    placeholder="es. 2024" className="w-full input-field"
                    style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15 }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Note</label>
                <textarea value={machineForm.notes} onChange={e => setMachineForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Note aggiuntive..." className="w-full input-field"
                  style={{ borderRadius: 14, padding: '14px 16px', fontSize: 15, resize: 'none' }} rows={2} />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={handleSaveMachine} disabled={saving || !machineForm.name.trim()}
                className="press-scale"
                style={{
                  flex: 1, padding: '16px 0', borderRadius: 16,
                  fontSize: 16, fontWeight: 700, color: '#fff',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                  opacity: saving || !machineForm.name.trim() ? 0.5 : 1,
                }}>
                {saving
                  ? <div style={{ width: 22, height: 22, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  : <><Save size={20} /> Aggiungi Macchinario</>}
              </button>
              <button onClick={() => { setMachineForm(emptyMachineForm); onCloseNewMachine() }}
                style={{
                  width: '30%', padding: '16px 0', borderRadius: 16,
                  fontSize: 16, fontWeight: 700, background: 'var(--color-surface-2)',
                  color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer',
                }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
