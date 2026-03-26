import { useState, useEffect, useMemo } from 'react'
import { useDraggable } from '../../../hooks/useDraggable'
import { db } from '../../../lib/supabase'
import { STATUS, SEVERITY, timeAgo } from '../../../lib/constants'
import { Badge } from '../../../components/ui'
import ReportDetailModal from '../reports/ReportDetailModal'
import {
  X, Wrench, Pencil, Save, XCircle, Phone, Mail, User,
  ChevronRight, Filter, CheckCircle, Clock, AlertTriangle, Printer
} from 'lucide-react'

export default function TechnicianDetailSheet({ tech, reports, users, machines, user, onClose, onUpdate }) {
  const { position, dragProps } = useDraggable()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: tech.name, email: tech.email, phone: tech.phone || '' })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Reset form when tech changes
  useEffect(() => {
    setEditForm({ name: tech.name, email: tech.email, phone: tech.phone || '' })
    setEditing(false)
  }, [tech.id, tech.name, tech.email, tech.phone])

  const techReports = useMemo(() =>
    reports.filter(r => r.assigned_to === tech.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [reports, tech.id]
  )

  const filtered = statusFilter
    ? techReports.filter(r => r.status === statusFilter)
    : techReports

  const stats = useMemo(() => {
    const total = techReports.length
    const resolved = techReports.filter(r => r.status === 'risolta').length
    const inProgress = techReports.filter(r => r.status === 'in_lavorazione').length
    const pending = techReports.filter(r => r.status === 'assegnata').length
    return { total, resolved, inProgress, pending, rate: total > 0 ? Math.round((resolved / total) * 100) : 0 }
  }, [techReports])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await db.updateUser(tech.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
      })
      onUpdate(updated)
      setEditing(false)
    } catch (e) {
      console.error('Errore salvataggio:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditForm({ name: tech.name, email: tech.email, phone: tech.phone || '' })
    setEditing(false)
  }

  const handlePrintChecklist = () => {
    const rows = filtered.map(r => {
      const st = STATUS[r.status] || {}
      const sev = SEVERITY[r.severity] || {}
      const done = r.status === 'risolta'
      return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">
            <input type="checkbox" ${done ? 'checked' : ''} style="width:16px;height:16px;" />
          </td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${r.title}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${st.label || r.status}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${sev.label || r.severity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.machine || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '—'}</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><title>Checklist - ${tech.name}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1f2937; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
        .stats { display: flex; gap: 24px; margin-bottom: 24px; }
        .stat { text-align: center; }
        .stat-value { font-size: 20px; font-weight: 700; }
        .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { text-align: left; padding: 8px 10px; background: #f3f4f6; border-bottom: 2px solid #d1d5db; font-size: 12px; text-transform: uppercase; color: #6b7280; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <h1>Checklist Segnalazioni — ${tech.name}</h1>
      <p class="subtitle">${tech.email}${tech.phone ? ' · ' + tech.phone : ''} · Stampata il ${new Date().toLocaleDateString('it-IT')}</p>
      <div class="stats">
        <div class="stat"><div class="stat-value">${stats.total}</div><div class="stat-label">Totali</div></div>
        <div class="stat"><div class="stat-value">${stats.pending}</div><div class="stat-label">In attesa</div></div>
        <div class="stat"><div class="stat-value">${stats.inProgress}</div><div class="stat-label">In corso</div></div>
        <div class="stat"><div class="stat-value">${stats.resolved}</div><div class="stat-label">Risolte</div></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:40px;">✓</th><th>Segnalazione</th><th>Stato</th><th>Severità</th><th>Macchinario</th><th>Data</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af;">Nessuna segnalazione</td></tr>'}</tbody>
      </table>
    </body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const rateColor = stats.rate > 70 ? '#22c55e' : stats.rate > 40 ? '#f59e0b' : '#ef4444'

  const statusFilters = [
    { key: null, label: 'Tutte', count: techReports.length },
    { key: 'assegnata', label: 'Assegnate', count: stats.pending, color: STATUS.assegnata.color },
    { key: 'in_lavorazione', label: 'In Corso', count: stats.inProgress, color: STATUS.in_lavorazione.color },
    { key: 'risolta', label: 'Risolte', count: stats.resolved, color: STATUS.risolta.color },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden"
          style={{ height: '85vh', transform: `translate(${position.x}px, ${position.y}px)` }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header — drag handle */}
          <div {...dragProps} className="flex items-center justify-between px-6 py-4 border-b border-token"
            style={{ ...dragProps.style }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                <Wrench size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-themed">{tech.name}</h2>
                <p className="text-sm text-faint">Tecnico</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handlePrintChecklist} title="Stampa checklist" className="p-2 rounded-xl hover:bg-white/10 text-muted hover:text-themed transition-colors">
                <Printer size={18} />
              </button>
              {!editing && (
                <button onClick={() => setEditing(true)} className="p-2 rounded-xl hover:bg-white/10 text-muted hover:text-themed transition-colors">
                  <Pencil size={18} />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-muted hover:text-themed transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-12 h-[calc(85vh-65px)]">
            {/* Sidebar */}
            <div className="col-span-3 border-r border-token p-5 overflow-y-auto space-y-5">
              {/* Avatar */}
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-emerald-500/15 rounded-2xl flex items-center justify-center">
                  <Wrench size={36} className="text-emerald-400" />
                </div>
              </div>

              {/* Anagrafica */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-faint uppercase tracking-wider">Anagrafica</h3>

                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-faint block mb-1">Nome</label>
                      <input
                        type="text" value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full bg-surface-2 border border-token rounded-lg px-3 py-2 text-sm text-themed focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-faint block mb-1">Email</label>
                      <input
                        type="email" value={editForm.email}
                        onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full bg-surface-2 border border-token rounded-lg px-3 py-2 text-sm text-themed focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-faint block mb-1">Telefono</label>
                      <input
                        type="tel" value={editForm.phone}
                        onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="es. +39 333 1234567"
                        className="w-full bg-surface-2 border border-token rounded-lg px-3 py-2 text-sm text-themed focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave} disabled={saving || !editForm.name.trim() || !editForm.email.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                      >
                        <Save size={14} /> {saving ? 'Salvo...' : 'Salva'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-1.5 bg-surface-2 hover:bg-surface-3 text-muted text-sm font-bold rounded-lg px-3 py-2 transition-colors"
                      >
                        <XCircle size={14} /> Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <InfoRow icon={<User size={14} />} label="Nome" value={tech.name} />
                    <InfoRow icon={<Mail size={14} />} label="Email" value={tech.email} />
                    <InfoRow icon={<Phone size={14} />} label="Telefono" value={tech.phone || '—'} />
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-faint uppercase tracking-wider">Statistiche</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Totali', value: stats.total, color: '#94a3b8' },
                    { label: 'Attesa', value: stats.pending, color: '#7c6aff' },
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
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stats.rate}%`, background: rateColor }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="col-span-9 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="px-5 py-3 border-b border-token flex items-center gap-2">
                <Filter size={16} className="text-faint" />
                {statusFilters.map(f => (
                  <button
                    key={f.label}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFilter === f.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface-2 text-muted hover:text-themed hover:bg-surface-3'
                    }`}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>

              {/* Reports List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <ClipboardEmpty size={48} className="text-faint mb-3" />
                    <p className="text-muted font-medium">Nessuna segnalazione {statusFilter ? 'con questo stato' : 'assegnata'}</p>
                  </div>
                ) : (
                  filtered.map(report => {
                    const sev = SEVERITY[report.severity] || {}
                    const st = STATUS[report.status] || {}
                    return (
                      <div
                        key={report.id}
                        onClick={() => setSelectedReport(report)}
                        className="group bg-surface-2 hover:bg-surface-3 border border-token hover:border-emerald-500/40 rounded-xl p-4 cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <h4 className="text-sm font-bold text-themed truncate">{report.title}</h4>
                            </div>
                            {report.description && (
                              <p className="text-xs text-muted line-clamp-2 mb-2">{report.description}</p>
                            )}
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge label={st.label || report.status} color={st.color || '#94a3b8'} bg={st.bg} />
                              <Badge label={sev.label || report.severity} color={sev.color || '#94a3b8'} bg={sev.bg} />
                              {report.machine && (
                                <span className="text-xs text-faint">🏭 {report.machine}</span>
                              )}
                              <span className="text-xs text-faint">
                                <Clock size={11} className="inline mr-1" />
                                {timeAgo(report.created_at)}
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-faint group-hover:text-emerald-400 transition-colors mt-1 shrink-0" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Report Detail */}
      {selectedReport && (
        <ReportDetailModal
          selected={selectedReport}
          user={user}
          users={users}
          machines={machines}
          onClose={() => setSelectedReport(null)}
          onUpdate={() => {
            setSelectedReport(null)
            if (onUpdate) onUpdate(tech)
          }}
        />
      )}
    </>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5 flex items-center gap-2.5">
      <span className="text-faint">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-faint uppercase">{label}</p>
        <p className="text-sm text-themed truncate">{value}</p>
      </div>
    </div>
  )
}

function ClipboardEmpty({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    </svg>
  )
}
