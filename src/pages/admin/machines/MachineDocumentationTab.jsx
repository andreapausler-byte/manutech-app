import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Camera, FileText, Plus, Trash2, ExternalLink, Save, X,
  BookOpen, Wrench, Image as ImageIcon, Building,
  ShieldCheck, Sparkles, Loader2, FileSignature,
  Search, Folder, Upload, MessageCircle,
  Star, LayoutGrid, List, Download,
} from 'lucide-react'
import { db } from '../../../lib/supabase'
import { timeAgo, formatDate } from '../../../lib/constants'

// Font Barlow Condensed per i titoli display (squadrati, industriali)
const F_DISPLAY = "'Barlow Condensed', system-ui, sans-serif"
const F_MONO = "'DM Mono', 'JetBrains Mono', ui-monospace, monospace"
// Gold accent (e0a82e) — tab attiva, linguetta cartelle, accenti
const GOLD = '#e0a82e'

// Categorie note (id = valore stringa salvato in attachment.category)
const CATEGORIES = [
  { id: 'foto', label: 'Galleria Foto', desc: 'Foto, targhette, dettagli installazione',
    icon: ImageIcon, frontColor: '#5b8eff', backColor: '#3b6ad9', uploadType: 'image' },
  { id: 'scheda_tecnica', label: 'Schede Tecniche', desc: 'Datasheet, schemi elettrici, P&ID',
    icon: FileText, frontColor: '#e0a82e', backColor: '#b58220', uploadType: 'pdf' },
  { id: 'manuale_uso', label: "Istruzioni d'Uso", desc: 'Avvio, arresto, funzionamento',
    icon: BookOpen, frontColor: '#3ddc84', backColor: '#2aa564', uploadType: 'pdf',
    instructionsField: 'usage_instructions', instructionsPlaceholder: "Aggiungi istruzioni d'uso..." },
  { id: 'manuale_manutenzione', label: 'Manutenzione', desc: 'Procedure preventive e CIP',
    icon: Wrench, frontColor: '#ff8a3d', backColor: '#cc5e1d', uploadType: 'pdf',
    instructionsField: 'maintenance_instructions', instructionsPlaceholder: 'Aggiungi istruzioni di manutenzione...' },
  { id: 'intervento_esterno', label: 'Ditta Esterna', desc: 'Rapporti tecnici esterni e fornitori',
    icon: Building, frontColor: '#8b6ff5', backColor: '#6a52c4', uploadType: 'pdf' },
  { id: 'contratto_manutenzione', label: 'Contratti Manut.', desc: 'Contratti attivi e scadenze SLA',
    icon: FileSignature, frontColor: '#e85d75', backColor: '#a73a4d', uploadType: 'pdf' },
  { id: 'certificato', label: 'Certificati', desc: 'Dichiarazioni CE, ispezioni, tarature',
    icon: ShieldCheck, frontColor: '#5dd3b8', backColor: '#36a187', uploadType: 'pdf' },
]
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

// ──────────────────────────────────────────────────────────────
// AiBar: banner compatto in 1 riga (icona · testo · stats · bottone)
// ──────────────────────────────────────────────────────────────
function AiBar({ machineId, reindexing, totalFiles, indexedFiles, onOpenAssistant }) {
  const [stats, setStats] = useState(null)
  const prevReindexing = useRef(reindexing)

  const fetchStats = () => {
    if (!machineId) return Promise.resolve(null)
    return db.getKnowledgeStats(machineId).then(s => { setStats(s); return s })
  }
  useEffect(() => {
    if (!machineId) return
    let cancelled = false
    db.getKnowledgeStats(machineId).then(s => { if (!cancelled) setStats(s) })
    return () => { cancelled = true }
  }, [machineId])
  useEffect(() => {
    const wasReindexing = prevReindexing.current
    prevReindexing.current = reindexing
    if (!wasReindexing || reindexing || !machineId) return
    let cancelled = false
    const timers = []
    fetchStats()
    timers.push(setTimeout(() => { if (!cancelled) fetchStats() }, 2000))
    timers.push(setTimeout(() => { if (!cancelled) fetchStats() }, 5000))
    return () => { cancelled = true; timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reindexing, machineId])

  const chunks = stats?.chunks || 0

  return (
    <div className="grid items-center gap-3 mb-2.5 px-3 py-2.5"
      style={{
        gridTemplateColumns: 'auto 1fr auto auto',
        background: 'linear-gradient(90deg, rgba(139,111,245,0.12), rgba(42,157,110,0.05))',
        border: '1px solid rgba(139,111,245,0.30)',
        borderLeft: '3px solid #8b6ff5',
        borderRadius: 2,
      }}>
      <div className="w-[30px] h-[30px] grid place-items-center"
        style={{ background: 'linear-gradient(135deg, #8b6ff5, #5b8eff)' }}>
        {reindexing
          ? <Loader2 size={14} className="text-white animate-spin" />
          : <Sparkles size={14} className="text-white" />}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold uppercase tracking-wide leading-tight"
          style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {reindexing ? 'Biblioteca AI · indicizzazione' : 'Biblioteca AI'}
        </div>
        <div className="text-[10px] mt-0.5 leading-snug truncate" style={{ color: 'var(--color-text-muted)' }}>
          {reindexing
            ? "Estrazione testo + embedding in corso…"
            : "Chiedi qualsiasi cosa sul macchinario — manuali e contratti letti in tempo reale."}
        </div>
      </div>
      <div className="hidden md:flex gap-3.5 px-1.5 pl-3.5"
        style={{ borderLeft: '1px solid var(--color-border)' }}>
        {[
          { val: indexedFiles, lbl: 'Indicizzati' },
          { val: chunks, lbl: 'Estratti' },
          { val: totalFiles, lbl: 'File' },
        ].map(s => (
          <div key={s.lbl} className="text-center">
            <div className="text-lg font-semibold leading-none" style={{ fontFamily: F_DISPLAY, color: '#8b6ff5' }}>{s.val}</div>
            <div className="text-[8px] uppercase tracking-widest mt-0.5"
              style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>{s.lbl}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onOpenAssistant}
        disabled={!onOpenAssistant}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#8b6ff5', fontFamily: F_DISPLAY, borderRadius: 2 }}
        onMouseEnter={(e) => { if (onOpenAssistant) e.currentTarget.style.background = '#9a7eff' }}
        onMouseLeave={(e) => { if (onOpenAssistant) e.currentTarget.style.background = '#8b6ff5' }}
        title={onOpenAssistant ? "Vai all'Assistente AI" : 'Assistente non disponibile in questo contesto'}>
        <MessageCircle size={11} />
        Chiedi
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FolderCard COMPATTA: padding 11px, min-h 118px, icona 42×32
// ──────────────────────────────────────────────────────────────
function FolderCard({ category, items, onClick, onDropFile }) {
  const empty = items.length === 0
  const indexed = items.filter(a => a.type === 'pdf').length
  const lastUploaded = items.reduce((latest, a) => {
    if (!a.uploaded_at) return latest
    if (!latest) return a.uploaded_at
    return a.uploaded_at > latest ? a.uploaded_at : latest
  }, null)
  const [hovering, setHovering] = useState(false)

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setHovering(true) }
  const handleDragLeave = () => setHovering(false)
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setHovering(false)
    const files = Array.from(e.dataTransfer.files || [])
    for (const f of files) onDropFile?.(f, category.id)
  }

  return (
    <button
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative text-left px-[11px] py-2.5 flex flex-col gap-2 min-h-[118px] transition-all border"
      style={{
        background: hovering ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
        borderColor: hovering ? 'var(--color-primary)' : 'var(--color-border)',
        borderRadius: 2,
      }}
      onMouseEnter={(e) => { if (!hovering) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={(e) => { if (!hovering) e.currentTarget.style.background = 'var(--color-surface-1)' }}
    >
      {/* tab linguetta gialla in alto se ha contenuti */}
      {!empty && (
        <span className="absolute top-0 left-[11px] w-8 h-1"
          style={{ background: GOLD }} />
      )}

      {/* row1: icona + AI tag */}
      <div className="flex items-start justify-between">
        {/* Folder icon CSS pure 42×32 */}
        <div className="relative w-[42px] h-8 shrink-0">
          <div className="absolute inset-x-0 top-1 bottom-0"
            style={{
              background: empty ? '#3d3017' : category.backColor,
              opacity: empty ? 0.55 : 1,
              clipPath: 'polygon(0 0, 38% 0, 44% 14%, 100% 14%, 100% 100%, 0 100%)',
            }} />
          <div className="absolute inset-x-0 top-[9px] bottom-0"
            style={{
              background: empty ? '#5a4520' : category.frontColor,
              opacity: empty ? 0.55 : 1,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }} />
          <span className="absolute -bottom-[5px] -right-[6px] z-10 min-w-[18px] text-center px-1.5 text-[10px] font-bold leading-tight py-px"
            style={{
              fontFamily: F_MONO,
              background: empty ? 'var(--color-surface-3)' : '#2a9d6e',
              color: empty ? 'var(--color-text-faint)' : '#061a0e',
              borderRadius: 10,
              boxShadow: empty ? 'none' : '0 0 8px rgba(42,157,110,0.4)',
            }}>{items.length}</span>
        </div>
        {indexed > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[8px] uppercase tracking-wide"
            style={{ fontFamily: F_MONO, color: '#8b6ff5' }}>
            <Sparkles size={8} fill="currentColor" /> AI
          </span>
        )}
      </div>

      {/* titolo + descrizione */}
      <div className="min-w-0 flex-1">
        <h3 className="text-[14px] font-semibold uppercase tracking-tight leading-tight truncate"
          style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {category.label}
        </h3>
        <p className="text-[10px] leading-snug mt-0.5 line-clamp-2"
          style={{ color: 'var(--color-text-muted)' }}>{category.desc}</p>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide pt-1.5"
        style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)', borderTop: '1px dashed var(--color-border)' }}>
        {empty
          ? <><span>Vuota</span><span>+ {category.uploadType === 'image' ? 'Aggiungi' : 'Carica'}</span></>
          : (
            <>
              <span>{lastUploaded ? `Agg. ${timeAgo(lastUploaded)}` : `${items.length} file`}</span>
              <span>{items.length} {items.length === 1 ? 'file' : 'file'}</span>
            </>
          )}
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// InstructionEditor (compatto)
// ──────────────────────────────────────────────────────────────
function InstructionEditor({ value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')

  const handleSave = () => { onSave(text.trim() || null); setEditing(false) }

  if (!editing) {
    return value ? (
      <div className="group relative p-3 border"
        style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
        <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{value}</p>
        <button onClick={() => { setText(value); setEditing(true) }}
          className="absolute top-1.5 right-1.5 p-1 transition-all opacity-0 group-hover:opacity-100"
          style={{ color: 'var(--color-text-faint)' }}>
          <Save size={12} />
        </button>
      </div>
    ) : (
      <button onClick={() => setEditing(true)}
        className="w-full text-left p-3 text-xs border border-dashed transition-all"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)', borderRadius: 2 }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        + {placeholder}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={4}
        className="w-full input-field px-2.5 py-2 text-xs resize-none" style={{ borderRadius: 2 }} autoFocus />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
          <X size={11} /> Annulla
        </button>
        <button onClick={handleSave}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
          style={{ background: 'var(--color-primary)', fontFamily: F_DISPLAY, borderRadius: 2 }}>
          <Save size={11} /> Salva
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FileRow compatta
// ──────────────────────────────────────────────────────────────
function FileRow({ attachment, onSelect, selected, onToggleFavorite, attachmentIndex }) {
  const isImage = attachment.type === 'image'
  return (
    <div onClick={() => onSelect(attachment)}
      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer border transition-all group"
      style={{
        background: selected ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
        borderColor: selected ? 'rgba(42,157,110,0.45)' : 'var(--color-border)',
        borderRadius: 2,
      }}>
      {isImage ? (
        <div className="w-[26px] h-8 overflow-hidden shrink-0 border" style={{ borderColor: 'var(--color-border)' }}>
          <img src={attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-6 h-[30px] shrink-0 grid place-items-center text-[8px] font-bold text-white relative"
          style={{ background: '#e03c31', fontFamily: F_MONO }}>
          PDF
          <span className="absolute top-0 right-0 w-1.5 h-1.5"
            style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] truncate" style={{ color: 'var(--color-text)' }}>{attachment.name}</p>
          {!isImage && (
            <span className="inline-flex items-center gap-0.5 text-[8px] px-1 shrink-0 uppercase tracking-wide"
              style={{ fontFamily: F_MONO, color: '#8b6ff5' }}>
              <Sparkles size={8} fill="currentColor" /> AI
            </span>
          )}
        </div>
        <p className="text-[9px] mt-px" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          {attachment.uploaded_by_name || '—'}
          {attachment.uploaded_at && ` · ${timeAgo(attachment.uploaded_at)}`}
        </p>
      </div>

      <button onClick={e => { e.stopPropagation(); onToggleFavorite(attachmentIndex) }}
        className="p-1.5 shrink-0"
        style={{ color: attachment.is_favorite ? GOLD : 'var(--color-text-faint)' }}
        title={attachment.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
        <Star size={12} fill={attachment.is_favorite ? GOLD : 'none'} />
      </button>
      <a href={attachment.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
        className="p-1.5 shrink-0" style={{ color: 'var(--color-text-faint)' }} title="Apri">
        <ExternalLink size={12} />
      </a>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FolderView (compatto)
// ──────────────────────────────────────────────────────────────
function FolderView({ category, items, attachmentsAll, onUpload, onRemove, onToggleFavorite, sel, onSaveField, onSelect, selectedAttachment, viewMode }) {
  const Icon = category.icon
  const indexOf = (a) => attachmentsAll.indexOf(a)
  const isPhotoFolder = category.id === 'foto'

  return (
    <div className="space-y-2 animate-fade-in">
      <div className="flex items-center gap-2.5 pb-1">
        <div className="w-9 h-9 grid place-items-center shrink-0"
          style={{ background: category.frontColor + '22', borderRadius: 2 }}>
          <Icon size={16} style={{ color: category.frontColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
            {category.label}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {items.length} {items.length === 1 ? 'elemento' : 'elementi'} · {category.desc}
          </p>
        </div>
      </div>

      {category.instructionsField && (
        <InstructionEditor
          value={sel[category.instructionsField]}
          onSave={(val) => onSaveField(category.instructionsField, val)}
          placeholder={category.instructionsPlaceholder}
        />
      )}

      {isPhotoFolder ? (
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
          {sel.photo_url && (
            <div className="aspect-[4/3] overflow-hidden border relative group" style={{ borderColor: 'var(--color-border)' }}>
              <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-1.5 left-1.5 text-[8px] font-bold text-white px-1.5 py-0.5 uppercase"
                style={{ background: 'var(--color-primary)', fontFamily: F_MONO }}>Principale</span>
              <a href={sel.photo_url} target="_blank" rel="noopener"
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center transition-all">
                <ExternalLink size={16} className="text-white" />
              </a>
            </div>
          )}
          {items.map((photo, i) => (
            <div key={i} className="aspect-[4/3] overflow-hidden border relative group cursor-pointer"
              style={{ borderColor: 'var(--color-border)' }}
              onClick={() => onSelect(photo)}>
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5">
                <a href={photo.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                  className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white">
                  <ExternalLink size={12} />
                </a>
                <button onClick={(e) => { e.stopPropagation(); onRemove(indexOf(photo)) }}
                  className="p-1.5 rounded-full bg-red-500/40 hover:bg-red-500/60 text-white">
                  <Trash2 size={12} />
                </button>
              </div>
              {photo.is_favorite && (
                <Star size={11} fill={GOLD} stroke={GOLD} className="absolute top-1.5 right-1.5" />
              )}
            </div>
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="aspect-[4/3] border-2 border-dashed flex flex-col items-center justify-center transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Camera size={18} className="mb-1 opacity-60" />
            <span className="text-[10px] font-medium">Aggiungi</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((doc, i) => (
            <button key={`${doc.url}-${i}`} onClick={() => onSelect(doc)}
              className="text-left px-2.5 py-2 border transition-all flex flex-col gap-1.5"
              style={{
                background: selectedAttachment === doc ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
                borderColor: selectedAttachment === doc ? 'rgba(42,157,110,0.45)' : 'var(--color-border)',
                borderRadius: 2,
              }}>
              <div className="flex items-start gap-2">
                <div className="w-6 h-[30px] shrink-0 grid place-items-center text-[8px] font-bold text-white relative"
                  style={{ background: '#e03c31', fontFamily: F_MONO }}>
                  PDF
                  <span className="absolute top-0 right-0 w-1.5 h-1.5"
                    style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium line-clamp-2 leading-tight" style={{ color: 'var(--color-text)' }}>{doc.name}</p>
                </div>
                {doc.is_favorite && <Star size={11} fill={GOLD} stroke={GOLD} className="shrink-0" />}
              </div>
              <p className="text-[8px] uppercase tracking-wide mt-auto truncate"
                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                {doc.uploaded_by_name || '—'}
                {doc.uploaded_at && ` · ${timeAgo(doc.uploaded_at)}`}
              </p>
            </button>
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="border border-dashed flex flex-col items-center justify-center py-4 text-[11px] transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
            <Plus size={14} className="mb-1 opacity-60" />
            <span>Carica</span>
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {items.length === 0 && (
            <p className="text-[11px] text-center py-4 border border-dashed"
              style={{ color: 'var(--color-text-faint)', borderColor: 'var(--color-border)' }}>
              {category.desc}
            </p>
          )}
          {items.map((doc, i) => (
            <FileRow key={`${doc.url}-${i}`}
              attachment={doc}
              attachmentIndex={indexOf(doc)}
              onSelect={onSelect}
              selected={selectedAttachment === doc}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed text-[11px] transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)', borderRadius: 2 }}>
            <Plus size={12} /> Carica nuovo file
          </button>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// PreviewPanel: 280px
// ──────────────────────────────────────────────────────────────
function PreviewPanel({ attachment, attachmentsAll, onRemove, onToggleFavorite, onClose }) {
  if (!attachment) {
    return (
      <aside className="hidden lg:flex w-[280px] shrink-0 border-l p-3 flex-col gap-2 max-h-[78vh] overflow-auto"
        style={{ borderColor: 'var(--color-border)' }}>
        <h6 className="text-[9px] uppercase tracking-[0.18em]"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Anteprima · Selezionato</h6>
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 p-5 border border-dashed text-center"
          style={{ borderColor: 'var(--color-border)' }}>
          <FileText size={22} style={{ color: 'var(--color-text-faint)' }} />
          <p className="text-[11px] leading-relaxed max-w-[200px]" style={{ color: 'var(--color-text-muted)' }}>
            Seleziona un file per vedere metadati e azioni
          </p>
        </div>
      </aside>
    )
  }

  const isImage = attachment.type === 'image'
  const cat = CATEGORY_BY_ID[attachment.category]
  const idx = attachmentsAll.indexOf(attachment)
  const initials = (attachment.uploaded_by_name || '?')
    .split(' ').map(s => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('') || '?'

  return (
    <aside className="hidden lg:flex w-[280px] shrink-0 border-l p-3 flex-col gap-2 max-h-[78vh] overflow-auto"
      style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between">
        <h6 className="text-[9px] uppercase tracking-[0.18em]"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Anteprima · Selezionato</h6>
        <button onClick={onClose} className="p-0.5" style={{ color: 'var(--color-text-faint)' }} title="Chiudi">
          <X size={12} />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="aspect-[1.3/1] relative grid place-items-center overflow-hidden border"
        style={{
          background: 'linear-gradient(180deg, var(--color-surface-2), var(--color-surface-0))',
          borderColor: 'var(--color-border)',
        }}>
        {isImage ? (
          <img src={attachment.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-[60%] aspect-[0.77] p-2.5 flex flex-col gap-1"
            style={{ background: '#f4f1e8', boxShadow: '0 6px 18px rgba(0,0,0,0.6)', color: '#1a1a1a' }}>
            <div className="text-[7px] font-bold uppercase tracking-wide" style={{ fontFamily: F_DISPLAY, color: '#000' }}>
              {(cat?.label) || 'Documento'}
            </div>
            <div className="h-px my-0.5" style={{ background: '#000' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
            <div className="h-0.5 w-4/5" style={{ background: '#999' }} />
            <div className="h-0.5 w-[55%]" style={{ background: '#999' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
            <div className="h-0.5 w-4/5" style={{ background: '#999' }} />
            <div className="h-1" />
            <div className="h-0.5 w-[55%]" style={{ background: 'var(--color-primary-dark, #1B6B4A)' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 text-[8px] font-bold text-white px-1.5 py-0.5 uppercase tracking-wider"
          style={{ background: isImage ? '#5b8eff' : '#e03c31', fontFamily: F_MONO }}>
          {isImage ? 'IMG' : 'PDF'}
        </span>
      </div>

      {/* Title + pills */}
      <div>
        <h3 className="text-[14px] font-semibold leading-tight break-words" style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {attachment.name}
        </h3>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {!isImage && (
            <span className="text-[8px] px-1.5 py-0.5 uppercase tracking-wider border"
              style={{
                fontFamily: F_MONO, background: 'rgba(139,111,245,0.15)',
                color: '#8b6ff5', borderColor: 'rgba(139,111,245,0.4)',
              }}>⚡ AI</span>
          )}
          <span className="text-[8px] px-1.5 py-0.5 uppercase tracking-wider border"
            style={{
              fontFamily: F_MONO, background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)', borderColor: 'var(--color-border)',
            }}>{isImage ? 'Immagine' : 'PDF'}</span>
          {attachment.is_favorite && (
            <span className="text-[8px] px-1.5 py-0.5 uppercase tracking-wider border"
              style={{
                fontFamily: F_MONO, background: 'rgba(42,157,110,0.18)',
                color: 'var(--color-primary-light, #3db685)', borderColor: 'var(--color-primary)',
              }}>★ Preferito</span>
          )}
        </div>
      </div>

      {/* Meta grid 2-col compatto */}
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 py-2 my-1 border-y"
        style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-[8px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Cartella</p>
          <p className="text-[11px] mt-px" style={{ color: 'var(--color-text)' }}>{cat?.label || '—'}</p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Tipo</p>
          <p className="text-[11px] mt-px" style={{ color: 'var(--color-text)' }}>{isImage ? 'Immagine' : 'PDF'}</p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Caricato</p>
          <p className="text-[11px] mt-px" style={{ color: 'var(--color-text)' }}>{attachment.uploaded_at ? formatDate(attachment.uploaded_at) : '—'}</p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Quando</p>
          <p className="text-[11px] mt-px" style={{ color: 'var(--color-text)' }}>{attachment.uploaded_at ? timeAgo(attachment.uploaded_at) : '—'}</p>
        </div>
      </div>

      {/* Uploader card compatta */}
      <div className="flex items-center gap-2 px-2 py-1.5 border"
        style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
        <div className="w-6 h-6 grid place-items-center text-[9px] font-bold rounded-full shrink-0"
          style={{ fontFamily: F_MONO, background: 'var(--color-primary-light, #3db685)', color: '#061a0e' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
            {attachment.uploaded_by_name || 'Origine sconosciuta'}
          </p>
          <p className="text-[9px] mt-px truncate" style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
            {attachment.uploaded_at ? `${formatDate(attachment.uploaded_at)}` : 'Data non disponibile'}
          </p>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex gap-1.5">
        <a href={attachment.url} target="_blank" rel="noopener"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors"
          style={{ fontFamily: F_DISPLAY, background: 'var(--color-primary)', borderRadius: 2 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light, #3db685)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}>
          <ExternalLink size={11} /> Apri
        </a>
        <a href={attachment.url} download={attachment.name}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border"
          style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)', borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', borderRadius: 2 }}>
          <Download size={11} /> Scarica
        </a>
        <button onClick={() => onToggleFavorite(idx)}
          className="px-2 py-1.5 transition-colors border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', color: attachment.is_favorite ? GOLD : 'var(--color-text-faint)', borderRadius: 2 }}
          title={attachment.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
          <Star size={12} fill={attachment.is_favorite ? GOLD : 'none'} />
        </button>
        <button onClick={() => { if (confirm('Eliminare questo file?')) { onRemove(idx); onClose() } }}
          className="px-2 py-1.5 transition-colors border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-faint)', borderRadius: 2 }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger, #e03c31)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-faint)'}
          title="Elimina">
          <Trash2 size={12} />
        </button>
      </div>

      {/* AI extract */}
      {!isImage && (
        <div className="text-[11px] leading-snug p-2 mt-1"
          style={{
            color: 'var(--color-text-muted)',
            background: 'rgba(139,111,245,0.07)',
            borderLeft: '2px solid #8b6ff5',
          }}>
          <span className="block text-[8px] uppercase tracking-widest mb-1"
            style={{ fontFamily: F_MONO, color: '#8b6ff5' }}>⚡ Estratto AI</span>
          Apri il documento per leggerlo, oppure usa la chat AI per chiedere una sintesi.
        </div>
      )}
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────
export default function MachineDocumentationTab({
  sel, onUpload, onUploadFile, onRemoveAttachment, onToggleFavorite, onSaveField, onOpenAssistant, reindexing = false,
  // Stato controllato dal parent (left-rail tree). Se non passato, fallback
  // a state interno per riuso standalone.
  currentFolder: controlledFolder,
  onChangeFolder,
  typeFilter: controlledTypeFilter,
  onChangeTypeFilter,
}) {
  const attachments = useMemo(() => sel.attachments || [], [sel.attachments])

  const [innerFolder, setInnerFolder] = useState(null)
  const [innerTypeFilter, setInnerTypeFilter] = useState('all')
  const currentFolder = onChangeFolder ? (controlledFolder ?? null) : innerFolder
  const typeFilter = onChangeTypeFilter ? (controlledTypeFilter ?? 'all') : innerTypeFilter
  const setCurrentFolder = onChangeFolder || setInnerFolder
  const setTypeFilter = onChangeTypeFilter || setInnerTypeFilter
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  const [selectedAttachment, setSelectedAttachment] = useState(null)

  useEffect(() => { setSelectedAttachment(null) }, [currentFolder, sel?.id])

  const filteredByChips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return attachments.filter(a => {
      if (typeFilter === 'pdf' && a.type !== 'pdf') return false
      if (typeFilter === 'image' && a.type !== 'image') return false
      if (typeFilter === 'favorites' && !a.is_favorite) return false
      if (q && !(a.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [attachments, searchQuery, typeFilter])

  const itemsByCategory = useMemo(() => {
    const map = {}
    for (const cat of CATEGORIES) map[cat.id] = []
    for (const a of filteredByChips) {
      const id = a.category || (a.type === 'image' ? 'foto' : null)
      if (id && map[id]) map[id].push(a)
    }
    return map
  }, [filteredByChips])

  const totalFiles = attachments.length
  const indexedFiles = attachments.filter(a => a.type === 'pdf').length
  const favoriteFiles = attachments.filter(a => a.is_favorite).length

  const handleDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) setDragOver(false) }
  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    if (!onUploadFile) return
    const files = Array.from(e.dataTransfer.files || [])
    const target = currentFolder || 'foto'
    for (const f of files) onUploadFile(f, target)
  }

  const goToFolder = (id) => setCurrentFolder(id)
  const goToRoot = () => { setCurrentFolder(null); setTypeFilter('all') }

  const activeCategory = currentFolder ? CATEGORY_BY_ID[currentFolder] : null

  // Recenti (massimo 4 nei "Recenti & Preferiti", ordinati per uploaded_at desc)
  const recentForList = useMemo(() => {
    return [...filteredByChips]
      .sort((a, b) => {
        if (a.is_favorite && !b.is_favorite) return -1
        if (!a.is_favorite && b.is_favorite) return 1
        return (b.uploaded_at || '').localeCompare(a.uploaded_at || '')
      })
      .slice(0, 4)
  }, [filteredByChips])

  return (
    <div
      className="relative animate-fade-in"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div className="absolute inset-2 z-50 border-2 border-dashed pointer-events-none flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
          style={{ background: 'rgba(15,61,42,0.85)', borderColor: 'var(--color-primary-light, #3db685)' }}>
          <Upload size={42} style={{ color: 'var(--color-primary-light, #3db685)' }} />
          <p className="text-2xl font-semibold uppercase tracking-wider"
            style={{ fontFamily: F_DISPLAY, color: 'var(--color-primary-light, #3db685)' }}>Rilascia qui</p>
          <p className="text-[11px]" style={{ color: 'var(--color-text)' }}>L'AI indicizza automaticamente</p>
        </div>
      )}

      {/* Layout: main + preview side (preview compare ≥lg) */}
      <div className="flex">
        <main className="flex-1 min-w-0 px-1 lg:pr-3.5 max-h-[78vh] overflow-y-auto">
          <AiBar machineId={sel?.id} reindexing={reindexing} totalFiles={totalFiles} indexedFiles={indexedFiles} onOpenAssistant={onOpenAssistant} />

          {/* Toolbar compatta */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <div className="flex items-center gap-1 text-[13px] uppercase tracking-wide font-semibold"
              style={{ fontFamily: F_DISPLAY }}>
              <button onClick={goToRoot}
                className="flex items-center gap-1 px-1.5 py-1 transition-colors"
                style={{ color: !currentFolder ? GOLD : 'var(--color-text-muted)' }}>
                <Folder size={12} fill="currentColor" /> Documentazione
              </button>
              {currentFolder && (
                <>
                  <span style={{ color: 'var(--color-text-faint)' }}>›</span>
                  <span style={{ color: GOLD }}>{activeCategory?.label}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border min-w-[160px] max-w-[240px] flex-1"
              style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
              <Search size={11} style={{ color: 'var(--color-text-muted)' }} />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca documento…"
                className="bg-transparent border-none outline-none text-[12px] flex-1 min-w-0"
                style={{ color: 'var(--color-text)' }} />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ color: 'var(--color-text-faint)' }}>
                  <X size={10} />
                </button>
              )}
            </div>

            {/* Filter chips */}
            {[
              { id: 'all', label: 'Tutti', count: attachments.length },
              { id: 'pdf', label: 'PDF', count: attachments.filter(a => a.type === 'pdf').length },
              { id: 'image', label: 'Foto', count: attachments.filter(a => a.type === 'image').length },
              { id: 'favorites', label: '★', count: favoriteFiles },
            ].map(f => {
              const active = typeFilter === f.id
              return (
                <button key={f.id} onClick={() => setTypeFilter(f.id)}
                  className="px-2 py-1.5 text-[10px] uppercase tracking-wider border flex items-center gap-1 transition-colors"
                  style={{
                    fontFamily: F_MONO,
                    background: active ? 'rgba(42,157,110,0.15)' : 'var(--color-surface-1)',
                    color: active ? 'var(--color-primary-light, #3db685)' : 'var(--color-text-muted)',
                    borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                    borderRadius: 2,
                  }}>
                  {f.label}
                  <span className="text-[9px] px-0.5"
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface-3)',
                      color: active ? '#fff' : 'var(--color-text-muted)',
                    }}>{f.count}</span>
                </button>
              )
            })}

            {activeCategory && activeCategory.id !== 'foto' && (
              <div className="flex border" style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
                {[
                  { id: 'grid', icon: <LayoutGrid size={12} /> },
                  { id: 'list', icon: <List size={12} /> },
                ].map(v => (
                  <button key={v.id} onClick={() => setViewMode(v.id)}
                    className="px-2 py-1.5 transition-colors"
                    style={{
                      background: viewMode === v.id ? 'var(--color-surface-3)' : 'transparent',
                      color: viewMode === v.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                    }} title={v.id === 'grid' ? 'Griglia' : 'Elenco'}>
                    {v.icon}
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => activeCategory ? onUpload(activeCategory.uploadType, activeCategory.id) : onUpload('pdf', 'scheda_tecnica')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white transition-colors"
              style={{
                fontFamily: F_DISPLAY, background: 'var(--color-primary)',
                boxShadow: '0 0 16px rgba(42,157,110,0.30)', borderRadius: 2,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light, #3db685)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}>
              <Plus size={11} strokeWidth={2.5} /> Carica
            </button>
          </div>

          {/* Folder grid 3-col compatta o vista cartella */}
          {!currentFolder ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                {CATEGORIES.map(cat => (
                  <FolderCard key={cat.id}
                    category={cat}
                    items={itemsByCategory[cat.id] || []}
                    onClick={() => goToFolder(cat.id)}
                    onDropFile={onUploadFile}
                  />
                ))}
              </div>

              {/* Recenti & Preferiti — riga 2-col compatta */}
              <div className="flex items-center gap-2 mt-1 mb-1.5">
                <span className="text-[9px] uppercase tracking-[0.18em]"
                  style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>★ Recenti & preferiti</span>
                <span className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                {totalFiles > 4 && (
                  <button className="text-[9px] uppercase tracking-wider"
                    style={{ fontFamily: F_MONO, color: 'var(--color-primary-light, #3db685)' }}>
                    Vedi tutti →
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {recentForList.length === 0 && (
                  <div className="flex items-center gap-2 px-2 py-1.5 border opacity-50"
                    style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
                    <div className="w-6 h-[30px] grid place-items-center text-[8px] font-bold"
                      style={{ background: 'var(--color-surface-3)', color: 'var(--color-text-faint)', fontFamily: F_MONO }}>—</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>Nessun file caricato</p>
                      <p className="text-[9px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Trascina qui per iniziare</p>
                    </div>
                  </div>
                )}
                {recentForList.map((a, i) => {
                  const cat = CATEGORY_BY_ID[a.category] || CATEGORIES[0]
                  return (
                    <button key={`${a.url}-${i}`}
                      onClick={() => { goToFolder(a.category || 'foto'); setSelectedAttachment(a) }}
                      className="flex items-center gap-2 px-2 py-1.5 border transition-all text-left"
                      style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}>
                      <div className="w-6 h-[30px] grid place-items-center text-[8px] font-bold text-white relative shrink-0"
                        style={{ background: a.type === 'image' ? '#5b8eff' : '#e03c31', fontFamily: F_MONO }}>
                        {a.type === 'image' ? 'IMG' : 'PDF'}
                        <span className="absolute top-0 right-0 w-1.5 h-1.5"
                          style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.name}</p>
                        <p className="text-[9px] mt-px truncate"
                          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                          {a.uploaded_by_name || cat.label}
                          {a.uploaded_at && ` · ${timeAgo(a.uploaded_at)}`}
                          {` · ${cat.label}`}
                        </p>
                      </div>
                      <Star size={11} fill={a.is_favorite ? GOLD : 'none'}
                        stroke={a.is_favorite ? GOLD : 'var(--color-text-faint)'}
                        className="shrink-0" />
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <FolderView
              category={activeCategory}
              items={itemsByCategory[activeCategory.id] || []}
              attachmentsAll={attachments}
              onUpload={onUpload}
              onRemove={onRemoveAttachment}
              onToggleFavorite={onToggleFavorite}
              sel={sel}
              onSaveField={onSaveField}
              onSelect={setSelectedAttachment}
              selectedAttachment={selectedAttachment}
              viewMode={viewMode}
            />
          )}
        </main>

        <PreviewPanel
          attachment={selectedAttachment}
          attachmentsAll={attachments}
          onRemove={onRemoveAttachment}
          onToggleFavorite={onToggleFavorite}
          onClose={() => setSelectedAttachment(null)}
        />
      </div>

      {/* Anteprima inline su < lg (mobile/tablet stretto) */}
      {selectedAttachment && (
        <div className="lg:hidden mt-2.5">
          <div className="p-2.5 border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
            <div className="flex items-center gap-2.5">
              {selectedAttachment.type === 'image' ? (
                <img src={selectedAttachment.url} alt="" className="w-12 h-12 object-cover" />
              ) : (
                <div className="w-10 h-12 grid place-items-center text-[9px] font-bold text-white"
                  style={{ background: '#e03c31', fontFamily: F_MONO }}>PDF</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{selectedAttachment.name}</p>
                <p className="text-[9px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                  {selectedAttachment.uploaded_by_name || '—'}
                  {selectedAttachment.uploaded_at && ` · ${timeAgo(selectedAttachment.uploaded_at)}`}
                </p>
              </div>
              <a href={selectedAttachment.url} target="_blank" rel="noopener"
                className="px-2.5 py-1.5 text-[11px] font-bold uppercase text-white"
                style={{ background: 'var(--color-primary)', fontFamily: F_DISPLAY, borderRadius: 2 }}>
                Apri
              </a>
              <button onClick={() => setSelectedAttachment(null)} className="p-1.5" style={{ color: 'var(--color-text-faint)' }}>
                <X size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar minimale */}
      <div className="flex items-center gap-3 mt-2.5 px-3 py-1.5 border-t"
        style={{ borderColor: 'var(--color-border)', fontFamily: F_MONO }}>
        <span className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--color-primary-light, #3db685)', boxShadow: '0 0 6px var(--color-primary-glow)' }} />
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {reindexing ? 'Indicizzazione…' : 'Connesso · biblioteca AI online'}
        </span>
        <span className="hidden md:inline text-[9px] uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}>
          · {CATEGORIES.length} cartelle · {totalFiles} file
        </span>
        {favoriteFiles > 0 && (
          <span className="hidden md:inline text-[9px] uppercase tracking-wider" style={{ color: GOLD }}>
            · ★ {favoriteFiles}
          </span>
        )}
        <div className="ml-auto hidden md:flex text-[9px] uppercase tracking-wider"
          style={{ color: 'var(--color-text-faint)' }}>
          ↓ Trascina file qui per caricarli
        </div>
      </div>
    </div>
  )
}
