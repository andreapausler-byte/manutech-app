import React from 'react'
import { MT, fMono } from './tokens'

const TONES = {
  neutral: { bg: MT.surface2, fg: MT.text, bd: MT.border },
  green:   { bg: MT.greenDim, fg: MT.greenLight, bd: MT.green },
  amber:   { bg: MT.amberDim, fg: MT.amber, bd: '#4a2d08' },
  red:     { bg: MT.redDim, fg: MT.red, bd: '#4a1613' },
  muted:   { bg: MT.surface, fg: MT.textMuted, bd: MT.border },
}

export function Pill({ children, tone = 'neutral', size = 'md', style = {} }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'sm' ? '3px 8px' : '5px 10px',
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontFamily: fMono, fontSize: size === 'sm' ? 9 : 10,
      fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
      ...style,
    }}>
      {children}
    </span>
  )
}
