import React from 'react'
import { MT, fDisplay, fMono } from './tokens'
import { Avatar } from './Avatar'

const DEFAULT_NAV = [
  { route: 'command', label: 'Command Center', icon: 'M3 10 L12 3 L21 10 V20 H14 V14 H10 V20 H3 Z', hot: true },
  { route: 'tickets', label: 'Ticket Board',   icon: 'M4 5 h16 v14 h-16 z M8 5 v14 M16 5 v14' },
  { route: 'machines', label: 'Macchine',      icon: 'M4 8 h4 v4 h-4 z M10 4 h4 v4 h-4 z M16 8 h4 v4 h-4 z M4 14 h16 v6 h-16 z' },
  { route: 'team',     label: 'Team',          icon: 'M9 11 a4 4 0 100-8 4 4 0 000 8 z M17 11 a3 3 0 100-6 3 3 0 000 6 z M3 21 Q 9 16 15 21' },
  { route: 'reports',  label: 'Report & KPI',  icon: 'M4 20 V10 M10 20 V4 M16 20 V14 M22 20 V8' },
]

function NavButton({ item, active, onClick }) {
  const disabled = !!item.disabled
  const IconCmp = item.IconCmp
  return (
    <button
      onClick={() => !disabled && onClick && onClick(item.route)}
      disabled={disabled}
      title={disabled ? (item.disabledHint || 'Non disponibile') : item.label}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: active ? MT.greenDim : 'transparent',
        borderLeft: active ? `2px solid ${MT.greenLight}` : '2px solid transparent',
        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
        color: active ? MT.greenLight : (disabled ? MT.textDim : MT.textMuted),
        textDecoration: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: fDisplay, fontSize: 14, fontWeight: 500, letterSpacing: 0.2,
        textAlign: 'left',
      }}>
      {IconCmp ? (
        <IconCmp size={17} strokeWidth={active ? 2.1 : 1.7}/>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d={item.icon}/>
        </svg>
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.hot && (
        <span style={{
          width: 6, height: 6, borderRadius: 6, background: MT.red,
          boxShadow: `0 0 6px ${MT.red}`, animation: 'mt-pulse 1.6s infinite',
        }}/>
      )}
      {item.badge != null && (
        <span style={{
          fontFamily: fMono, fontSize: 10, color: MT.greenLight,
          background: MT.greenDim, padding: '2px 6px', letterSpacing: 0.4,
          border: `1px solid ${MT.border}`,
        }}>{item.badge}</span>
      )}
      {disabled && !item.badge && (
        <span style={{ fontFamily: fMono, fontSize: 10, color: MT.textDim, letterSpacing: 0.5 }}>—</span>
      )}
    </button>
  )
}

export function Shell({
  children,
  activeRoute = 'command',
  onNavigate,
  onExit,
  exitLabel = 'EXIT',
  exitTitle = 'Torna alla console admin',
  userName = 'Andrea Pausler',
  userSubtitle = 'ADMIN · BIRRA AMARCORD',
  navItems = DEFAULT_NAV,
  navSections,
  versionLabel = 'v6 · AMARCORD',
  topExtras,
  sidebarFooter,
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '244px 1fr',
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
              fontFamily: fMono, fontSize: 11, color: MT.textMuted,
              letterSpacing: 0.8, marginTop: 3,
            }}>{versionLabel}</div>
          </div>
        </div>

        {topExtras && (
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${MT.border}` }}>
            {topExtras}
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
          {navSections ? (
            navSections.map((section, idx) => (
              <div key={section.title || idx} style={{ marginBottom: 10 }}>
                {section.title && (
                  <div style={{
                    fontFamily: fMono, fontSize: 10, color: MT.textDim,
                    letterSpacing: 1.1, padding: '10px 12px 6px', textTransform: 'uppercase',
                  }}>{section.title}</div>
                )}
                {section.items.map(it => (
                  <NavButton
                    key={it.route}
                    item={it}
                    active={activeRoute === it.route}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            ))
          ) : (
            <>
              <div style={{
                fontFamily: fMono, fontSize: 11, color: MT.textMuted,
                letterSpacing: 1, padding: '6px 12px 10px',
              }}>NAVIGAZIONE</div>
              {navItems.map(it => (
                <NavButton
                  key={it.route}
                  item={it}
                  active={activeRoute === it.route}
                  onClick={onNavigate}
                />
              ))}
            </>
          )}
        </nav>

        {sidebarFooter && (
          <div style={{
            padding: '10px 12px', borderTop: `1px solid ${MT.border}`,
          }}>
            {sidebarFooter}
          </div>
        )}

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${MT.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Avatar name={userName} size={32}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </div>
            <div style={{ fontFamily: fMono, fontSize: 11, color: MT.textMuted, letterSpacing: 0.5 }}>
              {userSubtitle}
            </div>
          </div>
          {onExit && (
            <button onClick={onExit} title={exitTitle} style={{
              background: 'transparent', border: `1px solid ${MT.border}`, color: MT.textMuted,
              fontFamily: fMono, fontSize: 11, letterSpacing: 0.5, padding: '5px 8px', cursor: 'pointer',
            }}>
              {exitLabel}
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
