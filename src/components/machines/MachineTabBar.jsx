/**
 * MachineTabBar — Le risorse della macchina al primo livello
 *
 * Prima foto, documenti e interventi erano tre accordion in fondo alla
 * scheda, sotto otto segnalazioni: per arrivarci l'operatore doveva
 * scorrere tutta la pagina. Qui diventano schede pari livello delle
 * segnalazioni, sempre visibili sotto l'intestazione.
 *
 * Misure per l'uso con i guanti: schede da 80px, contatore a pastiglia
 * piena leggibile da lontano, stato premuto pieno — con i guanti il
 * feedback tattile non arriva, deve arrivare quello visivo.
 */

import { MACHINE_TABS } from './machineTabs'

export default function MachineTabBar({ active, counts = {}, accents = {}, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Risorse del macchinario"
      className="grid grid-cols-5 gap-px border-b"
      style={{ background: 'var(--color-border-subtle)', borderColor: 'var(--color-border)' }}
    >
      {MACHINE_TABS.map(tab => {
        const isActive = active === tab.id
        const count = counts[tab.id]
        const accent = accents[tab.id] || null

        return (
          <button
            key={tab.id}
            role="tab"
            id={`machine-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`machine-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className="relative h-[80px] flex flex-col items-center justify-center gap-1.5 transition-colors active:bg-surface-3"
            style={{ background: isActive ? 'var(--color-surface-2)' : 'var(--color-surface-1)' }}
          >
            <tab.icon
              size={26}
              strokeWidth={1.8}
              style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            />
            <span
              className="font-mono text-[9.5px] uppercase tracking-wider"
              style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            >
              {tab.label}
            </span>

            {count !== null && count !== undefined && (
              <span
                className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-md font-mono text-[10px] font-medium flex items-center justify-center"
                style={
                  accent
                    ? { background: accent, color: '#0b0b12' }
                    : { background: 'var(--color-surface-3)', color: 'var(--color-text-secondary)' }
                }
              >
                {count}
              </span>
            )}

            {isActive && (
              <span
                className="absolute left-0 right-0 bottom-0 h-[3px]"
                style={{ background: 'var(--color-primary)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
