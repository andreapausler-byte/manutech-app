import { useState, useEffect, Fragment } from 'react'
import { useDraggable } from '../../../hooks/useDraggable'
import { db } from '../../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, formatDate, timeAgo, formatTicketId, isTerminalStatus } from '../../../lib/constants'
import { Badge, TicketIdBadge } from '../../../components/ui'
import { useMergeSegnalazione } from '../../../hooks/useMergeSegnalazione'
import MediaCapture from '../../../components/media/MediaCapture'
import MediaLightbox from '../../../components/media/MediaLightbox'
import ActivityTimeline from '../../../components/reports/ActivityTimeline'
import ChatPanel from '../../../components/chat/ChatPanel'
import AssistantChat from '../../../components/assistant/AssistantChat'
import DemoBanner from '../../../components/assistant/DemoBanner'
import { isAssistantAvailable } from '../../../lib/assistant'
import { useToast } from '../../../hooks/useToast'
import InterventionsForReport from '../../../components/interventions/InterventionsForReport'
import MergeReportModal from './MergeReportModal'
import ShareReportSheet from '../../../components/reports/ShareReportSheet'
import ComponentPill from '../../../components/machines/ComponentPill'
import {
  X, MessageCircle, Clock, Pencil, Trash2, Save, XCircle, Share2,
  AlertTriangle, UserCheck, Sparkles, GitMerge, Link2, Unlink, ChevronRight
} from 'lucide-react'

function InfoCard({ label, value, icon }) {
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="text-sm text-themed mt-0.5">{icon ? `${icon} ${value}` : value}</p>
    </div>
  )
}

export default function ReportDetailModal({ selected, user, users, machines, allReports = [], onClose, onUpdate, onRequestMerge, onOpenReport }) {
  const toast = useToast()
  const { unmerge, isLoading: mergeLoading } = useMergeSegnalazione()
  const { position, dragging, dragProps } = useDraggable()
  const [detailTab, setDetailTab] = useState('chat')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editMedia, setEditMedia] = useState([])
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showClosureForm, setShowClosureForm] = useState(false)
  const [closureForm, setClosureForm] = useState({ hours: '', parts: '', rootCause: '', action: '', componentId: null })
  const [closureSaving, setClosureSaving] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [components, setComponents] = useState([])
  const [componentSaving, setComponentSaving] = useState(false)

  const photos = (selected.media || []).filter(m => m.type === 'photo')

  // ── Merge duplicati (mig 058) ──
  const [masterFetched, setMasterFetched] = useState(null)
  const [confirmUnmerge, setConfirmUnmerge] = useState(false)
  // Fallback quando il parent non gestisce il merge (onRequestMerge assente,
  // es. dettaglio aperto da AdminMachines o dalla scheda tecnico): il modal
  // "Unisci a…" viene aperto e gestito direttamente da qui. Senza questo,
  // il bottone non faceva nulla in quelle pagine.
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const isDuplicate = !!selected.duplicate_of_id
  const roleOk = ['tecnico', 'admin', 'super_admin'].includes(user?.role)
  // I pezzi della macchina del ticket. `machine_id` manca sui ticket
  // vecchi: si ricade sullo snapshot testuale `machine`.
  const machineId = selected.machine_id
    || machines.find(m => m.name === selected.machine)?.id
    || null
  const masterFromList = allReports.find(r => r.id === selected.duplicate_of_id)
  const master = masterFromList
    || (masterFetched && masterFetched.id === selected.duplicate_of_id ? masterFetched : null)
  const children = allReports.filter(r => r.duplicate_of_id === selected.id)
  const canMerge = roleOk && !isDuplicate && children.length === 0 && !isTerminalStatus(selected.status)

  // Se la master non è nel set già caricato (es. deep-link al duplicato), falla
  // fetch una volta sola per popolare il banner.
  useEffect(() => {
    let alive = true
    if (selected.duplicate_of_id && !allReports.some(r => r.id === selected.duplicate_of_id)) {
      db.getReport(selected.duplicate_of_id).then(r => { if (alive && r) setMasterFetched(r) }).catch(() => {})
    }
    return () => { alive = false }
  }, [selected.duplicate_of_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnmerge = async () => {
    try {
      const updated = await unmerge(selected.id)
      setConfirmUnmerge(false)
      onUpdate(updated)
    } catch { /* toast già mostrato dall'hook */ }
  }

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

  const handleStatusClick = (reportId, newStatus) => {
    if (newStatus === 'risolta' && selected?.status !== 'risolta') {
      setShowClosureForm(true)
      return
    }
    if (newStatus === 'chiuso' && selected?.status !== 'chiuso') {
      setConfirmClose(true)
      return
    }
    updateStatus(reportId, newStatus)
  }

  const handleConfirmClose = async () => {
    await updateStatus(selected.id, 'chiuso')
    setConfirmClose(false)
  }

  const submitClosure = async () => {
    if (!closureForm.hours || !closureForm.rootCause.trim()) {
      toast.warning('Compila ore lavoro e causa radice')
      return
    }
    setClosureSaving(true)
    const closureComponentId = closureForm.componentId === null
      ? (selected.component_id || '')
      : closureForm.componentId
    const closureComponent = components.find(c => c.id === closureComponentId) || null
    const prevComponentName = selected.component_name || null
    const closureData = {
      closure_hours: parseFloat(closureForm.hours),
      closure_parts: closureForm.parts.trim() || null,
      closure_root_cause: closureForm.rootCause.trim(),
      closure_action: closureForm.action.trim() || null,
      component_id: closureComponent?.id || null,
      component_name: closureComponent?.name || null,
      closed_at: new Date().toISOString(),
    }
    try {
      await updateStatus(selected.id, 'risolta', closureData, closureData)
      if ((closureData.component_id || null) !== (selected.component_id || null)) {
        db.addActivity(selected.id, {
          type: 'component_change',
          user_id: user?.id, user_name: user?.name,
          detail: closureData.component_name
            ? (prevComponentName
                ? `In chiusura: guasto riattribuito da ${prevComponentName} a ${closureData.component_name}`
                : `In chiusura: guasto attribuito a ${closureData.component_name}`)
            : `In chiusura: attribuzione rimossa${prevComponentName ? ` (era ${prevComponentName})` : ''}`,
        }).catch(e => console.warn('Side effect failed:', e.message))
      }
      setShowClosureForm(false)
      setClosureForm({ hours: '', parts: '', rootCause: '', action: '', componentId: null })
      toast.success('Intervento chiuso con successo')
    } catch (err) {
      toast.error('Errore chiusura intervento: ' + err.message)
    } finally {
      setClosureSaving(false)
    }
  }

  const updateStatus = async (reportId, newStatus, extraUpdates = {}, closureData = null) => {
    await db.updateReport(reportId, { status: newStatus, ...extraUpdates })
    const activityDetail = newStatus === 'risolta' && closureData?.closure_hours
      ? `Chiuso in ${closureData.closure_hours}h — Causa: ${closureData.closure_root_cause}`
      : null
    db.addActivity(reportId, {
      type: 'status_change', from_status: selected?.status, to_status: newStatus,
      user_id: user?.id, user_name: user?.name, detail: activityDetail,
    }).catch(e => console.warn('Side effect failed:', e.message))
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
    onUpdate({ status: newStatus, ...extraUpdates })
  }

  useEffect(() => {
    let cancelled = false
    if (!machineId) { setComponents([]); return }
    db.getMachineComponents(machineId)
      .then(list => { if (!cancelled) setComponents(list || []) })
      .catch(e => console.warn('[ReportDetailModal] getMachineComponents failed:', e?.message))
    return () => { cancelled = true }
  }, [machineId])

  // Attribuisce (o toglie) il pezzo. È una diagnosi, non un cambio di
  // stato: nessuna notifica, ma resta in cronologia — l'ipotesi di chi ha
  // aperto la segnalazione non deve sparire in silenzio.
  const attributeComponent = async (componentId) => {
    if (componentSaving) return
    const comp = components.find(c => c.id === componentId) || null
    const prevName = selected.component_name || null
    if ((selected.component_id || null) === (comp?.id || null)) return
    setComponentSaving(true)
    try {
      const updated = await db.updateReport(selected.id, {
        component_id: comp?.id || null,
        component_name: comp?.name || null,
      })
      db.addActivity(selected.id, {
        type: 'component_change',
        user_id: user?.id, user_name: user?.name,
        detail: comp
          ? (prevName && prevName !== comp.name
              ? `Guasto riattribuito da ${prevName} a ${comp.name}`
              : `Guasto attribuito a ${comp.name}`)
          : `Attribuzione rimossa${prevName ? ` (era ${prevName})` : ''} — torna generico`,
      }).catch(e => console.warn('Side effect failed:', e.message))
      onUpdate(updated)
      toast.success(comp ? `Guasto attribuito a ${comp.name}` : 'Torna generico')
    } catch (err) {
      toast.error('Errore attribuzione: ' + err.message)
    }
    setComponentSaving(false)
  }

  const startEditing = () => {
    setEditForm({
      title: selected.title || '', description: selected.description || '',
      machine: selected.machine || '', severity: selected.severity || 'media',
      type: selected.type || 'correttiva',
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
        machine: editForm.machine || null, severity: editForm.severity, type: editForm.type, media: editMedia,
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
    <Fragment>
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '5vh' }} onClick={closeDetail}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease' }} />
      <div className="relative bg-surface-1 border border-token rounded-2xl w-full animate-fade-in shadow-2xl overflow-hidden"
        style={{ maxWidth: 1200, height: '82vh', transform: `translate(${position.x}px, ${position.y}px)` }} onClick={e => e.stopPropagation()}>

        {/* Header — drag handle: trascina da qui per spostare il modal */}
        <div {...dragProps}
          style={{ ...dragProps.style, cursor: dragging ? 'grabbing' : 'grab' }}
          className="flex items-center justify-between px-6 py-4 border-b border-token shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Modalità modifica</span>
              </div>
            ) : (
              <>
                {/* TK-id sempre a vista: riferimento del ticket, tap per copiare */}
                <TicketIdBadge report={selected} className="text-[11px] font-bold shrink-0" style={{
                  display: 'inline-block',
                  padding: '3px 9px',
                  borderRadius: 6,
                  letterSpacing: 1,
                  fontFamily: '"JetBrains Mono", monospace',
                  background: 'var(--color-primary-glow)',
                  color: 'var(--color-primary)',
                }} />
                <h2 className="text-lg font-bold text-themed truncate">{selected.title}</h2>
                <Badge {...(STATUS[selected.status] || STATUS.aperta)} />
                <Badge {...(SEVERITY[selected.severity] || SEVERITY.media)} />
                {selected.type && REPORT_TYPES[selected.type] && <Badge {...REPORT_TYPES[selected.type]} />}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-emerald-400 hover:bg-emerald-400/10 transition-all">
                <Share2 size={14} /> Condividi
              </button>
            )}
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
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Tipo Intervento</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(REPORT_TYPES).map(([key, { label, color, icon }]) => (
                      <button key={key} onClick={() => setEdit('type', key)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${editForm.type === key ? 'text-white' : 'bg-surface-2 text-muted'}`}
                        style={editForm.type === key ? { background: color } : {}}>{icon} {label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Media</label>
                  <MediaCapture media={editMedia} onChange={setEditMedia} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all disabled:opacity-50">
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
                {isDuplicate && (
                  <div className="rounded-xl p-3 border" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
                    <div className="flex items-start gap-2">
                      <Link2 size={15} className="text-amber-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Segnalazione unita</p>
                        {master ? (
                          <button onClick={() => onOpenReport?.(master.id)}
                            className="text-sm text-themed font-medium hover:text-amber-300 transition-colors mt-0.5 text-left inline-flex items-center gap-1">
                            Unita a {formatTicketId(master)} · {STATUS[master.status]?.label || master.status}
                            <ChevronRight size={13} />
                          </button>
                        ) : (
                          <p className="text-sm text-themed mt-0.5">Unita a un'altra segnalazione</p>
                        )}
                        {roleOk && (!confirmUnmerge ? (
                          <button onClick={() => setConfirmUnmerge(true)}
                            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-400 hover:text-amber-300">
                            <Unlink size={12} /> Annulla unione
                          </button>
                        ) : (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <button onClick={handleUnmerge} disabled={mergeLoading}
                              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-all disabled:opacity-50">
                              {mergeLoading ? 'Annullo…' : 'Conferma annullamento'}
                            </button>
                            <button onClick={() => setConfirmUnmerge(false)} className="text-[12px] text-muted hover:text-white">Mantieni unione</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {(selected.machine || selected.component_name || components.length > 0) && (
                  <div className="bg-surface-2 rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {selected.machine && (
                        <>
                          <span className="text-lg">🏭</span>
                          <span className="text-sm text-themed font-medium">{selected.machine}</span>
                        </>
                      )}
                      {selected.component_name && (
                        <ComponentPill name={selected.component_name} size="sm" style={{ marginLeft: 'auto' }} />
                      )}
                    </div>
                    {/* Il pezzo è una diagnosi e la diagnosi cambia: si
                        attribuisce e si corregge da qui, senza entrare in
                        modifica. "Generico" resta sempre disponibile. */}
                    {roleOk && components.length > 0 && (
                      <div>
                        <label className="block text-[11px] text-faint uppercase tracking-wider mb-1.5">Pezzo interessato</label>
                        <select
                          value={selected.component_id || ''}
                          disabled={componentSaving}
                          onChange={e => attributeComponent(e.target.value || null)}
                          className="w-full input-field rounded-xl px-3 py-2.5 text-sm disabled:opacity-50"
                        >
                          <option value="">Generico — intera macchina</option>
                          {components.map(c => (
                            <option key={c.id} value={c.id}>{c.type ? `${c.name} (${c.type})` : c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                      {selected.media.map((m, i) => {
                        if (m.type === 'photo') {
                          const photoIdx = photos.indexOf(m)
                          return (
                            <button key={i}
                              type="button"
                              onClick={() => setLightboxIndex(photoIdx)}
                              aria-label={`Apri foto ${photoIdx + 1} a schermo intero`}
                              className="aspect-square rounded-xl bg-surface-2 overflow-hidden border border-token flex items-center justify-center hover:ring-2 hover:ring-violet-500/40 transition-all press-scale cursor-zoom-in">
                              <img src={m.url} alt="" className="w-full h-full object-cover" />
                            </button>
                          )
                        }
                        return (
                          <div key={i} className="aspect-square rounded-xl bg-surface-2 overflow-hidden border border-token flex items-center justify-center">
                            <span className="text-2xl">{m.type === 'video' ? '🎥' : '🎤'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {selected.extra_data && Object.entries(selected.extra_data).filter(([k]) => !k.startsWith('closure_')).length > 0 && (
                  <div>
                    <p className="text-[11px] text-faint uppercase tracking-wider mb-2">Dati aggiuntivi</p>
                    {Object.entries(selected.extra_data).filter(([k]) => !k.startsWith('closure_')).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-surface-1 rounded-lg px-3 py-2 mb-1">
                        <span className="text-xs text-muted">{k}</span>
                        <span className="text-xs text-white font-medium">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selected.extra_data?.closure_hours != null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
                    <p className="text-[11px] text-emerald-400 uppercase tracking-wider font-semibold">Dati Chiusura</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-faint">Ore:</span> <span className="text-themed font-bold">{selected.extra_data.closure_hours}h</span></div>
                      {selected.extra_data.closure_parts && <div><span className="text-faint">Ricambi:</span> <span className="text-secondary">{selected.extra_data.closure_parts}</span></div>}
                    </div>
                    {selected.extra_data.closure_root_cause && <div className="text-xs"><span className="text-faint">Causa radice:</span> <span className="text-secondary">{selected.extra_data.closure_root_cause}</span></div>}
                    {selected.extra_data.closure_action && <div className="text-xs"><span className="text-faint">Azione correttiva:</span> <span className="text-secondary">{selected.extra_data.closure_action}</span></div>}
                  </div>
                )}
                <div className="bg-surface-2/20 rounded-xl p-3 space-y-1.5 text-xs text-faint">
                  <p>Ticket: <span className="text-secondary font-mono font-bold">{formatTicketId(selected)}</span></p>
                  <p>ID interno: <span className="text-muted font-mono" title={selected.id}>{selected.id?.slice(0, 8)}…</span></p>
                  {selected.type && <p>Tipo: <span className="text-secondary font-medium">{REPORT_TYPES[selected.type]?.icon} {REPORT_TYPES[selected.type]?.label || selected.type}</span></p>}
                  {selected.is_quick && <p>Report: <span className="text-amber-400 font-medium">⚡ Quick Report</span></p>}
                </div>

                {/* Interventi pianificati collegati al report (Sprint 1a) */}
                <InterventionsForReport report={selected} user={user} />
              </>
            )}
          </div>

          {/* COL 2: Chat + Timeline + AI */}
          <div className="col-span-6 border-r border-token flex flex-col overflow-hidden">
            <div className="flex border-b border-token shrink-0">
              <button onClick={() => setDetailTab('chat')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'chat' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <MessageCircle size={16} /> Chat
              </button>
              <button onClick={() => setDetailTab('timeline')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'timeline' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5' : 'text-faint hover:text-secondary'}`}>
                <Clock size={16} /> Cronologia
              </button>
              <button onClick={() => setDetailTab('ai')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${detailTab === 'ai' ? 'text-violet-400 border-b-2 border-violet-400 bg-violet-400/5' : 'text-faint hover:text-secondary'}`}>
                <Sparkles size={16} /> AI
              </button>
            </div>
            {detailTab === 'chat' ? (
              <ChatPanel reportId={selected.id} user={user} report={selected} variant="desktop" className="flex-1 min-h-0" />
            ) : detailTab === 'timeline' ? (
              <div className="flex-1 overflow-y-auto p-4">
                <ActivityTimeline reportId={selected.id} report={selected} />
              </div>
            ) : (
              <div className="flex-1 min-h-0 p-3">
                {isAssistantAvailable() ? (
                  <AssistantChat
                    key={selected.id}
                    machineId={selected.machine_id}
                    reportId={selected.id}
                    scope="ticket"
                    initialQuery={[selected.title, selected.description].filter(Boolean).join('. ').slice(0, 600)}
                    fillParent
                    suggestions={[
                      'Ci sono ricorrenze su questo macchinario?',
                      'Quale ricambio è stato usato più spesso per casi simili?',
                      'Passi tipici per diagnosticare questo problema',
                    ]}
                  />
                ) : (
                  <div className="p-4"><DemoBanner /></div>
                )}
              </div>
            )}
          </div>

          {/* COL 3: Actions */}
          <div className="col-span-3 overflow-y-auto p-4 space-y-4">
            {children.length > 0 && (
              <div className="rounded-2xl p-4 border" style={{ background: 'rgba(250, 204, 21, 0.10)', borderColor: 'rgba(250, 204, 21, 0.40)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style={{ color: '#facc15' }}>
                  <GitMerge size={13} /> Include {children.length} {children.length === 1 ? 'segnalazione unita' : 'segnalazioni unite'}
                </p>
                <div className="space-y-1.5">
                  {children.map(c => (
                    <button key={c.id} onClick={() => onOpenReport?.(c.id)}
                      className="w-full text-left rounded-lg px-3 py-2 transition-colors group flex items-center gap-2 border press-scale"
                      style={{ background: 'var(--color-surface-1)', borderColor: 'rgba(250, 204, 21, 0.25)' }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(250,204,21,0.16)', color: '#facc15', fontFamily: '"JetBrains Mono", monospace' }}>{formatTicketId(c)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-themed font-medium truncate group-hover:text-yellow-200">{c.title}</span>
                        <span className="block text-[10px] text-faint">{c.created_by_name || 'Sconosciuto'} · {formatDate(c.created_at)}</span>
                      </span>
                      <span className="text-[10px] font-bold shrink-0 inline-flex items-center gap-0.5" style={{ color: '#facc15' }}>Apri <ChevronRight size={12} /></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isDuplicate && (
              <div className="bg-surface-1 rounded-2xl p-4 space-y-2">
                <p className="text-[11px] text-faint uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 size={13} /> Unita
                </p>
                <p className="text-[12px] text-muted leading-relaxed">
                  Questa segnalazione è chiusa come duplicato{master ? ` di ${formatTicketId(master)}` : ''}. Usa “Annulla unione” nel riquadro in alto a sinistra per ripristinarla e modificarne stato e assegnazione.
                </p>
              </div>
            )}
            {!isDuplicate && (<>
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
              {!confirmClose ? (
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(STATUS).map(([key, { label, color }]) => (
                    <button key={key} onClick={() => handleStatusClick(selected.id, key)}
                      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all ${selected.status === key ? 'text-white' : 'bg-surface-2 text-muted hover:text-white'}`}
                      style={selected.status === key ? { background: color } : {}}>
                      <span className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-bold">Chiudere senza completare?</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    "Chiuso" archivia la segnalazione senza registrare l'intervento:
                    niente ore lavoro, causa o ricambi, e non verrà conteggiata come
                    risolta nelle statistiche. Se il lavoro è stato fatto, usa "Completato".
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmClose}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all">
                      Chiudi comunque
                    </button>
                    <button onClick={() => setConfirmClose(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>

            {canMerge && (
              <div className="bg-surface-1 rounded-2xl p-4">
                <button onClick={() => (onRequestMerge ? onRequestMerge() : setShowMergeModal(true))}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-violet-400/80 hover:text-violet-300 hover:bg-violet-500/10 transition-all">
                  <GitMerge size={15} /> Unisci a un'altra…
                </button>
              </div>
            )}
            </>)}

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

        {/* Closure Form Overlay */}
        {showClosureForm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl"
            onClick={() => setShowClosureForm(false)}>
            <div className="bg-surface-1 border border-token rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-themed">Chiusura Intervento</h3>
              <p className="text-sm text-faint">Compila i dati dell'intervento prima di chiudere.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-faint uppercase mb-1">Ore lavoro *</label>
                  <input type="number" step="0.5" min="0" value={closureForm.hours}
                    onChange={e => setClosureForm(f => ({ ...f, hours: e.target.value }))}
                    placeholder="es. 2.5"
                    className="w-full input-field rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-faint uppercase mb-1">Ricambi utilizzati</label>
                  <input type="text" value={closureForm.parts}
                    onChange={e => setClosureForm(f => ({ ...f, parts: e.target.value }))}
                    placeholder="es. Cuscinetto, guarnizione"
                    className="w-full input-field rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              {components.length > 0 && (
                <div>
                  <label className="block text-[11px] text-faint uppercase mb-1">Pezzo interessato</label>
                  <select
                    value={closureForm.componentId === null ? (selected.component_id || '') : closureForm.componentId}
                    onChange={e => setClosureForm(f => ({ ...f, componentId: e.target.value }))}
                    className="w-full input-field rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">Generico — intera macchina</option>
                    {components.map(c => (
                      <option key={c.id} value={c.id}>{c.type ? `${c.name} (${c.type})` : c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-faint uppercase mb-1">Causa radice *</label>
                <textarea value={closureForm.rootCause}
                  onChange={e => setClosureForm(f => ({ ...f, rootCause: e.target.value }))}
                  placeholder="Cosa ha causato il problema?" rows={2}
                  className="w-full input-field rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-[11px] text-faint uppercase mb-1">Azione correttiva</label>
                <textarea value={closureForm.action}
                  onChange={e => setClosureForm(f => ({ ...f, action: e.target.value }))}
                  placeholder="Cosa è stato fatto per risolvere?" rows={2}
                  className="w-full input-field rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={submitClosure} disabled={closureSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50">
                  {closureSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Chiudi Intervento</>}
                </button>
                <button onClick={() => setShowClosureForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted hover:text-white transition-all">
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {lightboxIndex !== null && (
      <MediaLightbox
        images={photos}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    )}

    <ShareReportSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      report={selected}
      user={user}
    />

    {/* Merge gestito internamente (parent senza onRequestMerge) */}
    {showMergeModal && (
      <MergeReportModal
        sourceReport={selected}
        onClose={() => setShowMergeModal(false)}
        onMerged={(result, meta) => {
          setShowMergeModal(false)
          toast.success(`Unita a ${formatTicketId(meta.masterReport)}`)
          // Se la segnalazione aperta è quella chiusa come duplicato, il
          // pannello si aggiorna e mostra il banner con "Annulla unione";
          // altrimenti notifica solo il parent per il refresh.
          onUpdate(meta.duplicateId === selected.id ? result : {})
        }}
      />
    )}
    </Fragment>
  )
}
