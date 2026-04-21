import React from 'react'
import { MT, fMono } from './tokens'

export function TopBar({ title, crumbs, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 28px', borderBottom: `1px solid ${MT.border}`,
      background: MT.bg, position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div>
        {crumbs && (
          <div style={{
            fontFamily: fMono, fontSize: 10, color: MT.textDim,
            letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase',
          }}>{crumbs}</div>
        )}
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.3, margin: 0, lineHeight: 1 }}>
          {title}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {right}
      </div>
    </div>
  )
}
