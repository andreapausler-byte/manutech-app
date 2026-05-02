import { useState, useEffect, useRef } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo } from '../../lib/constants'
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
  ArrowLeft, MoreVertical, Send, Paperclip, Mic,
  Check, X, AlertTriangle, ArrowRight, Zap, Clock as ClockIcon,
  CheckCircle2, XCircle, Wrench, MessageCircle, History,
  Image as ImageIcon, Video, Mic as MicIcon, Expand, Plus,
  FileEdit, ClipboardCheck, Package,
} from 'lucide-react'
import VoiceUpdateFlow from '../voice/VoiceUpdateFlow'
import VoiceCloseFlow from '../voice/VoiceCloseFlow'
import VoiceNoteFlow from '../voice/VoiceNoteFlow'
import VoiceSpareRequestFlow from '../voice/VoiceSpareRequestFlow'

// ─────────────────────────────────────────────────────────────
// Design tokens — Compact variant (handoff Dettaglio Segnalazione)
// ─────────────────────────────────────────────────────────────
const D = {
  bg: '#050810',
  card: '#0d1219',
  composer: '#11161e',
  raised: '#1a2030',
  borderDashed: '#2a3344',
  textPrimary: '#f1f5f9',
  textBody: '#e8edf3',
  textSecondary: '#cbd5e1',
  textMuted: '#9ca3af',
  textSubtle: '#7d8a9c',
  textFaint: '#5d6b80',
  separator: '#3d4756',
  accent: '#7c3aed',
  accentLight: '#a78bfa',
  accentGradient: 'linear-gradient(135deg, #6366f1, #7c3aed)',
  accentShadow: '0 8px 20px rgba(124,58,237,0.4)',
  aiCardBg: 'linear-gradient(135deg, rgba(124,58,237,0.16), rgba(99,102,241,0.08))',
  aiCardBorder: '1px solid rgba(124,58,237,0.35)',
}

// Design status colors (handoff palette — leggermente diverse da constants.js)
const STATUS_META = {
  aperta:           { color: '#ef4444', icon: AlertTriangle, sub: 'In attesa di assegnazione' },
  assegnata:        { color: '#f59e0b', icon: ArrowRight,    sub: 'Tecnico assegnato' },
  in_lavorazione:   { color: '#06b6d4', icon: Zap,           sub: 'Intervento in corso' },
  in_attesa_ricambi:{ color: '#eab308', icon: ClockIcon,     sub: 'Attesa fornitura ricambi' },
  risolta:          { color: '#10b981', icon: CheckCircle2,  sub: 'Intervento completato' },
  chiuso:           { color: '#7d8a9c', icon: XCircle,       sub: 'Segnalazione archiviata' },
}

// 5 stati nel flusso lineare (chiuso è terminale fuori flow)
const FLOW_STATUSES = ['aperta', 'assegnata', 'in_lavorazione', 'in_attesa_ricambi', 'risolta']
const ALL_STATUSES = [...FLOW_STATUSES, 'chiuso']

// ─────────────────────────────────────────────────────────────
// Progress segments — 5 segmenti orizzontali, primo colorato per stato attivo/passato
// ─────────────────────────────────────────────────────────────
function ProgressSegments({ status }) {
  const isChiuso = status === 'chiuso'
  const idx = isChiuso ? FLOW_STATUSES.length - 1 : FLOW_STATUSES.indexOf(status)
  const activeColor = STATUS_META[status]?.color || D.textFaint

  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
      {FLOW_STATUSES.map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= idx ? activeColor : D.raised,
            transition: 'background 0.25s ease',
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Status bottom sheet — 6 stati selezionabili
// ─────────────────────────────────────────────────────────────
function StatusSheet({ open, onClose, current, onSelect, busy }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-sheet-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.65)', animation: 'fadeIn 0.18s ease both',
      }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 500,
          background: D.card, borderRadius: '20px 20px 0 0',
          padding: '14px 14px 28px', maxHeight: '80vh', overflowY: 'auto',
          animation: 'slideUp 0.22s ease both',
          border: `1px solid ${D.raised}`, borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: D.raised }} />
        </div>
        <h3 id="status-sheet-title" style={{
          fontSize: 15, fontWeight: 600, color: D.textPrimary,
          margin: '0 0 14px', letterSpacing: -0.2,
        }}>
          Cambia stato
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_STATUSES.map(s => {
            const meta = STATUS_META[s]
            const label = STATUS[s]?.label || s
            const Icon = meta.icon
            const active = current === s
            return (
              <button
                key={s}
                onClick={() => !active && !busy && onSelect(s)}
                disabled={active || busy}
                className="press-scale"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 12px', borderRadius: 12,
                  background: active ? `${meta.color}14` : D.raised,
                  border: `1px solid ${active ? `${meta.color}55` : 'transparent'}`,
                  color: D.textPrimary, textAlign: 'left',
                  cursor: active ? 'default' : 'pointer',
                  opacity: busy && !active ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${meta.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={16} style={{ color: meta.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.textPrimary, letterSpacing: -0.1 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 11, color: D.textSubtle, marginTop: 1 }}>
                    {meta.sub}
                  </div>
                </div>
                {active && <Check size={16} style={{ color: meta.color }} />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Closure form (bottom sheet) — riusato dal vecchio design
// ─────────────────────────────────────────────────────────────
function ClosureSheet({ open, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ hours: '', parts: '', rootCause: '', action: '' })
  if (!open) return null
  const submit = () => {
    if (!form.hours || !form.rootCause.trim()) return
    onSubmit({
      closure_hours: parseFloat(form.hours),
      closure_parts: form.parts.trim() || null,
      closure_root_cause: form.rootCause.trim(),
      closure_action: form.action.trim() || null,
      closed_at: new Date().toISOString(),
    })
  }
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="closure-sheet-title"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', animation: 'fadeIn 0.18s ease both' }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 500,
          background: D.card, borderRadius: '20px 20px 0 0',
          padding: '14px 14px 28px', maxHeight: '90vh', overflowY: 'auto',
          animation: 'slideUp 0.22s ease both',
          border: `1px solid ${D.raised}`, borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: D.raised }} />
        </div>
        <h3 id="closure-sheet-title" style={{ fontSize: 15, fontWeight: 600, color: D.textPrimary, margin: '0 0 14px', letterSpacing: -0.2 }}>
          Chiusura intervento
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldLabel label="Ore lavoro *">
              <input type="number" step="0.5" min="0" value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="es. 2.5" style={inputStyle} />
            </FieldLabel>
            <FieldLabel label="Ricambi usati">
              <input type="text" value={form.parts}
                onChange={e => setForm(f => ({ ...f, parts: e.target.value }))}
                placeholder="es. Cuscinetto" style={inputStyle} />
            </FieldLabel>
          </div>
          <FieldLabel label="Causa radice *">
            <textarea value={form.rootCause}
              onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))}
              placeholder="Cosa ha causato il problema?"
              rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </FieldLabel>
          <FieldLabel label="Azione correttiva">
            <textarea value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              placeholder="Cosa è stato fatto per risolvere?"
              rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </FieldLabel>
          <button onClick={submit} disabled={busy || !form.hours || !form.rootCause.trim()}
            className="press-scale"
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: D.accentGradient, color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none',
              cursor: 'pointer', opacity: (busy || !form.hours || !form.rootCause.trim()) ? 0.5 : 1,
              boxShadow: D.accentShadow, letterSpacing: -0.1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={16} /> Conferma chiusura
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', borderRadius: 10, padding: '10px 12px', fontSize: 13,
  background: D.raised, border: `1px solid ${D.raised}`,
  color: D.textPrimary, outline: 'none',
  fontFamily: 'inherit',
}

function FieldLabel({ label, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 10, color: D.textSubtle,
        marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
      }}>{label}</label>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Chip — pill compatta per priorità / categoria / area
// ─────────────────────────────────────────────────────────────
function Chip({ icon, label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '5px 9px', borderRadius: 5,
      fontSize: 11, fontWeight: 500, lineHeight: 1.3,
      background: color ? `${color}1c` : D.raised,
      color: color || D.textSecondary,
      border: `1px solid ${color ? `${color}33` : D.raised}`,
      whiteSpace: 'nowrap', letterSpacing: -0.1,
    }}>
      {icon ? <span style={{ fontSize: 11 }}>{icon}</span> : null}
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Pinned composer — quick reply (solo Dettagli / Cronologia)
// ─────────────────────────────────────────────────────────────
function ComposerBar({ onSend, sending }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const handleSend = () => {
    const v = text.trim()
    if (!v || sending) return
    onSend(v)
    setText('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  return (
    <div style={{
      flexShrink: 0,
      background: 'rgba(5,8,16,0.95)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderTop: `1px solid ${D.raised}`,
      padding: '8px 10px',
      paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: D.composer, border: `1px solid ${D.raised}`,
        borderRadius: 22, padding: '4px 6px 4px 12px',
      }}>
        <Paperclip size={16} style={{ color: D.textSubtle, flexShrink: 0 }} />
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => {
            setText(e.target.value)
            const el = e.target
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 96) + 'px'
          }}
          onKeyDown={onKey}
          placeholder="Aggiorna o rispondi..."
          rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: D.textBody, fontSize: 13, resize: 'none',
            fontFamily: 'inherit', padding: '8px 0', lineHeight: 1.4,
            minHeight: 20, maxHeight: 96,
          }}
        />
        <button
          aria-label="Registra audio"
          className="press-scale"
          style={{
            width: 32, height: 32, borderRadius: 16,
            background: D.raised, color: D.accentLight,
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          <Mic size={15} />
        </button>
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          aria-label="Invia messaggio"
          className="press-scale"
          style={{
            width: 32, height: 32, borderRadius: 16,
            background: D.accent, color: '#fff',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: text.trim() ? 'pointer' : 'not-allowed',
            opacity: text.trim() && !sending ? 1 : 0.4,
            transition: 'opacity 0.15s',
          }}
        >
          {sending
            ? <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pulse 0.6s linear infinite' }} />
            : <Send size={14} style={{ marginLeft: 1 }} />}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function ReportDetail({ report: initialReport, user, onBack }) {
  const [report, setReport] = useState(initialReport)
  const [activeTab, setActiveTab] = useState('details')
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  const [closureSheetOpen, setClosureSheetOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [sendingQuick, setSendingQuick] = useState(false)
  const [chatCount, setChatCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [voiceFlow, setVoiceFlow] = useState(null) // null|'update'|'close'|'note'|'spare'
  const [addingMedia, setAddingMedia] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()

  const meta = STATUS_META[report.status] || STATUS_META.aperta
  const statusLabel = STATUS[report.status]?.label || report.status
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = report.type ? REPORT_TYPES[report.type] : null
  const canUpdate = user.role === 'tecnico' || user.role === 'admin'
  const isMine = report.assigned_to === user.id
  const showTakeOver = canUpdate && (report.status === 'aperta' || (!isMine && report.assigned_to == null))
  const showTechActions = (user.role === 'tecnico' && (isMine || !report.assigned_to)) || user.role === 'admin'

  // Conta messaggi e attività per i badge dei tab
  useEffect(() => {
    let cancelled = false
    db.getComments(report.id).then(c => { if (!cancelled) setChatCount((c || []).length) }).catch(() => {})
    db.getActivities?.(report.id)?.then(a => { if (!cancelled) setHistoryCount((a || []).length) }).catch(() => {})
    return () => { cancelled = true }
  }, [report.id])

  // ─── Status update ────────────────────────────────────
  const updateStatus = async (s, extraUpdates = {}, closureData = null) => {
    if (updating) return false
    setUpdating(true)
    haptic.medium()
    try {
      const oldStatus = report.status
      const updated = await db.updateReport(report.id, { status: s, ...extraUpdates })
      setReport(r => ({ ...r, ...updated }))
      const lbl = STATUS[s]?.label || s
      toast.success(`Stato → ${lbl}`)
      const detail = s === 'risolta' && closureData?.closure_hours
        ? `Chiuso in ${closureData.closure_hours}h — Causa: ${closureData.closure_root_cause}`
        : null
      db.addActivity(report.id, {
        type: 'status_change',
        from_status: oldStatus, to_status: s,
        user_id: user.id, user_name: user.name,
        detail,
      }).catch(e => console.warn('Side effect failed:', e.message))
      const recipients = new Set()
      if (report.created_by) recipients.add(report.created_by)
      if (report.assigned_to) recipients.add(report.assigned_to)
      recipients.delete(user.id)
      for (const targetId of recipients) {
        db.addNotification({
          type: 'status_change',
          title: `Stato aggiornato: ${report.title}`,
          body: `${user.name} ha cambiato lo stato a "${lbl}"`,
          report_id: report.id, from_user: user.id, target_user: targetId,
        }).catch(e => console.warn('Side effect failed:', e.message))
      }
      return true
    } catch (err) {
      console.error('[ManuTech] Errore aggiornamento stato:', err)
      toast.error(`Errore: ${err?.message || 'sconosciuto'}`)
      return false
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusSelect = (s) => {
    setStatusSheetOpen(false)
    if (s === 'risolta' && report.status !== 'risolta') {
      setClosureSheetOpen(true)
      return
    }
    updateStatus(s)
  }

  const handleTakeOver = async () => {
    if (updating) return
    haptic.medium()
    const ok = await updateStatus('in_lavorazione', {
      assigned_to: user.id,
      assigned_to_name: user.name,
    })
    if (ok) toast.success('Hai preso in carico la segnalazione')
  }

  const handleClosureSubmit = async (closureData) => {
    const ok = await updateStatus('risolta', closureData, closureData)
    if (ok) setClosureSheetOpen(false)
  }

  // ─── Aggiungi foto al ticket esistente ────────────────
  const handleAddPhoto = (kind = 'camera') => {
    if (addingMedia) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/*'
    if (kind === 'camera') input.capture = 'environment'
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return
      setAddingMedia(true)
      try {
        const uploaded = []
        for (const file of files) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `reports/${report.id}/${Date.now()}-${safe}`
          const url = await db.uploadFile('attachments', path, file)
          uploaded.push({
            type: file.type.startsWith('image/') ? 'photo' : 'document',
            name: file.name,
            url,
          })
        }
        const newMedia = [...(report.media || []), ...uploaded]
        const updated = await db.updateReport(report.id, { media: newMedia })
        setReport(r => ({ ...r, ...updated, media: newMedia }))
        haptic.success?.()
        toast.success(uploaded.length === 1 ? 'Foto aggiunta' : `${uploaded.length} foto aggiunte`)
      } catch (err) {
        toast.error('Errore upload: ' + (err.message || 'riprova'))
      }
      setAddingMedia(false)
    }
    input.click()
  }

  // ─── Quick reply (composer pinato) ────────────────────
  const handleQuickSend = async (text) => {
    setSendingQuick(true)
    try {
      await db.addComment(report.id, {
        text, user_id: user.id, user_name: user.name, user_role: user.role,
      })
      setChatCount(c => c + 1)
      haptic.light()
    } catch (err) {
      toast.error(`Invio fallito: ${err?.message || 'errore'}`)
    } finally {
      setSendingQuick(false)
    }
  }

  // ─── Render ───────────────────────────────────────────
  const photos = (report.media || []).filter(m => m.type === 'photo')
  const videos = (report.media || []).filter(m => m.type === 'video')
  const audios = (report.media || []).filter(m => m.type === 'audio')

  const tickeId = `TK-${String(report.id).replace(/[^0-9]/g, '').slice(-4).padStart(4, '0') || '0000'}`
  const eyebrowParts = [
    tickeId,
    timeAgo(report.created_at),
    report.created_by_name,
  ].filter(Boolean)

  return (
    <div
      className="flex flex-col min-h-screen min-h-[100dvh]"
      style={{
        background: D.bg, color: D.textBody,
      }}
    >
      {/* ═══ Header ═══ */}
      <header style={{
        flexShrink: 0,
        background: D.bg,
        borderBottom: `1px solid ${D.raised}`,
        padding: '4px 12px 8px',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 8 }}>
          <button
            onClick={onBack}
            aria-label="Indietro"
            className="press-scale"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'transparent', border: 'none', color: D.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, cursor: 'pointer', marginTop: 2,
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              fontSize: 10, color: D.textSubtle, fontWeight: 500,
              fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5,
              marginBottom: 2,
            }}>
              {eyebrowParts.map((p, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && (
                    <span aria-hidden="true" style={{
                      width: 3, height: 3, borderRadius: '50%',
                      background: D.separator, margin: '0 6px',
                    }} />
                  )}
                  <span style={{ color: i === 0 ? D.textFaint : D.textSubtle }}>{p}</span>
                </span>
              ))}
            </div>
            <h1 style={{
              fontSize: 15, fontWeight: 600, lineHeight: 1.2,
              letterSpacing: -0.2, color: D.textPrimary,
              margin: 0, display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {report.title}
            </h1>
          </div>
          {(user.role === 'admin' || user.role === 'tecnico') && (
            <ShareGuestLink reportId={report.id} reportTitle={report.title} />
          )}
          <button
            aria-label="Altre opzioni"
            className="press-scale"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: D.raised, border: 'none', color: D.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, cursor: 'pointer', marginTop: 2,
            }}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </header>

      {/* ═══ Chip row ═══ */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 6, padding: '10px 12px 0',
        overflowX: 'auto',
      }} className="no-scrollbar">
        <Chip label={severity.label} color={severity.color} />
        {reportType && <Chip label={reportType.label} color={reportType.color} />}
        {report.machine && <Chip icon="📍" label={report.machine} />}
      </div>

      {/* ═══ Card "Stato" ═══ */}
      <div style={{
        flexShrink: 0,
        margin: '10px 12px 0',
        padding: 12, borderRadius: 12,
        background: D.card, border: `1px solid ${D.raised}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: D.textSubtle,
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            Stato
          </span>
          {canUpdate && (
            <button
              onClick={() => { haptic.light(); setStatusSheetOpen(true) }}
              className="press-scale"
              style={{
                background: 'transparent', border: 'none',
                color: D.accentLight, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', padding: 0, letterSpacing: -0.1,
              }}
            >
              Cambia
            </button>
          )}
        </div>

        <ProgressSegments status={report.status} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${meta.color}1c`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <meta.icon size={16} style={{ color: meta.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: D.textPrimary,
              letterSpacing: -0.1,
            }}>
              {statusLabel}
            </div>
            <div style={{ fontSize: 11, color: D.textSubtle, lineHeight: 1.3 }}>
              {report.assigned_to_name && report.status !== 'aperta'
                ? `${report.assigned_to_name}`
                : meta.sub}
            </div>
          </div>
          {showTakeOver && (
            <button
              onClick={handleTakeOver}
              disabled={updating}
              className="press-scale"
              style={{
                background: D.accent, color: '#fff',
                border: 'none', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', flexShrink: 0,
                opacity: updating ? 0.6 : 1, letterSpacing: -0.1,
                boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {updating ? '...' : 'Prendi in carico'}
            </button>
          )}
        </div>
      </div>

      {/* ═══ Tab bar ═══ */}
      <div style={{
        flexShrink: 0,
        display: 'flex', gap: 0,
        padding: '0 12px',
        marginTop: 14,
        borderBottom: `1px solid ${D.raised}`,
      }}>
        {[
          { id: 'details', label: 'Dettagli' },
          { id: 'chat', label: 'Chat', badge: chatCount },
          { id: 'history', label: 'Cronologia', badge: historyCount },
        ].map(t => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => { haptic.light(); setActiveTab(t.id) }}
              className="press-scale"
              style={{
                flex: 1, background: 'transparent', border: 'none',
                padding: '10px 0 10px',
                fontSize: 13, fontWeight: active ? 600 : 500,
                color: active ? D.textPrimary : D.textSubtle,
                cursor: 'pointer', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
              {t.badge > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: active ? D.accent : D.raised,
                  color: active ? '#fff' : D.textMuted,
                  padding: '1px 6px', borderRadius: 8,
                  fontFamily: '"JetBrains Mono", monospace',
                  minWidth: 18, textAlign: 'center',
                }}>
                  {t.badge}
                </span>
              )}
              {active && (
                <span aria-hidden="true" style={{
                  position: 'absolute', bottom: -1, left: '20%', right: '20%',
                  height: 2, background: D.accent, borderRadius: 1,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ═══ Content area ═══ */}
      {activeTab === 'details' && (
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '14px 12px 0',
        }}>
          {/* Descrizione */}
          {report.description && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: D.card, border: `1px solid ${D.raised}`,
              marginBottom: 12,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', color: D.textSubtle,
                fontFamily: '"JetBrains Mono", monospace',
                marginBottom: 6,
              }}>
                Descrizione
              </div>
              <p style={{
                fontSize: 13, color: D.textSecondary,
                lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {report.description}
              </p>
            </div>
          )}

          {/* Foto */}
          {(photos.length > 0 || canUpdate) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 6,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  textTransform: 'uppercase', color: D.textSubtle,
                  fontFamily: '"JetBrains Mono", monospace',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <ImageIcon size={11} /> Foto · {photos.length}
                </div>
                {canUpdate && (
                  <button
                    onClick={() => handleAddPhoto('camera')}
                    disabled={addingMedia}
                    className="press-scale"
                    style={{
                      background: 'transparent', border: 'none',
                      color: D.accentLight, fontSize: 11, fontWeight: 600,
                      cursor: addingMedia ? 'not-allowed' : 'pointer',
                      padding: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      opacity: addingMedia ? 0.5 : 1,
                    }}>
                    {addingMedia ? (
                      <span style={{
                        width: 12, height: 12, borderRadius: '50%',
                        border: `2px solid ${D.accentLight}40`,
                        borderTopColor: D.accentLight,
                        display: 'inline-block',
                        animation: 'spin 1s linear infinite',
                      }} />
                    ) : (
                      <Plus size={12} />
                    )}
                    {addingMedia ? 'Caricamento…' : 'Aggiungi'}
                  </button>
                )}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))',
                gap: 6,
              }}>
                {photos.map((m, i) => (
                  <button
                    key={m.id || i}
                    onClick={() => { haptic.light(); setLightboxIndex(i) }}
                    aria-label={`Apri foto ${i + 1}`}
                    className="press-scale"
                    style={{
                      position: 'relative', aspectRatio: '1',
                      borderRadius: 10, overflow: 'hidden',
                      background: D.raised, border: `1px solid ${D.raised}`,
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 22, height: 22, borderRadius: 6,
                      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Expand size={11} style={{ color: '#fff' }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video */}
          {videos.map((m, i) => (
            <div key={m.id || `v-${i}`} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', color: D.textSubtle,
                fontFamily: '"JetBrains Mono", monospace',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginBottom: 6,
              }}>
                <Video size={11} /> Video {videos.length > 1 ? i + 1 : ''}
              </div>
              <VideoPlayer src={m.url} name={m.name} />
            </div>
          ))}

          {/* Audio */}
          {audios.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', color: D.textSubtle,
                fontFamily: '"JetBrains Mono", monospace',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginBottom: 6,
              }}>
                <MicIcon size={11} /> Note vocali · {audios.length}
              </div>
              {audios.map((m, i) => (
                <div key={m.id || `a-${i}`} style={{ marginBottom: 6 }}>
                  <AudioPlayer src={m.url} name={m.name} />
                </div>
              ))}
            </div>
          )}

          {/* Closure data */}
          {report.extra_data?.closure_hours != null && (
            <div style={{
              padding: 12, borderRadius: 12,
              background: D.card, border: `1px solid ${D.raised}`,
              marginBottom: 12,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', color: D.textSubtle,
                fontFamily: '"JetBrains Mono", monospace',
                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Wrench size={11} /> Dati chiusura
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <ClosureField label="Ore" value={`${report.extra_data.closure_hours}h`} mono />
                {report.extra_data.closure_parts && (
                  <ClosureField label="Ricambi" value={report.extra_data.closure_parts} />
                )}
              </div>
              {report.extra_data.closure_root_cause && (
                <ClosureField label="Causa radice" value={report.extra_data.closure_root_cause} block />
              )}
              {report.extra_data.closure_action && (
                <div style={{ marginTop: 8 }}>
                  <ClosureField label="Azione correttiva" value={report.extra_data.closure_action} block />
                </div>
              )}
            </div>
          )}

          {/* AI card "Soluzioni dal passato" */}
          {user.role === 'tecnico' && report.status !== 'chiuso' && (
            <div style={{ marginBottom: 12 }}>
              <SimilarReportsPanel report={report} />
            </div>
          )}

          {/* Padding bottom per composer */}
          <div style={{ height: 8 }} />
        </div>
      )}

      {activeTab === 'chat' && (
        <ChatPanel
          reportId={report.id}
          user={user}
          report={report}
          variant="mobile"
          className="flex-1 min-h-0"
        />
      )}

      {activeTab === 'history' && (
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          padding: '14px 12px 8px',
        }}>
          <ActivityTimeline reportId={report.id} report={report} />
        </div>
      )}

      {/* ═══ Tech voice action bar (solo Dettagli, ticket non chiuso) ═══ */}
      {showTechActions && activeTab === 'details' && report.status !== 'chiuso' && (
        <TechActionBar onAction={(id) => { haptic.medium(); setVoiceFlow(id) }} />
      )}

      {/* ═══ Pinned composer (solo Dettagli/Cronologia) ═══ */}
      {(activeTab === 'details' || activeTab === 'history') && (
        <ComposerBar onSend={handleQuickSend} sending={sendingQuick} />
      )}

      {/* ═══ Sheets ═══ */}
      <StatusSheet
        open={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        current={report.status}
        onSelect={handleStatusSelect}
        busy={updating}
      />
      <ClosureSheet
        open={closureSheetOpen}
        onClose={() => setClosureSheetOpen(false)}
        onSubmit={handleClosureSubmit}
        busy={updating}
      />

      {/* ═══ Lightbox ═══ */}
      {lightboxIndex !== null && (
        <MediaLightbox
          images={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ═══ Voice flows (overlay fullscreen) ═══ */}
      {voiceFlow === 'update' && (
        <VoiceUpdateFlow
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={(updated) => {
            if (updated) setReport(r => ({ ...r, ...updated }))
            setChatCount(c => c + 1)
            setHistoryCount(h => h + 1)
            setVoiceFlow(null)
          }}
        />
      )}
      {voiceFlow === 'close' && (
        <VoiceCloseFlow
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={(updated) => {
            if (updated) setReport(r => ({ ...r, ...updated }))
            setChatCount(c => c + 1)
            setHistoryCount(h => h + 1)
            setVoiceFlow(null)
          }}
        />
      )}
      {voiceFlow === 'note' && (
        <VoiceNoteFlow
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={() => {
            setChatCount(c => c + 1)
            setVoiceFlow(null)
          }}
        />
      )}
      {voiceFlow === 'spare' && (
        <VoiceSpareRequestFlow
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={() => {
            setChatCount(c => c + 1)
            setHistoryCount(h => h + 1)
            setVoiceFlow(null)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Tech action bar — 4 azioni vocali per il Tecnico
// ─────────────────────────────────────────────────────────────
function TechActionBar({ onAction }) {
  const items = [
    { id: 'update', label: 'Aggiorna', icon: FileEdit, color: '#06b6d4' },
    { id: 'close', label: 'Chiudi', icon: ClipboardCheck, color: '#10b981' },
    { id: 'note', label: 'Nota', icon: Mic, color: '#a78bfa' },
    { id: 'spare', label: 'Ricambio', icon: Package, color: '#f59e0b' },
  ]
  return (
    <div style={{
      flexShrink: 0,
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 6, padding: '8px 10px',
      background: D.composer, borderTop: `1px solid ${D.raised}`,
    }}>
      {items.map(it => (
        <button
          key={it.id}
          onClick={() => onAction(it.id)}
          aria-label={`Voce: ${it.label}`}
          className="press-scale"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '10px 4px', borderRadius: 10,
            background: D.raised, border: 'none', cursor: 'pointer',
            color: it.color,
          }}
        >
          <it.icon size={18} strokeWidth={2.2} />
          <span style={{ fontSize: 10, fontWeight: 600, color: D.textSecondary, letterSpacing: 0.2 }}>
            {it.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function ClosureField({ label, value, mono, block }) {
  return (
    <div style={{
      background: D.raised, borderRadius: 8,
      padding: '8px 10px',
      gridColumn: block ? '1 / -1' : undefined,
    }}>
      <div style={{
        fontSize: 9, color: D.textSubtle,
        fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: mono ? 14 : 12,
        fontWeight: mono ? 700 : 500,
        color: D.textPrimary,
        fontFamily: mono ? '"JetBrains Mono", monospace' : 'inherit',
        lineHeight: 1.35, wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  )
}
