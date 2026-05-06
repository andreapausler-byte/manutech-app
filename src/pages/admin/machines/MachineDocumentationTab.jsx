import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Camera, FileText, Plus, Trash2, ExternalLink, Save, X,
  BookOpen, Wrench, Image as ImageIcon, Building,
  ShieldCheck, Sparkles, Loader2, FileSignature,
  Search, ArrowLeft, Folder, Upload, MessageCircle,
  Star, LayoutGrid, List, ChevronRight, ChevronDown,
  Calendar, Clock, MoreHorizontal, Download,
} from 'lucide-react'
import { db } from '../../../lib/supabase'
import { timeAgo, formatDate } from '../../../lib/constants'

// Font Barlow Condensed per i titoli display (squadrati, industriali)
const F_DISPLAY = "'Barlow Condensed', system-ui, sans-serif"
const F_MONO = "'DM Mono', 'JetBrains Mono', ui-monospace, monospace"
// Gold accent: tab linguetta in alto delle cartelle "occupate" + active tabs
const GOLD = '#e0a82e'

// Categorie note (id = valore stringa salvato in attachment.category)
const CATEGORIES = [
  { id: 'foto', label: 'Galleria Foto', desc: 'Foto della macchina, targhette, dettagli installazione',
    icon: ImageIcon, frontColor: '#5b8eff', backColor: '#3b6ad9', uploadType: 'image' },
  { id: 'scheda_tecnica', label: 'Schede Tecniche', desc: 'Datasheet costruttore, dimensioni, schemi elettrici',
    icon: FileText, frontColor: '#e0a82e', backColor: '#b58220', uploadType: 'pdf' },
  { id: 'manuale_uso', label: "Istruzioni d'Uso", desc: "Procedure di avvio, arresto, funzionamento ordinario",
    icon: BookOpen, frontColor: '#3ddc84', backColor: '#2aa564', uploadType: 'pdf',
    instructionsField: 'usage_instructions', instructionsPlaceholder: "Aggiungi istruzioni d'uso..." },
  { id: 'manuale_manutenzione', label: 'Istruzioni di Manutenzione', desc: 'Procedure preventive, lubrificazione, sanificazione',
    icon: Wrench, frontColor: '#ff8a3d', backColor: '#cc5e1d', uploadType: 'pdf',
    instructionsField: 'maintenance_instructions', instructionsPlaceholder: 'Aggiungi istruzioni di manutenzione...' },
  { id: 'intervento_esterno', label: 'Interventi Ditta Esterna', desc: 'Rapporti di intervento, bolle di lavoro, verbali',
    icon: Building, frontColor: '#8b6ff5', backColor: '#6a52c4', uploadType: 'pdf' },
  { id: 'contratto_manutenzione', label: 'Contratti di Manutenzione', desc: 'Contratti attivi, accordi quadro, SLA fornitori',
    icon: FileSignature, frontColor: '#e85d75', backColor: '#a73a4d', uploadType: 'pdf' },
  { id: 'certificato', label: 'Certificati e Conformità', desc: 'Dichiarazioni CE, ispezioni periodiche, tarature',
    icon: ShieldCheck, frontColor: '#5dd3b8', backColor: '#36a187', uploadType: 'pdf' },
]
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

// ──────────────────────────────────────────────────────────────
// AiBanner: banner viola/verde con stats triple e CTA "Chiedi all'AI"
// ──────────────────────────────────────────────────────────────
function AiBanner({ machineId, reindexing, totalFiles, indexedFiles }) {
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
  const lastIndexed = stats?.last_indexed_at ? new Date(stats.last_indexed_at) : null

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 mb-4 overflow-hidden border"
      style={{
        background: 'linear-gradient(90deg, rgba(139,111,245,0.12), rgba(42,157,110,0.08))',
        borderColor: 'rgba(139,111,245,0.25)',
        borderLeft: '3px solid #8b6ff5',
        borderRadius: 2,
      }}>
      <div className="w-9 h-9 shrink-0 grid place-items-center"
        style={{ background: 'linear-gradient(135deg, #8b6ff5, #5b8eff)', borderRadius: 2 }}>
        {reindexing
          ? <Loader2 size={18} className="text-white animate-spin" />
          : <Sparkles size={18} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold uppercase tracking-wider" style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {reindexing
            ? 'Biblioteca AI · indicizzazione in corso'
            : `Biblioteca AI · ${indexedFiles} document${indexedFiles === 1 ? 'o' : 'i'} indicizzat${indexedFiles === 1 ? 'o' : 'i'}`}
        </h4>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {reindexing
            ? "Estrazione testo, generazione embedding e salvataggio. Richiede alcuni secondi."
            : "Chiedi qualsiasi cosa sul macchinario — i manuali, le procedure e i contratti vengono letti in tempo reale."}
        </p>
      </div>
      {!reindexing && (
        <div className="hidden lg:flex gap-5 pr-2">
          {[
            { val: indexedFiles, lbl: 'indicizzati' },
            { val: chunks, lbl: 'estratti' },
            { val: totalFiles, lbl: 'file totali' },
          ].map(s => (
            <div key={s.lbl} className="text-center">
              <div className="text-xl font-semibold" style={{ fontFamily: F_DISPLAY, color: '#8b6ff5' }}>{s.val}</div>
              <div className="text-[9px] uppercase tracking-widest" style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      )}
      <button className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors"
        style={{ background: '#8b6ff5', fontFamily: F_DISPLAY, borderRadius: 2 }}
        title="Va alla chat AI"
        onMouseEnter={(e) => e.currentTarget.style.background = '#9a7eff'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#8b6ff5'}>
        <MessageCircle size={12} />
        Chiedi all'AI
      </button>
      {lastIndexed && !reindexing && (
        <span className="hidden xl:block text-[9px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          agg. {timeAgo(lastIndexed.toISOString())}
        </span>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// SidebarTree: navigazione gerarchica a sx, 240px (≥xl)
// ──────────────────────────────────────────────────────────────
function SidebarTree({ currentFolder, currentQuickFilter, onFolderSelect, onQuickFilterSelect, onRoot, itemsByCategory, attachments, totalSize, recentCount, favoriteCount }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <aside className="hidden xl:block w-60 shrink-0 border-r pt-3 pb-3"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
      <h6 className="px-4 pb-2 text-[9px] uppercase tracking-[0.18em]"
        style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
        Naviga
      </h6>

      {/* Root: Documentazione */}
      <button onClick={onRoot}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
          !currentFolder && !currentQuickFilter ? 'mt-active-item' : 'hover:bg-surface-1'
        }`}
        style={{
          color: !currentFolder && !currentQuickFilter ? 'var(--color-text)' : 'var(--color-text-muted)',
          background: !currentFolder && !currentQuickFilter ? 'rgba(42,157,110,0.12)' : undefined,
          borderLeft: !currentFolder && !currentQuickFilter ? '2px solid var(--color-primary)' : '2px solid transparent',
        }}>
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }} className="p-0.5 -m-0.5 flex items-center">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <Folder size={14} style={{ color: !currentFolder && !currentQuickFilter ? 'var(--color-primary-light, #3db685)' : GOLD }} fill="currentColor" />
        <span className="flex-1 text-left font-medium">Documentazione</span>
        <span className="text-[10px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>{attachments.length}</span>
      </button>

      {/* Sub-cartelle */}
      {expanded && CATEGORIES.map(cat => {
        const active = currentFolder === cat.id
        const count = (itemsByCategory[cat.id] || []).length
        return (
          <button key={cat.id} onClick={() => onFolderSelect(cat.id)}
            className="w-full flex items-center gap-2 pl-9 pr-4 py-2 text-[13px] transition-colors hover:bg-surface-1"
            style={{
              color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
              background: active ? 'rgba(42,157,110,0.12)' : undefined,
              borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}>
            <Folder size={13} style={{ color: active ? cat.frontColor : GOLD, opacity: count > 0 ? 1 : 0.4 }} fill="currentColor" />
            <span className="flex-1 text-left truncate">{cat.label}</span>
            <span className="text-[10px]" style={{ fontFamily: F_MONO, color: active ? 'var(--color-primary-light, #3db685)' : 'var(--color-text-faint)' }}>{count}</span>
          </button>
        )
      })}

      <div className="h-px mx-4 my-2" style={{ background: 'var(--color-border)' }} />

      <h6 className="px-4 pb-2 pt-1 text-[9px] uppercase tracking-[0.18em]"
        style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
        Filtri rapidi
      </h6>

      {[
        { id: 'favorites', label: 'Preferiti', icon: <Star size={13} fill={GOLD} stroke={GOLD} />, count: favoriteCount },
        { id: 'recent', label: 'Recenti', icon: <Clock size={13} />, count: recentCount },
      ].map(f => {
        const active = currentQuickFilter === f.id
        return (
          <button key={f.id} onClick={() => onQuickFilterSelect(f.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors hover:bg-surface-1"
            style={{
              color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
              background: active ? 'rgba(42,157,110,0.12)' : undefined,
              borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}>
            <span className="w-2.5 inline-block" />
            {f.icon}
            <span className="flex-1 text-left">{f.label}</span>
            <span className="text-[10px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>{f.count}</span>
          </button>
        )
      })}

      <div className="h-px mx-4 my-2" style={{ background: 'var(--color-border)' }} />

      <h6 className="px-4 pb-2 pt-1 text-[9px] uppercase tracking-[0.18em]"
        style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
        Spazio
      </h6>
      <div className="px-4">
        <div className="flex justify-between text-[10px] mb-1.5"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
          <span>{totalSize.label}</span>
          <span style={{ color: 'var(--color-text-faint)' }}>/ {totalSize.cap}</span>
        </div>
        <div className="h-1" style={{ background: 'var(--color-surface-3)' }}>
          <div className="h-full transition-all" style={{
            width: `${Math.min(100, totalSize.pct)}%`,
            background: 'var(--color-primary-light, #3db685)',
            boxShadow: '0 0 6px var(--color-primary-glow)',
          }} />
        </div>
      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────
// FolderCard: card stile Windows, tab gialla in alto se ha contenuti
// ──────────────────────────────────────────────────────────────
function FolderCard({ category, items, onClick, onDropFile, isDragTarget }) {
  const Icon = category.icon
  const empty = items.length === 0
  const indexed = items.filter(a => a.type === 'pdf').length
  const lastUploaded = items.reduce((latest, a) => {
    if (!a.uploaded_at) return latest
    if (!latest) return a.uploaded_at
    return a.uploaded_at > latest ? a.uploaded_at : latest
  }, null)
  const hasFavorite = items.some(a => a.is_favorite)
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
      className="relative text-left p-4 flex flex-col gap-3 min-h-[170px] transition-all border"
      style={{
        background: hovering ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
        borderColor: hovering ? 'var(--color-primary)' : 'var(--color-border)',
        borderRadius: 2,
        boxShadow: isDragTarget ? '0 0 0 2px var(--color-primary)' : undefined,
      }}
      onMouseEnter={(e) => { if (!hovering) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={(e) => { if (!hovering) e.currentTarget.style.background = 'var(--color-surface-1)' }}
    >
      {/* tab linguetta gialla in alto se ha contenuti */}
      {!empty && (
        <span className="absolute top-0 left-4 w-12 h-1.5"
          style={{ background: GOLD, borderRadius: '0 0 1px 1px' }} />
      )}

      {/* AI tag */}
      {indexed > 0 && (
        <span className="absolute top-2.5 right-9 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 uppercase tracking-wider"
          style={{ fontFamily: F_MONO, color: '#8b6ff5' }}>
          <Sparkles size={9} fill="currentColor" /> AI · indicizzato
        </span>
      )}

      <div className="flex items-start justify-between">
        {/* Folder icon CSS pure */}
        <div className="relative w-16 h-12 shrink-0">
          <div className="absolute inset-x-0 top-1.5 bottom-0"
            style={{
              background: empty ? '#3d3017' : category.backColor,
              opacity: empty ? 0.55 : 1,
              clipPath: 'polygon(0 0, 38% 0, 44% 14%, 100% 14%, 100% 100%, 0 100%)',
            }} />
          <div className="absolute inset-x-0 top-3 bottom-0"
            style={{
              background: empty ? '#5a4520' : category.frontColor,
              opacity: empty ? 0.55 : 1,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
            }} />
          <Icon size={14} className="absolute top-3.5 left-3 z-[1]"
            style={{ color: 'rgba(0,0,0,0.55)', opacity: empty ? 0.4 : 1 }} />
          <span className="absolute -bottom-1.5 -right-2 z-10 min-w-[22px] text-center px-2 py-0.5 text-[11px] font-bold"
            style={{
              fontFamily: F_MONO,
              background: empty ? 'var(--color-surface-3)' : '#2a9d6e',
              color: empty ? 'var(--color-text-faint)' : '#061a0e',
              borderRadius: 12,
              boxShadow: empty ? 'none' : '0 0 12px rgba(42,157,110,0.4)',
            }}>{items.length}</span>
        </div>

        <button onClick={(e) => e.stopPropagation()}
          className="w-7 h-7 grid place-items-center transition-colors"
          style={{ color: 'var(--color-text-faint)', borderRadius: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-3)'; e.currentTarget.style.color = 'var(--color-text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-faint)' }}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* titolo + descrizione */}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold uppercase tracking-wide leading-tight"
          style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {category.label}
        </h3>
        <p className="text-xs leading-snug line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
          {category.desc}
        </p>
      </div>

      {/* mini preview stack (border-top colorato per tipo) */}
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 3).map((a, i) => {
          const isImage = a.type === 'image'
          return (
            <span key={i} className="w-[34px] h-[42px] grid place-items-center text-[8px] font-mono border"
              style={{
                background: isImage ? 'linear-gradient(135deg, #2a3d2f, #1c2a21)' : 'var(--color-surface-3)',
                borderColor: 'var(--color-border)',
                borderTopWidth: 3,
                borderTopColor: isImage ? '#5b8eff' : '#e03c31',
                color: isImage ? '#5b8eff' : '#e03c31',
                fontFamily: F_MONO,
              }}>{isImage ? 'IMG' : 'PDF'}</span>
          )
        })}
        {items.length > 3 && (
          <span className="w-[34px] h-[42px] grid place-items-center text-[9px]"
            style={{
              background: 'var(--color-surface-3)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              fontFamily: F_MONO,
            }}>+{items.length - 3}</span>
        )}
      </div>

      {/* footer */}
      <div className="mt-auto pt-2.5 flex items-center justify-between text-[10px] uppercase tracking-wider"
        style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)', borderTop: '1px dashed var(--color-border)' }}>
        {lastUploaded ? <span>Agg. {timeAgo(lastUploaded)}</span> : <span>Vuota</span>}
        {hasFavorite && <span style={{ color: GOLD }}>★ preferito</span>}
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// InstructionEditor (riusato dal precedente con stilemi industrial)
// ──────────────────────────────────────────────────────────────
function InstructionEditor({ value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')

  const handleSave = () => { onSave(text.trim() || null); setEditing(false) }

  if (!editing) {
    return value ? (
      <div className="group relative p-4 border"
        style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>{value}</p>
        <button onClick={() => { setText(value); setEditing(true) }}
          className="absolute top-2 right-2 p-1.5 transition-all opacity-0 group-hover:opacity-100"
          style={{ color: 'var(--color-text-faint)', borderRadius: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--color-primary-light, #3db685)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-faint)' }}>
          <Save size={13} />
        </button>
      </div>
    ) : (
      <button onClick={() => setEditing(true)}
        className="w-full text-left p-4 text-sm border border-dashed transition-all"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)', borderRadius: 2 }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        + {placeholder}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={5}
        className="w-full input-field px-3 py-2.5 text-sm resize-none"
        style={{ borderRadius: 2 }}
        autoFocus />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
          style={{ color: 'var(--color-text-faint)' }}>
          <X size={12} /> Annulla
        </button>
        <button onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white"
          style={{ background: 'var(--color-primary)', fontFamily: F_DISPLAY, borderRadius: 2 }}>
          <Save size={12} /> Salva
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FileRow: riga compatta per vista lista (dentro cartella)
// ──────────────────────────────────────────────────────────────
function FileRow({ attachment, onSelect, selected, onToggleFavorite, attachmentIndex }) {
  const isImage = attachment.type === 'image'
  return (
    <div onClick={() => onSelect(attachment)}
      className="flex items-center gap-3 p-2.5 cursor-pointer border transition-all group"
      style={{
        background: selected ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
        borderColor: selected ? 'rgba(42,157,110,0.45)' : 'var(--color-border)',
        borderRadius: 2,
      }}>
      {isImage ? (
        <div className="w-10 h-12 overflow-hidden shrink-0 border"
          style={{ borderColor: 'var(--color-border)' }}>
          <img src={attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-9 h-12 shrink-0 grid place-items-center text-[9px] font-bold text-white relative"
          style={{ background: '#e03c31', fontFamily: F_MONO }}>
          PDF
          <span className="absolute top-0 right-0 w-2 h-2"
            style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{attachment.name}</p>
          {!isImage && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 shrink-0 uppercase tracking-wider"
              style={{ fontFamily: F_MONO, color: '#8b6ff5', background: 'rgba(139,111,245,0.10)' }}>
              <Sparkles size={9} fill="currentColor" /> AI
            </span>
          )}
        </div>
        <p className="text-[10px] mt-0.5" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          {attachment.uploaded_by_name || '—'}
          {attachment.uploaded_at && ` · ${timeAgo(attachment.uploaded_at)}`}
          {!attachment.uploaded_at && !attachment.uploaded_by_name && 'Origine sconosciuta'}
        </p>
      </div>

      <button onClick={e => { e.stopPropagation(); onToggleFavorite(attachmentIndex) }}
        className="p-2 transition-colors shrink-0"
        style={{ color: attachment.is_favorite ? GOLD : 'var(--color-text-faint)', borderRadius: 2 }}
        title={attachment.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
        <Star size={14} fill={attachment.is_favorite ? GOLD : 'none'} />
      </button>
      <a href={attachment.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
        className="p-2 transition-colors shrink-0"
        style={{ color: 'var(--color-text-faint)', borderRadius: 2 }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-faint)'}
        title="Apri">
        <ExternalLink size={14} />
      </a>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// FolderView: vista contenuto cartella aperta (lista o griglia)
// ──────────────────────────────────────────────────────────────
function FolderView({ category, items, attachmentsAll, onUpload, onRemove, onToggleFavorite, sel, onSaveField, onSelect, selectedAttachment, viewMode }) {
  const Icon = category.icon
  const indexOf = (a) => attachmentsAll.indexOf(a)
  const isPhotoFolder = category.id === 'foto'

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header cartella */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-10 h-10 grid place-items-center shrink-0"
          style={{ background: category.frontColor + '22', borderRadius: 2 }}>
          <Icon size={18} style={{ color: category.frontColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold uppercase tracking-wide" style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
            {category.label}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {items.length} {items.length === 1 ? 'elemento' : 'elementi'} · {category.desc}
          </p>
        </div>
      </div>

      {/* Editor istruzioni testuali (solo per le 2 cartelle istruzioni) */}
      {category.instructionsField && (
        <InstructionEditor
          value={sel[category.instructionsField]}
          onSave={(val) => onSaveField(category.instructionsField, val)}
          placeholder={category.instructionsPlaceholder}
        />
      )}

      {/* Galleria foto = sempre vista griglia visiva */}
      {isPhotoFolder ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sel.photo_url && (
            <div className="aspect-[4/3] overflow-hidden border relative group"
              style={{ borderColor: 'var(--color-border)' }}>
              <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-2 left-2 text-[9px] font-bold text-white px-2 py-0.5 uppercase"
                style={{ background: 'var(--color-primary)', fontFamily: F_MONO }}>Principale</span>
              <a href={sel.photo_url} target="_blank" rel="noopener"
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center transition-all">
                <ExternalLink size={20} className="text-white" />
              </a>
            </div>
          )}
          {items.map((photo, i) => (
            <div key={i} className="aspect-[4/3] overflow-hidden border relative group cursor-pointer"
              style={{ borderColor: 'var(--color-border)' }}
              onClick={() => onSelect(photo)}>
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                <a href={photo.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                  <ExternalLink size={14} />
                </a>
                <button onClick={(e) => { e.stopPropagation(); onRemove(indexOf(photo)) }}
                  className="p-2 rounded-full bg-red-500/40 hover:bg-red-500/60 text-white">
                  <Trash2 size={14} />
                </button>
              </div>
              {photo.is_favorite && (
                <Star size={14} fill={GOLD} stroke={GOLD} className="absolute top-2 right-2" />
              )}
              {photo.uploaded_by_name && (
                <span className="absolute bottom-0 inset-x-0 px-2 py-1 text-[9px] text-white bg-gradient-to-t from-black/80 to-transparent"
                  style={{ fontFamily: F_MONO }}>
                  {photo.uploaded_by_name}{photo.uploaded_at && ` · ${timeAgo(photo.uploaded_at)}`}
                </span>
              )}
            </div>
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="aspect-[4/3] border-2 border-dashed flex flex-col items-center justify-center transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Camera size={22} className="mb-1.5 opacity-60" />
            <span className="text-xs font-medium">Aggiungi foto</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        // Vista griglia: mini-card per ogni file
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {items.map((doc, i) => (
            <button key={`${doc.url}-${i}`} onClick={() => onSelect(doc)}
              className="text-left p-3 border transition-all flex flex-col gap-2"
              style={{
                background: selectedAttachment === doc ? 'rgba(42,157,110,0.10)' : 'var(--color-surface-1)',
                borderColor: selectedAttachment === doc ? 'rgba(42,157,110,0.45)' : 'var(--color-border)',
                borderRadius: 2,
              }}>
              <div className="flex items-start gap-2">
                <div className="w-9 h-12 shrink-0 grid place-items-center text-[9px] font-bold text-white relative"
                  style={{ background: '#e03c31', fontFamily: F_MONO }}>
                  PDF
                  <span className="absolute top-0 right-0 w-2 h-2"
                    style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium line-clamp-2 leading-tight" style={{ color: 'var(--color-text)' }}>{doc.name}</p>
                </div>
                {doc.is_favorite && <Star size={12} fill={GOLD} stroke={GOLD} className="shrink-0" />}
              </div>
              <p className="text-[9px] uppercase tracking-wider mt-auto truncate"
                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                {doc.uploaded_by_name || '—'}
                {doc.uploaded_at && ` · ${timeAgo(doc.uploaded_at)}`}
              </p>
            </button>
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="border border-dashed flex flex-col items-center justify-center py-6 text-xs transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Plus size={18} className="mb-1.5 opacity-60" />
            <span>Carica file</span>
          </button>
        </div>
      ) : (
        // Vista lista
        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-center py-6 border border-dashed"
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
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed text-sm transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)', borderRadius: 2 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Plus size={14} /> Carica nuovo file
          </button>
          <p className="text-[10px] text-center mt-1" style={{ color: 'var(--color-text-faint)' }}>
            oppure trascina un file qui sopra
          </p>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// PreviewPanel: 360px a destra, fisso (≥xl)
// ──────────────────────────────────────────────────────────────
function PreviewPanel({ attachment, attachmentsAll, onRemove, onToggleFavorite, onClose }) {
  if (!attachment) {
    return (
      <aside className="hidden xl:flex w-[360px] shrink-0 border-l p-4 flex-col gap-3 max-h-[78vh] overflow-auto"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
        <h6 className="text-[9px] uppercase tracking-[0.18em]"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Anteprima</h6>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 border border-dashed text-center"
          style={{ borderColor: 'var(--color-border)' }}>
          <FileText size={28} style={{ color: 'var(--color-text-faint)' }} />
          <p className="text-xs leading-relaxed max-w-[240px]" style={{ color: 'var(--color-text-muted)' }}>
            Seleziona un file per vedere i metadati, l'estratto AI e le azioni rapide
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
    <aside className="hidden xl:flex w-[360px] shrink-0 border-l p-4 flex-col gap-3 max-h-[78vh] overflow-auto"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
      <div className="flex items-center justify-between">
        <h6 className="text-[9px] uppercase tracking-[0.18em]"
          style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Anteprima</h6>
        <button onClick={onClose}
          className="p-1 transition-colors"
          style={{ color: 'var(--color-text-faint)', borderRadius: 2 }}
          title="Chiudi anteprima">
          <X size={14} />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="aspect-[1.4/1] relative grid place-items-center overflow-hidden border"
        style={{
          background: 'linear-gradient(180deg, var(--color-surface-2), var(--color-surface-0))',
          borderColor: 'var(--color-border)',
        }}>
        {isImage ? (
          <img src={attachment.url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-[64%] aspect-[0.77] p-3.5 flex flex-col gap-1.5"
            style={{ background: '#f4f1e8', boxShadow: '0 6px 20px rgba(0,0,0,0.6)', color: '#1a1a1a' }}>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ fontFamily: F_DISPLAY, color: '#000' }}>
              {(cat?.label) || 'Documento'}
            </div>
            <div className="h-px my-1" style={{ background: '#000' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
            <div className="h-0.5 w-4/5" style={{ background: '#999' }} />
            <div className="h-0.5 w-3/5" style={{ background: '#999' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
            <div className="h-0.5 w-4/5" style={{ background: '#999' }} />
            <div className="h-2" />
            <div className="h-0.5 w-3/5" style={{ background: 'var(--color-primary-dark, #1B6B4A)' }} />
            <div className="h-0.5 w-full" style={{ background: '#999' }} />
            <div className="h-0.5 w-4/5" style={{ background: '#999' }} />
          </div>
        )}
        <span className="absolute top-2 left-2 text-[9px] font-bold text-white px-2 py-0.5 uppercase tracking-wider"
          style={{ background: isImage ? '#5b8eff' : '#e03c31', fontFamily: F_MONO }}>
          {isImage ? 'IMG' : 'PDF'}
        </span>
      </div>

      {/* Titolo + pills */}
      <div>
        <h3 className="text-base font-semibold leading-tight break-words" style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
          {attachment.name}
        </h3>
        <div className="flex flex-wrap gap-1 mt-2">
          {attachment.is_favorite && (
            <span className="text-[9px] px-2 py-0.5 uppercase tracking-wider border"
              style={{
                fontFamily: F_MONO, background: 'rgba(42,157,110,0.18)',
                color: 'var(--color-primary-light, #3db685)', borderColor: 'var(--color-primary)',
              }}>★ Preferito</span>
          )}
          {!isImage && (
            <span className="text-[9px] px-2 py-0.5 uppercase tracking-wider border"
              style={{
                fontFamily: F_MONO, background: 'rgba(139,111,245,0.15)',
                color: '#8b6ff5', borderColor: 'rgba(139,111,245,0.4)',
              }}>⚡ AI · letto</span>
          )}
          <span className="text-[9px] px-2 py-0.5 uppercase tracking-wider border"
            style={{
              fontFamily: F_MONO, background: 'var(--color-surface-2)',
              color: 'var(--color-text-muted)', borderColor: 'var(--color-border)',
            }}>{isImage ? 'Immagine' : 'PDF'}</span>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-2.5 border-y"
        style={{ borderColor: 'var(--color-border)' }}>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Cartella</p>
          <p className="text-xs" style={{ color: 'var(--color-text)' }}>{cat?.label || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Tipo</p>
          <p className="text-xs" style={{ color: 'var(--color-text)' }}>{isImage ? 'Immagine' : 'Documento PDF'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Caricato il</p>
          <p className="text-xs" style={{ color: 'var(--color-text)' }}>{attachment.uploaded_at ? formatDate(attachment.uploaded_at) : '—'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>Quando</p>
          <p className="text-xs" style={{ color: 'var(--color-text)' }}>{attachment.uploaded_at ? timeAgo(attachment.uploaded_at) : '—'}</p>
        </div>
      </div>

      {/* Uploader card */}
      <div className="flex items-center gap-2.5 p-2.5 border"
        style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
        <div className="w-8 h-8 grid place-items-center text-[11px] font-bold rounded-full shrink-0"
          style={{ fontFamily: F_MONO, background: 'var(--color-primary-light, #3db685)', color: '#061a0e' }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
            {attachment.uploaded_by_name || 'Origine sconosciuta'}
          </p>
          <p className="text-[10px] mt-0.5 truncate" style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
            {attachment.uploaded_at ? `Caricato ${timeAgo(attachment.uploaded_at)}` : 'Data non disponibile'}
          </p>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex gap-1.5">
        <a href={attachment.url} target="_blank" rel="noopener"
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors"
          style={{ fontFamily: F_DISPLAY, background: 'var(--color-primary)', borderRadius: 2 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light, #3db685)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}>
          <ExternalLink size={13} /> Apri
        </a>
        <a href={attachment.url} download={attachment.name}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border"
          style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)', borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', borderRadius: 2 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-3)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-surface-2)'}>
          <Download size={13} /> Scarica
        </a>
        <button onClick={() => onToggleFavorite(idx)}
          className="px-3 py-2.5 transition-colors border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', color: attachment.is_favorite ? GOLD : 'var(--color-text-faint)', borderRadius: 2 }}
          title={attachment.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
          <Star size={14} fill={attachment.is_favorite ? GOLD : 'none'} />
        </button>
        <button onClick={() => { if (confirm('Eliminare questo file?')) { onRemove(idx); onClose() } }}
          className="px-3 py-2.5 transition-colors border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-faint)', borderRadius: 2 }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger, #e03c31)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-faint)'}
          title="Elimina">
          <Trash2 size={14} />
        </button>
      </div>

      {/* AI extract placeholder */}
      {!isImage && (
        <div>
          <h6 className="mb-2 text-[9px] uppercase tracking-[0.18em]"
            style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>⚡ Estratto AI</h6>
          <div className="text-xs leading-relaxed p-3"
            style={{
              color: 'var(--color-text-muted)',
              background: 'rgba(139,111,245,0.06)',
              borderLeft: '2px solid #8b6ff5',
            }}>
            Apri il documento per leggerlo, oppure usa il chatbot AI per chiedere una sintesi su questo file.
          </div>
        </div>
      )}
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────
export default function MachineDocumentationTab({ sel, onUpload, onUploadFile, onRemoveAttachment, onToggleFavorite, onSaveField, reindexing = false }) {
  const attachments = useMemo(() => sel.attachments || [], [sel.attachments])

  const [currentFolder, setCurrentFolder] = useState(null) // categoryId or null
  const [currentQuickFilter, setCurrentQuickFilter] = useState(null) // 'favorites' | 'recent' | null
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'pdf' | 'image' | 'favorites'
  const [viewMode, setViewMode] = useState('list') // 'grid' | 'list' (dentro cartella)
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  const [selectedAttachment, setSelectedAttachment] = useState(null)

  useEffect(() => { setSelectedAttachment(null) }, [currentFolder, currentQuickFilter, sel?.id])

  // Filtraggio per ricerca + tipo filter chip
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
  // "Recenti" = file con timestamp uploaded_at (cioe' quelli caricati dopo
  // l'introduzione del campo). I file storici senza timestamp sono esclusi.
  const recentCount = useMemo(() => attachments.filter(a => a.uploaded_at).length, [attachments])

  // Drag & drop
  const handleDragEnter = (e) => { e.preventDefault(); dragCounter.current++; setDragOver(true) }
  const handleDragLeave = (e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) setDragOver(false) }
  const handleDragOver = (e) => e.preventDefault()
  const handleDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    if (!onUploadFile) return
    const files = Array.from(e.dataTransfer.files || [])
    // Se siamo dentro una cartella, droppa lì. Altrimenti chiede di scegliere.
    const target = currentFolder || 'foto'
    for (const f of files) onUploadFile(f, target)
  }

  const goToFolder = (id) => { setCurrentFolder(id); setCurrentQuickFilter(null) }
  const goToQuickFilter = (id) => {
    setCurrentQuickFilter(id); setCurrentFolder(null)
    if (id === 'favorites') setTypeFilter('favorites')
    else setTypeFilter('all')
  }
  const goToRoot = () => { setCurrentFolder(null); setCurrentQuickFilter(null); setTypeFilter('all') }

  // Items per viste speciali (preferiti / recenti)
  const quickFilterItems = useMemo(() => {
    if (currentQuickFilter === 'favorites') return attachments.filter(a => a.is_favorite)
    if (currentQuickFilter === 'recent') {
      return [...attachments].filter(a => a.uploaded_at).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)).slice(0, 30)
    }
    return []
  }, [attachments, currentQuickFilter])

  const activeCategory = currentFolder ? CATEGORY_BY_ID[currentFolder] : null
  const totalSize = { label: `${totalFiles} file`, cap: '—', pct: Math.min(100, totalFiles * 4) }

  return (
    <div
      className="relative animate-fade-in"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ minHeight: 600 }}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 border-2 border-dashed pointer-events-none flex flex-col items-center justify-center gap-3 backdrop-blur-sm"
          style={{ background: 'rgba(15,61,42,0.85)', borderColor: 'var(--color-primary-light, #3db685)' }}>
          <Upload size={56} style={{ color: 'var(--color-primary-light, #3db685)' }} />
          <p className="text-3xl font-semibold uppercase tracking-wider"
            style={{ fontFamily: F_DISPLAY, color: 'var(--color-primary-light, #3db685)' }}>Rilascia qui</p>
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>I file verranno indicizzati automaticamente dall'AI</p>
        </div>
      )}

      {/* AI banner */}
      <AiBanner machineId={sel?.id} reindexing={reindexing} totalFiles={totalFiles} indexedFiles={indexedFiles} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3 pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1.5 text-[15px] uppercase tracking-wider" style={{ fontFamily: F_DISPLAY }}>
          <button onClick={goToRoot}
            className="flex items-center gap-1.5 px-2 py-1.5 transition-colors"
            style={{ color: !currentFolder && !currentQuickFilter ? 'var(--color-text)' : 'var(--color-text-muted)', fontWeight: 600, borderRadius: 2 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Folder size={14} fill="currentColor" /> Documentazione
          </button>
          {(currentFolder || currentQuickFilter) && (
            <>
              <span style={{ color: 'var(--color-text-faint)' }}>›</span>
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                {currentFolder ? activeCategory?.label : currentQuickFilter === 'favorites' ? '★ Preferiti' : 'Recenti'}
              </span>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border min-w-[240px] focus-within:border-primary"
          style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
          <Search size={14} style={{ color: 'var(--color-text-faint)' }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca documento..."
            className="bg-transparent border-none outline-none text-sm flex-1 min-w-0"
            style={{ color: 'var(--color-text)' }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ color: 'var(--color-text-faint)' }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Tutti', count: attachments.length },
            { id: 'pdf', label: 'PDF', count: attachments.filter(a => a.type === 'pdf').length },
            { id: 'image', label: 'Foto', count: attachments.filter(a => a.type === 'image').length },
            { id: 'favorites', label: '★', count: favoriteFiles },
          ].map(f => {
            const active = typeFilter === f.id
            return (
              <button key={f.id} onClick={() => setTypeFilter(f.id)}
                className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider border flex items-center gap-1.5 transition-colors"
                style={{
                  fontFamily: F_MONO,
                  background: active ? 'rgba(42,157,110,0.15)' : 'var(--color-surface-1)',
                  color: active ? 'var(--color-primary-light, #3db685)' : 'var(--color-text-muted)',
                  borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                  borderRadius: 2,
                }}>
                {f.label}
                <span className="text-[9px] px-1"
                  style={{
                    background: active ? 'var(--color-primary)' : 'var(--color-surface-3)',
                    color: active ? '#fff' : 'var(--color-text-muted)',
                  }}>{f.count}</span>
              </button>
            )
          })}
        </div>

        {/* View toggle (solo dentro cartella) */}
        {activeCategory && activeCategory.id !== 'foto' && (
          <div className="flex border" style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
            {[
              { id: 'grid', label: 'Griglia', icon: <LayoutGrid size={13} /> },
              { id: 'list', label: 'Elenco', icon: <List size={13} /> },
            ].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)}
                className="px-2.5 py-2 transition-colors"
                style={{
                  background: viewMode === v.id ? 'var(--color-surface-3)' : 'transparent',
                  color: viewMode === v.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                }} title={v.label}>
                {v.icon}
              </button>
            ))}
          </div>
        )}

        {/* Upload btn (verde con glow) */}
        <button onClick={() => activeCategory ? onUpload(activeCategory.uploadType, activeCategory.id) : onUpload('pdf', 'scheda_tecnica')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors"
          style={{
            fontFamily: F_DISPLAY, background: 'var(--color-primary)',
            boxShadow: '0 0 20px rgba(42,157,110,0.30)', borderRadius: 2,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light, #3db685)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}>
          <Plus size={13} strokeWidth={2.5} /> Carica
        </button>
      </div>

      {/* 3-col layout: sidebar | main | preview (sidebar+preview hidden < xl) */}
      <div className="flex">
        <SidebarTree
          currentFolder={currentFolder}
          currentQuickFilter={currentQuickFilter}
          onFolderSelect={goToFolder}
          onQuickFilterSelect={goToQuickFilter}
          onRoot={goToRoot}
          itemsByCategory={itemsByCategory}
          attachments={attachments}
          totalSize={totalSize}
          recentCount={recentCount}
          favoriteCount={favoriteFiles}
        />

        {/* Main */}
        <main className="flex-1 min-w-0 px-0 xl:px-5 py-1 max-h-[78vh] overflow-auto">
          {!currentFolder && !currentQuickFilter ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 text-xl font-semibold uppercase tracking-wide"
                  style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
                  <Folder size={20} style={{ color: GOLD }} />
                  Cartelle
                </h2>
                <span className="text-[11px] uppercase tracking-wider"
                  style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
                  {CATEGORIES.length} cartelle · {totalFiles} file
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {CATEGORIES.map(cat => (
                  <FolderCard key={cat.id}
                    category={cat}
                    items={itemsByCategory[cat.id] || []}
                    onClick={() => goToFolder(cat.id)}
                    onDropFile={onUploadFile}
                  />
                ))}
              </div>

              {/* Recenti & Preferiti */}
              {filteredByChips.length > 0 && (
                <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <h4 className="text-[11px] uppercase tracking-[0.18em]"
                      style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
                      ★ Documenti recenti & preferiti
                    </h4>
                    <div className="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
                    <button onClick={() => goToQuickFilter('recent')}
                      className="text-[10px] uppercase tracking-wider transition-colors"
                      style={{ fontFamily: F_MONO, color: 'var(--color-primary-light, #3db685)' }}>
                      Vedi tutti →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {[...filteredByChips]
                      .sort((a, b) => {
                        if (a.is_favorite && !b.is_favorite) return -1
                        if (!a.is_favorite && b.is_favorite) return 1
                        return (b.uploaded_at || '').localeCompare(a.uploaded_at || '')
                      })
                      .slice(0, 4)
                      .map((a, i) => {
                        const cat = CATEGORY_BY_ID[a.category] || CATEGORIES[0]
                        return (
                          <button key={`${a.url}-${i}`}
                            onClick={() => { goToFolder(a.category || 'foto'); setSelectedAttachment(a) }}
                            className="flex items-center gap-2.5 p-2.5 border transition-all text-left"
                            style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', borderRadius: 2 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-surface-1)'}>
                            <div className="w-9 h-11 grid place-items-center text-[8px] font-bold text-white relative shrink-0"
                              style={{ background: a.type === 'image' ? '#5b8eff' : '#e03c31', fontFamily: F_MONO }}>
                              {a.type === 'image' ? 'IMG' : 'PDF'}
                              <span className="absolute top-0 right-0 w-1.5 h-1.5"
                                style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.name}</p>
                              <p className="text-[9px] mt-0.5 truncate"
                                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                                {a.uploaded_by_name || cat.label}
                                {a.uploaded_at && ` · ${timeAgo(a.uploaded_at)}`}
                              </p>
                            </div>
                            <Star size={13} fill={a.is_favorite ? GOLD : 'none'} stroke={a.is_favorite ? GOLD : 'var(--color-text-faint)'} />
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </>
          ) : currentQuickFilter ? (
            // Vista filtro rapido (preferiti / recenti)
            <>
              <div className="flex items-center gap-3 pb-3">
                <div className="w-10 h-10 grid place-items-center"
                  style={{ background: 'rgba(224,168,46,0.15)', borderRadius: 2 }}>
                  {currentQuickFilter === 'favorites'
                    ? <Star size={18} fill={GOLD} stroke={GOLD} />
                    : <Clock size={18} style={{ color: GOLD }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold uppercase tracking-wide"
                    style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
                    {currentQuickFilter === 'favorites' ? 'Preferiti' : 'Documenti recenti'}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {quickFilterItems.length} {quickFilterItems.length === 1 ? 'elemento' : 'elementi'}
                    {currentQuickFilter === 'recent' && ' · ultimi 30 file caricati'}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {quickFilterItems.length === 0 && (
                  <p className="text-xs text-center py-8 border border-dashed"
                    style={{ color: 'var(--color-text-faint)', borderColor: 'var(--color-border)' }}>
                    {currentQuickFilter === 'favorites'
                      ? 'Nessun preferito. Marca un file con ★ dalla preview o dalla lista.'
                      : 'Nessun file caricato di recente.'}
                  </p>
                )}
                {quickFilterItems.map((doc, i) => (
                  <FileRow key={`${doc.url}-${i}`}
                    attachment={doc}
                    attachmentIndex={attachments.indexOf(doc)}
                    onSelect={setSelectedAttachment}
                    selected={selectedAttachment === doc}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
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

      {/* Anteprima inline (solo < xl, perché ≥xl usa la colonna fissa) */}
      {selectedAttachment && (
        <div className="xl:hidden mt-4">
          <div className="p-3 border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
            <div className="flex items-center gap-3">
              {selectedAttachment.type === 'image' ? (
                <img src={selectedAttachment.url} alt="" className="w-14 h-14 object-cover" />
              ) : (
                <div className="w-12 h-14 grid place-items-center text-[10px] font-bold text-white"
                  style={{ background: '#e03c31', fontFamily: F_MONO }}>PDF</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{selectedAttachment.name}</p>
                <p className="text-[10px]" style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                  {selectedAttachment.uploaded_by_name || '—'}
                  {selectedAttachment.uploaded_at && ` · ${timeAgo(selectedAttachment.uploaded_at)}`}
                </p>
              </div>
              <a href={selectedAttachment.url} target="_blank" rel="noopener"
                className="px-3 py-2 text-xs font-bold uppercase text-white"
                style={{ background: 'var(--color-primary)', fontFamily: F_DISPLAY, borderRadius: 2 }}>
                Apri
              </a>
              <button onClick={() => setSelectedAttachment(null)} className="p-2" style={{ color: 'var(--color-text-faint)' }}>
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 mt-4 px-4 py-2 border-t"
        style={{
          background: 'var(--color-bg-subtle, var(--color-bg))',
          borderColor: 'var(--color-border)',
          fontFamily: F_MONO,
        }}>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-primary-light, #3db685)', boxShadow: '0 0 6px var(--color-primary-glow)' }} />
          <span>{reindexing ? 'Indicizzazione…' : 'Connesso · biblioteca AI online'}</span>
          <span className="hidden md:inline">· {CATEGORIES.length} cartelle · {totalFiles} file</span>
          {favoriteFiles > 0 && <span className="hidden md:inline" style={{ color: GOLD }}>· ★ {favoriteFiles} preferit{favoriteFiles === 1 ? 'o' : 'i'}</span>}
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-wider"
          style={{ color: 'var(--color-text-faint)' }}>
          <Calendar size={11} />
          <span>Trascina qui i file per caricarli</span>
        </div>
      </div>
    </div>
  )
}
