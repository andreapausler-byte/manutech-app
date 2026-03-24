/**
 * ConversationView — Premium chat view con bubble layout stile iMessage/WhatsApp
 *
 * Features:
 *  - Chat bubbles: propri a destra (gradient), altri a sinistra (surface)
 *  - Bubble tails con CSS clip-path
 *  - Pill date separators con glass effect
 *  - Glass input bar + send/mic toggle
 *  - Message entrance animations
 *  - Media support (foto, video, audio)
 *  - Realtime subscription
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
  Square, X, Paperclip, Download,
  Loader, MessageCircle, Sparkles, Check, CheckCheck
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

function isLastInGroup(messages, index) {
  if (index === messages.length - 1) return true
  const curr = messages[index], next = messages[index + 1]
  if (curr.sender_id !== next.sender_id) return true
  return new Date(next.created_at) - new Date(curr.created_at) > GROUP_THRESHOLD_MS
}

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
  const [sendAnimating, setSendAnimating] = useState(false)

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
    setSendAnimating(true)
    setTimeout(() => setSendAnimating(false), 350)
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

  const hasContent = text.trim().length > 0 || pendingMedia.length > 0

  // ── Render message (bubble layout) ──
  const renderMessage = (msg, index) => {
    const isOwn = msg.sender_id === user.id
    const showDate = shouldShowDateSeparator(messages, index)
    const showHeader = shouldShowHeader(messages, index)
    const isLast = isLastInGroup(messages, index)
    const senderRole = msg.sender_role || 'operatore'
    const senderColor = ROLE_COLORS[senderRole] || ROLE_COLORS.operatore

    return (
      <div key={msg.id} className="msg-enter">
        {/* Date separator — floating pill */}
        {showDate && (
          <div className="flex justify-center my-5">
            <span
              className="px-4 py-1.5 rounded-full text-[13px] font-semibold"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {formatDateSeparator(msg.created_at)}
            </span>
          </div>
        )}

        {/* Bubble message */}
        <div
          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-4 ${showHeader ? 'mt-3' : 'mt-0.5'}`}
        >
          {/* Avatar (only for other user, first in group) */}
          {!isOwn && showHeader && (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 mt-1 mr-2.5"
              style={{
                background: `linear-gradient(135deg, ${senderColor}, ${senderColor}bb)`,
                fontSize: 13,
                boxShadow: `0 2px 8px ${senderColor}33`,
              }}
            >
              {getInitials(msg.sender_name)}
            </div>
          )}
          {!isOwn && !showHeader && <div className="w-10 shrink-0 mr-2.5" />}

          {/* Bubble */}
          <div
            className={`relative max-w-[78%] ${isMobile ? 'max-w-[82%]' : ''} ${
              isOwn
                ? `${isLast ? 'bubble-tail-right' : ''}`
                : `${isLast ? 'bubble-tail-left' : ''}`
            }`}
            style={{
              background: isOwn
                ? 'var(--gradient-primary)'
                : 'var(--color-surface-2)',
              borderRadius: isOwn
                ? (isLast ? '18px 18px 4px 18px' : '18px 18px 18px 18px')
                : (isLast ? '18px 18px 18px 4px' : '18px 18px 18px 18px'),
              padding: '10px 14px',
              boxShadow: isOwn
                ? '0 2px 12px rgba(124, 106, 255, 0.2)'
                : 'var(--shadow-xs)',
            }}
          >
            {/* Sender name (only other, first in group) */}
            {!isOwn && showHeader && (
              <p
                className="text-[13px] font-semibold mb-0.5"
                style={{ color: senderColor }}
              >
                {msg.sender_name || 'Utente'}
              </p>
            )}

            {/* Media */}
            {msg.media && msg.media.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {msg.media.map((m, mi) => (
                  <div key={mi} className="relative group">
                    {m.type === 'photo' ? (
                      <img
                        src={m.url}
                        alt=""
                        className="rounded-xl cursor-pointer object-cover"
                        style={{
                          maxWidth: isMobile ? '55vw' : 280,
                          maxHeight: 220,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        }}
                        onClick={() => setLightboxData({ url: m.url, type: 'photo', name: m.name })}
                      />
                    ) : m.type === 'video' ? (
                      <div className="rounded-xl overflow-hidden" style={{ maxWidth: isMobile ? '65vw' : 320 }}>
                        <VideoPlayer src={m.url} />
                      </div>
                    ) : m.type === 'audio' ? (
                      <audio controls src={m.url} className="max-w-[230px]" style={{ filter: isOwn ? 'brightness(1.3) invert(0)' : 'none' }} />
                    ) : null}
                    {!isMobile && (
                      <button
                        onClick={() => downloadFile(m.url, m.name)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.55)' }}
                      >
                        <Download size={13} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Text + timestamp row */}
            <div className="flex items-end gap-2">
              <p
                className="text-[15px] leading-relaxed break-words whitespace-pre-wrap flex-1"
                style={{ color: isOwn ? '#fff' : 'var(--color-text)' }}
              >
                {msg.text}
              </p>
              <span
                className="text-[11px] shrink-0 flex items-center gap-0.5 translate-y-0.5"
                style={{
                  color: isOwn ? 'rgba(255,255,255,0.6)' : 'var(--color-text-tertiary)',
                }}
              >
                {formatTimestamp(msg.created_at)}
                {isOwn && (
                  <CheckCheck size={14} style={{ opacity: 0.6, marginLeft: 1 }} />
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Header — Glass effect */}
      <div
        className="flex items-center gap-3.5 px-4 py-4 shrink-0"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          borderBottom: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={26} />
          </button>
        )}
        {/* Avatar with online dot */}
        <div className="relative">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
            style={{
              background: `linear-gradient(135deg, ${roleColor}, ${roleColor}bb)`,
              fontSize: 15,
              boxShadow: `0 2px 10px ${roleColor}30`,
            }}
          >
            {getInitials(other.name)}
          </div>
          <div
            className="online-dot absolute -bottom-0.5 -right-0.5"
            style={{ borderColor: 'var(--glass-bg)' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate" style={{ color: 'var(--color-text)' }}>
            {other.name || 'Utente'}
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className="text-[12px] px-2 py-0.5 rounded-md font-semibold"
              style={{ background: `${roleColor}18`, color: roleColor }}
            >
              {roleLabel}
            </span>
            <span className="text-[12px] font-medium" style={{ color: '#3ddc84' }}>Online</span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={24} className="animate-spin" style={{ color: 'var(--color-text-tertiary)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center animate-scale-in"
                style={{
                  background: 'var(--gradient-primary)',
                  opacity: 0.12,
                }}
              >
                <MessageCircle size={40} />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center animate-scale-in"
                style={{ animationDelay: '100ms' }}
              >
                <Sparkles size={28} style={{ color: 'var(--color-primary)' }} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Inizia la conversazione con
              </p>
              <p
                className="text-base font-bold mt-0.5"
                style={{
                  background: 'var(--gradient-primary)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {other.name || 'questo utente'}
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => renderMessage(msg, i))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Pending media preview */}
      {pendingMedia.length > 0 && (
        <div
          className="flex gap-2 px-3 py-2.5 overflow-x-auto"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          {pendingMedia.map(m => (
            <div key={m.id} className="relative shrink-0 animate-scale-in">
              {m.type === 'photo' ? (
                <img src={m.url} alt="" className="w-16 h-16 rounded-xl object-cover" style={{ boxShadow: 'var(--shadow-sm)' }} />
              ) : (
                <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
                  {m.type === 'video' ? <Video size={20} style={{ color: 'var(--color-text-tertiary)' }} /> : <Mic size={20} style={{ color: 'var(--color-text-tertiary)' }} />}
                </div>
              )}
              <button
                onClick={() => removePending(m.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-md"
                style={{ background: '#ef4444' }}
              >
                <X size={11} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording bar */}
      {recording && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 animate-fade-in"
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-bold tracking-wide" style={{ color: '#ef4444' }}>
            {Math.floor(audioTime / 60)}:{String(audioTime % 60).padStart(2, '0')}
          </span>
          <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>Registrazione...</span>
          <button onClick={stopAudio} className="p-2.5 rounded-xl press-scale" style={{ background: 'rgba(239,68,68,0.12)' }}>
            <Square size={16} fill="#ef4444" style={{ color: '#ef4444' }} />
          </button>
        </div>
      )}

      {/* Media bar */}
      {showMediaBar && !recording && (
        <div
          className="flex items-center gap-1 px-3 py-2 animate-slide-up"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          {[
            { icon: Camera, label: 'Foto', action: capturePhoto },
            { icon: Video, label: 'Video', action: captureVideo },
            { icon: Image, label: 'Galleria', action: pickGallery },
            { icon: Mic, label: 'Audio', action: startAudio },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl press-scale transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <Icon size={22} />
              </div>
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
          <button onClick={() => setShowMediaBar(false)} className="ml-auto p-2 rounded-xl press-scale" style={{ color: 'var(--color-text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Input bar — Glass effect */}
      {!recording && (
        <div
          className="flex items-end gap-2.5 px-4 py-3"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
          }}
        >
          <button
            onClick={() => setShowMediaBar(v => !v)}
            className="p-2.5 rounded-xl press-scale shrink-0 mb-0.5 transition-colors"
            style={{
              color: showMediaBar ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
              background: showMediaBar ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
            }}
          >
            <Paperclip size={22} />
          </button>

          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Messaggio..."
            rows={1}
            className="flex-1 resize-none rounded-2xl search-chat"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              outline: 'none',
              fontSize: 16,
              lineHeight: '1.5',
              padding: '12px 16px',
              minHeight: 48,
              maxHeight: isMobile ? 130 : 160,
            }}
          />

          {hasContent ? (
            <button
              onClick={sendMessage}
              disabled={sending || uploading}
              className={`p-3 rounded-2xl press-scale shrink-0 mb-0.5 text-white disabled:opacity-40 ${sendAnimating ? 'send-pop' : ''}`}
              style={{
                background: 'var(--gradient-primary)',
                boxShadow: '0 2px 12px rgba(124, 106, 255, 0.35)',
              }}
            >
              {sending ? <Loader size={22} className="animate-spin" /> : <Send size={22} />}
            </button>
          ) : (
            <button
              onClick={startAudio}
              className="p-3 rounded-2xl press-scale shrink-0 mb-0.5"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Mic size={22} />
            </button>
          )}
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: 'var(--color-surface-2)' }}>
          <Loader size={14} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Caricamento...</span>
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
