/**
 * ConversationView — Chat view per conversazione diretta 1-a-1
 *
 * Features:
 *  - Header con nome/ruolo dell'altro utente + bottone indietro
 *  - Lista messaggi stile Discord (raggruppati, separatori di data)
 *  - Input bar con testo + media (foto, video, audio)
 *  - Realtime subscription per nuovi messaggi
 *  - Auto-scroll, auto-resize textarea
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { db, supabase } from '../../lib/supabase'
import { ROLES } from '../../lib/constants'
import { useImageCompressor } from '../../hooks/useImageCompressor'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import VideoPlayer from '../media/VideoPlayer'
import MediaLightbox from '../media/MediaLightbox'
import {
  Send, ArrowLeft, Camera, Video, Mic, Image,
  Square, X, Paperclip, Play, Pause, Download,
  Loader, MessageCircle
} from 'lucide-react'

const ROLE_COLORS = { admin: '#7c6aff', tecnico: '#10b981', operatore: '#f59e0b' }
const ROLE_LABELS = { admin: 'Admin', tecnico: 'Tecnico', operatore: 'Operatore' }
const MAX_FILE_SIZE = 50 * 1024 * 1024
const GROUP_THRESHOLD_MS = 5 * 60 * 1000

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

function formatDateSeparator(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Oggi'
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ieri'
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTimestamp(dateStr) {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function shouldShowHeader(messages, index) {
  if (index === 0) return true
  const prev = messages[index - 1], curr = messages[index]
  if (prev.sender_id !== curr.sender_id) return true
  return new Date(curr.created_at) - new Date(prev.created_at) > GROUP_THRESHOLD_MS
}

function shouldShowDateSeparator(messages, index) {
  if (index === 0) return true
  return new Date(messages[index - 1].created_at).toDateString() !== new Date(messages[index].created_at).toDateString()
}

// ── Download utility ──
async function downloadFile(url, filename) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch {
    window.open(url, '_blank')
  }
}

export default function ConversationView({ conversation, user, otherUser, onBack, onMessageSent, variant = 'mobile' }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingMedia, setPendingMedia] = useState([])
  const [showMediaBar, setShowMediaBar] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightboxData, setLightboxData] = useState(null)
  const [recording, setRecording] = useState(false)
  const [audioTime, setAudioTime] = useState(0)

  const chatEndRef = useRef(null)
  const inputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioTimerRef = useRef(null)

  const { compress, formatSize } = useImageCompressor()
  const toast = useToast()
  const haptic = useHaptic()
  const toastRef = useRef(toast)
  const hapticRef = useRef(haptic)
  useEffect(() => { toastRef.current = toast }, [toast])
  useEffect(() => { hapticRef.current = haptic }, [haptic])

  const isMobile = variant === 'mobile'
  const other = otherUser || {}
  const roleColor = ROLE_COLORS[other.role] || ROLE_COLORS.operatore
  const roleLabel = ROLE_LABELS[other.role] || 'Operatore'

  // ── Load messages ──
  useEffect(() => {
    if (!conversation?.id) return
    setLoading(true)
    db.getDirectMessages(conversation.id)
      .then(m => setMessages(m || []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false))
  }, [conversation?.id])

  // ── Realtime subscription ──
  useEffect(() => {
    if (!supabase || !conversation?.id) return
    const channel = supabase
      .channel(`dm-conv-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [conversation?.id])

  // ── Demo mode polling ──
  useEffect(() => {
    if (supabase || !conversation?.id) return
    const interval = setInterval(() => {
      db.getDirectMessages(conversation.id)
        .then(m => setMessages(m || []))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [conversation?.id])

  // ── Auto-scroll ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages])

  // ── Auto-resize textarea ──
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, isMobile ? 120 : 150) + 'px'
  }, [text, isMobile])

  // ── File upload ──
  const uploadAndAdd = useCallback(async (file, type) => {
    if (file.size > MAX_FILE_SIZE) {
      toastRef.current.error(`File troppo grande (max ${formatSize(MAX_FILE_SIZE)})`)
      return
    }
    setUploading(true)
    try {
      let fileToUpload = file
      if (type === 'photo') {
        const result = await compress(file)
        fileToUpload = result.file
      }
      const ext = fileToUpload.name?.split('.').pop() || (type === 'audio' ? 'webm' : 'jpg')
      const path = `dm/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const url = await db.uploadFile('attachments', path, fileToUpload)
      setPendingMedia(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
        type, url, name: fileToUpload.name || `${type}-${Date.now()}.${ext}`,
      }])
      hapticRef.current.light()
    } catch {
      toastRef.current.error('Errore upload file')
    }
    setUploading(false)
  }, [compress, formatSize])

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
  }, [uploadAndAdd])

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
    } catch {
      toastRef.current.error('Microfono non disponibile')
    }
  }, [uploadAndAdd])

  const stopAudio = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setRecording(false)
    }
  }

  const removePending = (id) => {
    setPendingMedia(prev => prev.filter(m => m.id !== id))
  }

  // ── Send message ──
  const sendMessage = async () => {
    const hasText = text.trim().length > 0
    const hasMedia = pendingMedia.length > 0
    if ((!hasText && !hasMedia) || sending) return
    setSending(true)
    hapticRef.current.medium()
    try {
      let msgText = text.trim()
      if (!hasText && hasMedia) {
        if (pendingMedia.length === 1) {
          const m = pendingMedia[0]
          msgText = m.type === 'photo' ? 'Foto' : m.type === 'video' ? 'Video' : 'Audio'
        } else {
          msgText = `${pendingMedia.length} allegati`
        }
      }
      const newMsg = await db.sendDirectMessage(conversation.id, {
        senderId: user.id,
        senderName: user.name,
        senderRole: user.role,
        text: msgText,
        media: hasMedia ? pendingMedia.map(m => ({ type: m.type, url: m.url, name: m.name })) : null,
        orgId: user.org_id || 'default',
      })
      setMessages(prev => {
        if (prev.some(m => m.id === newMsg.id)) return prev
        return [...prev, newMsg]
      })
      setText('')
      setPendingMedia([])
      setShowMediaBar(false)
      hapticRef.current.success()
      if (inputRef.current) inputRef.current.style.height = 'auto'
      onMessageSent?.()
    } catch (err) {
      toastRef.current.error('Errore invio messaggio')
      console.warn('[ConvView] Errore invio:', err)
    }
    setSending(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Render message ──
  const renderMessage = (msg, index) => {
    const isOwn = msg.sender_id === user.id
    const showDate = shouldShowDateSeparator(messages, index)
    const showHeader = shouldShowHeader(messages, index)
    const senderRole = msg.sender_role || 'operatore'
    const senderColor = ROLE_COLORS[senderRole] || ROLE_COLORS.operatore
    const senderLabel = ROLE_LABELS[senderRole] || 'Operatore'

    return (
      <div key={msg.id}>
        {/* Date separator */}
        {showDate && (
          <div className="flex items-center gap-3 my-4 px-2">
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-tertiary)' }}>
              {formatDateSeparator(msg.created_at)}
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
          </div>
        )}

        {/* Message */}
        <div className={`flex gap-2.5 px-3 ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
          {/* Avatar */}
          {showHeader ? (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0 mt-0.5"
              style={{
                background: `linear-gradient(135deg, ${senderColor}, ${senderColor}99)`,
                fontSize: 12,
              }}
            >
              {getInitials(msg.sender_name)}
            </div>
          ) : (
            <div className="w-9 shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {/* Header (name + role + time) */}
            {showHeader && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-semibold text-[13px]" style={{ color: senderColor }}>
                  {msg.sender_name || 'Utente'}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: `${senderColor}22`, color: senderColor }}
                >
                  {senderLabel}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatTimestamp(msg.created_at)}
                </span>
              </div>
            )}

            {/* Text */}
            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
              {msg.text}
            </p>

            {/* Media */}
            {msg.media && msg.media.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1.5">
                {msg.media.map((m, mi) => (
                  <div key={mi} className="relative group">
                    {m.type === 'photo' ? (
                      <img
                        src={m.url}
                        alt=""
                        className="rounded-lg cursor-pointer object-cover"
                        style={{ maxWidth: isMobile ? '60vw' : 300, maxHeight: 250 }}
                        onClick={() => setLightboxData({ url: m.url, type: 'photo', name: m.name })}
                      />
                    ) : m.type === 'video' ? (
                      <div style={{ maxWidth: isMobile ? '70vw' : 350 }}>
                        <VideoPlayer src={m.url} />
                      </div>
                    ) : m.type === 'audio' ? (
                      <audio controls src={m.url} className="max-w-[250px]" />
                    ) : null}
                    {/* Download overlay */}
                    {!isMobile && (
                      <button
                        onClick={() => downloadFile(m.url, m.name)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.6)' }}
                      >
                        <Download size={14} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-3 shrink-0"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {onBack && (
          <button onClick={onBack} className="p-1.5 rounded-lg press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={22} />
          </button>
        )}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
          style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`, fontSize: 13 }}
        >
          {getInitials(other.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
            {other.name || 'Utente'}
          </p>
          <p className="text-[12px]" style={{ color: roleColor }}>
            {roleLabel}
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
              <MessageCircle size={28} style={{ color: 'var(--color-text-tertiary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              Invia il primo messaggio a {other.name || 'questo utente'}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => renderMessage(msg, i))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Pending media preview */}
      {pendingMedia.length > 0 && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto" style={{ borderTop: '1px solid var(--color-border)' }}>
          {pendingMedia.map(m => (
            <div key={m.id} className="relative shrink-0">
              {m.type === 'photo' ? (
                <img src={m.url} alt="" className="w-16 h-16 rounded-lg object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
                  {m.type === 'video' ? <Video size={20} style={{ color: 'var(--color-text-tertiary)' }} /> : <Mic size={20} style={{ color: 'var(--color-text-tertiary)' }} />}
                </div>
              )}
              <button
                onClick={() => removePending(m.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-error, #ef4444)' }}
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording bar */}
      {recording && (
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{ background: 'rgba(239,68,68,0.1)', borderTop: '1px solid var(--color-border)' }}
        >
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-semibold" style={{ color: '#ef4444' }}>
            {Math.floor(audioTime / 60)}:{String(audioTime % 60).padStart(2, '0')}
          </span>
          <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>Registrazione in corso...</span>
          <button onClick={stopAudio} className="p-2 rounded-lg press-scale" style={{ color: '#ef4444' }}>
            <Square size={18} fill="#ef4444" />
          </button>
        </div>
      )}

      {/* Media bar */}
      {showMediaBar && !recording && (
        <div
          className="flex items-center gap-1 px-3 py-2"
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <button onClick={capturePhoto} className="flex flex-col items-center gap-1 p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <Camera size={20} />
            <span className="text-[10px]">Foto</span>
          </button>
          <button onClick={captureVideo} className="flex flex-col items-center gap-1 p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <Video size={20} />
            <span className="text-[10px]">Video</span>
          </button>
          <button onClick={pickGallery} className="flex flex-col items-center gap-1 p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <Image size={20} />
            <span className="text-[10px]">Galleria</span>
          </button>
          <button onClick={startAudio} className="flex flex-col items-center gap-1 p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <Mic size={20} />
            <span className="text-[10px]">Audio</span>
          </button>
          <button onClick={() => setShowMediaBar(false)} className="ml-auto p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Input bar */}
      {!recording && (
        <div
          className="flex items-end gap-2 px-3 py-2"
          style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          <button
            onClick={() => setShowMediaBar(v => !v)}
            className="p-2 rounded-xl press-scale shrink-0 mb-0.5"
            style={{ color: showMediaBar ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
          >
            <Paperclip size={20} />
          </button>

          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un messaggio..."
            rows={1}
            className="flex-1 resize-none text-sm py-2 px-3 rounded-xl"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              outline: 'none',
              maxHeight: isMobile ? 120 : 150,
            }}
          />

          <button
            onClick={sendMessage}
            disabled={sending || uploading || (!text.trim() && pendingMedia.length === 0)}
            className="p-2.5 rounded-xl press-scale shrink-0 mb-0.5 text-white disabled:opacity-40"
            style={{ background: 'var(--gradient-primary)' }}
          >
            {sending ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: 'var(--color-surface-2)' }}>
          <Loader size={14} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Caricamento in corso...</span>
        </div>
      )}

      {/* Lightbox */}
      {lightboxData && (
        <MediaLightbox
          media={lightboxData}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  )
}
