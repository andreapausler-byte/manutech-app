import { useState, useEffect, useRef } from 'react'
import {
  Camera, FileText, Plus, Trash2, ExternalLink, Save, X,
  BookOpen, Wrench, Image, ChevronDown, ChevronUp, Building,
  ShieldCheck, Sparkles, Loader2, FileSignature
} from 'lucide-react'
import { db } from '../../../lib/supabase'

function Section({ icon, title, color, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const SectionIcon = icon
  return (
    <div className="bg-surface-2 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-all">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '15' }}>
          <SectionIcon size={18} style={{ color }} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-themed">{title}</p>
          {count != null && <p className="text-[10px] text-faint">{count} {count === 1 ? 'elemento' : 'elementi'}</p>}
        </div>
        {open ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  )
}

// Badge che indica se un allegato è indicizzato dall'AI
function AiBadge({ type }) {
  // type è 'image' → non indicizzabile in Sprint A
  // type è 'pdf'   → indicizzato (assumiamo ready dopo ingestione)
  if (type === 'image') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-400 shrink-0"
        title="Le immagini non sono indicizzate dall'AI in questa versione"
      >
        <Image size={9} /> immagine
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 shrink-0"
      title="Questo documento è interrogabile dall'assistente AI"
    >
      <Sparkles size={9} /> AI
    </span>
  )
}

function AttachmentItem({ attachment, index, onRemove }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-surface-1 rounded-xl group hover:bg-surface-0/50 transition-all">
      {attachment.type === 'image'
        ? <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-token">
            <img src={attachment.url} alt="" className="w-full h-full object-cover" />
          </div>
        : <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-red-400" />
          </div>}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p className="text-sm text-themed truncate">{attachment.name}</p>
        <AiBadge type={attachment.type} />
      </div>
      <a href={attachment.url} target="_blank" rel="noopener"
        className="p-2 rounded-lg hover:bg-white/10 text-faint hover:text-violet-400 transition-all shrink-0" title="Apri">
        <ExternalLink size={14} />
      </a>
      {onRemove && (
        <button onClick={() => onRemove(index)}
          className="p-2 rounded-lg hover:bg-red-500/15 text-faint hover:text-red-400 transition-all shrink-0 opacity-0 group-hover:opacity-100" title="Rimuovi">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

// Banner "Biblioteca AI": mostra quanti chunks sono indicizzati.
// Auto-refresh quando `reindexing` passa da true a false (fine indicizzazione),
// con 2 retry a 2s di distanza per dare tempo al DB di materializzare i nuovi chunks.
function KnowledgeStatsBadge({ machineId, reindexing = false }) {
  const [stats, setStats] = useState(null)
  const prevReindexing = useRef(reindexing)

  const fetchStats = () => {
    if (!machineId) return Promise.resolve(null)
    return db.getKnowledgeStats(machineId).then(s => {
      setStats(s)
      return s
    })
  }

  // Fetch iniziale on-mount
  useEffect(() => {
    if (!machineId) return
    let cancelled = false
    db.getKnowledgeStats(machineId).then(s => { if (!cancelled) setStats(s) })
    return () => { cancelled = true }
  }, [machineId])

  // Auto-refresh a fine reindex: true → false
  useEffect(() => {
    const wasReindexing = prevReindexing.current
    prevReindexing.current = reindexing
    if (!wasReindexing || reindexing || !machineId) return
    // Reindex appena finito: aggiorna subito, poi un paio di retry leggeri
    // nel caso la RPC non abbia ancora visto i nuovi chunks (edge function async).
    let cancelled = false
    let timers = []
    fetchStats()
    timers.push(setTimeout(() => { if (!cancelled) fetchStats() }, 2000))
    timers.push(setTimeout(() => { if (!cancelled) fetchStats() }, 5000))
    return () => { cancelled = true; timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reindexing, machineId])

  const chunks = stats?.chunks || 0
  const lastIndexed = stats?.last_indexed_at ? new Date(stats.last_indexed_at) : null
  const relLabel = lastIndexed ? timeRelative(lastIndexed) : null

  // Stato prioritario: indicizzazione in corso
  if (reindexing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-500/15 to-emerald-500/15 border border-violet-500/30">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/25 shrink-0">
          <Loader2 size={16} className="text-violet-300 animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-themed">
            Biblioteca AI — indicizzazione in corso
          </p>
          <p className="text-[10px] text-faint">
            Estrazione testo, generazione embedding e salvataggio estratti. Richiede alcuni secondi.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-emerald-500/10 border border-violet-500/20">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-500/20 shrink-0">
        <Sparkles size={16} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-themed">
          Biblioteca AI — {chunks > 0 ? `${chunks} estratti indicizzati` : 'nessun documento indicizzato'}
        </p>
        <p className="text-[10px] text-faint">
          {chunks > 0
            ? `L'assistente può rispondere a domande su questa macchina${relLabel ? ` — aggiornata ${relLabel}` : ''}`
            : "Aggiungi manuali o istruzioni: verranno indicizzati automaticamente"}
        </p>
      </div>
    </div>
  )
}

function timeRelative(date) {
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins} min fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  const days = Math.floor(hrs / 24)
  return `${days}g fa`
}

function InstructionEditor({ value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')

  const handleSave = () => {
    onSave(text.trim() || null)
    setEditing(false)
  }

  if (!editing) {
    return value ? (
      <div className="group relative">
        <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{value}</p>
        <button onClick={() => { setText(value); setEditing(true) }}
          className="absolute top-0 right-0 p-1.5 rounded-lg hover:bg-white/10 text-faint hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all">
          <Save size={13} />
        </button>
      </div>
    ) : (
      <button onClick={() => setEditing(true)}
        className="w-full text-left p-3 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-violet-500/30 hover:text-violet-400 transition-all">
        {placeholder}
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

export default function MachineDocumentationTab({ sel, onUpload, onRemoveAttachment, onSaveField, reindexing = false }) {
  const attachments = sel.attachments || []

  // Categorize attachments (legacy ones without category go to 'altro')
  const photos = attachments.filter(a => a.category === 'foto' || (a.type === 'image' && !a.category))
  const technicalSheets = attachments.filter(a => a.category === 'scheda_tecnica')
  const usageManuals = attachments.filter(a => a.category === 'manuale_uso')
  const maintenanceManuals = attachments.filter(a => a.category === 'manuale_manutenzione')
  const externalReports = attachments.filter(a => a.category === 'intervento_esterno')
  const maintenanceContracts = attachments.filter(a => a.category === 'contratto_manutenzione')
  const certificates = attachments.filter(a => a.category === 'certificato')
  const otherDocs = attachments.filter(a =>
    !a.category || (
      a.category !== 'foto' &&
      a.category !== 'scheda_tecnica' &&
      a.category !== 'manuale_uso' &&
      a.category !== 'manuale_manutenzione' &&
      a.category !== 'intervento_esterno' &&
      a.category !== 'contratto_manutenzione' &&
      a.category !== 'certificato' &&
      a.type !== 'image'
    )
  )

  const getIndex = (attachment) => attachments.indexOf(attachment)

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ═══ BIBLIOTECA AI — Badge stato indicizzazione ═══ */}
      <KnowledgeStatsBadge machineId={sel?.id} reindexing={reindexing} />

      {/* ═══ GALLERIA FOTO ═══ */}
      <Section icon={Image} title="Galleria Foto" color="#7c6aff"
        count={(sel.photo_url ? 1 : 0) + photos.length}>
        <div className="grid grid-cols-4 gap-3">
          {/* Main photo */}
          {sel.photo_url && (
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-token group relative">
              <img src={sel.photo_url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                <a href={sel.photo_url} target="_blank" rel="noopener"
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                  <ExternalLink size={16} />
                </a>
              </div>
              <span className="absolute top-2 left-2 text-[9px] font-bold bg-violet-600 text-white px-2 py-0.5 rounded-md">Principale</span>
            </div>
          )}
          {/* Additional photos */}
          {photos.map((photo, i) => (
            <div key={i} className="aspect-[4/3] rounded-xl overflow-hidden border border-token group relative">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                <a href={photo.url} target="_blank" rel="noopener"
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white">
                  <ExternalLink size={14} />
                </a>
                <button onClick={() => onRemoveAttachment(getIndex(photo))}
                  className="p-2 rounded-full bg-red-500/40 hover:bg-red-500/60 text-white">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {/* Upload button */}
          <button onClick={() => onUpload('image', 'foto')}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-token/40 flex flex-col items-center justify-center text-faint hover:border-violet-500/40 hover:text-violet-400 hover:bg-violet-500/5 transition-all">
            <Camera size={22} className="mb-1.5 opacity-60" />
            <span className="text-xs font-medium">Aggiungi</span>
          </button>
        </div>
      </Section>

      {/* ═══ SCHEDE TECNICHE ═══ */}
      <Section icon={FileText} title="Schede Tecniche" color="#f59e0b" count={technicalSheets.length}>
        <div className="space-y-2">
          {technicalSheets.map((doc, i) => (
            <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
          ))}
          {technicalSheets.length === 0 && (
            <p className="text-xs text-faint text-center py-2">Nessuna scheda tecnica caricata</p>
          )}
          <button onClick={() => onUpload('pdf', 'scheda_tecnica')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5 transition-all">
            <Plus size={14} /> Carica scheda tecnica
          </button>
        </div>
      </Section>

      {/* ═══ ISTRUZIONI D'USO ═══ */}
      <Section icon={BookOpen} title="Istruzioni d'Uso" color="#22c55e"
        count={usageManuals.length + (sel.usage_instructions ? 1 : 0)} defaultOpen={!!sel.usage_instructions || usageManuals.length > 0}>
        <div className="space-y-3">
          <InstructionEditor
            value={sel.usage_instructions}
            onSave={(val) => onSaveField('usage_instructions', val)}
            placeholder="Aggiungi istruzioni d'uso..."
          />
          {usageManuals.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">Documenti allegati</p>
              {usageManuals.map((doc, i) => (
                <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
              ))}
            </div>
          )}
          <button onClick={() => onUpload('pdf', 'manuale_uso')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all">
            <Plus size={14} /> Allega manuale d'uso
          </button>
        </div>
      </Section>

      {/* ═══ ISTRUZIONI DI MANUTENZIONE ═══ */}
      <Section icon={Wrench} title="Istruzioni di Manutenzione" color="#ef4444"
        count={maintenanceManuals.length + (sel.maintenance_instructions ? 1 : 0)} defaultOpen={!!sel.maintenance_instructions || maintenanceManuals.length > 0}>
        <div className="space-y-3">
          <InstructionEditor
            value={sel.maintenance_instructions}
            onSave={(val) => onSaveField('maintenance_instructions', val)}
            placeholder="Aggiungi istruzioni di manutenzione..."
          />
          {maintenanceManuals.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] text-faint uppercase tracking-wider font-semibold">Documenti allegati</p>
              {maintenanceManuals.map((doc, i) => (
                <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
              ))}
            </div>
          )}
          <button onClick={() => onUpload('pdf', 'manuale_manutenzione')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5 transition-all">
            <Plus size={14} /> Allega manuale manutenzione
          </button>
        </div>
      </Section>

      {/* ═══ INTERVENTI DITTA ESTERNA ═══ */}
      <Section
        icon={Building}
        title="Interventi Ditta Esterna"
        color="#f59e0b"
        count={externalReports.length}
        defaultOpen={externalReports.length > 0}
      >
        <div className="space-y-2">
          {externalReports.map((doc, i) => (
            <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
          ))}
          {externalReports.length === 0 && (
            <p className="text-xs text-faint text-center py-2">
              Rapporti di ditte esterne, bolle di lavoro, verbali di intervento
            </p>
          )}
          <button onClick={() => onUpload('pdf', 'intervento_esterno')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5 transition-all">
            <Plus size={14} /> Carica rapporto ditta esterna
          </button>
          <p className="text-[10px] text-faint">
            Suggerimento: per legare un intervento esterno a data/ricambi, registralo anche come "Intervento" con toggle "Ditta esterna".
          </p>
        </div>
      </Section>

      {/* ═══ CONTRATTI DI MANUTENZIONE ═══ */}
      <Section
        icon={FileSignature}
        title="Contratti di Manutenzione"
        color="#0ea5e9"
        count={maintenanceContracts.length}
        defaultOpen={maintenanceContracts.length > 0}
      >
        <div className="space-y-2">
          {maintenanceContracts.map((doc, i) => (
            <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
          ))}
          {maintenanceContracts.length === 0 && (
            <p className="text-xs text-faint text-center py-2">
              Contratti di manutenzione, accordi quadro, offerte commerciali firmate
            </p>
          )}
          <button onClick={() => onUpload('pdf', 'contratto_manutenzione')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-sky-500/40 hover:text-sky-400 hover:bg-sky-500/5 transition-all">
            <Plus size={14} /> Carica contratto di manutenzione
          </button>
        </div>
      </Section>

      {/* ═══ CERTIFICATI E CONFORMITÀ ═══ */}
      <Section
        icon={ShieldCheck}
        title="Certificati e Conformità"
        color="#10b981"
        count={certificates.length}
        defaultOpen={certificates.length > 0}
      >
        <div className="space-y-2">
          {certificates.map((doc, i) => (
            <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
          ))}
          {certificates.length === 0 && (
            <p className="text-xs text-faint text-center py-2">
              Certificati CE, verifiche periodiche, tarature, ispezioni normative
            </p>
          )}
          <button onClick={() => onUpload('pdf', 'certificato')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-token/40 text-sm text-faint hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all">
            <Plus size={14} /> Carica certificato
          </button>
        </div>
      </Section>

      {/* ═══ ALTRI DOCUMENTI (legacy) ═══ */}
      {otherDocs.length > 0 && (
        <Section icon={FileText} title="Altri Documenti" color="#6b7280" count={otherDocs.length} defaultOpen={false}>
          <div className="space-y-2">
            {otherDocs.map((doc, i) => (
              <AttachmentItem key={i} attachment={doc} index={getIndex(doc)} onRemove={onRemoveAttachment} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
