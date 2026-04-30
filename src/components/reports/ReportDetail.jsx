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
  ChevronDown, Check, User
} from 'lucide-react'

// ── Refined design tokens (allinea a MobileLayout v7.0) ──
const REFINED_PRIMARY = 'linear-gradient(135deg, #4f46e5, #7c3aed)'
const REFINED_PRIMARY_SHADOW = '0 8px 24px rgba(124,58,237,0.35)'

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
      {/* ═══ Refined Header — sleek, no severity tint ═══ */}
      <header style={{
        background: 'var(--color-surface-1)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 40,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div className="flex items-center px-4 pt-3 pb-2" style={{ gap: 10 }}>
          <button
            onClick={onBack}
            aria-label="Indietro"
            className="press-scale shrink-0"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 style={{
              fontSize: 15, fontWeight: 600, lineHeight: 1.25, letterSpacing: -0.2,
              color: 'var(--color-text)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {report.title}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <Clock size={11} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{
                fontSize: 11, color: 'var(--color-text-muted)',
                fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.2,
              }}>
                {timeAgo(report.created_at)}
              </span>
            </div>
          </div>
          {/* Share guest link (admin/tecnico only) */}
          {(user.role === 'admin' || user.role === 'tecnico') && (
            <ShareGuestLink reportId={report.id} reportTitle={report.title} />
          )}
          {/* Status pill — compact */}
          <span style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 999,
            fontWeight: 700, color: status.color, background: status.bg,
            border: `1px solid ${status.color}33`,
            whiteSpace: 'nowrap', letterSpacing: 0.2,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 10 }}>{status.icon}</span>
            {status.label}
          </span>
        </div>

        {/* Status stepper */}
        <div style={{ padding: '6px 14px 12px' }}>
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
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Dettagli
          </span>
          <ChevronDown size={16} className="text-faint transition-transform duration-200" style={{ transform: showInfo ? 'rotate(180deg)' : 'rotate(0deg)' }} />
        </button>

        <div style={{
          maxHeight: showInfo ? '2000px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}>
          <div className="px-[4vw] pb-[4vw] space-y-[3vw]">
            {/* Assignment card — Refined indigo/violet */}
            {report.assigned_to_name && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 14, padding: '10px 12px',
                position: 'relative', overflow: 'hidden',
              }}>
                <span aria-hidden="true" style={{
                  position: 'absolute', left: 0, top: 10, bottom: 10, width: 3,
                  background: REFINED_PRIMARY, borderRadius: 2,
                }} />
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: REFINED_PRIMARY,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  marginLeft: 6,
                }}>
                  <User size={16} style={{ color: '#fff' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontSize: 9, color: 'var(--color-text-muted)',
                    textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700,
                  }}>
                    Assegnata a
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', letterSpacing: -0.1 }}>
                    {report.assigned_to_name}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{
              background: 'var(--color-surface-2)',
              borderRadius: 14, padding: '12px 14px',
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
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
                borderRadius: 14, padding: '14px',
                border: '1px solid var(--color-border)',
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: 'uppercase', color: 'var(--color-text-muted)',
                  marginBottom: 10,
                }}>Dati Chiusura</p>
                <div className="grid grid-cols-2 gap-[2vw]">
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 10, padding: '9px 11px' }}>
                    <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Ore lavoro</p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', fontFamily: '"JetBrains Mono", monospace' }}>{report.extra_data.closure_hours}h</p>
                  </div>
                  {report.extra_data.closure_parts && (
                    <div style={{ background: 'var(--color-surface-3)', borderRadius: 10, padding: '9px 11px' }}>
                      <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Ricambi</p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_parts}</p>
                    </div>
                  )}
                </div>
                {report.extra_data.closure_root_cause && (
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 10, padding: '9px 11px', marginTop: 8 }}>
                    <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Causa radice</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_root_cause}</p>
                  </div>
                )}
                {report.extra_data.closure_action && (
                  <div style={{ background: 'var(--color-surface-3)', borderRadius: 10, padding: '9px 11px', marginTop: 8 }}>
                    <p style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Azione correttiva</p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{report.extra_data.closure_action}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status Actions — Refined compact grid */}
            {canUpdateStatus && (
              <div style={{
                background: 'var(--color-surface-2)',
                borderRadius: 14, padding: '14px',
                border: '1px solid var(--color-border)',
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: 'uppercase', color: 'var(--color-text-muted)',
                  marginBottom: 10,
                }}>Aggiorna Stato</p>
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
                          padding: '11px 6px', borderRadius: 12,
                          background: isActive ? color + '14' : 'var(--color-surface-3)',
                          border: `1.5px solid ${isActive ? color : 'transparent'}`,
                          cursor: isActive ? 'default' : 'pointer',
                          opacity: (updatingStatus && !isActive && !isUpdating) ? 0.4 : 1,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: isActive ? color : 'transparent',
                          border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isUpdating && <div style={{ width: 9, height: 9, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pulse 0.6s linear infinite' }} />}
                          {isActive && <Check size={11} style={{ color: '#fff' }} />}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: isActive ? 700 : 600,
                          color: isActive ? color : 'var(--color-text-secondary)',
                          textAlign: 'center', lineHeight: 1.2, letterSpacing: -0.1,
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
                  width: '100%', padding: 14, borderRadius: 12,
                  background: REFINED_PRIMARY,
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                  opacity: updatingStatus ? 0.5 : 1,
                  boxShadow: REFINED_PRIMARY_SHADOW,
                  letterSpacing: -0.1,
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

      {/* ═══ Segmented toggle: Chat / Cronologia — Refined ═══ */}
      <div className="shrink-0" style={{
        margin: '0 4vw', marginTop: 4,
        display: 'flex', borderRadius: 12, padding: 4,
        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
      }}>
        {[
          { id: 'chat', label: 'Chat', icon: MessageCircle },
          { id: 'timeline', label: 'Cronologia', icon: Clock },
        ].map(t => {
          const active = activeSection === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveSection(t.id)}
              className="press-scale"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                background: active ? 'var(--color-card)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                border: 'none', cursor: 'pointer',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              <t.icon size={14} style={{ color: active ? '#7c3aed' : 'currentColor' }} /> {t.label}
            </button>
          )
        })}
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
