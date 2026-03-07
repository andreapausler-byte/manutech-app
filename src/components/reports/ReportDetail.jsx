import { useState } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, timeAgo } from '../../lib/constants'
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
  ChevronDown, ChevronUp
} from 'lucide-react'

export default function ReportDetail({ report: initialReport, user, onBack }) {
  const [report, setReport] = useState(initialReport)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [showInfo, setShowInfo] = useState(true)
  const [activeSection, setActiveSection] = useState('chat') // 'chat' | 'timeline'

  const toast = useToast()
  const haptic = useHaptic()

  const status = STATUS[report.status] || STATUS.aperta
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const canUpdateStatus = user.role === 'tecnico' || user.role === 'admin'

  const updateStatus = async (s) => {
    if (updatingStatus) return
    setUpdatingStatus(s)
    haptic.medium()
    try {
      const oldStatus = report.status
      const updated = await db.updateReport(report.id, { status: s })
      setReport(r => ({ ...r, ...updated }))
      const statusLabel = STATUS[s]?.label || s
      toast.success(`Stato → ${statusLabel}`)

      db.addActivity(report.id, {
        type: 'status_change',
        from_status: oldStatus, to_status: s,
        user_id: user.id, user_name: user.name,
      }).catch(() => {})

      db.addNotification({
        type: 'status_change',
        title: `Stato aggiornato: ${report.title}`,
        body: `${user.name} ha cambiato lo stato a "${statusLabel}"`,
        report_id: report.id,
        from_user: user.id,
        target_user: report.created_by !== user.id ? report.created_by : null,
      }).catch(() => {})
    } catch {
      toast.error('Errore aggiornamento stato')
    }
    setUpdatingStatus(null)
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
            {report.machine && <Badge label={`🏭 ${report.machine}`} color="#94a3b8" bg="#94a3b822" />}
            {report.assigned_to_name && <Badge label={`👤 ${report.assigned_to_name}`} color="#8b5cf6" bg="#8b5cf622" />}
          </div>
          {showInfo ? <ChevronUp size={18} className="text-faint" /> : <ChevronDown size={18} className="text-faint" />}
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

        {showInfo && (
          <div className="px-[4vw] pb-[4vw] space-y-[3vw] animate-fade-in">
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
                            className={`relative rounded-2xl bg-gray-800 overflow-hidden border border-token active:opacity-80 press-scale ${
                              photos.length === 1 ? 'aspect-[16/10]' : 'aspect-[4/3]'
                            }`}>
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

            {/* Status Actions — BIG buttons for gloves */}
            {canUpdateStatus && (
              <div className="card-elevated rounded-2xl p-[4vw]">
                <p className="label-section tracking-wider mb-[3vw]">Aggiorna Stato</p>
                <div className="space-y-[2.5vw]">
                  {Object.entries(STATUS).map(([key, { label, color }]) => {
                    const isActive = report.status === key
                    const isUpdating = updatingStatus === key
                    return (
                      <button key={key} onClick={() => !isActive && !updatingStatus && updateStatus(key)}
                        disabled={isActive || !!updatingStatus}
                        className={`w-full flex items-center gap-[3.5vw] px-[4vw] py-[4vw] rounded-2xl transition-all press-scale ${
                          isActive
                            ? 'border-2 text-white'
                            : 'bg-surface-2 border-2 border-transparent active:bg-surface-3 text-secondary'
                        } ${updatingStatus && !isActive && !isUpdating ? 'opacity-40' : ''}`}
                        style={isActive ? { background: color + '20', borderColor: color } : {}}>
                        <div className={`w-6 h-6 rounded-full shrink-0 border-[3px] flex items-center justify-center ${isUpdating ? 'animate-pulse' : ''}`}
                          style={{ background: isActive ? color : 'transparent', borderColor: color }}>
                          {isUpdating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        </div>
                        <span className="text-lg font-bold flex-1 text-left">{label}</span>
                        {isActive && (
                          <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg"
                            style={{ background: color + '30', color }}>Attivo</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <MediaLightbox
          images={report.media.filter(m => m.type === 'photo')}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ═══ Tab switcher: Chat / Timeline ═══ */}
      <div className="flex border-b border-token shrink-0 bg-base">
        <button onClick={() => setActiveSection('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-[3vw] text-sm font-semibold transition-all ${
            activeSection === 'chat'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/5'
              : 'text-faint active:text-secondary'
          }`}>
          <MessageCircle size={18} /> Chat
        </button>
        <button onClick={() => setActiveSection('timeline')}
          className={`flex-1 flex items-center justify-center gap-2 py-[3vw] text-sm font-semibold transition-all ${
            activeSection === 'timeline'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5'
              : 'text-faint active:text-secondary'
          }`}>
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
