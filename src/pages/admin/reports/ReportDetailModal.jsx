import { useState } from 'react'
import { db } from '../../../lib/supabase'
import { STATUS, SEVERITY, formatDate, timeAgo } from '../../../lib/constants'
import { Badge } from '../../../components/ui'
import MediaCapture from '../../../components/media/MediaCapture'
import ActivityTimeline from '../../../components/reports/ActivityTimeline'
import ChatPanel from '../../../components/chat/ChatPanel'
import { useToast } from '../../../hooks/useToast'
import {
  X, MessageCircle, Clock, Pencil, Trash2, Save, XCircle,
  AlertTriangle, UserCheck
} from 'lucide-react'

function InfoCard({ label, value, icon }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="text-sm text-themed mt-0.5">{icon ? `${icon} ${value}` : value}</p>
    </div>
  )
}

export default function ReportDetailModal({ selected, user, users, machines, onClose, onUpdate }) {
  const toast = useToast()
  const [detailTab, setDetailTab] = useState('chat')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editMedia, setEditMedia] = useState([])
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const allAssignableUsers = users.filter(u => u.role === 'tecnico' || u.role === 'operatore' || u.role === 'admin')
  const setEdit = (key, val) => setEditForm(f => ({ ...f, [key]: val }))

  const assignUser = async (reportId, userId) => {
    const assignee = users.find(u => u.id === userId)
    await db.updateReport(reportId, {
      assigned_to: userId, assigned_to_name: assignee?.name, status: 'assegnata',
    })
    db.addActivity(reportId, {
      type: 'assigned', detail: `${assignee?.name} (${assignee?.role})`,
      user_id: user?.id, user_name: user?.name,
    }).catch(e => console.warn('Side effect failed:', e.message))

    if (userId && userId !== user?.id) {
      db.addNotification({
        type: 'assigned',
        title: `📋 Segnalazione assegnata a te`,
        body: `${user?.name} ti ha assegnato: "${selected?.title}"`,
        report_id: reportId, from_user: user?.id, target_user: userId,
      }).catch(e => console.warn('Side effect failed:', e.message))
    }

    onUpdate({ assigned_to: userId, assigned_to_name: assignee?.name, status: 'assegnata' })
    toast.success(`Assegnato a ${assignee?.name}`)
  }

  const updateStatus = async (reportId, newStatus) => {
    await db.updateReport(reportId, { status: newStatus })
    db.addActivity(reportId, {
      type: 'status_change', from_status: selected?.status, to_status: newStatus,
      user_id: user?.id, user_name: user?.name,
    }).catch(e => console.warn('Side effect failed:', e.message))
    // Notifica tutti gli stakeholder tranne chi fa il cambio
    const recipients = new Set()
    if (selected?.created_by) recipients.add(selected.created_by)
    if (selected?.assigned_to) recipients.add(selected.assigned_to)
    recipients.delete(user?.id)

    for (const targetId of recipients) {
      db.addNotification({
        type: 'status_change',
        title: `Stato aggiornato: ${selected?.title}`,
        body: `${user?.name} ha cambiato lo stato a "${STATUS[newStatus]?.label || newStatus}"`,
        report_id: reportId, from_user: user?.id, target_user: targetId,
      }).catch(e => console.warn('Side effect failed:', e.message))
    }
    onUpdate({ status: newStatus })
  }

  const startEditing = () => {
    setEditForm({
      title: selected.title || '', description: selected.description || '',
      machine: selected.machine || '', severity: selected.severity || 'media',
    })
    setEditMedia(selected.media || [])
    setEditing(true)
  }

  const cancelEditing = () => { setEditing(false); setEditForm({}); setEditMedia([]) }

  const saveEdit = async () => {
    if (!editForm.title?.trim() || !editForm.description?.trim()) {
      toast.warning('Titolo e descrizione sono obbligatori'); return
    }
    setSaving(true)
    try {
      const updates = {
        title: editForm.title.trim(), description: editForm.description.trim(),
        machine: editForm.machine || null, severity: editForm.severity, media: editMedia,
      }
      const updated = await db.updateReport(selected.id, updates)
      db.addActivity(selected.id, {
        type: 'edited', detail: `Segnalazione modificata da ${user?.name}`,
        user_id: user?.id, user_name: user?.name,
      }).catch(e => console.warn('Side effect failed:', e.message))
      onUpdate(updated)
      setEditing(false)
      toast.success('Segnalazione aggiornata')
    } catch (err) {
      toast.error('Errore salvataggio: ' + err.message)
    }
    setSaving(false)
  }

  const deleteReport = async () => {
    setDeleting(true)
    try {
      await db.deleteReport(selected.id)
      toast.success('Segnalazione eliminata')
      onClose(true)
    } catch (err) {
      toast.error('Errore eliminazione: ' + err.message)
    }
    setDeleting(false)
  }

  const closeDetail = () => { setEditing(false); setShowDeleteConfirm(false); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeDetail}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-surface-1 border border-token rounded-2xl w-full max-w-[95vw] animate-fade-in shadow-2xl overflow-hidden"
        style={{ height: '82vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-token shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Modalità modifica</span>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-bold text-themed truncate">{selected.title}</h2>
                <Badge {...(STATUS[selected.status] || STATUS.aperta)} />
                <Badge {...(SEVERITY[selected.severity] || SEVERITY.media)} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={startEditing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-all">
                <Pencil size={14} /> Modifica
              </button>
            )}
            <button onClick={closeDetail}
              className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-white transition-colors shrink-0">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* 3-column body */}
        <div className="grid grid-cols-12 gap-0" style={{ height: 'calc(82vh - 65px)' }}>

          {/* COL 1: Report Info / Edit Form */}
          <div className="col-span-3 border-r border-token overflow-y-auto p-5 space-y-4">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Titolo *</label>
                  <input type="text" value={editForm.title} onChange={e => setEdit('title', e.target.value)}
                    className="w-full input-field rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Descrizione *</label>
                  <textarea value={editForm.description} onChange={e => setEdit('description', e.target.value)}
                    rows={6} className="w-full input-field rounded-xl px-3 py-2.5 text-sm resize-none" />
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Macchinario</label>
                  <select value={editForm.machine} onChange={e => setEdit('machine', e.target.value)}
                    className="w-full input-field rounded-xl px-3 py-2.5 text-sm">
                    <option value="">Nessuno</option>
                    {machines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Gravità</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(SEVERITY).map(([key, { label, color }]) => (
                      <button key={key} onClick={() => setEdit('severity', key)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${editForm.severity === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                        style={editForm.severity === key ? { background: color } : {}}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Media</label>
                  <MediaCapture media={editMedia} onChange={setEditMedia} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50">
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Salva</>}
                  </button>
                  <button onClick={cancelEditing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                    <XCircle size={14} /> Annulla
                  </button>
                </div>
              </div>
            ) : (
              <>
                {selected.machine && (
                  <div className="bg-surface-2 rounded-xl p-3 flex items-center gap-2">
                    <span className="text-lg">🏭</span>
                    <span className="text-sm text-themed font-medium">{selected.machine}</span>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-faint uppercase tracking-wider mb-1">Descrizione</p>
                  <p className="text-[14px] text-secondary leading-relaxed">{selected.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InfoCard label="Creato da" value={selected.created_by_name || '—'} />
                  <InfoCard label="Data" value={formatDate(selected.created_at)} />
                  {selected.assigned_to_name && <InfoCard label="Assegnato" value={selected.assigned_to_name} icon="🔧" />}
                  <InfoCard label="Aggiornato" value={timeAgo(selected.updated_at || selected.created_at)} />
                </div>
                {selected.media?.length > 0 && (
                  <div>
                    <p className="text-[11px] text-faint uppercase tracking-wider mb-2">Allegati ({selected.media.length})</p>
                    <div className="grid grid-cols-3 gap-2">
                      {selected.media.map((m, i) => (
                        <div key={i} className="aspect-square rounded-xl bg-surface-2 overflow-hidden border border-token flex items-center justify-center">
                          {m.type === 'photo'
                            ? <img src={m.url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-2xl">{m.type === 'video' ? '🎥' : '🎤'}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.extra_data && Object.keys(selected.extra_data).length > 0 && (
                  <div>
                    <p className="text-[11px] text-faint uppercase tracking-wider mb-2">Dati aggiuntivi</p>
                    {Object.entries(selected.extra_data).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-surface-1 rounded-lg px-3 py-2 mb-1">
                        <span className="text-xs text-muted">{k}</span>
                        <span className="text-xs text-white font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-surface-2/20 rounded-xl p-3 space-y-1.5 text-xs text-faint">
                  <p>ID: <span className="text-muted font-mono">{selected.id?.slice(0, 8)}…</span></p>
                  {selected.is_quick && <p>Tipo: <span className="text-amber-400 font-medium">⚡ Quick Report</span></p>}
                </div>
              </>
            )}
          </div>

          {/* COL 2: Chat + Timeline */}
          <div className="col-span-6 border-r border-token flex flex-col overflow-hidden">
            <div className="flex border-b border-token shrink-0">
              <button onClick={() => setDetailTab('chat')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'chat' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5' : 'text-faint hover:text-secondary'}`}>
                <MessageCircle size={16} /> Chat
              </button>
              <button onClick={() => setDetailTab('timeline')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'timeline' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5' : 'text-faint hover:text-secondary'}`}>
                <Clock size={16} /> Cronologia
              </button>
            </div>
            {detailTab === 'chat' ? (
              <ChatPanel reportId={selected.id} user={user} report={selected} variant="desktop" className="flex-1 min-h-0" />
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <ActivityTimeline reportId={selected.id} report={selected} />
              </div>
            )}
          </div>

          {/* COL 3: Actions */}
          <div className="col-span-3 overflow-y-auto p-4 space-y-4">
            <div className="bg-surface-1 rounded-2xl p-4 space-y-3">
              <p className="text-[11px] text-faint uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck size={13} /> Assegna a
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allAssignableUsers.map(u => {
                  const roleIcon = u.role === 'tecnico' ? '🔧' : u.role === 'admin' ? '👔' : '👷'
                  const roleLabel = u.role === 'tecnico' ? 'Tecnico' : u.role === 'admin' ? 'Admin' : 'Operatore'
                  return (
                    <button key={u.id} onClick={() => assignUser(selected.id, u.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${selected.assigned_to === u.id ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-surface-2 hover:bg-surface-2 text-secondary border border-transparent'}`}>
                      <span>{roleIcon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block truncate">{u.name}</span>
                        <span className="text-[10px] text-faint">{roleLabel}</span>
                      </div>
                      {selected.assigned_to === u.id && (
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-emerald-400 shrink-0">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      )}
                    </button>
                  )
                })}
                {allAssignableUsers.length === 0 && <p className="text-sm text-faint text-center py-3">Nessun utente registrato</p>}
              </div>
            </div>

            <div className="bg-surface-1 rounded-2xl p-4 space-y-3">
              <p className="text-[11px] text-faint uppercase tracking-wider">Cambia Stato</p>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(STATUS).map(([key, { label, color }]) => (
                  <button key={key} onClick={() => updateStatus(selected.id, key)}
                    className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${selected.status === key ? 'text-white' : 'bg-surface-2 text-muted hover:text-white'}`}
                    style={selected.status === key ? { background: color } : {}}>
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-surface-1 rounded-2xl p-4">
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all">
                  <Trash2 size={14} /> Elimina segnalazione
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-bold">Conferma eliminazione</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Stai per eliminare "{selected.title}". Tutti i messaggi, allegati e la cronologia verranno rimossi. Questa azione è irreversibile.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={deleteReport} disabled={deleting}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-50">
                      {deleting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Trash2 size={14} /> Elimina</>}
                    </button>
                    <button onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
