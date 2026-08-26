/**
 * MachineDocsTab — Documenti e scheda tecnica
 *
 * Manuale, schemi, dichiarazione CE: quello che serve avere in mano
 * davanti alla macchina. In cima la scheda tecnica, che prima stava
 * spalmata nell'intestazione e non ci stava più.
 *
 * Le foto promosse in galleria vivono in `machines.attachments` come
 * categoria `foto`: qui sono escluse, il loro posto è il tab Foto.
 *
 * Misure guanti: righe da 88px, tasto apri 56×56 staccato dalla riga.
 */

import { useState } from 'react'
import { FileText, Image as ImageIcon, Film, ExternalLink, Plus } from 'lucide-react'
import { timeAgo } from '../../lib/constants'
import { categoryLabel } from '../../lib/machineDocCategories'
import { TabHeading, TabActionRow, TabEmptyFrame, CategorySheet } from './MachineTabParts'
import { padX, padRow } from './machineTabs'
import { EmptyState } from '../ui'
import { useHaptic } from '../../hooks/useHaptic'

const TYPE_META = {
  pdf: { icon: FileText, color: '#ef4444' },
  image: { icon: ImageIcon, color: '#8b5cf6' },
  video: { icon: Film, color: '#3ddc84' },
}

export default function MachineDocsTab({ machine, attachments, onUpload, uploading }) {
  const haptic = useHaptic()
  const [picking, setPicking] = useState(false)

  const documents = (attachments || machine.attachments || []).filter(a => a.category !== 'foto')

  const specs = [
    ['Reparto', machine.department],
    ['Costruttore', machine.manufacturer],
    ['Modello', machine.model],
    ['Matricola', machine.serial_number],
    ['Anno', machine.year],
  ].filter(([, value]) => value)

  return (
    <div>
      {documents.length === 0 ? (
        <>
          <TabEmptyFrame>
            <EmptyState
              icon={<FileText size={44} style={{ margin: '0 auto' }} className="text-faint" />}
              title="Nessun documento"
              subtitle="Manuale, schemi, dichiarazione CE: quello che serve avere in mano davanti alla macchina."
            />
          </TabEmptyFrame>
          {onUpload && (
            <TabActionRow
              icon={Plus}
              label={uploading ? 'Carico…' : 'Carica documento'}
              onClick={() => { haptic.light(); setPicking(true) }}
            />
          )}
        </>
      ) : (
        <>
          <TabHeading>
            {documents.length} file
          </TabHeading>
          {documents.map((a, i) => {
            const meta = TYPE_META[a.type] || TYPE_META.pdf
            const Icon = meta.icon
            return (
              <div
                key={a.url || i}
                className="flex items-center gap-[3.5vw] border-t"
                style={{ minHeight: 88, paddingLeft: '4vw', paddingRight: '2vw', borderColor: 'var(--color-border-subtle)' }}
              >
                <span
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: meta.color + '22' }}
                >
                  <Icon size={24} style={{ color: meta.color }} />
                </span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 min-w-0"
                  style={padRow}
                >
                  <p className="text-[18px] font-medium text-themed break-words">{a.name}</p>
                  {/* Il componente prima della categoria: davanti alla macchina
                      la domanda è "di che pezzo è questo manuale", non "in che
                      cartella sta". */}
                  {a.component_name && (
                    <p className="text-[13px] font-semibold truncate" style={{ marginTop: 4, color: '#22d3ee' }}>
                      {a.component_name}
                    </p>
                  )}
                  <p className="font-mono text-[11px] uppercase tracking-wider text-faint truncate" style={{ marginTop: 6 }}>
                    {(a.type || 'file').toUpperCase()}
                    {a.category && a.category !== a.type ? ` · ${categoryLabel(a.category)}` : ''}
                    {a.uploaded_at ? ` · ${timeAgo(a.uploaded_at)}` : ''}
                  </p>
                </a>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Apri ${a.name}`}
                  className="w-[56px] h-[56px] rounded-2xl flex items-center justify-center shrink-0 active:bg-surface-3 transition-colors"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  <ExternalLink size={22} style={{ color: 'var(--color-primary)' }} />
                </a>
              </div>
            )
          })}
          <div className="border-b" style={{ borderColor: 'var(--color-border-subtle)' }} />
          {onUpload && (
            <TabActionRow
              icon={Plus}
              label={uploading ? 'Carico…' : 'Carica documento'}
              onClick={() => { haptic.light(); setPicking(true) }}
            />
          )}
        </>
      )}

      {picking && (
        <CategorySheet
          onPick={(category) => { setPicking(false); onUpload(category) }}
          onClose={() => setPicking(false)}
        />
      )}

      {specs.length > 0 && (
        <>
          <TabHeading>Scheda tecnica</TabHeading>
          <div
            className="rounded-2xl overflow-hidden card-elevated divide-y"
            style={{ margin: '0 4vw', borderColor: 'var(--color-border-subtle)' }}
          >
            {specs.map(([label, value]) => (
              <div key={label} className="flex items-start gap-[4vw]" style={{ ...padX, ...padRow }}>
                <span className="font-mono text-[11px] uppercase tracking-wider text-faint w-[26vw] max-w-[110px] shrink-0">
                  {label}
                </span>
                <span className="flex-1 min-w-0 text-base font-medium text-themed break-words">{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {machine.description && (
        <p
          className="card-elevated rounded-2xl text-base text-secondary leading-relaxed"
          style={{ margin: '4vw', padding: '3.5vw 4vw' }}
        >
          {machine.description}
        </p>
      )}
    </div>
  )
}


// ── CategorySheet ────────────────────────────────────────
//
// In che cartella va il file lo sa solo chi lo carica. Righe da 68px:
// si sceglie con i guanti, senza mirare.
