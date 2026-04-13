import { Info } from 'lucide-react'

/**
 * Banner mostrato quando l'assistente AI non è disponibile
 * (app in demo mode senza Supabase configurato).
 */
export default function DemoBanner({ compact = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: compact ? '12px 14px' : '16px 18px',
        borderRadius: 14,
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'var(--color-primary-glow)',
          border: '1px solid var(--color-border-active)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Info size={16} color="var(--color-primary)" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 2,
          }}
        >
          Assistente AI non disponibile in demo
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            lineHeight: 1.45,
          }}
        >
          L&apos;assistente attinge allo storico dei report risolti della tua organizzazione.
          Per abilitarlo configura Supabase e la chiave <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>ANTHROPIC_API_KEY</code> nei secrets delle Edge Functions.
        </div>
      </div>
    </div>
  )
}
