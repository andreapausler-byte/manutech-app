import React from 'react'
import { MT } from './tokens'

export function PriorityDot({ p, size = 10 }) {
  const c = p === 'alta' ? MT.red : p === 'media' ? MT.amber : MT.greenLight
  return (
    <span style={{
      width: size, height: size, borderRadius: size,
      background: c, boxShadow: `0 0 ${size}px ${c}66`,
      display: 'inline-block', flexShrink: 0,
    }}/>
  )
}
