import React from 'react'
import { MT, fDisplay, fMono } from './tokens'

export function SearchField({
  placeholder = 'Cerca ticket, macchina, operatore…',
  value,
  onChange,
  showKbd = true,
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', background: MT.surface,
      border: `1px solid ${MT.border}`, width: 280,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MT.textMuted} strokeWidth="2">
        <circle cx="11" cy="11" r="7"/>
        <line x1="16" y1="16" x2="20" y2="20" strokeLinecap="round"/>
      </svg>
      <input
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          background: 'transparent', border: 'none', color: MT.text,
          outline: 'none', fontFamily: fDisplay, fontSize: 14, flex: 1, fontWeight: 400,
        }}
      />
      {showKbd && (
        <kbd style={{
          fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.5,
          border: `1px solid ${MT.border}`, padding: '2px 6px', background: MT.bg,
        }}>⌘K</kbd>
      )}
    </div>
  )
}
