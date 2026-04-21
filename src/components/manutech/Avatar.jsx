import React from 'react'
import { MT, fMono } from './tokens'

const PALETTE = [MT.greenLight, MT.amber, MT.blue, '#e06fae', '#5dd3b8']

export function Avatar({ name, size = 24 }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const hash = initials.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const bg = PALETTE[hash % PALETTE.length]
  return (
    <span style={{
      width: size, height: size, borderRadius: size,
      background: bg, color: '#061a0e',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fMono, fontSize: size * 0.42, fontWeight: 700,
      letterSpacing: -0.3, flexShrink: 0,
    }}>
      {initials}
    </span>
  )
}
