/**
 * Primitivi della pagina Manutenzione (console): selettore a segmenti,
 * barra del ciclo, riquadro vuoto. Spigoli vivi come il resto della v6.
 */

import { MONO } from './planUi'

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} style={{
      display: 'flex', flexShrink: 0,
      border: '1px solid var(--color-border)', background: 'var(--color-surface-1)',
    }}>
      {options.map(([id, text], i) => {
        const on = value === id
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onChange(id)} style={{
            padding: '8px 14px', cursor: 'pointer', border: 'none',
            borderLeft: i ? '1px solid var(--color-border)' : 'none',
            background: on ? 'var(--color-green-bg)' : 'transparent',
            color: on ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 1,
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>{text}</button>
        )
      })}
    </div>
  )
}

export function CycleBar({ percent, color, height = 3, style }) {
  return (
    <div style={{ height, background: 'var(--color-border)', ...style }}>
      <div style={{ width: `${percent}%`, height: '100%', background: color }} />
    </div>
  )
}

export function EmptyBox({ text, hint }) {
  return (
    <div style={{
      background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
      padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-text-faint)' }}>
        {text}
      </div>
      {hint && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>{hint}</div>}
    </div>
  )
}
