import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { LogOut, ChevronLeft, ChevronRight, Shield, Sun, Moon, Settings, Layers } from 'lucide-react'
import { useAutoNotifications } from '../../hooks/useAutoNotifications'
import { getAmbientColors, avatarGradient } from '../../hooks/usePremiumUI'
import { usePWA } from '../../hooks/usePWA'
import SettingsPanel from '../ui/SettingsPanel'
import NotificationCenter from '../ui/NotificationCenter'
import StatusBar from './StatusBar'
import { Spinner } from '../ui'
import { NAV } from '../../lib/adminNav'

const AdminDashboard = lazy(() => import('../../pages/admin/AdminDashboard'))
const AdminReports = lazy(() => import('../../pages/admin/AdminReports'))
const AdminMachines = lazy(() => import('../../pages/admin/AdminMachines'))
const AdminMaintenance = lazy(() => import('../../pages/admin/AdminMaintenance'))
const AdminUsers = lazy(() => import('../../pages/admin/AdminUsers'))
const AdminTechnicians = lazy(() => import('../../pages/admin/AdminTechnicians'))
const AdminNotifSettings = lazy(() => import('../../pages/admin/AdminNotifSettings'))
const AdminMessaging = lazy(() => import('../../pages/admin/AdminMessaging'))
const AdminLeaderboard = lazy(() => import('../../pages/admin/AdminLeaderboard'))
const AdminRewards = lazy(() => import('../../pages/admin/AdminRewards'))
const AdminSpareParts = lazy(() => import('../../pages/admin/AdminSpareParts'))
const AdminAssistantPage = lazy(() => import('../../pages/admin/AdminAssistantPage'))

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Caricamento pagina">
      <Spinner />
    </div>
  )
}

export default function AdminLayout({ initialReportId }) {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [tab, setTab] = useState(initialReportId ? 'reports' : 'dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ── Deep link da email ──
  useEffect(() => {
    if (initialReportId) {
      window.history.replaceState({}, '', '/')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto Notifications (scadenze manutenzione) ──
  useAutoNotifications(user?.id, user?.role)

  // ── PWA + Web Push per admin ──
  const handleNotifClick = (data) => {
    if (data.report_id) setTab('reports')
  }
  usePWA(handleNotifClick, { userId: user?.id, orgId: user?.org_id || 'default' })

  const renderPage = () => {
    switch (tab) {
      case 'dashboard': return <AdminDashboard onNavigate={setTab} />
      case 'reports': return <AdminReports initialReportId={initialReportId} />
      case 'assistant': return <AdminAssistantPage onOpenReport={() => setTab('reports')} />
      case 'machines': return <AdminMachines />
      case 'maintenance': return <AdminMaintenance />
      case 'spare-parts': return <AdminSpareParts />
      case 'technicians': return <AdminTechnicians />
      case 'leaderboard': return <AdminLeaderboard />
      case 'rewards': return <AdminRewards />
      case 'users': return <AdminUsers />
      case 'messages': return <AdminMessaging />
      case 'notifications': return <AdminNotifSettings />
      default: return <AdminDashboard onNavigate={setTab} />
    }
  }

  const iconBtnStyle = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--color-surface-2)',
    color: 'var(--color-text-secondary)',
  }

  return (
    <div
      className="h-screen flex ambient-glow overflow-hidden"
      style={{
        background: 'var(--color-app-bg)',
        '--ambient-color': getAmbientColors(tab).color,
        '--ambient-color-2': getAmbientColors(tab).color2,
      }}
    >
      {/* ════════ SIDEBAR — Glass chassis, accent left-bar nav ════════ */}
      <aside
        aria-label="Navigazione principale"
        className={`${collapsed ? 'w-[76px]' : 'w-[264px]'} flex flex-col transition-all duration-300 shrink-0 relative overflow-hidden`}
        style={{
          background: 'var(--color-sidebar-bg)',
          borderRight: '1px solid var(--color-sidebar-border)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Ambient glow decorativo — depth senza pesare */}
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            top: -120,
            left: -80,
            width: 320,
            height: 320,
            background: 'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 70%)',
            opacity: 0.7,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{
            bottom: -100,
            right: -80,
            width: 280,
            height: 280,
            background: 'radial-gradient(circle, var(--color-accent-glow, var(--color-primary-glow)) 0%, transparent 70%)',
            opacity: 0.4,
          }}
        />

        {/* ── Brand: icon + ManuTech + version ── */}
        <div
          className={`relative flex items-center ${collapsed ? 'justify-center px-0' : 'px-5'} h-[88px] shrink-0`}
          style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
        >
          <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--color-primary-glow)',
                border: '1px solid var(--color-border-active)',
                boxShadow: '0 4px 16px var(--color-primary-glow)',
              }}
            >
              <Layers size={20} color="var(--color-primary)" strokeWidth={2.2} />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div
                  className="text-[15px] font-extrabold tracking-tight leading-tight"
                  style={{ color: 'var(--color-primary)' }}
                >
                  ManuTech
                </div>
                <div
                  className="text-[10px] font-semibold uppercase mt-0.5"
                  style={{
                    color: 'var(--color-text-muted)',
                    letterSpacing: '0.18em',
                  }}
                >
                  v{__APP_VERSION__} · Console
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Collapse toggle ── */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          className="absolute -right-3 top-[72px] w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 z-20 hover:scale-110"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-sidebar-border)',
            color: 'var(--color-text-muted)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* ── Nav: section label + items ── */}
        <nav className="relative flex-1 py-5 overflow-y-auto">
          {!collapsed && (
            <div
              className="px-6 mb-3 text-[10px] font-bold uppercase"
              style={{
                color: 'var(--color-text-muted)',
                letterSpacing: '0.2em',
              }}
            >
              Navigazione
            </div>
          )}

          <div className={`${collapsed ? 'px-3' : 'px-3'} space-y-1`}>
            {NAV.map(({ id, icon: Icon, label }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={`group relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 pl-4 pr-3'} py-2.5 rounded-lg transition-all duration-300 ease-in-out`}
                  style={{
                    background: active ? 'var(--color-primary-glow)' : 'transparent',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    opacity: active ? 1 : 0.78,
                    borderLeft: collapsed ? 'none' : `3px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                    paddingLeft: collapsed ? undefined : (active ? 13 : 16),
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'var(--color-surface-2)'
                      e.currentTarget.style.color = 'var(--color-text)'
                      e.currentTarget.style.opacity = 1
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-muted)'
                      e.currentTarget.style.opacity = 0.78
                    }
                  }}
                >
                  {/* Indicatore collapsed (dot accent quando attivo) */}
                  {collapsed && active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                      style={{
                        width: 3,
                        height: 22,
                        background: 'var(--color-primary)',
                        boxShadow: '0 0 8px var(--color-primary)',
                      }}
                    />
                  )}
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                  {!collapsed && (
                    <span className="text-[13.5px] font-semibold tracking-tight">
                      {label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* ── User card + logout ── */}
        <div
          className="relative mt-auto p-3 shrink-0"
          style={{ borderTop: '1px solid var(--color-sidebar-border)' }}
        >
          {!collapsed ? (
            <div
              className="flex items-center gap-3 p-2.5 mb-2 rounded-xl"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-sidebar-border)',
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-white text-[12px]"
                style={{
                  background: avatarGradient(user.name),
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
              >
                {(user.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] font-bold truncate leading-tight"
                  style={{ color: 'var(--color-text)' }}
                >
                  {user.name}
                </p>
                <p
                  className="text-[10px] font-semibold uppercase mt-0.5 flex items-center gap-1"
                  style={{
                    color: 'var(--color-primary)',
                    letterSpacing: '0.12em',
                  }}
                >
                  <Shield size={9} strokeWidth={2.5} />
                  Admin
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[12px]"
                style={{
                  background: avatarGradient(user.name),
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
                title={user.name}
              >
                {(user.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            aria-label="Disconnetti"
            title={collapsed ? 'Disconnetti' : undefined}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2 px-3'} py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200`}
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 92, 92, 0.10)'
              e.currentTarget.style.color = 'var(--color-danger)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            <LogOut size={16} />
            {!collapsed && 'Disconnetti'}
          </button>
        </div>
      </aside>

      {/* Content column: main scrollable + status bar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto scroll-smooth">
          {/* Top bar — minimale, solo azioni */}
          <header
            className="glass flex items-center justify-end gap-3 px-10 py-4 sticky top-0 z-30"
            style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
          >
            <button
              onClick={toggleMode}
              aria-label={isDark ? 'Passa a modalità chiara' : 'Passa a modalità scura'}
              className="press-scale flex items-center justify-center border-0 cursor-pointer"
              style={iconBtnStyle}
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* NotificationCenter (bell + badge + panel) */}
            <NotificationCenter
              userId={user.id}
              userRole={user.role}
              onOpenReport={() => setTab('reports')}
            />

            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Personalizza tema"
              className="press-scale flex items-center justify-center border-0 cursor-pointer"
              style={iconBtnStyle}
            >
              <Settings size={17} />
            </button>

            {/* User avatar — apre settings panel */}
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label={`Profilo ${user.name}`}
              title={user.name}
              className="press-scale flex items-center justify-center cursor-pointer font-semibold text-white text-[13px] shrink-0"
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: avatarGradient(user.name),
                border: '2px solid var(--color-sidebar-border)',
              }}
            >
              {(user.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </button>
          </header>

          {/* Messaging usa full-width; le altre pagine sono centrate con max-width */}
          {tab === 'messages' ? (
            <div className="p-8 animate-fade-in">
              <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>
            </div>
          ) : (
            <div className="px-10 pb-10 pt-8 max-w-7xl mx-auto animate-fade-in stagger-enter">
              <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>
            </div>
          )}
        </main>

        <StatusBar userName={user.name} userRole={user.role} />
      </div>

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user.id} userRole={user.role} />
    </div>
  )
}
