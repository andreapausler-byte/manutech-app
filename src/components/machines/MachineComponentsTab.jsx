/**
 * MachineComponentsTab — I pezzi della macchina, dal campo
 *
 * Lato admin il tab Componenti è una scrivania: elenco a sinistra, scheda
 * a destra. Qui no. Davanti alla macchina il pezzo serve per fare tre
 * cose — guardare com'era, dire che si è rotto, dire cosa si è fatto — e
 * ognuna deve stare a un tap dal nome del pezzo.
 *
 * Due livelli: elenco → scheda del pezzo. La scheda sostituisce l'elenco
 * dentro il tab invece di aprire una schermata nuova, così l'intestazione
 * della macchina resta visibile: chi guarda sa sempre di quale impianto
 * è quella pompa.
 *
 * I file caricati da qui NON escono dalla macchina (ADR-012): finiscono
 * in `machines.attachments` con l'etichetta del pezzo, quindi restano
 * nella galleria e nelle cartelle del macchinario.
 *
 * Misure guanti: righe elenco da 88px, azioni da 68px, testo lista 18px,
 * nessun bersaglio sotto 56px.
 */

import { useMemo, useState } from 'react'
import {
  Package, ChevronRight, ArrowLeft, Camera, FilePlus, Wrench,
  AlertTriangle, FileText, ExternalLink, Image as ImageIcon, Clock,
} from 'lucide-react'
import { timeAgo, formatDate, isReportOpen } from '../../lib/constants'
import { categoryLabel } from '../../lib/machineDocCategories'
import { galleryFileName } from '../../lib/mediaFile'
import { TabHeading, TabActionRow, TabEmptyFrame, CategorySheet } from './MachineTabParts'
import { padX, padRow } from './machineTabs'
import { EmptyState } from '../ui'
import MediaLightbox from '../media/MediaLightbox'
import { useHaptic } from '../../hooks/useHaptic'

const CYAN = '#22d3ee'

// ──────────────────────────────────────────────────────────────
// Elenco: una riga per pezzo
// ──────────────────────────────────────────────────────────────
function ComponentRow({ component, files, openReports, onOpen }) {
  const subtitle = [component.type, component.manufacturer, component.model]
    .filter(Boolean).join(' · ')

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-[3.5vw] border-t text-left active:bg-surface-2 transition-colors"
      style={{ ...padX, minHeight: 88, borderColor: 'var(--color-border-subtle)' }}
    >
      <span
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: CYAN + '22' }}
      >
        <Package size={24} style={{ color: CYAN }} />
      </span>

      <span className="flex-1 min-w-0" style={padRow}>
        <span className="block text-[18px] font-medium text-themed break-words">{component.name}</span>
        {subtitle && (
          <span className="block font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 4 }}>
            {subtitle}
          </span>
        )}
        <span className="flex items-center gap-[3vw]" style={{ marginTop: 6 }}>
          {openReports > 0 && (
            <span className="flex items-center gap-1 font-mono text-[11px]" style={{ color: '#ffaa2c' }}>
              <AlertTriangle size={12} /> {openReports} aperte
            </span>
          )}
          <span className="flex items-center gap-1 font-mono text-[11px]"
            style={{ color: files > 0 ? CYAN : 'var(--color-text-faint)' }}>
            <FileText size={12} /> {files} file
          </span>
        </span>
      </span>

      <ChevronRight size={22} className="shrink-0 text-faint" />
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Scheda del pezzo
// ──────────────────────────────────────────────────────────────
function ComponentDetail({
  component, machine, files, reports, logs, canLogWork, uploading,
  onBack, onCapture, onUploadDoc, onRegisterWork, onReport, onViewReport,
}) {
  const haptic = useHaptic()
  const [picking, setPicking] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const photos = useMemo(() => files.filter(f => f.type === 'image'), [files])
  const documents = useMemo(() => files.filter(f => f.type !== 'image'), [files])

  const specs = [
    ['Costruttore', component.manufacturer],
    ['Modello', component.model],
    ['Matricola', component.serial_number],
    ['Anno', component.year],
  ].filter(([, value]) => value)

  return (
    <div>
      {/* Torna all'elenco — riga piena, non una freccia da centrare col dito */}
      <button
        onClick={() => { haptic.light(); onBack() }}
        className="w-full flex items-center gap-[3vw] border-b active:bg-surface-2 transition-colors"
        style={{ ...padX, minHeight: 60, borderColor: 'var(--color-border-subtle)' }}
      >
        <ArrowLeft size={20} className="text-muted shrink-0" />
        <span className="font-mono text-[12px] uppercase tracking-wider text-muted">Tutti i pezzi</span>
      </button>

      {/* Intestazione del pezzo */}
      <div className="flex items-center gap-[3.5vw]" style={{ ...padX, paddingTop: '4vw', paddingBottom: '3vw' }}>
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: CYAN + '22' }}>
          <Package size={28} style={{ color: CYAN }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[22px] font-bold text-themed break-words leading-tight">{component.name}</span>
          {component.type && (
            <span className="block font-mono text-[11px] uppercase tracking-wider" style={{ marginTop: 4, color: CYAN }}>
              {component.type}
            </span>
          )}
        </span>
      </div>

      {/* Azioni: quello per cui si apre la scheda di un pezzo */}
      <TabActionRow
        icon={Camera}
        label={uploading ? 'Carico…' : 'Scatta foto'}
        onClick={() => { if (!uploading) onCapture(component) }}
      />
      <TabActionRow
        icon={FilePlus}
        label="Carica documento"
        onClick={() => { haptic.light(); setPicking(true) }}
      />
      {canLogWork && (
        <TabActionRow
          icon={Wrench}
          label="Registra intervento"
          tone="#3ddc84"
          onClick={() => { haptic.light(); onRegisterWork(component) }}
        />
      )}
      <TabActionRow
        icon={AlertTriangle}
        label="Segnala guasto sul pezzo"
        tone="#ffaa2c"
        onClick={() => { haptic.medium(); onReport(component) }}
      />

      {/* Scheda tecnica */}
      {specs.length > 0 && (
        <>
          <TabHeading>Scheda tecnica</TabHeading>
          <div className="border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {specs.map(([label, value]) => (
              <div key={label} className="flex items-center gap-[4vw] border-b"
                style={{ ...padX, ...padRow, borderColor: 'var(--color-border-subtle)' }}>
                <span className="font-mono text-[11px] uppercase tracking-wider text-faint" style={{ minWidth: '32vw' }}>
                  {label}
                </span>
                <span className="flex-1 text-[17px] text-themed break-words">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {component.notes && (
        <>
          <TabHeading>Note</TabHeading>
          <p className="text-[16px] text-secondary leading-relaxed" style={{ ...padX, paddingBottom: '4vw' }}>
            {component.notes}
          </p>
        </>
      )}

      {/* Foto del pezzo */}
      {photos.length > 0 && (
        <>
          <TabHeading>{photos.length} foto</TabHeading>
          <div className="grid grid-cols-3 gap-[2vw]" style={{ ...padX, paddingBottom: '4vw' }}>
            {photos.map((f, i) => (
              <button
                key={f.url || i}
                onClick={() => { haptic.light(); setLightbox(i) }}
                aria-label={`Apri ${f.name || 'foto'}`}
                className="aspect-square rounded-xl overflow-hidden press-scale"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <img src={f.thumb_url || f.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Documenti del pezzo */}
      {documents.length > 0 && (
        <>
          <TabHeading>{documents.length} documenti</TabHeading>
          {documents.map((f, i) => (
            <div key={f.url || i} className="flex items-center gap-[3.5vw] border-t"
              style={{ paddingLeft: '4vw', paddingRight: '2vw', minHeight: 88, borderColor: 'var(--color-border-subtle)' }}>
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#ef444422' }}>
                <FileText size={24} style={{ color: '#ef4444' }} />
              </span>
              <a href={f.url} target="_blank" rel="noopener" className="flex-1 min-w-0" style={padRow}>
                <span className="block text-[18px] font-medium text-themed break-words">{f.name}</span>
                <span className="block font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 6 }}>
                  {categoryLabel(f.category)}{f.uploaded_at ? ` · ${timeAgo(f.uploaded_at)}` : ''}
                </span>
              </a>
              <a href={f.url} target="_blank" rel="noopener" aria-label={`Apri ${f.name}`}
                className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center shrink-0 active:bg-surface-3"
                style={{ border: '1px solid var(--color-border)' }}>
                <ExternalLink size={22} style={{ color: 'var(--color-primary)' }} />
              </a>
            </div>
          ))}
        </>
      )}

      {files.length === 0 && (
        <TabEmptyFrame>
          <EmptyState
            icon={<ImageIcon size={44} style={{ margin: '0 auto' }} className="text-faint" />}
            title="Nessun file su questo pezzo"
            subtitle="Scatta la targhetta o carica il manuale: restano anche nella galleria e nelle cartelle del macchinario."
          />
        </TabEmptyFrame>
      )}

      {/* Segnalazioni sul pezzo */}
      {reports.length > 0 && (
        <>
          <TabHeading>{reports.length} segnalazioni su questo pezzo</TabHeading>
          {reports.map(r => (
            <button key={r.id} onClick={() => { haptic.light(); onViewReport?.(r) }}
              className="w-full flex items-center gap-[3.5vw] border-t text-left active:bg-surface-2 transition-colors"
              style={{ ...padX, minHeight: 76, borderColor: 'var(--color-border-subtle)' }}>
              <AlertTriangle size={20} className="shrink-0"
                style={{ color: isReportOpen(r) ? '#ffaa2c' : 'var(--color-text-faint)' }} />
              <span className="flex-1 min-w-0" style={padRow}>
                <span className="block text-[17px] text-themed break-words">{r.title}</span>
                <span className="block font-mono text-[11px] uppercase tracking-wider text-faint" style={{ marginTop: 4 }}>
                  {r.status}{r.created_at ? ` · ${timeAgo(r.created_at)}` : ''}
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-faint" />
            </button>
          ))}
        </>
      )}

      {/* Storico interventi sul pezzo */}
      {logs.length > 0 && (
        <>
          <TabHeading>{logs.length} interventi registrati</TabHeading>
          {logs.map(l => (
            <div key={l.id} className="flex items-start gap-[3.5vw] border-t"
              style={{ ...padX, ...padRow, borderColor: 'var(--color-border-subtle)' }}>
              <Clock size={20} className="shrink-0 text-faint" style={{ marginTop: 2 }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[17px] text-themed break-words">{l.title}</span>
                <span className="block font-mono text-[11px] uppercase tracking-wider text-faint" style={{ marginTop: 4 }}>
                  {l.performed_at ? formatDate(l.performed_at) : '—'}
                  {l.performed_by_name ? ` · ${l.performed_by_name}` : ''}
                </span>
                {l.description && (
                  <span className="block text-[15px] text-secondary leading-relaxed" style={{ marginTop: 6 }}>
                    {l.description}
                  </span>
                )}
              </span>
            </div>
          ))}
        </>
      )}

      <div style={{ height: '8vw' }} />

      {picking && (
        <CategorySheet
          onPick={(category) => { setPicking(false); onUploadDoc(category, component) }}
          onClose={() => setPicking(false)}
        />
      )}

      {lightbox !== null && photos.length > 0 && (
        <MediaLightbox
          images={photos.map((f, i) => ({
            url: f.url,
            // Il nome del file scaricato dice macchina, pezzo e data: in una
            // cartella Download `1712345678-IMG_0042.jpg` non si ritrova.
            name: galleryFileName({ ...f, source_label: f.component_name }, machine?.name, i),
          }))}
          initialIndex={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
export default function MachineComponentsTab({
  machine, components = [], attachments, reports = [], logs = [],
  canLogWork = false, uploading = false,
  onCapture, onUploadDoc, onRegisterWork, onReport, onViewReport,
}) {
  const [openId, setOpenId] = useState(null)

  const files = useMemo(() => attachments || machine?.attachments || [], [attachments, machine?.attachments])

  const filesByComponent = useMemo(() => {
    const map = {}
    for (const f of files) {
      if (!f.component_id) continue
      ;(map[f.component_id] = map[f.component_id] || []).push(f)
    }
    return map
  }, [files])

  const reportsByComponent = useMemo(() => {
    const map = {}
    for (const r of reports) {
      if (!r.component_id) continue
      ;(map[r.component_id] = map[r.component_id] || []).push(r)
    }
    return map
  }, [reports])

  const logsByComponent = useMemo(() => {
    const map = {}
    for (const l of logs) {
      if (!l.component_id) continue
      ;(map[l.component_id] = map[l.component_id] || []).push(l)
    }
    return map
  }, [logs])

  if (components.length === 0) {
    return (
      <TabEmptyFrame>
        <EmptyState
          icon={<Package size={44} style={{ margin: '0 auto' }} className="text-faint" />}
          title="Nessun pezzo registrato"
          subtitle="Pompe, motori, quadri: quando l'ufficio li registra, qui trovi la loro scheda, i loro documenti e le loro segnalazioni."
        />
      </TabEmptyFrame>
    )
  }

  const open = components.find(c => c.id === openId)

  if (open) {
    return (
      <ComponentDetail
        component={open}
        machine={machine}
        files={filesByComponent[open.id] || []}
        reports={reportsByComponent[open.id] || []}
        logs={logsByComponent[open.id] || []}
        canLogWork={canLogWork}
        uploading={uploading}
        onBack={() => setOpenId(null)}
        onCapture={onCapture}
        onUploadDoc={onUploadDoc}
        onRegisterWork={onRegisterWork}
        onReport={onReport}
        onViewReport={onViewReport}
      />
    )
  }

  return (
    <div>
      <TabHeading>{components.length} pezzi</TabHeading>
      {components.map(c => (
        <ComponentRow
          key={c.id}
          component={c}
          files={(filesByComponent[c.id] || []).length}
          openReports={(reportsByComponent[c.id] || []).filter(isReportOpen).length}
          onOpen={() => setOpenId(c.id)}
        />
      ))}
      <div className="border-b" style={{ borderColor: 'var(--color-border-subtle)' }} />
    </div>
  )
}
