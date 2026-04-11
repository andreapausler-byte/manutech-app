import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { LogOut, ChevronLeft, ChevronRight, Shield, Sun, Moon, Settings, Search, Layers } from 'lucide-react'
import { useAutoNotifications } from '../../hooks/useAutoNotifications'
import { getAmbientColors } from '../../hooks/usePremiumUI'
import { usePWA } from '../../hooks/usePWA'
import SettingsPanel from '../ui/SettingsPanel'
import { NAV } from '../../lib/adminNav'
import AdminDashboard from '../../pages/admin/AdminDashboard'
import AdminReports from '../../pages/admin/AdminReports'
import AdminMachines from '../../pages/admin/AdminMachines'
import AdminMaintenance from '../../pages/admin/AdminMaintenance'
import AdminUsers from '../../pages/admin/AdminUsers'
import AdminTechnicians from '../../pages/admin/AdminTechnicians'
import AdminNotifSettings from '../../pages/admin/AdminNotifSettings'
import AdminMessaging from '../../pages/admin/AdminMessaging'
import AdminLeaderboard from '../../pages/admin/AdminLeaderboard'
import AdminRewards from '../../pages/admin/AdminRewards'
import AdminSpareParts from '../../pages/admin/AdminSpareParts'

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
      className="min-h-screen flex ambient-glow"
      style={{
        background: 'var(--color-app-bg)',
        '--ambient-color': getAmbientColors(tab).color,
        '--ambient-color-2': getAmbientColors(tab).color2,
      }}
    >
      {/* Sidebar — dark chassis, piatta */}
      <aside
        aria-label="Navigazione principale"
        className={`${collapsed ? 'w-[72px]' : 'w-[260px]'} flex flex-col transition-all duration-300 shrink-0 relative`}
        style={{
          background: 'var(--color-sidebar-bg)',
          borderRight: '1px solid var(--color-sidebar-border)',
        }}
      >
        {/* Logo area — solo icona gradient, minimale */}
        <div
          className={`flex items-center ${collapsed ? 'justify-center' : 'px-6'} h-[72px]`}
          style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
        >
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--gradient-primary)',
            }}
          >
            <Layers size={18} color="#fff" strokeWidth={2.2} />
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          className="absolute -right-3 top-[60px] w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-sidebar-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ id, icon: Icon, label }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-4'} py-2.5 rounded-lg transition-colors duration-150`}
                style={{
                  background: active ? 'var(--color-surface-2)' : 'transparent',
                  color: active ? '#ffffff' : 'var(--color-text-muted)',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = 'var(--color-text-muted)'
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && <span className="text-[14px] font-medium">{label}</span>}
              </button>
            )
          })}
        </nav>

        {/* User section — in fondo */}
        <div
          className="mt-auto p-3"
          style={{ borderTop: '1px solid var(--color-sidebar-border)' }}
        >
          {!collapsed ? (
            <div className="flex items-center gap-3 px-2 py-2 mb-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <Shield size={16} color="var(--color-primary)" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {user.name}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Amministratore
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <Shield size={16} color="var(--color-primary)" />
              </div>
            </div>
          )}
          <button
            onClick={logout}
            aria-label="Disconnetti"
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2 px-3'} py-2.5 rounded-lg text-sm transition-colors hover:text-red-400 hover:bg-red-500/10`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <LogOut size={16} />
            {!collapsed && 'Disconnetti'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        {/* Top bar — minimale, solo azioni */}
        <header
          className="glass flex items-center justify-end gap-3 px-10 py-4 sticky top-0 z-30"
          style={{ borderBottom: '1px solid var(--color-sidebar-border)' }}
        >
          <button
            aria-label="Cerca"
            className="press-scale flex items-center justify-center border-0 cursor-pointer"
            style={iconBtnStyle}
            onClick={() => { /* placeholder — apertura search futura */ }}
          >
            <Search size={17} />
          </button>
          <button
            onClick={toggleMode}
            aria-label={isDark ? 'Passa a modalità chiara' : 'Passa a modalità scura'}
            className="press-scale flex items-center justify-center border-0 cursor-pointer"
            style={iconBtnStyle}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Personalizza tema"
            className="press-scale flex items-center justify-center border-0 cursor-pointer"
            style={iconBtnStyle}
          >
            <Settings size={17} />
          </button>
        </header>

        {/* Messaging usa full-width e altezza viewport; le altre pagine sono centrate con max-width */}
        {tab === 'messages' ? (
          <div className="p-8 animate-fade-in">
            {renderPage()}
          </div>
        ) : (
          <div className="px-10 pb-10 pt-8 max-w-7xl mx-auto animate-fade-in stagger-enter">
            {renderPage()}
          </div>
        )}
      </main>

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user.id} userRole={user.role} />
    </div>
  )
}
