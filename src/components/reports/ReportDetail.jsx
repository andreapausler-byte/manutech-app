import { useState, useEffect, useRef } from 'react'
import { db } from '../../lib/supabase'
import { STATUS, SEVERITY, REPORT_TYPES, timeAgo, formatDate, isTerminalStatus } from '../../lib/constants'
import { getClosure, hasClosureData, isClosureIncomplete, closedAtOf } from '../../lib/closure'
import { TicketIdBadge } from '../ui'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { useClosureEdit } from '../../hooks/useClosureEdit'
import MediaLightbox from '../media/MediaLightbox'
import AudioPlayer from '../media/AudioPlayer'
import VideoPlayer from '../media/VideoPlayer'
import ActivityTimeline from './ActivityTimeline'
import ChatPanel from '../chat/ChatPanel'
import ShareGuestLink from '../chat/ShareGuestLink'
import ShareReportSheet from './ShareReportSheet'
import SimilarCasesLivePanel from './SimilarCasesLivePanel'
import {
  ArrowLeft, MoreVertical, Send, Paperclip, Mic,
  Check, X, AlertTriangle, ArrowRight, Zap, Clock as ClockIcon,
  CheckCircle2, XCircle, Wrench, MessageCircle, History,
  Image as ImageIcon, Video, Mic as MicIcon, Expand, Plus,
  FileEdit, ClipboardCheck, Package, Pencil,
} from 'lucide-react'
import VoiceUpdateFlow from '../voice/VoiceUpdateFlow'
import VoiceCloseFlow from '../voice/VoiceCloseFlow'
import VoiceNoteFlow from '../voice/VoiceNoteFlow'
import DictateButton from '../voice/DictateButton'
import SpareRequestModal from '../spare/SpareRequestModal'
import InterventionRequestModal from '../spare/InterventionRequestModal'
import RequestKindChooser from '../spare/RequestKindChooser'
import TicketSparePanel from '../spare/TicketSparePanel'
import ComponentPill from '../machines/ComponentPill'
import ClosureHelpful from './ClosureHelpful'
import ClosurePhotoPicker from './ClosurePhotoPicker'

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
// Confirm close sheet — "Chiuso" archivia senza registrare
// l'intervento: conferma esplicita con le implicazioni
// ─────────────────────────────────────────────────────────────
function ConfirmCloseSheet({ open, onClose, onConfirm, busy }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="confirm-close-title"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', animation: 'fadeIn 0.18s ease both' }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 500,
          background: D.card, borderRadius: '20px 20px 0 0',
          padding: '14px 14px 28px',
          animation: 'slideUp 0.22s ease both',
          border: `1px solid ${D.raised}`, borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: D.raised }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <AlertTriangle size={17} style={{ color: '#f59e0b' }} />
          </div>
          <h3 id="confirm-close-title" style={{
            fontSize: 15, fontWeight: 600, color: D.textPrimary,
            margin: 0, letterSpacing: -0.2,
          }}>
            Chiudere senza completare?
          </h3>
        </div>
        <p style={{ fontSize: 13, color: D.textSecondary, lineHeight: 1.5, margin: '0 0 14px' }}>
          "Chiuso" archivia la segnalazione senza registrare l'intervento:
          niente ore lavoro, causa o ricambi, e non verrà conteggiata come
          risolta nelle statistiche. Se il lavoro è stato fatto, usa "Completato".
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            disabled={busy}
            className="press-scale"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              background: D.raised, border: 'none',
              color: D.textPrimary, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', opacity: busy ? 0.5 : 1,
            }}
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="press-scale"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              background: '#f59e0b', border: 'none',
              color: '#000', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Chiudo…' : 'Chiudi comunque'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Component sheet — attribuisci il guasto a un pezzo
//
// Chi apre la segnalazione quasi mai sa qual è il pezzo rotto: vede un
// sintomo. Il componente è una diagnosi, e la diagnosi la fa il tecnico —
// spesso dopo aver smontato. Per questo l'attribuzione si cambia da qui in
// qualsiasi momento, e "Generico" resta sempre a portata di pollice.
// ─────────────────────────────────────────────────────────────
function ComponentSheet({ open, onClose, components, currentId, onSelect, busy }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="component-sheet-title"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', animation: 'fadeIn 0.18s ease both' }} />
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
        <h3 id="component-sheet-title" style={{ fontSize: 15, fontWeight: 600, color: D.textPrimary, margin: '0 0 4px', letterSpacing: -0.2 }}>
          Pezzo interessato
        </h3>
        <p style={{ fontSize: 12, color: D.textSubtle, margin: '0 0 14px', lineHeight: 1.4 }}>
          Se il guasto è di un pezzo preciso, dillo qui: lo storico di quel
          pezzo si popola da solo.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[{ id: '', name: 'Generico — intera macchina' }, ...components].map(c => {
            const active = (currentId || '') === c.id
            return (
              <button
                key={c.id || 'generic'}
                onClick={() => onSelect(c.id || null)}
                disabled={busy}
                className="press-scale"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', minHeight: 56, padding: '10px 12px',
                  borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                  background: active ? 'rgba(34,211,238,0.10)' : D.raised,
                  border: `1px solid ${active ? 'rgba(34,211,238,0.45)' : 'transparent'}`,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Package size={18} style={{ color: c.id ? '#22d3ee' : D.textFaint, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: D.textPrimary }}>{c.name}</span>
                  {(c.type || c.manufacturer) && (
                    <span style={{ display: 'block', fontSize: 11, color: D.textSubtle, marginTop: 2 }}>
                      {[c.type, c.manufacturer, c.model].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {active && <Check size={16} style={{ color: '#22d3ee', flexShrink: 0 }} />}
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
// mode 'close' → chiude la segnalazione; mode 'edit' → integra una chiusura
// già fatta, partendo dai valori salvati (`initial`, da getClosure). In
// modifica le ore non sono obbligatorie: sui ticket vecchi spesso non si
// sanno, e un numero inventato per passare la validazione è peggio di un
// campo vuoto.
function ClosureSheet({ open, onClose, onSubmit, busy, reportId, components = [], currentComponentId = null, mode = 'close', initial = null }) {
  const isEdit = mode === 'edit'
  // Vocabolario per Whisper: i nomi dei pezzi della macchina si sbagliano facile.
  const dictationHints = components.map(c => c.name)
  const [form, setForm] = useState(() => ({
    hours: initial?.hours != null ? String(initial.hours) : '',
    parts: initial?.parts || '',
    rootCause: initial?.rootCause || '',
    action: initial?.action || '',
    componentId: null,
    // Solo le foto nuove: quelle già salvate restano nel ticket.
    photos: [],
  }))
  // Il pezzo parte da quello già attribuito al ticket: chi chiude conferma
  // o corregge, non ricompila. `null` = non ancora toccato dall'utente,
  // così non serve un effetto per risincronizzarlo a ogni apertura.
  const componentId = form.componentId === null ? (currentComponentId || '') : form.componentId
  if (!open) return null
  const canSubmit = !!form.rootCause.trim() && (isEdit || !!form.hours)
  const submit = () => {
    if (!canSubmit) return
    const comp = components.find(c => c.id === componentId) || null
    const hours = parseFloat(form.hours)
    // In modifica, senza l'elenco dei pezzi (macchina senza anagrafica o
    // caricamento fallito) il pezzo non si tocca: azzerarlo cancellerebbe
    // un'attribuzione che il foglio non ha nemmeno mostrato.
    const componentFields = isEdit && components.length === 0
      ? {}
      : { component_id: comp?.id || null, component_name: comp?.name || null }
    onSubmit({
      closure_hours: Number.isFinite(hours) ? hours : null,
      closure_parts: form.parts.trim() || null,
      closure_root_cause: form.rootCause.trim(),
      closure_action: form.action.trim() || null,
      ...(isEdit ? {} : { closed_at: new Date().toISOString() }),
      ...componentFields,
      closure_photos: form.photos,
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
          {isEdit ? 'Integra chiusura' : 'Chiusura intervento'}
        </h3>
        {isEdit && (
          <p style={{ fontSize: 12, color: D.textSubtle, margin: '-8px 0 14px', lineHeight: 1.4 }}>
            Lo stato non cambia. In cronologia resta cosa c'era prima.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldLabel label={isEdit ? 'Ore lavoro' : 'Ore lavoro *'}>
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
          {components.length > 0 && (
            <FieldLabel label="Pezzo interessato">
              <select value={componentId}
                onChange={e => setForm(f => ({ ...f, componentId: e.target.value }))}
                style={inputStyle}>
                <option value="">Generico — intera macchina</option>
                {components.map(c => (
                  <option key={c.id} value={c.id}>{c.type ? `${c.name} (${c.type})` : c.name}</option>
                ))}
              </select>
            </FieldLabel>
          )}
          {reportId && (
            <FieldLabel label="Foto del pezzo">
              <ClosurePhotoPicker reportId={reportId} photos={form.photos}
                onChange={photos => setForm(f => ({ ...f, photos }))} />
            </FieldLabel>
          )}
          <FieldLabel label="Causa radice *" action={
            <DictateButton size="sm" hints={dictationHints}
              onText={t => setForm(f => ({ ...f, rootCause: appendText(f.rootCause, t) }))} />
          }>
            <textarea value={form.rootCause}
              onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))}
              placeholder="Cosa ha causato il problema?"
              rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </FieldLabel>
          <FieldLabel label="Azione correttiva" action={
            <DictateButton size="sm" hints={dictationHints}
              onText={t => setForm(f => ({ ...f, action: appendText(f.action, t) }))} />
          }>
            <textarea value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              placeholder="Cosa è stato fatto per risolvere?"
              rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </FieldLabel>
          <button onClick={submit} disabled={busy || !canSubmit}
            className="press-scale"
            style={{
              width: '100%', padding: '12px', borderRadius: 12,
              background: D.accentGradient, color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none',
              cursor: 'pointer', opacity: (busy || !canSubmit) ? 0.5 : 1,
              boxShadow: D.accentShadow, letterSpacing: -0.1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={16} /> {isEdit ? 'Salva modifiche' : 'Conferma chiusura'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Nota successiva — un'informazione arrivata dopo la chiusura
// ─────────────────────────────────────────────────────────────
function ClosureNoteSheet({ onClose, onSubmit, busy, autoDictate = false, hints = [] }) {
  const [text, setText] = useState('')
  const canSubmit = !!text.trim() && !busy
  return (
    <div
      onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="closure-note-title"
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
        <h3 id="closure-note-title" style={{ fontSize: 15, fontWeight: 600, color: D.textPrimary, margin: '0 0 6px', letterSpacing: -0.2 }}>
          Aggiungi alla chiusura
        </h3>
        <p style={{ fontSize: 12, color: D.textSubtle, margin: '0 0 12px', lineHeight: 1.4 }}>
          Quello che si è saputo dopo: se il guasto è tornato, il codice esatto del ricambio, cosa controllare la prossima volta.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="es. Si è ripresentato dopo 3 settimane: il vero problema era l'allineamento del motore"
          rows={4} autoFocus={!autoDictate}
          style={{ ...inputStyle, resize: 'none', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <DictateButton label="Detta la nota" autoStart={autoDictate} hints={hints}
            onText={t => setText(prev => appendText(prev, t))} />
        </div>
        <button onClick={() => canSubmit && onSubmit(text)} disabled={!canSubmit}
          className="press-scale"
          style={{
            width: '100%', padding: '12px', borderRadius: 12,
            background: D.accentGradient, color: '#fff',
            fontSize: 14, fontWeight: 600, border: 'none',
            cursor: 'pointer', opacity: canSubmit ? 1 : 0.5,
            boxShadow: D.accentShadow, letterSpacing: -0.1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={16} /> Aggiungi nota
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Come è stato risolto — in cima ai Dettagli di un ticket concluso
// ─────────────────────────────────────────────────────────────
// Per un ticket in archivio la domanda è una sola: cosa era e cosa è stato
// fatto. Per questo la chiusura sta sopra la descrizione e non in fondo.
function ClosureCard({ report, user, canUpdate, onEdit, onAddNote, onOpenPhoto }) {
  const closure = getClosure(report)
  const hasData = hasClosureData(closure)
  const terminal = isTerminalStatus(report.status)
  const incomplete = isClosureIncomplete(report)
  const archivedWithoutWork = report.status === 'chiuso' && !hasData
  const reopened = !terminal && hasData
  if (!hasData && !terminal) return null

  const missing = [
    !closure.rootCause && 'la causa radice',
    !closure.action && "l'azione correttiva",
  ].filter(Boolean)
  const accent = archivedWithoutWork ? D.textSubtle : (incomplete ? '#f59e0b' : '#10b981')
  const title = reopened ? 'Chiusura precedente'
    : archivedWithoutWork ? 'Archiviata senza intervento'
    : 'Come è stato risolto'
  const when = closedAtOf(report)
  const subtitle = reopened
    ? 'La segnalazione è stata riaperta'
    : [when && formatDate(when), !archivedWithoutWork && report.assigned_to_name].filter(Boolean).join(' · ')

  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: D.card, border: `1px solid ${accent}40`,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: hasData ? 10 : 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', color: accent,
            fontFamily: '"JetBrains Mono", monospace',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {archivedWithoutWork ? <XCircle size={11} /> : <Wrench size={11} />} {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: D.textSubtle, marginTop: 3 }}>{subtitle}</div>
          )}
        </div>
        {canUpdate && terminal && !archivedWithoutWork && (
          <button
            onClick={onEdit}
            className="press-scale"
            style={{
              background: 'transparent', border: 'none',
              color: D.accentLight, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', padding: '2px 0', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Pencil size={12} /> Correggi
          </button>
        )}
      </div>

      {archivedWithoutWork && (
        <p style={{ fontSize: 12, color: D.textMuted, margin: 0, lineHeight: 1.45 }}>
          Chiusa senza registrare un intervento: niente ore, causa o ricambi.
        </p>
      )}

      {hasData && (
        <>
          {(closure.hours != null || closure.parts) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <ClosureField label="Ore" value={closure.hours != null ? `${closure.hours}h` : '—'} mono />
              <ClosureField label="Ricambi" value={closure.parts || 'Nessuno indicato'} />
            </div>
          )}
          {closure.rootCause && (
            <ClosureField label="Causa radice" value={closure.rootCause} block />
          )}
          {closure.action && (
            <div style={{ marginTop: 8 }}>
              <ClosureField label="Azione correttiva" value={closure.action} block />
            </div>
          )}
        </>
      )}

      {incomplete && (
        <div style={{
          marginTop: 10, padding: '9px 10px', borderRadius: 8,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: D.textSecondary, lineHeight: 1.35 }}>
            Manca {missing.join(' e ')}: chi troverà lo stesso guasto partirà da qui.
          </span>
          {canUpdate && (
            <button
              onClick={onEdit}
              className="press-scale"
              style={{
                background: '#f59e0b', color: '#111', border: 'none', borderRadius: 7,
                padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}
            >
              Completa
            </button>
          )}
        </div>
      )}

      {closure.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {closure.photos.map((p, i) => (
            <button key={p.url} onClick={() => onOpenPhoto?.(p)}
              aria-label={`Apri foto del pezzo ${i + 1}`}
              className="press-scale"
              style={{ width: 64, height: 64, padding: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${D.raised}`, cursor: 'zoom-in', background: D.raised }}>
              <img src={p.thumb_url || p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}

      {hasData && terminal && (
        <ClosureHelpful report={report} user={user} style={{ marginTop: 10 }} />
      )}

      {closure.notes.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${D.raised}`, paddingTop: 10 }}>
          <div style={{
            fontSize: 9, color: D.textSubtle, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>
            Aggiunto dopo · {closure.notes.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {closure.notes.map((n, i) => (
              <div key={`${n.created_at}-${i}`} style={{ background: D.raised, borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: D.textSubtle, marginBottom: 2, fontFamily: '"JetBrains Mono", monospace' }}>
                  {n.user_name || 'Utente'} · {timeAgo(n.created_at)}
                </div>
                <div style={{ fontSize: 12.5, color: D.textPrimary, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {n.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {canUpdate && terminal && (
        <button
          onClick={onAddNote}
          className="press-scale"
          style={{
            marginTop: 10, width: '100%', padding: '10px', borderRadius: 10,
            background: 'transparent', border: `1px dashed ${D.borderDashed}`,
            color: D.textSecondary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Plus size={14} /> Aggiungi un'informazione
        </button>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', borderRadius: 10, padding: '10px 12px', fontSize: 13,
  background: D.raised, border: `1px solid ${D.raised}`,
  color: D.textPrimary, outline: 'none',
  fontFamily: 'inherit',
}

function FieldLabel({ label, action, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <label style={{
          display: 'block', fontSize: 10, color: D.textSubtle,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
        }}>{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}

// Accoda il testo dettato a quello già scritto, senza cancellarlo.
const appendText = (prev, text) => (prev?.trim() ? `${prev.trim()} ${text}` : text)

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
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [sendingQuick, setSendingQuick] = useState(false)
  const [chatCount, setChatCount] = useState(0)
  const [historyCount, setHistoryCount] = useState(0)
  const [spareRefresh, setSpareRefresh] = useState(0)
  const [voiceFlow, setVoiceFlow] = useState(null) // null|'update'|'close'|'note'|'spare'
  const [addingMedia, setAddingMedia] = useState(false)
  const [components, setComponents] = useState([])
  const [componentSheetOpen, setComponentSheetOpen] = useState(false)
  const [savingComponent, setSavingComponent] = useState(false)
  const [closureEditOpen, setClosureEditOpen] = useState(false)
  const [closureNoteOpen, setClosureNoteOpen] = useState(false) // false | 'text' | 'voice'

  const toast = useToast()
  const haptic = useHaptic()
  const closureEdit = useClosureEdit(user)

  const meta = STATUS_META[report.status] || STATUS_META.aperta
  const statusLabel = STATUS[report.status]?.label || report.status
  const severity = SEVERITY[report.severity] || SEVERITY.media
  const reportType = report.type ? REPORT_TYPES[report.type] : null
  const canUpdate = user.role === 'tecnico' || user.role === 'admin'
  const isMine = report.assigned_to === user.id
  const isClosed = isTerminalStatus(report.status)
  // Tutti i tecnici dell'org possono prendere in carico una segnalazione
  // (anche se è già assegnata a qualcun altro): l'assegnazione cambia, la
  // cronologia traccia il passaggio.
  const showTakeOver = canUpdate && !isMine && !isClosed
  // Tutti i tecnici dell'org vedono la barra vocale: ownership tracciato
  // da assigned_to per accountability/notifiche, ma non blocca l'editing.
  const showTechActions = canUpdate

  // Conta messaggi e attività per i badge dei tab
  useEffect(() => {
    let cancelled = false
    db.getComments(report.id).then(c => { if (!cancelled) setChatCount((c || []).length) }).catch(() => {})
    db.getActivities?.(report.id)?.then(a => { if (!cancelled) setHistoryCount((a || []).length) }).catch(() => {})
    return () => { cancelled = true }
  }, [report.id])

  // I pezzi della macchina: servono per attribuire il guasto e per il
  // menu in chiusura. `machine_id` manca sui ticket vecchi (la macchina
  // vive nello snapshot testuale `machine`), quindi si ricade sul nome.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let machineId = report.machine_id
        if (!machineId && report.machine) {
          const machines = await db.getMachines()
          machineId = machines.find(m => m.name === report.machine)?.id || null
        }
        if (!machineId) return
        const list = await db.getMachineComponents(machineId)
        if (!cancelled) setComponents(list || [])
      } catch (e) {
        console.warn('[ReportDetail] getMachineComponents failed:', e?.message)
      }
    })()
    return () => { cancelled = true }
  }, [report.machine_id, report.machine])

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
    if (s === 'chiuso' && report.status !== 'chiuso') {
      setConfirmCloseOpen(true)
      return
    }
    updateStatus(s)
  }

  const handleConfirmClose = async () => {
    const ok = await updateStatus('chiuso')
    if (ok) setConfirmCloseOpen(false)
  }

  const handleTakeOver = async () => {
    if (updating) return
    haptic.medium()
    const wasAssignedToOther = !!report.assigned_to && report.assigned_to !== user.id
    const previousAssignee = report.assigned_to_name
    const ok = await updateStatus('in_lavorazione', {
      assigned_to: user.id,
      assigned_to_name: user.name,
    })
    if (ok) {
      if (wasAssignedToOther) {
        toast.success(`Riassegnata a te (era di ${previousAssignee || 'altro tecnico'})`)
        db.addActivity(report.id, {
          type: 'reassignment',
          user_id: user.id, user_name: user.name,
          detail: `Riassegnata da ${previousAssignee || 'altro tecnico'} a ${user.name}`,
        }).catch(e => console.warn('Side effect failed:', e.message))
      } else {
        toast.success('Hai preso in carico la segnalazione')
      }
    }
  }

  // ─── Attribuzione del pezzo ───────────────────────────
  // Nessuna notifica: cambiare la diagnosi è lavoro del tecnico, non un
  // evento per cui svegliare il reparto. Resta in cronologia, che è dove
  // serve — per capire quando l'ipotesi dell'operatore è stata corretta.
  const handleComponentSelect = async (componentId) => {
    if (savingComponent) return
    const comp = components.find(c => c.id === componentId) || null
    const prevName = report.component_name || null
    if ((report.component_id || null) === (comp?.id || null)) {
      setComponentSheetOpen(false)
      return
    }
    setSavingComponent(true)
    haptic.medium()
    try {
      const updated = await db.updateReport(report.id, {
        component_id: comp?.id || null,
        component_name: comp?.name || null,
      })
      setReport(r => ({ ...r, ...updated }))
      db.addActivity(report.id, {
        type: 'component_change',
        user_id: user.id, user_name: user.name,
        detail: comp
          ? (prevName && prevName !== comp.name
              ? `Guasto riattribuito da ${prevName} a ${comp.name}`
              : `Guasto attribuito a ${comp.name}`)
          : `Attribuzione rimossa${prevName ? ` (era ${prevName})` : ''} — torna generico`,
      }).catch(e => console.warn('Side effect failed:', e.message))
      toast.success(comp ? `Guasto attribuito a ${comp.name}` : 'Torna generico')
      setComponentSheetOpen(false)
    } catch (err) {
      console.error('[ManuTech] Errore attribuzione componente:', err)
      toast.error(`Errore: ${err?.message || 'sconosciuto'}`)
    }
    setSavingComponent(false)
  }

  const handleClosureSubmit = async (closureData) => {
    // Il pezzo dichiarato in chiusura è quello che conta per le statistiche:
    // quello scelto in apertura è un'ipotesi dell'operatore. Se cambia, la
    // cronologia lo dice — l'ipotesi non deve sparire in silenzio.
    const prevComponentId = report.component_id || null
    const prevComponentName = report.component_name || null
    const { closure_photos: closurePhotos = [], ...closureFields } = closureData
    const updates = closurePhotos.length
      ? { ...closureFields, media: [...(report.media || []), ...closurePhotos] }
      : closureFields
    const ok = await updateStatus('risolta', updates, closureFields)
    if (ok) {
      if (closurePhotos.length) {
        db.addClosurePhotosToMachine(report.machine_id, closurePhotos, {
          componentId: closureFields.component_id ?? prevComponentId,
          componentName: closureFields.component_name ?? prevComponentName,
          label: report.display_id || report.title,
          uploadedByName: user.name,
        })
      }
      if ((closureData.component_id || null) !== prevComponentId) {
        db.addActivity(report.id, {
          type: 'component_change',
          user_id: user.id, user_name: user.name,
          detail: closureData.component_name
            ? (prevComponentName
                ? `In chiusura: guasto riattribuito da ${prevComponentName} a ${closureData.component_name}`
                : `In chiusura: guasto attribuito a ${closureData.component_name}`)
            : `In chiusura: attribuzione rimossa${prevComponentName ? ` (era ${prevComponentName})` : ''}`,
        }).catch(e => console.warn('Side effect failed:', e.message))
      }
      setClosureSheetOpen(false)
      // Triggera reindex knowledge base della macchina (fire-and-forget):
      // il ticket appena chiuso, con la sua chat e closure, diventa
      // memoria permanente per ticket futuri simili.
      if (report.machine_id) {
        db.queueMachineReindex(report.machine_id)
          .catch(e => console.warn('[ManuTech] reindex post-closure failed:', e?.message))
      }
    }
  }

  // ─── Integrare una chiusura già fatta ─────────────────
  const handleClosureEdit = async (data) => {
    const updated = await closureEdit.saveEdit(report, data)
    if (!updated) return
    if (updated !== report) {
      setReport(r => ({ ...r, ...updated }))
      setHistoryCount(h => h + 1)
    }
    setClosureEditOpen(false)
  }

  const handleClosureNote = async (text) => {
    const updated = await closureEdit.addNote(report, text)
    if (!updated) return
    setReport(r => ({ ...r, ...updated }))
    setHistoryCount(h => h + 1)
    setClosureNoteOpen(false)
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

  // TK-id ora promosso a badge prominente sopra il titolo (vedi render).
  // L'eyebrow contiene solo timeAgo + autore.
  const eyebrowParts = [
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
            <TicketIdBadge report={report} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              marginBottom: 4,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: 1.2,
              background: 'var(--color-primary-glow)',
              color: 'var(--color-primary)',
            }} />
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
                  <span style={{ color: D.textSubtle }}>{p}</span>
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
            aria-label="Condividi e copia"
            title="Condividi e copia"
            className="press-scale"
            onClick={() => { haptic.light(); setShareSheetOpen(true) }}
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

      {/* ═══ Card "Pezzo interessato" ═══
          Compare solo se c'è qualcosa da dire: un pezzo già attribuito,
          oppure una macchina che ha componenti in anagrafica. Su una
          macchina senza pezzi registrati non aggiunge rumore. */}
      {(report.component_name || components.length > 0) && (
        <div style={{
          flexShrink: 0,
          margin: '10px 12px 0',
          padding: '10px 12px', borderRadius: 12,
          background: D.card,
          border: `1px solid ${report.component_name ? 'rgba(34,211,238,0.28)' : D.raised}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', color: D.textSubtle,
              fontFamily: '"JetBrains Mono", monospace', marginBottom: 5,
            }}>
              Pezzo interessato
            </div>
            {report.component_name ? (
              <ComponentPill name={report.component_name} size="md" />
            ) : (
              <span style={{ fontSize: 13, color: D.textSubtle }}>
                Generico — intera macchina
              </span>
            )}
          </div>
          {canUpdate && !isClosed && components.length > 0 && (
            <button
              onClick={() => { haptic.light(); setComponentSheetOpen(true) }}
              className="press-scale"
              style={{
                background: 'transparent', border: 'none',
                color: D.accentLight, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', padding: '6px 2px', flexShrink: 0,
                letterSpacing: -0.1, whiteSpace: 'nowrap',
              }}
            >
              {report.component_name ? 'Cambia' : 'Attribuisci'}
            </button>
          )}
        </div>
      )}

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
              {updating ? '...' : (report.assigned_to ? 'Prendi tu' : 'Prendi in carico')}
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
          <ClosureCard
            report={report}
            user={user}
            canUpdate={canUpdate}
            onEdit={() => { haptic.light(); setClosureEditOpen(true) }}
            onAddNote={() => { haptic.light(); setClosureNoteOpen('text') }}
            onOpenPhoto={(p) => {
              const idx = photos.findIndex(x => x.url === p.url)
              if (idx >= 0) setLightboxIndex(idx)
            }}
          />

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

          {/* Richieste esterne (ricambi + interventi) associati al ticket */}
          <TicketSparePanel reportId={report.id} user={user} refreshKey={spareRefresh} />

          {/* AI: casi simili live (auto-cerca all'apertura, semantic search raw) */}
          {user.role === 'tecnico' && report.status !== 'chiuso' && (
            <div style={{ marginBottom: 12 }}>
              <SimilarCasesLivePanel
                text={[report.title, report.description].filter(Boolean).join('. ')}
                machineId={report.machine_id || null}
                excludeReportId={report.id}
              />
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
        <TechActionBar
          resolved={report.status === 'risolta'}
          onAction={(id) => {
            haptic.medium()
            // Su un ticket già risolto "Completa" riscriverebbe la chiusura
            // (e closed_at): qui diventa "Integra" e detta una nota successiva.
            if (id === 'close' && report.status === 'risolta') setClosureNoteOpen('voice')
            else setVoiceFlow(id)
          }}
        />
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
      <ConfirmCloseSheet
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={handleConfirmClose}
        busy={updating}
      />
      {closureSheetOpen && (
        <ClosureSheet
          open
          onClose={() => setClosureSheetOpen(false)}
          onSubmit={handleClosureSubmit}
          busy={updating}
          reportId={report.id}
          components={components}
          currentComponentId={report.component_id || null}
        />
      )}
      {/* Montati solo quando servono: il form parte dai valori salvati
          a ogni apertura, senza effetti di risincronizzazione. */}
      {closureEditOpen && (
        <ClosureSheet
          open
          mode="edit"
          initial={getClosure(report)}
          reportId={report.id}
          onClose={() => setClosureEditOpen(false)}
          onSubmit={handleClosureEdit}
          busy={closureEdit.saving}
          components={components}
          currentComponentId={report.component_id || null}
        />
      )}
      {closureNoteOpen && (
        <ClosureNoteSheet
          onClose={() => setClosureNoteOpen(false)}
          onSubmit={handleClosureNote}
          busy={closureEdit.saving}
          autoDictate={closureNoteOpen === 'voice'}
          hints={components.map(c => c.name)}
        />
      )}
      <ComponentSheet
        open={componentSheetOpen}
        onClose={() => setComponentSheetOpen(false)}
        components={components}
        currentId={report.component_id || null}
        onSelect={handleComponentSelect}
        busy={savingComponent}
      />
      <ShareReportSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        report={report}
        user={user}
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
        <RequestKindChooser
          onClose={() => setVoiceFlow(null)}
          onPick={(kind) => setVoiceFlow(kind === 'intervento' ? 'intervention' : 'ricambio')}
        />
      )}
      {voiceFlow === 'ricambio' && (
        <SpareRequestModal
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={(updated) => {
            if (updated) setReport(r => ({ ...r, ...updated }))
            setChatCount(c => c + 1)
            setHistoryCount(h => h + 1)
            setSpareRefresh(s => s + 1)
            setVoiceFlow(null)
          }}
        />
      )}
      {voiceFlow === 'intervention' && (
        <InterventionRequestModal
          report={report}
          user={user}
          onClose={() => setVoiceFlow(null)}
          onApplied={(updated) => {
            if (updated) setReport(r => ({ ...r, ...updated }))
            setChatCount(c => c + 1)
            setHistoryCount(h => h + 1)
            setSpareRefresh(s => s + 1)
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
function TechActionBar({ onAction, resolved = false }) {
  const items = [
    { id: 'update', label: 'Aggiorna', icon: FileEdit, color: '#06b6d4' },
    { id: 'close', label: resolved ? 'Integra' : 'Completa', icon: ClipboardCheck, color: '#10b981' },
    { id: 'note', label: 'Nota', icon: Mic, color: '#a78bfa' },
    { id: 'spare', label: 'Richiedi', icon: Package, color: '#f59e0b' },
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
