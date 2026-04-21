import React from 'react'
import { MT, fDisplay, fMono } from './tokens'
import { Avatar } from './Avatar'

const NAV = [
  { route: 'command', label: 'Command Center', icon: 'M3 10 L12 3 L21 10 V20 H14 V14 H10 V20 H3 Z', hot: true },
  { route: 'tickets', label: 'Ticket Board',   icon: 'M4 5 h16 v14 h-16 z M8 5 v14 M16 5 v14' },
  { route: 'machines', label: 'Macchine',      icon: 'M4 8 h4 v4 h-4 z M10 4 h4 v4 h-4 z M16 8 h4 v4 h-4 z M4 14 h16 v6 h-16 z' },
  { route: 'team',     label: 'Team',          icon: 'M9 11 a4 4 0 100-8 4 4 0 000 8 z M17 11 a3 3 0 100-6 3 3 0 000 6 z M3 21 Q 9 16 15 21' },
  { route: 'reports',  label: 'Report & KPI',  icon: 'M4 20 V10 M10 20 V4 M16 20 V14 M22 20 V8' },
]

export function Shell({
  children,
  activeRoute = 'command',
  onNavigate,
  onExit,
  userName = 'Andrea Pausler',
  userSubtitle = 'ADMIN · BIRRA AMARCORD',
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '240px 1fr',
      minHeight: '100%', background: MT.bg, color: MT.text, fontFamily: fDisplay,
    }}>
      <aside style={{
        background: MT.bgDeep, borderRight: `1px solid ${MT.border}`,
        display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, alignSelf: 'start', height: '100vh',
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 20px 22px', borderBottom: `1px solid ${MT.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, background: MT.green,
            border: `1px solid ${MT.greenLight}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: fDisplay, fontWeight: 700, fontSize: 16, color: '#fff',
            boxShadow: `0 0 12px ${MT.greenGlow}`,
          }}>M</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: 0.3, lineHeight: 1 }}>
              ManuTech
            </div>
            <div style={{
              fontFamily: fMono, fontSize: 9, color: MT.textDim,
              letterSpacing: 1, marginTop: 3,
            }}>v6 · AMARCORD</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
          <div style={{
            fontFamily: fMono, fontSize: 9, color: MT.textDim,
            letterSpacing: 1.5, padding: '6px 12px 10px',
          }}>NAVIGAZIONE</div>
          {NAV.map(it => {
            const active = activeRoute === it.route
            const disabled = it.route === 'machines' || it.route === 'team' || it.route === 'reports'
            return (
              <button
                key={it.route}
                onClick={() => !disabled && onNavigate && onNavigate(it.route)}
                disabled={disabled}
                title={disabled ? 'Disponibile in Fase 2' : it.label}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: active ? MT.greenDim : 'transparent',
                  borderLeft: active ? `2px solid ${MT.greenLight}` : '2px solid transparent',
                  borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                  color: active ? MT.greenLight : (disabled ? MT.textDim : MT.textMuted),
                  textDecoration: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                  fontFamily: fDisplay, fontSize: 14, fontWeight: 500, letterSpacing: 0.3,
                  textAlign: 'left',
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d={it.icon}/>
                </svg>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hot && (
                  <span style={{
                    width: 6, height: 6, borderRadius: 6, background: MT.red,
                    boxShadow: `0 0 6px ${MT.red}`, animation: 'mt-pulse 1.6s infinite',
                  }}/>
                )}
                {disabled && (
                  <span style={{ fontFamily: fMono, fontSize: 8, color: MT.textDim, letterSpacing: 0.5 }}>F2</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${MT.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Avatar name={userName} size={32}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </div>
            <div style={{ fontFamily: fMono, fontSize: 9, color: MT.textDim, letterSpacing: 0.5 }}>
              {userSubtitle}
            </div>
          </div>
          {onExit && (
            <button onClick={onExit} title="Torna alla console admin" style={{
              background: 'transparent', border: `1px solid ${MT.border}`, color: MT.textDim,
              fontFamily: fMono, fontSize: 9, letterSpacing: 0.5, padding: '4px 6px', cursor: 'pointer',
            }}>
              EXIT
            </button>
          )}
        </div>
      </aside>

      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}
