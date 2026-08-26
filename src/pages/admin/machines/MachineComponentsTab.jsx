/**
 * MachineComponentsTab — I pezzi della macchina, con la loro documentazione
 *
 * Il problema che risolve: una linea non è un blocco unico. La pompa
 * dosatrice ha un suo manuale, una sua matricola, un suo fornitore. Finché
 * l'unico contenitore di documenti era il macchinario, l'unico modo di dare
 * una scheda alla pompa era registrarla come macchinario a sé — e
 * l'anagrafica si riempiva di doppioni che nessuno voleva.
 *
 * Qui il componente resta un componente e prende i suoi file. I file però
 * NON escono dalla macchina: vivono in `machines.attachments` come prima,
 * con in più l'etichetta `component_id` (migration 062). Conseguenza
 * voluta: una foto caricata sulla pompa compare nella Galleria Foto della
 * macchina, un PDF entra nella biblioteca AI della macchina, e chi cerca
 * "manuale" nella cartella Schede Tecniche lo trova. Il componente è una
 * lente sui documenti, non un archivio separato.
 *
 * Layout master-detail: a sinistra i pezzi, a destra quello selezionato.
 *
 * Spaziature inline, non Tailwind: `styles/index.css` apre con un reset
 * `* { margin: 0; padding: 0 }` fuori da `@layer`, e in Tailwind v4 il CSS
 * senza layer batte le utility — `p-*`, `m-*` e `space-y-*` qui non
 * produrrebbero nulla. Sopravvive `gap-*`, che infatti resta in classe.
 */

import { useMemo, useState } from 'react'
import {
  Package, Plus, Edit, Trash2, ExternalLink, FileText,
  Image as ImageIcon, Camera, FolderInput, X, Factory, Hash,
  Calendar, Cog, AlertTriangle, CornerUpLeft, Loader2,
} from 'lucide-react'
import { timeAgo } from '../../../lib/constants'
import { MACHINE_DOC_CATEGORIES, categoryLabel } from '../../../lib/machineDocCategories'

const F_DISPLAY = "'Barlow Condensed', system-ui, sans-serif"
const F_MONO = "'DM Mono', 'JetBrains Mono', ui-monospace, monospace"
const CYAN = '#22d3ee'

const ROW = { padding: '9px 10px', borderRadius: 2 }
const ICON_BTN = { padding: 6 }
const PILL = { padding: '6px 10px', borderRadius: 2 }

// ──────────────────────────────────────────────────────────────
// Riga elenco: il pezzo, con quanto gli sta attaccato
// ──────────────────────────────────────────────────────────────
function ComponentRow({ component, files, openReports, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(component.id)}
      className="w-full text-left flex items-center gap-2 border transition-all"
      style={{
        ...ROW,
        background: selected ? 'rgba(34,211,238,0.10)' : 'var(--color-surface-1)',
        borderColor: selected ? 'rgba(34,211,238,0.45)' : 'var(--color-border)',
      }}>
      <span className="w-7 h-7 grid place-items-center shrink-0"
        style={{ background: 'rgba(34,211,238,0.12)', borderRadius: 2 }}>
        <Package size={14} style={{ color: CYAN }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
          {component.name}
        </span>
        <span className="block text-[9px] uppercase tracking-wider truncate"
          style={{ marginTop: 2, fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          {[component.type, component.manufacturer, component.model].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>
      {/* Due numeri affiancati senza icona si leggono come uno solo: il
          triangolo dice guasti, il foglio dice file. */}
      {openReports > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[9px] shrink-0 font-bold"
          style={{ padding: '1px 4px', fontFamily: F_MONO, color: '#ffaa2c', background: 'rgba(255,170,44,0.12)' }}
          title={`${openReports} segnalazioni su questo componente`}>
          <AlertTriangle size={9} /> {openReports}
        </span>
      )}
      <span className="inline-flex items-center gap-0.5 text-[10px] shrink-0"
        style={{ fontFamily: F_MONO, color: files > 0 ? CYAN : 'var(--color-text-faint)' }}
        title={`${files} file archiviati su questo componente`}>
        <FileText size={9} /> {files}
      </span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Un file del componente
// ──────────────────────────────────────────────────────────────
function ComponentFileRow({ attachment, onDetach, onRemove }) {
  const isImage = attachment.type === 'image'
  return (
    <div className="flex items-center gap-2 border"
      style={{ padding: '7px 8px', borderRadius: 2, background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
      {isImage ? (
        <div className="w-[26px] h-8 overflow-hidden shrink-0 border" style={{ borderColor: 'var(--color-border)' }}>
          <img src={attachment.thumb_url || attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-6 h-[30px] shrink-0 grid place-items-center text-[8px] font-bold text-white"
          style={{ background: '#e03c31', fontFamily: F_MONO }}>PDF</div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-[11px] truncate" style={{ color: 'var(--color-text)' }}>{attachment.name}</p>
        <p className="text-[9px] truncate" style={{ marginTop: 2, fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
          {categoryLabel(attachment.category)}
          {attachment.uploaded_at && ` · ${timeAgo(attachment.uploaded_at)}`}
        </p>
      </div>

      <a href={attachment.url} target="_blank" rel="noopener" className="shrink-0"
        style={{ ...ICON_BTN, color: 'var(--color-text-faint)' }} title="Apri">
        <ExternalLink size={12} />
      </a>
      <button onClick={onDetach} className="shrink-0" style={{ ...ICON_BTN, color: 'var(--color-text-faint)' }}
        title="Riporta al macchinario (il file resta, cambia solo dove è archiviato)">
        <CornerUpLeft size={12} />
      </button>
      <button onClick={onRemove} className="shrink-0" style={{ ...ICON_BTN, color: 'var(--color-text-faint)' }}
        title="Elimina file">
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Archivia sotto il componente un file che la macchina ha già
//
// Il caso normale in officina: il manuale della pompa sta nella cartella
// Schede Tecniche da mesi, e solo oggi la pompa diventa un componente.
// ──────────────────────────────────────────────────────────────
function AttachExisting({ candidates, onPick, onClose }) {
  return (
    <div className="border flex flex-col gap-1.5"
      style={{ padding: 8, borderRadius: 2, borderColor: 'rgba(34,211,238,0.35)', background: 'var(--color-surface-2)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
          File del macchinario non ancora archiviati
        </span>
        <button onClick={onClose} style={{ padding: 2, color: 'var(--color-text-faint)' }}><X size={12} /></button>
      </div>
      {candidates.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
          Nessun file libero: sono già tutti su un componente.
        </p>
      ) : (
        <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
          {candidates.map(({ attachment, index }) => (
            <button key={attachment.url || index} onClick={() => onPick(attachment)}
              className="w-full text-left flex items-center gap-2 border transition-all hover:border-cyan-400/50"
              style={{ padding: '7px 8px', borderRadius: 2, background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
              {attachment.type === 'image'
                ? <ImageIcon size={12} style={{ color: '#8b5cf6' }} className="shrink-0" />
                : <FileText size={12} style={{ color: '#e03c31' }} className="shrink-0" />}
              <span className="flex-1 min-w-0 text-[11px] truncate" style={{ color: 'var(--color-text)' }}>
                {attachment.name}
              </span>
              <span className="text-[9px] shrink-0 uppercase tracking-wider"
                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>
                {categoryLabel(attachment.category)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Scheda del componente selezionato
// ──────────────────────────────────────────────────────────────
function ComponentDetail({
  component, files, candidates, reports, uploading,
  onEdit, onDelete, onUpload, onAttach, onDetach, onRemoveFile, onOpenReport,
}) {
  const [pickingCategory, setPickingCategory] = useState(false)
  const [attaching, setAttaching] = useState(false)

  const specs = [
    ['Costruttore', component.manufacturer, Factory],
    ['Modello', component.model, Cog],
    ['Matricola', component.serial_number, Hash],
    ['Anno', component.year, Calendar],
  ].filter(([, value]) => value)

  return (
    <div className="flex flex-col gap-3">
      {/* Intestazione */}
      <div className="flex items-start gap-2.5 border-b"
        style={{ paddingBottom: 12, borderColor: 'var(--color-border)' }}>
        <span className="w-9 h-9 grid place-items-center shrink-0"
          style={{ background: 'rgba(34,211,238,0.12)', borderRadius: 2 }}>
          <Package size={18} style={{ color: CYAN }} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[17px] font-semibold uppercase tracking-wide leading-tight truncate"
            style={{ fontFamily: F_DISPLAY, color: 'var(--color-text)' }}>
            {component.name}
          </h3>
          {component.type && (
            <span className="block text-[9px] uppercase tracking-wider"
              style={{ marginTop: 2, fontFamily: F_MONO, color: CYAN }}>
              {component.type}
            </span>
          )}
        </div>
        <button onClick={() => onEdit(component)} style={{ ...ICON_BTN, color: 'var(--color-text-faint)' }} title="Modifica">
          <Edit size={14} />
        </button>
        <button onClick={() => onDelete(component)} style={{ ...ICON_BTN, color: 'var(--color-text-faint)' }} title="Elimina componente">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Scheda tecnica del pezzo */}
      {specs.length > 0 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-2">
          {specs.map(([label, value, Icon]) => (
            <div key={label} className="flex items-center gap-1.5 min-w-0">
              <Icon size={11} className="shrink-0" style={{ color: 'var(--color-text-faint)' }} />
              <span className="text-[10px] uppercase tracking-wider shrink-0"
                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>{label}</span>
              <span className="text-[12px] font-medium truncate ml-auto" style={{ color: 'var(--color-text)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {component.notes && (
        <p className="text-[11px] leading-relaxed border-l-2"
          style={{
            padding: '8px 10px', color: 'var(--color-text-muted)',
            borderColor: 'rgba(34,211,238,0.4)', background: 'var(--color-surface-1)',
          }}>
          {component.notes}
        </p>
      )}

      {/* Segnalazioni sul pezzo */}
      {reports.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-wider"
            style={{ marginBottom: 2, fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
            {reports.length} segnalazion{reports.length === 1 ? 'e' : 'i'} su questo componente
          </p>
          {reports.slice(0, 4).map(r => (
            <button key={r.id} onClick={() => onOpenReport?.(r)}
              className="w-full text-left flex items-center gap-2 border"
              style={{ padding: '7px 8px', borderRadius: 2, background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
              <AlertTriangle size={11} className="shrink-0" style={{ color: '#ffaa2c' }} />
              <span className="flex-1 min-w-0 text-[11px] truncate" style={{ color: 'var(--color-text)' }}>{r.title}</span>
              <span className="text-[9px] shrink-0 uppercase tracking-wider"
                style={{ fontFamily: F_MONO, color: 'var(--color-text-faint)' }}>{r.status}</span>
            </button>
          ))}
        </div>
      )}

      {/* Azioni file */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => onUpload(component, 'foto')} disabled={uploading}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all disabled:opacity-50"
          style={{ ...PILL, fontFamily: F_MONO, background: 'rgba(34,211,238,0.12)', color: CYAN }}>
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Foto
        </button>

        <div className="relative">
          <button onClick={() => setPickingCategory(v => !v)} disabled={uploading}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all disabled:opacity-50"
            style={{ ...PILL, fontFamily: F_MONO, background: 'rgba(224,168,46,0.12)', color: '#e0a82e' }}>
            <FileText size={12} /> Documento
          </button>
          {pickingCategory && (
            <div className="absolute left-0 top-full z-10 border min-w-[190px] flex flex-col"
              style={{ marginTop: 4, padding: '4px 0', background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', borderRadius: 2 }}>
              {MACHINE_DOC_CATEGORIES.filter(c => c.id !== 'foto').map(c => (
                <button key={c.id}
                  onClick={() => { setPickingCategory(false); onUpload(component, c.id) }}
                  className="w-full text-left text-[11px] hover:bg-white/5"
                  style={{ padding: '6px 10px', color: 'var(--color-text)' }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setAttaching(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all"
          style={{ ...PILL, fontFamily: F_MONO, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
          <FolderInput size={12} /> Archivia esistente
        </button>
      </div>

      {attaching && (
        <AttachExisting
          candidates={candidates}
          onPick={(a) => { setAttaching(false); onAttach(a, component) }}
          onClose={() => setAttaching(false)}
        />
      )}

      {/* File del componente */}
      <div className="flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-wider"
          style={{ marginBottom: 2, fontFamily: F_MONO, color: 'var(--color-text-muted)' }}>
          {files.length} file su questo componente
        </p>
        {files.length === 0 ? (
          <div className="border border-dashed text-center"
            style={{ padding: '20px 14px', borderColor: 'var(--color-border)' }}>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-faint)' }}>
              Nessun file. Carica il manuale del pezzo o scatta la targhetta:
              restano anche nella galleria e nelle cartelle del macchinario.
            </p>
          </div>
        ) : files.map(({ attachment, index }) => (
          <ComponentFileRow
            key={attachment.url || index}
            attachment={attachment}
            onDetach={() => onDetach(attachment)}
            onRemove={() => onRemoveFile(index, attachment)}
          />
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
export default function MachineComponentsTab({
  machine, components = [], reports = [], uploading = false,
  onOpenComponentForm, onDeleteComponent,
  onUploadComponentFile, onSetAttachmentComponent, onRemoveAttachment,
  onOpenReport,
}) {
  const [selectedId, setSelectedId] = useState(null)

  const attachments = useMemo(() => machine?.attachments || [], [machine?.attachments])

  // Gli allegati portano l'indice con sé: la rimozione lavora per
  // posizione nell'array della macchina, non per URL.
  const indexed = useMemo(
    () => attachments.map((attachment, index) => ({ attachment, index })),
    [attachments]
  )

  const filesByComponent = useMemo(() => {
    const map = {}
    for (const entry of indexed) {
      const id = entry.attachment.component_id
      if (!id) continue
      ;(map[id] = map[id] || []).push(entry)
    }
    return map
  }, [indexed])

  const unassigned = useMemo(() => indexed.filter(e => !e.attachment.component_id), [indexed])

  const reportsByComponent = useMemo(() => {
    const map = {}
    for (const r of reports) {
      if (!r.component_id) continue
      ;(map[r.component_id] = map[r.component_id] || []).push(r)
    }
    return map
  }, [reports])

  const selected = components.find(c => c.id === selectedId) || components[0] || null

  const newButton = (
    <button onClick={() => onOpenComponentForm?.()}
      className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-all shrink-0"
      style={{ padding: '8px 12px' }}>
      <Plus size={14} /> Nuovo Componente
    </button>
  )

  if (components.length === 0) {
    return (
      <div className="animate-fade-in flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted">0 componenti</p>
          {newButton}
        </div>
        <div className="text-center" style={{ padding: '56px 16px' }}>
          <Package size={48} className="mx-auto text-faint opacity-15" style={{ marginBottom: 12 }} />
          <p className="text-sm text-faint">Nessun componente registrato</p>
          <p className="text-xs text-faint max-w-md mx-auto leading-relaxed" style={{ marginTop: 6 }}>
            Registra qui pompe, motori, quadri: ognuno con la sua matricola e i suoi
            documenti, senza doverlo creare come macchinario a sé. I file restano
            anche nella galleria e nelle cartelle di questo macchinario.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">
          {components.length} componenti · {indexed.length - unassigned.length} file archiviati
        </p>
        {newButton}
      </div>

      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'minmax(200px, 260px) 1fr' }}>
        <div className="flex flex-col gap-1">
          {components.map(c => (
            <ComponentRow
              key={c.id}
              component={c}
              files={(filesByComponent[c.id] || []).length}
              openReports={(reportsByComponent[c.id] || []).length}
              selected={selected?.id === c.id}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <div className="border" style={{ padding: 14, borderRadius: 2, borderColor: 'var(--color-border)' }}>
          {selected && (
            <ComponentDetail
              component={selected}
              files={filesByComponent[selected.id] || []}
              candidates={unassigned}
              reports={reportsByComponent[selected.id] || []}
              uploading={uploading}
              onEdit={onOpenComponentForm}
              onDelete={(c) => {
                if (confirm(`Eliminare "${c.name}"?\n\nI file archiviati sotto questo componente restano sul macchinario.`)) {
                  onDeleteComponent?.(c.id)
                }
              }}
              onUpload={onUploadComponentFile}
              onAttach={(a, c) => onSetAttachmentComponent?.(a, c)}
              onDetach={(a) => onSetAttachmentComponent?.(a, null)}
              onRemoveFile={(index, a) => {
                if (confirm(`Eliminare "${a.name}"?`)) onRemoveAttachment?.(index)
              }}
              onOpenReport={onOpenReport}
            />
          )}
        </div>
      </div>
    </div>
  )
}
