import React from 'react'
import { MT } from './tokens'

export function RiskBar({ value, height = 6 }) {
  const c = value >= 70 ? MT.red : value >= 40 ? MT.amber : MT.greenLight
  return (
    <div style={{ width: '100%', height, background: MT.border, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        width: `${value}%`, height: '100%', background: c,
        boxShadow: `0 0 8px ${c}66`, transition: 'width 400ms',
      }}/>
    </div>
  )
}
