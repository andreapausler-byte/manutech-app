import React from 'react'
import { MT, fDisplay, fMono } from './tokens'

export function KpiCard({ label, value, unit, delta, tone = 'neutral', sub }) {
  const good = tone === 'good' || (tone === 'auto' && delta > 0)
  const bad = tone === 'bad' || (tone === 'auto' && delta < 0)
  const dColor = good ? MT.greenLight : bad ? MT.red : MT.textMuted
  const dSign = delta > 0 ? '+' : ''

  return (
    <div style={{
      background: MT.surface, border: `1px solid ${MT.border}`,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        fontFamily: fMono, fontSize: 10, color: MT.textMuted,
        letterSpacing: 1, textTransform: 'uppercase',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontFamily: fDisplay, fontSize: 34, fontWeight: 600,
          color: MT.text, letterSpacing: -0.5, lineHeight: 1,
        }}>{value}</span>
        {unit && <span style={{ fontFamily: fMono, fontSize: 12, color: MT.textMuted }}>{unit}</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: fMono, fontSize: 10, color: dColor, letterSpacing: 0.5 }}>
          {dSign}{delta} {delta > 0 ? '▲' : '▼'}
        </span>
        {sub && <span style={{ fontFamily: fMono, fontSize: 9, color: MT.textDim, letterSpacing: 0.5 }}>{sub}</span>}
      </div>
    </div>
  )
}
