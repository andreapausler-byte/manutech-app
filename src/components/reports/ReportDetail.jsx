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
import ShareGuestLink from '../chat/ShareGuestLink'
import SimilarReportsPanel from './SimilarReportsPanel'
import {
  ArrowLeft, MessageCircle, Video, Mic, Expand, Image, Clock,
  ChevronDown, Check, User, Wrench, Factory
} from 'lucide-react'

// ── Status Stepper ──
const STEPPER_STATUSES = ['aperta', 'assegnata', 'in_lavorazione', 'risolta']

function StatusStepper({ currentStatus }) {
  const currentIdx = STEPPER_STATUSES.indexOf(currentStatus)
  const isChiuso = currentStatus === 'chiuso'

  return (
    <div className="status-stepper" style={{ padding: '0 8px' }}>
      {STEPPER_STATUSES.map((s, i) => {
        const st = STATUS[s]
        const isPast = i < currentIdx || isChiuso
        const isCurrent = i === currentIdx && !isChiuso
        return (
          <div key={s} className="status-step" style={{ position: 'relative' }}>
            {/* Connector line */}
            {i < STEPPER_STATUSES.length - 1 && (
              <div style={{
                position: 'absolute', top: 13, left: '50%', width: '100%', height: 2,
                background: isPast ? st.color : 'var(--color-border)',
                zIndex: 0, opacity: isPast ? 0.5 : 1,
              }} />
            )}
            {/* Dot */}
            <div
              className="status-step-dot"
              style={{
                background: isCurrent ? st.color : isPast ? st.color + '30' : 'var(--color-surface-2)',
                borderColor: isCurrent || isPast ? st.color : 'var(--color-border)',
                boxShadow: isCurrent ? `0 0 12px ${st.color}50` : 'none',
                transform: isCurrent ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              {isPast ? <Check size={12} style={{ color: st.color }} /> : null}
              {isCurrent ? <span style={{ fontSize: 10 }}>{st.icon}</span> : null}
            </div>
            {/* Label */}
            <span style={{
              fontSize: 10, fontWeight: isCurrent ? 700 : 500,
              color: isCurrent ? st.color : isPast ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
              textAlign: 'center',
            }}>
              {st.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function ReportDetail({ report: initialReport, user, onBack }) {
  const [report, setReport] = useState(initialReport)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [showInfo, setShowInfo] = useState(true)
  const [activeSection, setActiveSection] = useState('chat')
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
      closed_at: new Date().toISOString(),
    }
    const success = await updateStatus('risolta', closureData, closureData)
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
    } catch (err) {
      console.error('[ManuTech] Errore aggiornamento stato:', err)
      const msg = err?.message || err?.code || 'Errore sconosciuto'
      toast.error(`Errore aggiornamento stato: ${msg}`)
      return false
    } finally {
      setUpdatingStatus(null)
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base flex flex-col">
      {/* ═══ Hero Header with severity accent ═══ */}
      <header style={{
        background: `linear-gradient(180deg, ${severity.color}12 0%, transparent 100%)`,
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 40,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <div className="flex items-center gap-[2vw] px-[3vw] py-[2.5vw]">
          <button onClick={onBack} className="w-[12vw] h-[12vw] max-w-12 max-h-12 rounded-xl flex items-center justify-center active:bg-white/10 text-muted press-scale shrink-0">
            <ArrowLeft size={26} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-themed truncate">{report.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Clock size={12} style={{ color: 'var(--color-text-muted)' }} />
              <span className="text-sm text-faint">{timeAgo(report.created_at)}</span>
            </div>
          </div>
          {/* Share guest link (admin/tecnico only) */}
          {(user.role === 'admin' || user.role === 'tecnico') && (
            <ShareGuestLink reportId={report.id} reportTitle={report.title} />
          )}
          {/* Status pill with pulse */}
          <span style={{
            fontSize: 12, padding: '6px 12px', borderRadius: 'var(--radius-full)',
            fontWeight: 700, color: status.color, background: status.bg,
            border: `1.5px solid ${status.color}40`,
            whiteSpace: 'nowrap', letterSpacing: '0.02em',
            boxShadow: `0 0 12px ${status.color}20`,
          }}>
            {status.icon} {status.label}
          </span>
        </div>

        {/* Status stepper */}
        <div style={{ padding: '4px 16px 14px' }}>
          <StatusStepper currentStatus={report.status} />
        </div>
      </header>

      {/* ═══ Info chips — scrollable horizontal ═══ */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        padding: '12px 4vw',
        borderBottom: '1px solid var(--color-border)',
      }}
        className="no-scrollbar"
      >
        <Badge {...severity} />
        {report.type && REPORT_TYPES[report.type] && <Badge {...REPORT_TYPES[report.type]} />}
        {report.machine && <Badge label={`🏭 ${report.machine}`} color="#94a3b8" bg="#94a3b822" />}
        {report.assigned_to_name && <Badge label={`👤 ${report.assigned_to_name}`} color="#8b5cf6" bg="#8b5cf622" />}
        {report.created_by_name && <Badge label={`Creata da ${report.created_by_name}`} color="var(--color-text-muted)" bg="var(--color-surface-2)" />}
      </div>

      {/* ═══ Collapsible Details ═══ */}
      <div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="w-full flex items-center justify-between px-[4vw] py-[2.5vw] active:bg-white/[0.02]"
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dettagli
          </span>
          <ChevronDown size={18} className="text-faint transition-transform duration-200" style={{ transform: showInfo ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>

        <div style={{
          maxHeight: showInfo ? '2000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}>
          <div className="px-[4vw] pb-[4vw] space-y-[3vw]">
            {/* Assignment card */}
            {report.assigned_to_name && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: 16, padding: '12px 16px',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(139, 92, 246, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <User size={18} style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'rgba(139, 92, 246, 0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Assegnata a</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>{report.assigned_to_name}</p>
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{
              background: 'var(--color-surface-2)',
              borderRadius: 16, padding: '14px 16px',
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                {report.description}
              </p>
            </div>

            {/* Media */}
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
                            aria-label={`Apri foto ${i + 1} a schermo intero`}
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

            {/* Closure data */}
            {report.extra_data?.closure_hours != null && (
              <div style={{
                background: 'var(--color-surface-2)',
                borderRadius: 16, padding: '16px',
                border: '1px solid var(--color-border)',
              }}>
                <p className="label-section tracking-wider" style={{ marginBottom: 12 }}>Dati Chiusura</p>
                <div className="grid grid-cols-2 gap-[2vw]">
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 12, padding: '10px 12px' }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Ore lavoro</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{report.extra_data.closure_hours}h</p>
                  </div>
                  {report.extra_data.closure_parts && (
                    <div style={{ background: 'var(--color-surface-3)', borderRadius: 12, padding: '10px 12px' }}>
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Ricambi</p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_parts}</p>
                    </div>
                  )}
                </div>
                {report.extra_data.closure_root_cause && (
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 12, padding: '10px 12px', marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Causa radice</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_root_cause}</p>
                  </div>
                )}
                {report.extra_data.closure_action && (
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 12, padding: '10px 12px', marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Azione correttiva</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status Actions — Modern compact grid */}
            {canUpdateStatus && (
              <div style={{
                background: 'var(--color-surface-2)',
                borderRadius: 16, padding: '16px',
                border: '1px solid var(--color-border)',
              }}>
                <p className="label-section tracking-wider" style={{ marginBottom: 12 }}>Aggiorna Stato</p>
                <div className="grid grid-cols-3 gap-[2vw]">
                  {Object.entries(STATUS).map(([key, { label, color }]) => {
                    const isActive = report.status === key
                    const isUpdating = updatingStatus === key
                    return (
                      <button key={key} onClick={() => !isActive && !updatingStatus && handleStatusClick(key)}
                        disabled={isActive || !!updatingStatus}
                        className="press-scale"
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          padding: '12px 6px', borderRadius: 14,
                          background: isActive ? color + '18' : 'var(--color-surface-3)',
                          border: `2px solid ${isActive ? color : 'transparent'}`,
                          cursor: isActive ? 'default' : 'pointer',
                          opacity: (updatingStatus && !isActive && !isUpdating) ? 0.4 : 1,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: isActive ? color : 'transparent',
                          border: `2.5px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isUpdating && <div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pulse 0.6s linear infinite' }} />}
                          {isActive && <Check size={12} style={{ color: '#fff' }} />}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: isActive ? 700 : 600,
                          color: isActive ? color : 'var(--color-text-secondary)',
                          textAlign: 'center', lineHeight: 1.2,
                        }}>{label}</span>
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

      {/* ═══ Closure Form — Modern Bottom Sheet ═══ */}
      {showClosureForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowClosureForm(false)} role="dialog" aria-modal="true" aria-labelledby="closure-form-title">
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.2s ease both' }} aria-hidden="true" />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              background: 'var(--color-surface-1)',
              borderRadius: '24px 24px 0 0',
              width: '100%', maxWidth: 500,
              maxHeight: '90vh', overflowY: 'auto',
              padding: '20px 20px 32px',
              animation: 'slideUp 0.3s ease both',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
            </div>
            <h3 id="closure-form-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', marginBottom: 16 }}>
              Chiusura Intervento
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ore lavoro *</label>
                  <input type="number" step="0.5" min="0" value={closureForm.hours}
                    onChange={e => setClosureForm(f => ({ ...f, hours: e.target.value }))}
                    placeholder="es. 2.5"
                    className="input-field"
                    style={{ width: '100%', borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ricambi usati</label>
                  <input type="text" value={closureForm.parts}
                    onChange={e => setClosureForm(f => ({ ...f, parts: e.target.value }))}
                    placeholder="es. Cuscinetto"
                    className="input-field"
                    style={{ width: '100%', borderRadius: 12, padding: '12px 14px', fontSize: 14 }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Causa radice *</label>
                <textarea value={closureForm.rootCause}
                  onChange={e => setClosureForm(f => ({ ...f, rootCause: e.target.value }))}
                  placeholder="Cosa ha causato il problema?"
                  rows={2}
                  className="input-field"
                  style={{ width: '100%', borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Azione correttiva</label>
                <textarea value={closureForm.action}
                  onChange={e => setClosureForm(f => ({ ...f, action: e.target.value }))}
                  placeholder="Cosa è stato fatto per risolvere?"
                  rows={2}
                  className="input-field"
                  style={{ width: '100%', borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'none' }}
                />
              </div>
              <button onClick={submitClosure} disabled={!!updatingStatus}
                className="press-scale"
                style={{
                  width: '100%', padding: 14, borderRadius: 14,
                  background: 'var(--color-success)',
                  color: '#000', fontSize: 15, fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  opacity: updatingStatus ? 0.5 : 1,
                  boxShadow: '0 4px 16px rgba(61, 220, 132, 0.3)',
                }}>
                {updatingStatus ? '...' : '✓ Conferma Chiusura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Assistente AI — Soluzioni dal passato (solo tecnici su report non chiusi) ═══ */}
      {user.role === 'tecnico' && report.status !== 'chiuso' && (
        <div style={{ padding: '4px 4vw 12px' }}>
          <SimilarReportsPanel report={report} />
        </div>
      )}

      {/* ═══ Pill toggle: Chat / Timeline ═══ */}
      <div className="pill-toggle shrink-0" style={{ margin: '0 4vw', marginTop: 4 }}>
        <button
          onClick={() => setActiveSection('chat')}
          className={`pill-toggle-btn ${activeSection === 'chat' ? 'active' : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={16} /> Chat
          </span>
        </button>
        <button
          onClick={() => setActiveSection('timeline')}
          className={`pill-toggle-btn ${activeSection === 'timeline' ? 'active' : ''}`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Cronologia
          </span>
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
