import { useState, useEffect } from 'react'
import { db } from '../../lib/supabase'
import { STATUS } from '../../lib/constants'
import { useAuth } from '../../contexts/AuthContext'
import { EmptyState, Spinner } from '../../components/ui'
import { Wrench, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import TechnicianDetailSheet from './technicians/TechnicianDetailSheet'

export default function AdminTechnicians() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [reports, setReports] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTech, setSelectedTech] = useState(null)

  const load = () => {
    Promise.all([db.getUsers(), db.getReports(), db.getMachines()]).then(([u, r, m]) => {
      setUsers(u); setReports(r); setMachines(m); setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const tecnici = users.filter(u => u.role === 'tecnico')

  const getTechStats = (techId) => {
    const assigned = reports.filter(r => r.assigned_to === techId)
    const resolved = assigned.filter(r => r.status === 'risolta')
    const inProgress = assigned.filter(r => r.status === 'in_lavorazione')
    const pending = assigned.filter(r => r.status === 'assegnata')
    return {
      total: assigned.length, resolved: resolved.length,
      inProgress: inProgress.length, pending: pending.length,
      rate: assigned.length > 0 ? Math.round((resolved.length / assigned.length) * 100) : 0,
    }
  }

  if (loading) return <Spinner />

  // Team summary
  const totalAssigned = reports.filter(r => r.assigned_to).length
  const totalResolved = reports.filter(r => r.assigned_to && r.status === 'risolta').length
  const teamRate = totalAssigned > 0 ? Math.round((totalResolved / totalAssigned) * 100) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Team Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tecnici', value: tecnici.length, icon: Wrench, color: '#22c55e' },
          { label: 'Segnalazioni Assegnate', value: totalAssigned, icon: ClipboardList, color: '#3b82f6' },
          { label: 'Risolte dal Team', value: totalResolved, icon: CheckCircle, color: '#22c55e' },
          { label: 'Efficienza Team', value: `${teamRate}%`, icon: TrendingUp, color: teamRate > 60 ? '#22c55e' : '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-elevated rounded-2xl p-5">
            <Icon size={20} style={{ color }} className="mb-3" />
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-sm text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {tecnici.length === 0 ? (
        <EmptyState icon="🔧" title="Nessun tecnico" subtitle="Aggiungi tecnici dalla sezione Utenti" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 stagger-children">
          {tecnici.map(tech => {
            const stats = getTechStats(tech.id)
            const rateColor = stats.rate > 70 ? '#22c55e' : stats.rate > 40 ? '#f59e0b' : '#ef4444'
            return (
              <div key={tech.id} className="card-elevated rounded-2xl p-6 hover:border-token transition-all cursor-pointer" onClick={() => setSelectedTech(tech)}>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                    <Wrench size={22} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-themed">{tech.name}</h3>
                    <p className="text-sm text-faint">{tech.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-5">
                  {[
                    { label: 'Totali', value: stats.total, color: '#94a3b8' },
                    { label: 'Attesa', value: stats.pending, color: '#3b82f6' },
                    { label: 'In corso', value: stats.inProgress, color: '#a855f7' },
                    { label: 'Risolte', value: stats.resolved, color: '#22c55e' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-surface-2 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-faint uppercase mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted">Efficienza</span>
                    <span className="font-bold" style={{ color: rateColor }}>{stats.rate}%</span>
                  </div>
                  <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stats.rate}%`, background: rateColor }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedTech && (
        <TechnicianDetailSheet
          tech={selectedTech}
          reports={reports}
          users={users}
          machines={machines}
          user={user}
          onClose={() => setSelectedTech(null)}
          onUpdate={(updated) => {
            setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u))
            setSelectedTech(prev => ({ ...prev, ...updated }))
          }}
        />
      )}
    </div>
  )
}

function ClipboardList({ size, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>
    </svg>
  )
}
