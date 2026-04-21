import React from 'react'
import { MT, fDisplay, fMono } from './tokens'

export function BtnPrimary({ children, onClick, size = 'md', type = 'button' }) {
  return (
    <button type={type} onClick={onClick} style={{
      padding: size === 'sm' ? '6px 12px' : '9px 16px',
      background: MT.green, color: '#fff', border: 'none',
      boxShadow: `inset 0 0 0 1px ${MT.greenLight}`, cursor: 'pointer',
      fontFamily: fDisplay, fontSize: 14, fontWeight: 600,
      letterSpacing: 0.6, textTransform: 'uppercase',
    }}>
      {children}
    </button>
  )
}

export function BtnGhost({ children, onClick, size = 'md', type = 'button' }) {
  return (
    <button type={type} onClick={onClick} style={{
      padding: size === 'sm' ? '6px 12px' : '9px 16px',
      background: 'transparent', color: MT.textMuted,
      border: `1px solid ${MT.border}`, cursor: 'pointer',
      fontFamily: fMono, fontSize: 12, fontWeight: 600,
      letterSpacing: 0.6, textTransform: 'uppercase',
    }}>
      {children}
    </button>
  )
}
