/**
 * ChatPanel v2.1 — Chat unificata con DOWNLOAD desktop
 *
 * FEATURES:
 *  ✅ Messaggi di testo con bolle colorate per ruolo
 *  ✅ Invio foto (camera + galleria) con compressione automatica
 *  ✅ Invio video (camera + galleria) con player inline
 *  ✅ Registrazione audio vocale con timer
 *  ✅ Preview media prima dell'invio (rimuovibili)
 *  ✅ Player audio/video inline nelle bolle
 *  ✅ Lightbox foto fullscreen con zoom + download
 *  ✅ DOWNLOAD foto/video/audio su desktop (hover overlay)
 *  ✅ Auto-scroll ai nuovi messaggi
 *  ✅ Auto-resize textarea
 *  ✅ Toast + Haptic feedback
 *  ✅ Drag & Drop file su desktop
 *  ✅ Skeleton loading
 *  ✅ Keyboard shortcuts (Enter = invia, Shift+Enter = a capo)
 *  ✅ Responsive mobile (vw) + desktop (px)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { db } from '../../lib/supabase'
import { timeAgo } from '../../lib/constants'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VideoPlayer from '../media/VideoPlayer'
import MediaLightbox from '../media/MediaLightbox'
import {
  Send, MessageCircle, Camera, Video, Mic, Image,
  Square, X, Paperclip, Play, Pause, FileVideo, FileAudio,
  Download, ArrowDownToLine
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────
const ROLE_COLORS = { admin: '#3b82f6', tecnico: '#10b981', operatore: '#f59e0b' }
const ROLE_LABELS = { admin: 'Admin', tecnico: 'Tecnico', operatore: 'Operatore' }
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// ── Download utility ─────────────────────────────────────
async function downloadFile(url, filename) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename || url.split('/').pop() || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    return true
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank')
    return false
  }
}

export default function ChatPanel({ reportId, user, variant = 'desktop', report, className = '' }) {
  // State
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingMedia, setPendingMedia] = useState([])
  const [showMediaBar, setShowMediaBar] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [lightboxData, setLightboxData] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  // Audio recording
  const [recording, setRecording] = useState(false)
  const [audioTime, setAudioTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioTimerRef = useRef(null)

  // Refs
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // Hooks — stabilize references with useRef
  const { compress, formatSize } = useImageCompressor()
  const toast = useToast()
  const haptic = useHaptic()
  const toastRef = useRef(toast)
  const hapticRef = useRef(haptic)
  toastRef.current = toast
  hapticRef.current = haptic

  const isMobile = variant === 'mobile'

  // ── Load comments ──────────────────────────────────────
  useEffect(() => {
    if (!reportId) return
    setLoading(true)
    db.getComments(reportId)
      .then(c => setComments(c || []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [reportId])

  // ── Auto-scroll ────────────────────────────────────────
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: comments.length > 1 ? 'smooth' : 'auto' })
    }
  }, [comments])

  // ── Auto-resize textarea ───────────────────────────────
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, isMobile ? 120 : 150) + 'px'
  }, [text, isMobile])

  // ── File upload helper ─────────────────────────────────
  const uploadAndAdd = useCallback(async (file, type) => {
    if (file.size > MAX_FILE_SIZE) {
      toastRef.current.error(`File troppo grande (max ${formatSize(MAX_FILE_SIZE)})`)
      return
    }

    const typeLabels = { photo: 'Foto', video: 'Video', audio: 'Audio' }
    setUploadLabel(typeLabels[type] || 'File')
    setUploading(true)

    try {
      let fileToUpload = file

      if (type === 'photo') {
        const result = await compress(file)
        fileToUpload = result.file
        if (result.wasCompressed) {
          toastRef.current.info(`Compressa: ${formatSize(result.originalSize)} → ${formatSize(result.compressedSize)}`)
        }
      }

      const ext = fileToUpload.name?.split('.').pop() || (type === 'audio' ? 'webm' : 'jpg')
      const path = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const url = await db.uploadFile('attachments', path, fileToUpload)

      setPendingMedia(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        type, url,
        name: fileToUpload.name || `${type}-${Date.now()}.${ext}`,
      }])
      hapticRef.current.light()
    } catch {
      toastRef.current.error(`Errore upload ${typeLabels[type]?.toLowerCase() || 'file'}`)
    }

    setUploading(false)
    setUploadLabel('')
  }, [compress, formatSize])

  // ── Media capture handlers ─────────────────────────────
  const captureFile = useCallback((accept, captureMode, type) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (captureMode) input.capture = captureMode
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (file) uploadAndAdd(file, type)
    }
    input.click()
    setShowMediaBar(false)
    hapticRef.current.light()
  }, [uploadAndAdd])

  const capturePhoto = useCallback(() => captureFile('image/*', 'environment', 'photo'), [captureFile])
  const captureVideo = useCallback(() => captureFile('video/*', 'environment', 'video'), [captureFile])

  const pickGallery = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.multiple = true
    input.onchange = async (e) => {
      for (const file of Array.from(e.target.files || [])) {
        await uploadAndAdd(file, file.type.startsWith('video') ? 'video' : 'photo')
      }
    }
    input.click()
    setShowMediaBar(false)
    hapticRef.current.light()
  }, [uploadAndAdd])

  // ── Audio recording ────────────────────────────────────
  const startAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(audioTimerRef.current)
        setAudioTime(0)
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
        await uploadAndAdd(file, 'audio')
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setAudioTime(0)
      audioTimerRef.current = setInterval(() => setAudioTime(t => t + 1), 1000)
      setShowMediaBar(false)
      hapticRef.current.medium()
      toastRef.current.info('Registrazione avviata...')
    } catch {
      toastRef.current.error('Microfono non disponibile')
    }
  }, [uploadAndAdd])

  const stopAudio = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setRecording(false)
      hapticRef.current.success()
    }
  }

  const removePending = (id) => {
    setPendingMedia(prev => prev.filter(m => m.id !== id))
    hapticRef.current.light()
  }

  // ── Drag & Drop (desktop) ──────────────────────────────
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }, [])
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    for (const file of Array.from(e.dataTransfer?.files || [])) {
      if (file.type.startsWith('image/')) await uploadAndAdd(file, 'photo')
      else if (file.type.startsWith('video/')) await uploadAndAdd(file, 'video')
      else if (file.type.startsWith('audio/')) await uploadAndAdd(file, 'audio')
      else toastRef.current.warning('Formato non supportato. Usa foto, video o audio.')
    }
  }, [uploadAndAdd])

  // ── Send message ───────────────────────────────────────
  const sendMessage = async () => {
    const hasText = text.trim().length > 0
    const hasMedia = pendingMedia.length > 0
    if ((!hasText && !hasMedia) || sending) return

    setSending(true)
    hapticRef.current.medium()

    try {
      let autoLabel = ''
      if (!hasText && hasMedia) {
        if (pendingMedia.length === 1) {
          const m = pendingMedia[0]
          autoLabel = m.type === 'photo' ? '📷 Foto' : m.type === 'video' ? '🎥 Video' : '🎤 Audio'
        } else {
          autoLabel = `📎 ${pendingMedia.length} allegati`
        }
      }

      const commentData = {
        text: hasText ? text.trim() : autoLabel,
        user_id: user?.id,
        user_name: user?.name || 'Utente',
        user_role: user?.role || 'operatore',
        media: hasMedia ? pendingMedia.map(m => ({ type: m.type, url: m.url, name: m.name })) : null,
      }

      const c = await db.addComment(reportId, commentData)
      setComments(prev => [...prev, c])
      setText('')
      setPendingMedia([])
      setShowMediaBar(false)
      hapticRef.current.success()
      if (inputRef.current) inputRef.current.style.height = 'auto'

      // Activity log + notifications (fire & forget)
      db.addActivity(reportId, {
        type: 'comment', detail: commentData.text.slice(0, 100),
        user_id: user?.id, user_name: user?.name,
      }).catch(e => console.warn('Side effect failed:', e.message))

      if (report) {
        const targets = [...new Set([report.created_by, report.assigned_to].filter(id => id && id !== user?.id))]
        targets.forEach(targetId => {
          db.addNotification({
            type: 'comment',
            title: `Nuovo messaggio: ${report.title}`,
            body: `${user?.name}: "${commentData.text.slice(0, 80)}"`,
            report_id: reportId, from_user: user?.id, target_user: targetId,
          }).catch(e => console.warn('Side effect failed:', e.message))
        })
      }
    } catch {
      toastRef.current.error('Errore invio messaggio')
      hapticRef.current.error()
    }

    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const fmtTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  const openLightbox = (comment, photoIndex) => {
    const photos = (comment.media || []).filter(m => m.type === 'photo')
    if (photos.length > 0) setLightboxData({ images: photos, index: photoIndex })
  }

  const canSend = (text.trim() || pendingMedia.length > 0) && !sending

  const mediaActions = useMemo(() => [
    { action: capturePhoto, icon: Camera, label: 'Foto', color: '#3b82f6' },
    { action: captureVideo, icon: Video, label: 'Video', color: '#22c55e' },
    { action: startAudio, icon: Mic, label: 'Audio', color: '#f59e0b' },
    { action: pickGallery, icon: Image, label: 'Galleria', color: '#a855f7' },
  ], [capturePhoto, captureVideo, startAudio, pickGallery])


  // ── RENDER ─────────────────────────────────────────────
  return (
    <div
      className={`flex flex-col relative ${className}`}
      onDragOver={!isMobile ? handleDragOver : undefined}
      onDragLeave={!isMobile ? handleDragLeave : undefined}
      onDrop={!isMobile ? handleDrop : undefined}
    >
      {/* Drag overlay (desktop) */}
      {dragOver && (
        <div className="absolute inset-0 z-30 bg-blue-500/10 border-2 border-dashed border-blue-400/50 rounded-xl flex items-center justify-center backdrop-blur-sm pointer-events-none">
          <div className="text-center">
            <Paperclip size={36} className="text-blue-400 mx-auto mb-2" />
            <p className="text-blue-300 font-semibold text-sm">Rilascia per allegare</p>
          </div>
        </div>
      )}

      {/* ═══ Messages area ═══ */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-[4vw] py-[3vw] space-y-[3vw]' : 'p-4 space-y-3'}`}>
        {loading ? (
          <ChatSkeleton isMobile={isMobile} />
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-muted">
            <MessageCircle size={isMobile ? 48 : 40} className="mb-3 opacity-10" strokeWidth={1.5} />
            <p className={`font-medium ${isMobile ? 'text-base' : 'text-sm'}`}>Nessun messaggio</p>
            <p className={`mt-1 opacity-50 ${isMobile ? 'text-sm' : 'text-xs'}`}>
              {isMobile ? 'Scrivi o allega un file' : 'Scrivi un messaggio o trascina un file'}
            </p>
          </div>
        ) : (
          comments.map(c => (
            <ChatBubble
              key={c.id}
              comment={c}
              isMe={c.user_id === user?.id}
              isMobile={isMobile}
              onPhotoClick={(idx) => openLightbox(c, idx)}
              onDownload={downloadFile}
              toast={toast}
            />
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ═══ Pending media preview ═══ */}
      {pendingMedia.length > 0 && (
        <div className={`shrink-0 border-t border-token bg-surface-1/30 ${isMobile ? 'px-[3vw] py-[2vw]' : 'px-3 py-2'}`}>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {pendingMedia.map(m => (
              <div key={m.id} className="relative shrink-0">
                <div className={`rounded-xl bg-surface-2 border border-token overflow-hidden flex items-center justify-center ${
                  isMobile ? 'w-[16vw] h-[16vw] max-w-[72px] max-h-[72px]' : 'w-16 h-16'
                }`}>
                  {m.type === 'photo'
                    ? <img src={m.url} alt="" className="w-full h-full object-cover" />
                    : m.type === 'video'
                      ? <div className="text-center"><FileVideo size={20} className="text-green-400 mx-auto" /><span className="text-[9px] text-muted mt-0.5 block">Video</span></div>
                      : <div className="text-center"><FileAudio size={20} className="text-orange-400 mx-auto" /><span className="text-[9px] text-muted mt-0.5 block">Audio</span></div>
                  }
                </div>
                <button onClick={() => removePending(m.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                  <X size={10} className="text-white" />
                </button>
              </div>
            ))}
            {uploading && (
              <div className={`shrink-0 rounded-xl bg-surface-2 border border-dashed border-blue-500/30 flex flex-col items-center justify-center ${
                isMobile ? 'w-[16vw] h-[16vw] max-w-[72px] max-h-[72px]' : 'w-16 h-16'
              }`}>
                <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                {uploadLabel && <span className="text-[8px] text-blue-400 mt-1">{uploadLabel}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Media action bar ═══ */}
      {showMediaBar && !recording && (
        <div className={`shrink-0 border-t border-token bg-surface-1/40 ${isMobile ? 'px-[3vw] py-[2.5vw]' : 'px-3 py-2'}`}>
          <div className={`grid grid-cols-4 ${isMobile ? 'gap-[2vw]' : 'gap-2'}`}>
            {mediaActions.map(({ action, icon: Icon, label, color }, i) => (
              <button key={i} onClick={action} disabled={uploading}
                className={`flex flex-col items-center justify-center rounded-xl border border-token bg-surface-2 active:bg-surface-3 transition-all active:scale-95 ${
                  isMobile ? 'py-[2.5vw] gap-1' : 'py-2 gap-0.5'
                } ${uploading ? 'opacity-40 pointer-events-none' : ''}`}>
                <Icon size={isMobile ? 22 : 18} style={{ color }} />
                <span className={`font-medium text-faint ${isMobile ? 'text-xs' : 'text-[10px]'}`}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Audio recording bar ═══ */}
      {recording && (
        <div className={`shrink-0 border-t border-red-500/30 bg-red-500/5 ${isMobile ? 'px-[3vw] py-[3vw]' : 'px-3 py-3'}`}>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className={`text-red-400 font-bold font-mono ${isMobile ? 'text-lg' : 'text-sm'}`}>{fmtTime(audioTime)}</span>
            <span className={`text-faint flex-1 truncate ${isMobile ? 'text-sm' : 'text-xs'}`}>Registrazione in corso...</span>
            <button onClick={stopAudio}
              className={`bg-red-500 text-white rounded-xl flex items-center justify-center gap-2 font-semibold active:bg-red-600 active:scale-95 transition-all ${
                isMobile ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm'
              }`}>
              <Square size={isMobile ? 16 : 14} fill="white" /> Stop
            </button>
          </div>
        </div>
      )}

      {/* ═══ Input bar ═══ */}
      {!recording && (
        <div className={`shrink-0 border-t border-token glass ${
          isMobile ? 'px-[3vw] py-[3vw]' : 'p-3'
        }`} style={isMobile ? { paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 3vw)' } : {}}>
          <div className="flex items-end gap-2">
            <button
              onClick={() => { setShowMediaBar(prev => !prev); hapticRef.current.light() }}
              disabled={uploading}
              className={`shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                showMediaBar ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30' : 'bg-surface-2 text-muted hover:text-gray-300'
              } ${isMobile ? 'w-[12vw] h-[12vw] max-w-12 max-h-12' : 'w-10 h-10'}`}
            >
              {showMediaBar ? <X size={isMobile ? 22 : 18} /> : <Paperclip size={isMobile ? 22 : 18} />}
            </button>

            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio..."
              rows={1}
              className={`flex-1 bg-surface-2 border border-token rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none transition-all ${
                isMobile ? 'px-[4vw] py-[3vw] text-base' : 'px-4 py-2.5 text-sm'
              }`}
              style={{ minHeight: isMobile ? '48px' : '40px', maxHeight: isMobile ? '120px' : '150px' }}
            />

            <button
              onClick={sendMessage}
              disabled={!canSend}
              className={`shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                canSend ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-surface-1 text-faint cursor-not-allowed'
              } ${isMobile ? 'w-[12vw] h-[12vw] max-w-12 max-h-12' : 'w-10 h-10'}`}
            >
              {sending
                ? <div className={`border-2 border-white/30 border-t-white rounded-full animate-spin ${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
                : <Send size={isMobile ? 20 : 16} className="ml-0.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Lightbox ═══ */}
      {lightboxData && (
        <MediaLightbox
          images={lightboxData.images}
          initialIndex={lightboxData.index}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  )
}


// ── ChatSkeleton ─────────────────────────────────────────

function ChatSkeleton({ isMobile }) {
  return (
    <div className="space-y-4 animate-pulse">
      {[false, true, false].map((isRight, i) => (
        <div key={i} className={`flex ${isRight ? 'justify-end' : 'justify-start'}`}>
          <div className={isMobile ? 'max-w-[75%]' : 'max-w-[70%]'}>
            <div className={`flex items-center gap-2 mb-1.5 ${isRight ? 'justify-end' : ''}`}>
              <div className="w-2 h-2 rounded-full bg-surface-2" />
              <div className="h-3 w-16 bg-surface-3 rounded" />
            </div>
            <div className={`rounded-2xl ${isRight ? 'bg-blue-500/10 rounded-tr-sm' : 'bg-surface-2/40 rounded-tl-sm'}`}>
              <div className={`space-y-1.5 ${isMobile ? 'px-[4vw] py-[2.5vw]' : 'px-4 py-3'}`}>
                <div className="h-3.5 bg-surface-2 rounded w-full" />
                <div className="h-3.5 bg-surface-2 rounded w-3/4" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


// ── ChatBubble — Message with text + media + DOWNLOAD ────

function ChatBubble({ comment: c, isMe, isMobile, onPhotoClick, onDownload, toast }) {
  const color = ROLE_COLORS[c.user_role] || '#6b7280'
  const media = c.media || []
  const photos = media.filter(m => m.type === 'photo')
  const videos = media.filter(m => m.type === 'video')
  const audios = media.filter(m => m.type === 'audio')
  const hasMedia = media.length > 0
  const isMediaOnly = hasMedia && (!c.text || c.text.startsWith('📷') || c.text.startsWith('🎥') || c.text.startsWith('🎤') || c.text.startsWith('📎'))

  const handleDownload = async (url, name, type) => {
    toast?.info?.(`Download ${type} in corso...`)
    const ok = await onDownload(url, name)
    if (ok) toast?.success?.(`${type} scaricato!`)
  }

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={isMobile ? 'max-w-[85%]' : 'max-w-[80%]'}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-[11px] font-semibold" style={{ color }}>{c.user_name || 'Utente'}</span>
          <span className="text-[10px] text-faint">{ROLE_LABELS[c.user_role] || c.user_role}</span>
          <span className="text-[10px] text-faint">{timeAgo(c.created_at)}</span>
        </div>

        {/* Bubble */}
        <div className={`rounded-2xl overflow-hidden ${
          isMe ? 'bg-blue-500/12 border border-blue-500/20 rounded-tr-sm' : 'bg-surface-2/40 border border-gray-700/25 rounded-tl-sm'
        }`}>

          {/* ── PHOTOS with download overlay (desktop) ── */}
          {photos.length > 0 && (
            <div className={photos.length === 1 ? '' : 'grid grid-cols-2 gap-0.5'}>
              {photos.map((p, i) => (
                <div key={i} className="relative group">
                  <button onClick={() => onPhotoClick(i)}
                    className={`block w-full overflow-hidden active:opacity-80 transition-opacity ${
                      photos.length === 1 ? (isMobile ? 'max-h-72' : 'max-h-64') : 'aspect-square'
                    }`}>
                    <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                  {/* Download overlay — desktop only */}
                  {!isMobile && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(p.url, p.name || `foto-${i+1}.jpg`, 'Foto') }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center
                        opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 cursor-pointer"
                      title="Scarica foto"
                    >
                      <Download size={14} className="text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── VIDEOS with download (desktop) ── */}
          {videos.map((v, i) => (
            <div key={i} className="p-1.5">
              <VideoPlayer src={v.url} name={v.name} />
              {!isMobile && (
                <button
                  onClick={() => handleDownload(v.url, v.name || `video-${i+1}.mp4`, 'Video')}
                  className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                    bg-surface-2 hover:bg-surface-2 text-faint hover:text-green-400
                    text-[11px] font-medium transition-all group"
                >
                  <ArrowDownToLine size={12} className="group-hover:translate-y-0.5 transition-transform" />
                  Scarica video
                </button>
              )}
            </div>
          ))}

          {/* ── AUDIO with download (desktop) ── */}
          {audios.map((a, i) => (
            <div key={i} className="p-2">
              <MiniAudioPlayer src={a.url} name={a.name} isMobile={isMobile}
                onDownload={!isMobile ? () => handleDownload(a.url, a.name || `audio-${i+1}.webm`, 'Audio') : null} />
            </div>
          ))}

          {/* ── TEXT ── */}
          {c.text && !isMediaOnly && (
            <p className={`text-themed leading-relaxed whitespace-pre-wrap break-words ${
              isMobile ? 'px-[4vw] py-[2.5vw] text-base' : 'px-4 py-2.5 text-[14px]'
            } ${hasMedia ? 'border-t border-gray-700/15' : ''}`}>
              {c.text}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}


// ── MiniAudioPlayer — with optional download ─────────────

function MiniAudioPlayer({ src, name, isMobile, onDownload }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const progress = duration > 0 ? currentTime / duration : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => setDuration(audio.duration)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play().catch(() => {})
    setPlaying(!playing)
  }

  const seekTo = (e) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    audio.currentTime = pct * duration
    setCurrentTime(pct * duration)
  }

  const fmt = (s) => (!s || !isFinite(s)) ? '0:00' : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  return (
    <div className={`flex items-center gap-2.5 bg-surface-2 rounded-xl ${isMobile ? 'px-3 py-2.5' : 'px-3 py-2'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button onClick={togglePlay}
        className={`shrink-0 rounded-full flex items-center justify-center transition-all active:scale-90 ${
          playing ? 'bg-orange-500' : 'bg-orange-500/20 border border-orange-500/50'
        } ${isMobile ? 'w-10 h-10' : 'w-9 h-9'}`}>
        {playing
          ? <Pause size={isMobile ? 16 : 14} className="text-white" fill="white" />
          : <Play size={isMobile ? 16 : 14} className="text-orange-400 ml-0.5" fill="currentColor" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="w-full h-6 flex items-center cursor-pointer" onClick={seekTo} onTouchEnd={seekTo}>
          <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-orange-400 rounded-full transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="flex justify-between">
          <span className={`text-faint font-mono ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}>{fmt(currentTime)}</span>
          <span className={`text-faint font-mono ${isMobile ? 'text-[11px]' : 'text-[10px]'}`}>{fmt(duration)}</span>
        </div>
      </div>

      {/* Download button — desktop only */}
      {onDownload && (
        <button onClick={onDownload}
          className="shrink-0 w-8 h-8 rounded-lg bg-surface-3 hover:bg-orange-500/20 flex items-center justify-center
            text-muted hover:text-orange-400 transition-all"
          title="Scarica audio">
          <Download size={14} />
        </button>
      )}
    </div>
  )
}
