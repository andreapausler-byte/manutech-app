import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Camera, FileText, Plus, Trash2, ExternalLink, Save, X,
  BookOpen, Wrench, Image as ImageIcon, Building,
  ShieldCheck, Sparkles, Loader2, FileSignature,
  Search, ArrowLeft, Folder, Upload, MessageCircle,
} from 'lucide-react'
import { db } from '../../../lib/supabase'
import { timeAgo, formatDate } from '../../../lib/constants'

// Categorie note (id = valore stringa salvato in attachment.category).
// Le sezioni di "istruzioni" hanno anche un campo testuale modificabile
// sulla macchina (usage_instructions / maintenance_instructions).
const CATEGORIES = [
  { id: 'foto', label: 'Galleria Foto', desc: 'Foto della macchina, targhette, dettagli installazione',
    icon: ImageIcon, color: '#5b8eff', uploadType: 'image' },
  { id: 'scheda_tecnica', label: 'Schede Tecniche', desc: 'Datasheet costruttore, dimensioni, schemi elettrici',
    icon: FileText, color: '#e0a82e', uploadType: 'pdf' },
  { id: 'manuale_uso', label: "Istruzioni d'Uso", desc: "Procedure di avvio, arresto, funzionamento ordinario",
    icon: BookOpen, color: '#22c55e', uploadType: 'pdf', instructionsField: 'usage_instructions',
    instructionsPlaceholder: "Aggiungi istruzioni d'uso..." },
  { id: 'manuale_manutenzione', label: 'Istruzioni di Manutenzione', desc: 'Procedure preventive, lubrificazione, sanificazione',
    icon: Wrench, color: '#ff8a3d', uploadType: 'pdf', instructionsField: 'maintenance_instructions',
    instructionsPlaceholder: 'Aggiungi istruzioni di manutenzione...' },
  { id: 'intervento_esterno', label: 'Interventi Ditta Esterna', desc: 'Rapporti di intervento, bolle di lavoro, verbali',
    icon: Building, color: '#8b6ff5', uploadType: 'pdf' },
  { id: 'contratto_manutenzione', label: 'Contratti di Manutenzione', desc: 'Contratti attivi, accordi quadro, SLA fornitori',
    icon: FileSignature, color: '#e85d75', uploadType: 'pdf' },
  { id: 'certificato', label: 'Certificati e Conformità', desc: 'Dichiarazioni CE, ispezioni periodiche, tarature',
    icon: ShieldCheck, color: '#5dd3b8', uploadType: 'pdf' },
]

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

// Banner Biblioteca AI: mostra stato indicizzazione con stats reali.
// Stesso comportamento di KnowledgeStatsBadge precedente (auto-refresh
// quando reindexing finisce) ma con layout in stile "AI banner" del design.
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
    <div className="relative flex items-center gap-3 px-4 py-3 rounded-2xl overflow-hidden border"
      style={{
        background: 'linear-gradient(90deg, rgba(139,111,245,0.12), rgba(34,197,94,0.06))',
        borderColor: 'rgba(139,111,245,0.25)',
        borderLeft: '3px solid #8b6ff5',
      }}>
      <div className="w-10 h-10 rounded-xl shrink-0 grid place-items-center"
        style={{ background: 'linear-gradient(135deg, #8b6ff5, #5b8eff)' }}>
        {reindexing
          ? <Loader2 size={18} className="text-white animate-spin" />
          : <Sparkles size={18} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-themed">
          {reindexing
            ? 'Biblioteca AI — indicizzazione in corso'
            : chunks > 0
              ? `Biblioteca AI · ${chunks} estratti indicizzati`
              : 'Biblioteca AI — nessun documento indicizzato'}
        </p>
        <p className="text-[11px] text-faint mt-0.5">
          {reindexing
            ? "Estrazione testo, generazione embedding e salvataggio. Richiede alcuni secondi."
            : chunks > 0
              ? `L'assistente può rispondere a domande sui documenti${lastIndexed ? ` — aggiornata ${timeAgo(lastIndexed.toISOString())}` : ''}`
              : 'Carica manuali o contratti: verranno indicizzati automaticamente'}
        </p>
      </div>
      {!reindexing && totalFiles > 0 && (
        <div className="hidden md:flex gap-4 pr-1 text-[10px] uppercase tracking-wider text-faint font-mono">
          <div className="text-center">
            <div className="text-base font-bold" style={{ color: '#8b6ff5', fontFamily: 'inherit' }}>{indexedFiles}</div>
            <div>indicizzati</div>
          </div>
          <div className="text-center">
            <div className="text-base font-bold text-themed">{totalFiles}</div>
            <div>file totali</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Folder card stile Windows: tab gialla in alto, icona-cartella colorata,
// badge count, mini-preview dei file dentro, descrizione, footer meta.
function FolderCard({ category, items, onClick }) {
  const Icon = category.icon
  const empty = items.length === 0
  const [hover, setHover] = useState(false)
  const indexed = items.filter(a => a.type === 'pdf').length
  const lastUploaded = items.reduce((latest, a) => {
    if (!a.uploaded_at) return latest
    if (!latest) return a.uploaded_at
    return a.uploaded_at > latest ? a.uploaded_at : latest
  }, null)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative text-left bg-surface-1 hover:bg-surface-2 border border-token hover:border-violet-500/30 rounded-2xl p-4 flex flex-col gap-3 min-h-[180px] transition-all hover:-translate-y-0.5 hover:shadow-xl"
    >
      {/* tab "linguetta" della cartella, solo se ha contenuti */}
      {!empty && (
        <span
          className="absolute top-0 left-5 w-12 h-1.5 rounded-b"
          style={{ background: category.color }}
        />
      )}

      {/* AI tag se ci sono PDF (indicizzabili) */}
      {indexed > 0 && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 font-mono uppercase tracking-wider">
          <Sparkles size={9} /> AI
        </span>
      )}

      {/* Icona cartella + badge count */}
      <div className="relative w-16 h-12 shrink-0">
        <div
          className="absolute inset-x-0 top-1.5 bottom-0 rounded-sm"
          style={{
            background: empty ? '#3d3017' : category.color,
            opacity: empty ? 0.4 : 0.7,
            clipPath: 'polygon(0 0, 38% 0, 44% 14%, 100% 14%, 100% 100%, 0 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 top-3 bottom-0 rounded-sm shadow-inner"
          style={{
            background: empty ? '#5a4520' : category.color,
            opacity: empty ? 0.55 : 1,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        />
        <span
          className="absolute -bottom-1.5 -right-2 z-10 min-w-[24px] text-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold shadow-md"
          style={{
            background: empty ? 'rgba(255,255,255,0.06)' : 'var(--color-success, #22c55e)',
            color: empty ? 'var(--color-text-faint)' : '#062a16',
            boxShadow: empty ? 'none' : '0 0 12px rgba(34,197,94,0.4)',
          }}
        >{items.length}</span>
        <Icon
          size={16}
          className="absolute top-3.5 left-3 z-[1]"
          style={{ color: empty ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.55)' }}
        />
      </div>

      {/* Titolo + descrizione */}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-themed leading-tight">{category.label}</h3>
        <p className="text-xs text-faint leading-snug line-clamp-2">{category.desc}</p>
      </div>

      {/* Mini preview stack */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {items.slice(0, 3).map((a, i) => (
          <span
            key={i}
            className="w-8 h-10 rounded-sm bg-surface-3 border border-token grid place-items-center text-[8px] font-mono"
            style={{
              borderTopWidth: '3px',
              borderTopColor: a.type === 'image' ? '#5b8eff' : '#e03c31',
              color: a.type === 'image' ? '#5b8eff' : '#e03c31',
              background: a.type === 'image' ? 'linear-gradient(135deg, #2a3d2f, #1c2a21)' : undefined,
            }}
          >{a.type === 'image' ? 'IMG' : 'PDF'}</span>
        ))}
        {items.length > 3 && (
          <span className="w-8 h-10 rounded-sm bg-surface-3 border border-token grid place-items-center text-[9px] font-mono text-faint">
            +{items.length - 3}
          </span>
        )}
        {empty && (
          <span className="text-[10px] text-faint italic">Nessun file</span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2.5 border-t border-dashed border-token/60 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-faint">
        {lastUploaded
          ? <span>Agg. {timeAgo(lastUploaded)}</span>
          : <span>Vuota</span>}
        {hover && !empty && <span style={{ color: category.color }}>Apri →</span>}
      </div>
    </button>
  )
}

// Editor istruzioni testuali (per le 2 cartelle di istruzioni).
// Identico al precedente per coerenza UX.
function InstructionEditor({ value, onSave, placeholder, accentColor }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')

  const handleSave = () => {
    onSave(text.trim() || null)
    setEditing(false)
  }

  if (!editing) {
    return value ? (
      <div className="group relative bg-surface-1 border border-token rounded-xl p-4">
        <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{value}</p>
        <button onClick={() => { setText(value); setEditing(true) }}
          className="absolute top-2 right-2 p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all">
          <Save size={13} />
        </button>
      </div>
    ) : (
      <button onClick={() => setEditing(true)}
        className="w-full text-left p-4 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:bg-surface-1 transition-all"
        style={{ '--hover-color': accentColor }}
      >
        + {placeholder}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder={placeholder} rows={5}
        className="w-full input-field rounded-xl px-3 py-2.5 text-sm resize-none" autoFocus />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-faint hover:text-white transition-all">
          <X size={12} /> Annulla
        </button>
        <button onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all">
          <Save size={12} /> Salva
        </button>
      </div>
    </div>
  )
}

// Riga singola di file dentro a una cartella aperta. Mostra thumbnail
// (immagine vera o placeholder PDF), nome, uploader/data, azioni.
function FileRow({ attachment, index, onRemove, onSelect, selected }) {
  const isImage = attachment.type === 'image'
  return (
    <div
      onClick={() => onSelect?.(attachment)}
      className={`flex items-center gap-3 p-3 rounded-xl group transition-all cursor-pointer border ${
        selected ? 'bg-surface-2 border-violet-500/40' : 'bg-surface-1 border-transparent hover:bg-surface-2'
      }`}
    >
      {isImage ? (
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-token">
          <img src={attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-10 h-12 rounded-sm shrink-0 grid place-items-center text-[9px] font-mono font-bold text-white relative"
          style={{ background: '#e03c31' }}>
          PDF
          <span className="absolute top-0 right-0 w-2 h-2"
            style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-themed truncate">{attachment.name}</p>
          {!isImage && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 shrink-0 font-mono uppercase tracking-wider">
              <Sparkles size={9} /> AI
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-faint mt-0.5">
          {attachment.uploaded_by_name || '—'}
          {attachment.uploaded_at && ` · ${timeAgo(attachment.uploaded_at)}`}
          {!attachment.uploaded_at && !attachment.uploaded_by_name && 'Origine sconosciuta'}
        </p>
      </div>

      <a href={attachment.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
        className="p-2 rounded-lg hover:bg-white/10 text-faint hover:text-themed transition-all shrink-0" title="Apri">
        <ExternalLink size={14} />
      </a>
      <button onClick={e => { e.stopPropagation(); onRemove(index) }}
        className="p-2 rounded-lg hover:bg-red-500/15 text-faint hover:text-red-400 transition-all shrink-0 opacity-0 group-hover:opacity-100" title="Rimuovi">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// Vista dentro a una cartella: lista file + (se applicabile) editor istruzioni.
function FolderView({ category, items, attachmentsAll, onUpload, onRemove, sel, onSaveField, onSelect, selectedAttachment }) {
  const Icon = category.icon
  const indexOf = (a) => attachmentsAll.indexOf(a)
  const isPhotoFolder = category.id === 'foto'

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header cartella */}
      <div className="flex items-center gap-3 pb-2">
        <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
          style={{ background: category.color + '20' }}>
          <Icon size={18} style={{ color: category.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-themed">{category.label}</p>
          <p className="text-[11px] text-faint">{items.length} {items.length === 1 ? 'elemento' : 'elementi'} · {category.desc}</p>
        </div>
      </div>

      {/* Editor istruzioni testuali (solo per le 2 cartelle di istruzioni) */}
      {category.instructionsField && (
        <InstructionEditor
          value={sel[category.instructionsField]}
          onSave={(val) => onSaveField(category.instructionsField, val)}
          placeholder={category.instructionsPlaceholder}
          accentColor={category.color}
        />
      )}

      {/* Galleria foto: griglia visiva. Altrimenti: lista */}
      {isPhotoFolder ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sel.photo_url && (
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-token relative group">
              <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-2 left-2 text-[9px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-md">Principale</span>
              <a href={sel.photo_url} target="_blank" rel="noopener"
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center transition-all">
                <ExternalLink size={20} className="text-white" />
              </a>
            </div>
          )}
          {items.map((photo, i) => (
            <div key={i} className="aspect-[4/3] rounded-xl overflow-hidden border border-token relative group">
              <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                <a href={photo.url} target="_blank" rel="noopener"
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                  <ExternalLink size={14} />
                </a>
                <button onClick={() => onRemove(indexOf(photo))}
                  className="p-2 rounded-full bg-red-500/40 hover:bg-red-500/60 text-white">
                  <Trash2 size={14} />
                </button>
              </div>
              {photo.uploaded_by_name && (
                <span className="absolute bottom-0 inset-x-0 px-2 py-1 text-[9px] font-mono text-white bg-gradient-to-t from-black/80 to-transparent">
                  {photo.uploaded_by_name}{photo.uploaded_at && ` · ${timeAgo(photo.uploaded_at)}`}
                </span>
              )}
            </div>
          ))}
          <button
            onClick={() => onUpload(category.uploadType, category.id)}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-token/40 flex flex-col items-center justify-center text-faint hover:bg-surface-1 transition-all"
          >
            <Camera size={22} className="mb-1.5 opacity-60" />
            <span className="text-xs font-medium">Aggiungi foto</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-faint text-center py-6 border border-dashed border-token/40 rounded-xl">
              {category.desc}
            </p>
          )}
          {items.map((doc, i) => (
            <FileRow
              key={`${doc.url}-${i}`}
              attachment={doc}
              index={indexOf(doc)}
              onRemove={onRemove}
              onSelect={onSelect}
              selected={selectedAttachment === doc}
            />
          ))}
          <button onClick={() => onUpload(category.uploadType, category.id)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:bg-surface-1 transition-all">
            <Plus size={14} /> Carica nuovo file
          </button>
          <p className="text-[10px] text-faint text-center mt-1">
            oppure trascina un file qui sopra
          </p>
        </div>
      )}
    </div>
  )
}

// Anteprima inline del file selezionato (compare in basso al click).
function FilePreview({ attachment, onClose, onRemove, attachmentsAll }) {
  const isImage = attachment.type === 'image'
  const cat = CATEGORY_BY_ID[attachment.category]
  const idx = attachmentsAll.indexOf(attachment)

  return (
    <div className="bg-surface-2 border border-token rounded-2xl p-4 flex flex-col sm:flex-row gap-4 animate-fade-in">
      {isImage ? (
        <img src={attachment.url} alt="" className="w-full sm:w-40 h-40 object-cover rounded-xl border border-token shrink-0" />
      ) : (
        <div className="w-full sm:w-40 h-40 rounded-xl border border-token shrink-0 grid place-items-center"
          style={{ background: 'linear-gradient(180deg, var(--color-surface-1, #1a2a20), var(--color-surface-0, #0e1812))' }}>
          <FileText size={48} className="text-red-400" />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div>
          <p className="text-sm font-bold text-themed break-words">{attachment.name}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {cat && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-token text-faint">
                {cat.label}
              </span>
            )}
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-token text-faint">
              {isImage ? 'Immagine' : 'PDF'}
            </span>
            {!isImage && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded text-violet-400 border border-violet-500/40 bg-violet-500/10">
                <Sparkles size={9} className="inline mr-1" /> AI · letto
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 py-2 border-y border-token text-xs">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-faint mb-0.5">Caricato da</p>
            <p className="text-themed">{attachment.uploaded_by_name || '—'}</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-faint mb-0.5">Quando</p>
            <p className="text-themed">{attachment.uploaded_at ? formatDate(attachment.uploaded_at) : '—'}</p>
          </div>
        </div>

        <div className="flex gap-2 mt-auto">
          <a href={attachment.url} target="_blank" rel="noopener"
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-violet-600 hover:bg-violet-700 text-white transition-all">
            <ExternalLink size={14} /> Apri
          </a>
          <a href={attachment.url} download={attachment.name}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-surface-3 hover:bg-surface-1 text-themed border border-token transition-all">
            <Upload size={14} className="rotate-180" /> Scarica
          </a>
          <button onClick={() => { if (confirm('Eliminare questo file?')) { onRemove(idx); onClose() } }}
            className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-red-500/20 text-faint hover:text-red-400 border border-token transition-all"
            title="Elimina">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose}
            className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-1 text-faint border border-token transition-all"
            title="Chiudi anteprima">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MachineDocumentationTab({ sel, onUpload, onUploadFile, onRemoveAttachment, onSaveField, reindexing = false }) {
  const attachments = useMemo(() => sel.attachments || [], [sel.attachments])

  // Stato vista: cartelle (null) o dentro una cartella (categoryId)
  const [currentFolder, setCurrentFolder] = useState(null)
  // Filtri (attivi solo nella vista cartelle)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'pdf' | 'image'
  // Drag & drop
  const [dragOver, setDragOver] = useState(false)
  const dragCounter = useRef(0)
  // Anteprima inline
  const [selectedAttachment, setSelectedAttachment] = useState(null)

  // Reset anteprima quando cambia cartella o macchina
  useEffect(() => { setSelectedAttachment(null) }, [currentFolder, sel?.id])

  // Raggruppa attachment per categoria, applicando i filtri (ricerca + tipo)
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return attachments.filter(a => {
      if (typeFilter === 'pdf' && a.type !== 'pdf') return false
      if (typeFilter === 'image' && a.type !== 'image') return false
      if (q && !(a.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [attachments, searchQuery, typeFilter])

  const itemsByCategory = useMemo(() => {
    const map = {}
    for (const cat of CATEGORIES) map[cat.id] = []
    for (const a of filtered) {
      // foto legacy senza category vanno nella galleria foto
      const id = a.category || (a.type === 'image' ? 'foto' : null)
      if (id && map[id]) map[id].push(a)
    }
    return map
  }, [filtered])

  const totalFiles = attachments.length
  const indexedFiles = attachments.filter(a => a.type === 'pdf').length

  // Drag & drop handlers (attivi solo dentro una cartella aperta)
  const handleDragEnter = (e) => {
    e.preventDefault()
    if (!currentFolder) return
    dragCounter.current++
    setDragOver(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    if (!currentFolder) return
    dragCounter.current--
    if (dragCounter.current <= 0) setDragOver(false)
  }
  const handleDragOver = (e) => { e.preventDefault() }
  const handleDrop = (e) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    if (!currentFolder || !onUploadFile) return
    const files = Array.from(e.dataTransfer.files || [])
    for (const f of files) onUploadFile(f, currentFolder)
  }

  const activeCategory = currentFolder ? CATEGORY_BY_ID[currentFolder] : null

  return (
    <div
      className="space-y-4 animate-fade-in relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag & drop overlay (full-area, attivo solo dentro una cartella) */}
      {dragOver && (
        <div className="absolute inset-0 z-50 rounded-2xl border-2 border-dashed pointer-events-none flex flex-col items-center justify-center gap-3 backdrop-blur-sm"
          style={{
            background: 'rgba(34,197,94,0.18)',
            borderColor: 'rgb(34,197,94)',
          }}>
          <Upload size={56} className="text-green-400" />
          <p className="text-2xl font-bold text-green-400 uppercase tracking-wider">Rilascia qui</p>
          <p className="text-sm text-themed">I file verranno indicizzati automaticamente dall'AI</p>
        </div>
      )}

      {/* AI banner in cima */}
      <AiBanner machineId={sel?.id} reindexing={reindexing} totalFiles={totalFiles} indexedFiles={indexedFiles} />

      {/* Toolbar: breadcrumb + ricerca + filtri tipo + carica */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          {currentFolder ? (
            <>
              <button
                onClick={() => setCurrentFolder(null)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-faint hover:text-themed hover:bg-surface-1 transition-all"
              >
                <ArrowLeft size={14} /> Documentazione
              </button>
              <span className="text-faint">›</span>
              <span className="text-themed">{activeCategory?.label}</span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-themed">
              <Folder size={14} className="text-amber-400" /> Documentazione
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Ricerca */}
        <div className="flex items-center gap-2 bg-surface-1 border border-token rounded-lg px-3 py-1.5 min-w-[200px] focus-within:border-violet-500/40 transition-all">
          <Search size={14} className="text-faint shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca documento..."
            className="bg-transparent border-none outline-none text-sm text-themed flex-1 min-w-0 placeholder:text-faint"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-faint hover:text-themed shrink-0">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filtri tipo */}
        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Tutti', count: attachments.length },
            { id: 'pdf', label: 'PDF', count: attachments.filter(a => a.type === 'pdf').length },
            { id: 'image', label: 'Foto', count: attachments.filter(a => a.type === 'image').length },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                typeFilter === f.id
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                  : 'bg-surface-1 border-token text-faint hover:text-themed'
              }`}
            >
              {f.label}
              <span className={`text-[9px] px-1 rounded ${
                typeFilter === f.id ? 'bg-violet-500/20' : 'bg-surface-3'
              }`}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Bottone Carica (solo dentro una cartella) */}
        {activeCategory && (
          <button
            onClick={() => onUpload(activeCategory.uploadType, activeCategory.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-violet-500/20"
          >
            <Plus size={14} /> Carica
          </button>
        )}
      </div>

      {/* Vista principale */}
      {!currentFolder ? (
        // ── Vista cartelle ──
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CATEGORIES.map(cat => (
              <FolderCard
                key={cat.id}
                category={cat}
                items={itemsByCategory[cat.id] || []}
                onClick={() => setCurrentFolder(cat.id)}
              />
            ))}
          </div>

          {/* Recenti — ordina i 4 più recenti per uploaded_at (fallback: ordine array) */}
          {filtered.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center gap-3 mb-3">
                <h4 className="text-[11px] font-mono uppercase tracking-widest text-faint">★ Documenti recenti</h4>
                <div className="flex-1 h-px bg-token" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {[...filtered]
                  .sort((a, b) => {
                    const ta = a.uploaded_at || ''
                    const tb = b.uploaded_at || ''
                    return tb.localeCompare(ta)
                  })
                  .slice(0, 4)
                  .map((a, i) => {
                    const cat = CATEGORY_BY_ID[a.category] || CATEGORIES[0]
                    return (
                      <button
                        key={`${a.url}-${i}`}
                        onClick={() => { setCurrentFolder(a.category || 'foto'); setSelectedAttachment(a) }}
                        className="flex items-center gap-2.5 p-2.5 bg-surface-1 hover:bg-surface-2 border border-token rounded-xl text-left transition-all"
                      >
                        <div className={`w-9 h-11 rounded-sm grid place-items-center text-[8px] font-mono font-bold shrink-0 text-white relative`}
                          style={{ background: a.type === 'image' ? '#5b8eff' : '#e03c31' }}>
                          {a.type === 'image' ? 'IMG' : 'PDF'}
                          <span className="absolute top-0 right-0 w-1.5 h-1.5"
                            style={{ background: 'rgba(255,255,255,0.3)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-themed truncate font-medium">{a.name}</p>
                          <p className="text-[9px] font-mono text-faint mt-0.5 truncate">
                            {a.uploaded_by_name || cat.label}
                            {a.uploaded_at && ` · ${timeAgo(a.uploaded_at)}`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      ) : (
        // ── Vista cartella aperta ──
        <FolderView
          category={activeCategory}
          items={itemsByCategory[activeCategory.id] || []}
          attachmentsAll={attachments}
          onUpload={onUpload}
          onRemove={onRemoveAttachment}
          sel={sel}
          onSaveField={onSaveField}
          onSelect={setSelectedAttachment}
          selectedAttachment={selectedAttachment}
        />
      )}

      {/* Anteprima inline file selezionato */}
      {selectedAttachment && (
        <FilePreview
          attachment={selectedAttachment}
          attachmentsAll={attachments}
          onClose={() => setSelectedAttachment(null)}
          onRemove={onRemoveAttachment}
        />
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-surface-1 border border-token rounded-xl text-[10px] font-mono uppercase tracking-wider text-faint">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
          <span>Biblioteca AI online</span>
          <span className="hidden sm:inline">· {CATEGORIES.length} cartelle · {totalFiles} file</span>
        </div>
        <div className="hidden md:flex items-center gap-2 text-faint">
          <MessageCircle size={11} />
          <span>Chiedi all'AI nella chat</span>
        </div>
      </div>
    </div>
  )
}
