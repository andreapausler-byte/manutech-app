import { useState } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
import { Badge } from '../ui'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import MediaLightbox from '../media/MediaLightbox'
import AudioPlayer from '../media/AudioPlayer'
import VideoPlayer from '../media/VideoPlayer'
import ActivityTimeline from './ActivityTimeline'
import ChatPanel from '../chat/ChatPanel'
import {
  ArrowLeft, MessageCircle, Video, Mic, Expand, Image, Clock,
  ChevronDown
} from 'lucide-react'

export default function ReportDetail({ report: initialReport, user, onBack }) {
  const [report, setReport] = useState(initialReport)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [showInfo, setShowInfo] = useState(true)
  const [activeSection, setActiveSection] = useState('chat') // 'chat' | 'timeline'
  const [showClosureForm, setShowClosureForm] = useState(false)
  const [closureForm, setClosureForm] = useState({ hours: '', parts: '', rootCause: '', action: '' })

  const toast = useToast()
  const haptic = useHaptic()

  const status = STATUS[report.status] || STATUS.aperta
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const canUpdateStatus = user.role === 'tecnico' || user.role === 'admin'

  const handleStatusClick = (s) => {
    if (s === 'risolta' && report.status !== 'risolta') {
      setShowClosureForm(true)
      return
    }
    updateStatus(s)
  }

  const submitClosure = async () => {
    if (!closureForm.hours || !closureForm.rootCause.trim()) {
      toast.warning('Compila ore lavoro e causa radice')
      haptic.warning()
      return
    }
    const closureData = {
      closure_hours: parseFloat(closureForm.hours),
      closure_parts: closureForm.parts.trim() || null,
      closure_root_cause: closureForm.rootCause.trim(),
      closure_action: closureForm.action.trim() || null,
    }
    const success = await updateStatus('risolta', {
      extra_data: { ...(report.extra_data || {}), ...closureData },
    }, closureData)
    if (success) {
      setShowClosureForm(false)
      setClosureForm({ hours: '', parts: '', rootCause: '', action: '' })
    }
  }

  const updateStatus = async (s, extraUpdates = {}, closureData = null) => {
    if (updatingStatus) return
    setUpdatingStatus(s)
    haptic.medium()
    try {
      const oldStatus = report.status
      const updated = await db.updateReport(report.id, { status: s, ...extraUpdates })
      setReport(r => ({ ...r, ...updated }))
      const statusLabel = STATUS[s]?.label || s
      toast.success(`Stato → ${statusLabel}`)

      const activityDetail = s === 'risolta' && closureData?.closure_hours
        ? `Chiuso in ${closureData.closure_hours}h — Causa: ${closureData.closure_root_cause}`
        : null

      db.addActivity(report.id, {
        type: 'status_change',
        from_status: oldStatus, to_status: s,
        user_id: user.id, user_name: user.name,
        detail: activityDetail,
      }).catch(e => console.warn('Side effect failed:', e.message))

      // Notifica tutti gli stakeholder tranne chi fa il cambio
      const recipients = new Set()
      if (report.created_by) recipients.add(report.created_by)
      if (report.assigned_to) recipients.add(report.assigned_to)
      recipients.delete(user.id)

      for (const targetId of recipients) {
        db.addNotification({
          type: 'status_change',
          title: `Stato aggiornato: ${report.title}`,
          body: `${user.name} ha cambiato lo stato a "${statusLabel}"`,
          report_id: report.id, from_user: user.id, target_user: targetId,
        }).catch(e => console.warn('Side effect failed:', e.message))
      }
      return true
    } catch {
      toast.error('Errore aggiornamento stato')
      return false
    } finally {
      setUpdatingStatus(null)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base flex flex-col">
      {/* ═══ Header ═══ */}
      <header className="header-page flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
        <button onClick={onBack} className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale shrink-0">
          <ArrowLeft size={26} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-themed truncate">{report.title}</h1>
          <p className="text-sm text-faint">{timeAgo(report.created_at)}</p>
        </div>
        <Badge {...status} />
      </header>

      {/* ═══ Collapsible Info Section ═══ */}
      <div className="glass border-b border-token">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="w-full flex items-center justify-between px-[4vw] py-[2.5vw] active:bg-white/[0.02]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge {...severity} />
            {report.type && REPORT_TYPES[report.type] && <Badge {...REPORT_TYPES[report.type]} />}
            {report.machine && <Badge label={`🏭 ${report.machine}`} color="#94a3b8" bg="#94a3b822" />}
            {report.assigned_to_name && <Badge label={`👤 ${report.assigned_to_name}`} color="#8b5cf6" bg="#8b5cf622" />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-faint font-medium">{showInfo ? 'Nascondi' : 'Dettagli'}</span>
            <ChevronDown size={18} className="text-faint transition-transform duration-200" style={{ transform: showInfo ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </div>
        </button>

        {/* Assegnazione visibile sempre (fuori dal collapse) */}
        {report.assigned_to_name && !showInfo && (
          <div className="px-[4vw] pb-[2.5vw]">
            <div className="flex items-center gap-2 bg-purple-500/10 rounded-xl px-[3vw] py-[2vw]">
              <span className="text-sm">👤</span>
              <span className="text-sm text-purple-300 font-medium">Assegnata a: <strong className="text-themed">{report.assigned_to_name}</strong></span>
            </div>
          </div>
        )}

        <div style={{
          maxHeight: showInfo ? '2000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}>
          <div className="px-[4vw] pb-[4vw] space-y-[3vw]">
            {/* Assignment info */}
            {report.assigned_to_name && (
              <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl px-[4vw] py-[3vw]">
                <div className="w-[10vw] h-[10vw] max-w-10 max-h-10 bg-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-lg">👤</span>
                </div>
                <div>
                  <p className="text-xs text-purple-300/70 uppercase tracking-wider font-semibold">Assegnata a</p>
                  <p className="text-base font-bold text-white">{report.assigned_to_name}</p>
                </div>
              </div>
            )}

            {/* Created by */}
            {report.created_by_name && (
              <div className="flex items-center gap-2 text-sm text-faint">
                <span>Creata da: <span className="text-secondary font-medium">{report.created_by_name}</span></span>
              </div>
            )}

            {/* Description */}
            <p className="text-base text-secondary leading-relaxed">{report.description}</p>

            {/* Media — Photo gallery, Video player, Audio player */}
            {report.media?.length > 0 && (() => {
              const photos = report.media.filter(m => m.type === 'photo')
              const videos = report.media.filter(m => m.type === 'video')
              const audios = report.media.filter(m => m.type === 'audio')
              return (
                <div className="space-y-[3vw]">
                  {photos.length > 0 && (
                    <div>
                      <p className="label-section tracking-wider mb-[2vw] flex items-center gap-1.5">
                        <Image size={15} /> Foto ({photos.length})
                      </p>
                      <div className={`grid gap-[2.5vw] ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {photos.map((m, i) => (
                          <button key={m.id || i} onClick={() => { haptic.light(); setLightboxIndex(i) }}
                            className="relative rounded-2xl bg-gray-800 overflow-hidden border border-token active:opacity-80 press-scale aspect-[4/3]">
                            <img src={m.url} alt="" className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-black/50 backdrop-blur-sm flex items-center justify-center">
                              <Expand size={14} className="text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {videos.map((m, i) => (
                    <div key={m.id || `v-${i}`}>
                      <p className="label-section tracking-wider mb-[2vw] flex items-center gap-1.5">
                        <Video size={15} /> Video {videos.length > 1 ? `${i + 1}` : ''}
                      </p>
                      <VideoPlayer src={m.url} name={m.name} />
                    </div>
                  ))}
                  {audios.map((m, i) => (
                    <div key={m.id || `a-${i}`}>
                      {i === 0 && (
                        <p className="label-section tracking-wider mb-[2vw] flex items-center gap-1.5">
                          <Mic size={15} /> Note vocali ({audios.length})
                        </p>
                      )}
                      <AudioPlayer src={m.url} name={m.name} />
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Closure info (se il report è risolta/chiuso e ha dati chiusura) */}
            {report.extra_data?.closure_hours != null && (
              <div className="card-elevated rounded-2xl p-[4vw] space-y-[2vw]">
                <p className="label-section tracking-wider">Dati Chiusura Intervento</p>
                <div className="grid grid-cols-2 gap-[2vw]">
                  <div className="bg-surface-2 rounded-xl p-[2.5vw]">
                    <p className="text-xs text-faint uppercase">Ore lavoro</p>
                    <p className="text-base text-themed font-bold">{report.extra_data.closure_hours}h</p>
                  </div>
                  {report.extra_data.closure_parts && (
                    <div className="bg-surface-2 rounded-xl p-[2.5vw]">
                      <p className="text-xs text-faint uppercase">Ricambi</p>
                      <p className="text-sm text-secondary">{report.extra_data.closure_parts}</p>
                    </div>
                  )}
                </div>
                {report.extra_data.closure_root_cause && (
                  <div className="bg-surface-2 rounded-xl p-[2.5vw]">
                    <p className="text-xs text-faint uppercase">Causa radice</p>
                    <p className="text-sm text-secondary">{report.extra_data.closure_root_cause}</p>
                  </div>
                )}
                {report.extra_data.closure_action && (
                  <div className="bg-surface-2 rounded-xl p-[2.5vw]">
                    <p className="text-xs text-faint uppercase">Azione correttiva</p>
                    <p className="text-sm text-secondary">{report.extra_data.closure_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status Actions — BIG buttons for gloves */}
            {canUpdateStatus && (
              <div className="card-elevated rounded-2xl p-[4vw]">
                <p className="label-section tracking-wider mb-[3vw]">Aggiorna Stato</p>
                <div className="grid grid-cols-2 gap-[2.5vw]">
                  {Object.entries(STATUS).map(([key, { label, color }]) => {
                    const isActive = report.status === key
                    const isUpdating = updatingStatus === key
                    return (
                      <button key={key} onClick={() => !isActive && !updatingStatus && handleStatusClick(key)}
                        disabled={isActive || !!updatingStatus}
                        className={`flex flex-col items-center gap-2 px-[3vw] py-[3.5vw] rounded-2xl transition-all press-scale ${
                          isActive
                            ? 'border-2 text-white'
                            : 'bg-surface-2 border-2 border-transparent active:bg-surface-3 text-secondary'
                        } ${updatingStatus && !isActive && !isUpdating ? 'opacity-40' : ''}`}
                        style={isActive ? { background: color + '20', borderColor: color } : {}}>
                        <div className={`w-7 h-7 rounded-full shrink-0 border-[3px] flex items-center justify-center ${isUpdating ? 'animate-pulse' : ''}`}
                          style={{ background: isActive ? color : 'transparent', borderColor: color }}>
                          {isUpdating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        </div>
                        <span className="text-base font-bold text-center">{label}</span>
                        {isActive && (
                          <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg"
                            style={{ background: color + '30', color }}>Attivo</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <MediaLightbox
          images={report.media.filter(m => m.type === 'photo')}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ═══ Closure Form — Design System Bottom Sheet ═══ */}
      {showClosureForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowClosureForm(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease both' }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              background: 'var(--color-surface-1)',
              borderRadius: '20px 20px 0 0',
              width: '100%', maxWidth: 500,
              maxHeight: '90vh', overflowY: 'auto',
              padding: '20px 18px 30px',
              animation: 'slideUp 0.3s ease both',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 12 }}>Chiusura Intervento</h3>

            {/* Form — Design System */}
            <div style={{
              background: 'var(--color-surface-3)',
              borderRadius: 12, padding: 14,
              border: '1px solid var(--color-border)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Ore lavoro *</label>
                  <input type="number" step="0.5" min="0" value={closureForm.hours}
                    onChange={e => setClosureForm(f => ({ ...f, hours: e.target.value }))}
                    placeholder="es. 2.5"
                    style={{
                      width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '10px 12px', fontSize: 14,
                      color: 'var(--color-text)', outline: 'none',
                    }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 4 }}>Ricambi usati</label>
                  <input type="text" value={closureForm.parts}
                    onChange={e => setClosureForm(f => ({ ...f, parts: e.target.value }))}
                    placeholder="es. Cuscinetto"
                    style={{
                      width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                      borderRadius: 8, padding: '10px 12px', fontSize: 14,
                      color: 'var(--color-text)', outline: 'none',
                    }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Causa radice *</label>
                <textarea value={closureForm.rootCause}
                  onChange={e => setClosureForm(f => ({ ...f, rootCause: e.target.value }))}
                  placeholder="Cosa ha causato il problema?"
                  rows={2}
                  style={{
                    width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 13,
                    color: 'var(--color-text)', outline: 'none', resize: 'none',
                  }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Azione correttiva</label>
                <textarea value={closureForm.action}
                  onChange={e => setClosureForm(f => ({ ...f, action: e.target.value }))}
                  placeholder="Cosa è stato fatto per risolvere?"
                  rows={2}
                  style={{
                    width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 13,
                    color: 'var(--color-text)', outline: 'none', resize: 'none',
                  }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Note</label>
                <input type="text"
                  placeholder="Note aggiuntive..."
                  style={{
                    width: '100%', background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: 8, padding: '8px 10px', fontSize: 13,
                    color: 'var(--color-text)', outline: 'none',
                  }} />
              </div>
              <button onClick={submitClosure} disabled={!!updatingStatus}
                className="press-scale"
                style={{
                  width: '100%', padding: 12, borderRadius: 8,
                  background: 'var(--color-green)', color: '#000',
                  fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
                  opacity: updatingStatus ? 0.5 : 1,
                }}>
                {updatingStatus ? '...' : '✓ Conferma Chiusura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Tab switcher: Chat / Timeline ═══ */}
      <div className="flex border-b border-token shrink-0 bg-base">
        <button onClick={() => setActiveSection('chat')}
          className="flex-1 flex items-center justify-center gap-2 py-[3vw] text-sm font-semibold transition-all"
          style={activeSection === 'chat'
            ? { color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)', background: 'var(--color-primary-glow)' }
            : { color: 'var(--color-text-muted)' }
          }>
          <MessageCircle size={18} /> Chat
        </button>
        <button onClick={() => setActiveSection('timeline')}
          className="flex-1 flex items-center justify-center gap-2 py-[3vw] text-sm font-semibold transition-all"
          style={activeSection === 'timeline'
            ? { color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)', background: 'var(--color-primary-glow)' }
            : { color: 'var(--color-text-muted)' }
          }>
          <Clock size={18} /> Cronologia
        </button>
      </div>

      {/* ═══ Content area ═══ */}
      {activeSection === 'chat' ? (
        <ChatPanel
          reportId={report.id}
          user={user}
          report={report}
          variant="mobile"
          className="flex-1 min-h-0"
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-[4vw] py-[4vw]">
          <ActivityTimeline reportId={report.id} report={report} />
        </div>
      )}
    </div>
  )
}
