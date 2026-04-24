import React, { useCallback, useMemo, useState, lazy, Suspense } from 'react'
import { LogOut, Sun, Moon, Settings, Terminal } from 'lucide-react'
import { Shell, MT, fMono } from '../../components/manutech'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { NAV as ADMIN_NAV } from '../../lib/adminNav'
import NotificationCenter from '../../components/ui/NotificationCenter'
import SettingsPanel from '../../components/ui/SettingsPanel'
import { Spinner } from '../../components/ui'
import { useV6Data } from '../../hooks/useV6Data'
import { V6NavContext } from './V6Nav'
import CommandCenter from './CommandCenter'
import TicketBoard from './TicketBoard'
import TicketDetail from './TicketDetail'

const AdminDashboard = lazy(() => import('../admin/AdminDashboard'))
const AdminReports = lazy(() => import('../admin/AdminReports'))
const AdminMachines = lazy(() => import('../admin/AdminMachines'))
const AdminMaintenance = lazy(() => import('../admin/AdminMaintenance'))
const AdminUsers = lazy(() => import('../admin/AdminUsers'))
const AdminTechnicians = lazy(() => import('../admin/AdminTechnicians'))
const AdminNotifSettings = lazy(() => import('../admin/AdminNotifSettings'))
const AdminMessaging = lazy(() => import('../admin/AdminMessaging'))
const AdminLeaderboard = lazy(() => import('../admin/AdminLeaderboard'))
const AdminRewards = lazy(() => import('../admin/AdminRewards'))
const AdminSpareParts = lazy(() => import('../admin/AdminSpareParts'))
const AdminAssistantPage = lazy(() => import('../admin/AdminAssistantPage'))

const V6_ROUTES = new Set(['command', 'tickets', 'ticket-detail'])

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Caricamento pagina">
      <Spinner />
    </div>
  )
}

// Sezioni sidebar: preview v6 in cima, console admin sotto.
function buildNavSections(adminNav) {
  const adminItems = adminNav
    .filter(n => n.id !== 'v6')
    .map(n => ({
      route: n.id,
      label: n.label,
      IconCmp: n.icon,
    }))

  return [
    {
      title: 'V6 · Preview',
      items: [
        { route: 'command', label: 'Command Center', IconCmp: Terminal, hot: true },
        { route: 'tickets', label: 'Ticket Board', IconCmp: Terminal },
      ],
    },
    {
      title: 'Console',
      items: adminItems,
    },
  ]
}

function V6TopBar({ title, crumbs }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 28px', borderBottom: `1px solid ${MT.border}`,
      background: MT.bg, position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div style={{ minWidth: 0 }}>
        {crumbs && (
          <div style={{
            fontFamily: fMono, fontSize: 12, color: MT.textMuted,
            letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase',
          }}>{crumbs}</div>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.2, margin: 0, lineHeight: 1.1, color: MT.text }}>
          {title}
        </h1>
      </div>
    </div>
  )
}

function AdminPageFrame({ title, crumbs, children }) {
  return (
    <>
      <V6TopBar title={title} crumbs={crumbs} />
      <div style={{
        flex: 1, minHeight: 0,
        background: 'var(--color-app-bg)',
        color: 'var(--color-text)',
        padding: '28px 32px',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        </div>
      </div>
    </>
  )
}

export default function V6App({ onExit, userName, initialReportId }) {
  const { user, logout } = useAuth()
  const { toggleMode, isDark } = useTheme()
  const [route, setRoute] = useState(() =>
    initialReportId ? { name: 'reports' } : { name: 'command' }
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  const navigate = useCallback((name, params = {}) => {
    setRoute({ name, ...params })
  }, [])

  const v6Data = useV6Data()

  const nav = useMemo(() => ({ route, navigate, data: v6Data }), [route, navigate, v6Data])

  const navSections = useMemo(() => buildNavSections(ADMIN_NAV), [])
  const activeRoute = route.name === 'ticket-detail' ? 'tickets' : route.name

  const adminNavItem = ADMIN_NAV.find(n => n.id === route.name)

  const isV6Route = V6_ROUTES.has(route.name)

  const sidebarFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
      <button
        onClick={toggleMode}
        title={isDark ? 'Modalità chiara' : 'Modalità scura'}
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        {isDark ? <Sun size={15}/> : <Moon size={15}/>}
      </button>
      <div style={{
        flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted,
      }}>
        <NotificationCenter
          userId={user?.id}
          userRole={user?.role}
          onOpenReport={() => navigate('reports')}
        />
      </div>
      <button
        onClick={() => setSettingsOpen(true)}
        title="Impostazioni tema"
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        <Settings size={15}/>
      </button>
      <button
        onClick={logout}
        title="Disconnetti"
        style={{
          flex: 1, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: MT.surface, border: `1px solid ${MT.border}`, color: MT.textMuted, cursor: 'pointer',
        }}
      >
        <LogOut size={15}/>
      </button>
    </div>
  )

  return (
    <V6NavContext.Provider value={nav}>
      <div className="mt-scope" style={{ minHeight: '100vh' }}>
        <Shell
          activeRoute={activeRoute}
          onNavigate={(r) => navigate(r)}
          onExit={onExit}
          exitLabel="CLASSIC"
          exitTitle="Passa al layout classico"
          userName={userName || user?.name}
          userSubtitle={user ? `${(user.role || '').toUpperCase()} · ${user?.org_name || 'MANUTECH'}` : 'ADMIN · MANUTECH'}
          navSections={navSections}
          versionLabel={`v${__APP_VERSION__} · CONSOLE`}
          sidebarFooter={sidebarFooter}
        >
          {isV6Route ? (
            <>
              {route.name === 'command' && <CommandCenter />}
              {route.name === 'tickets' && <TicketBoard />}
              {route.name === 'ticket-detail' && <TicketDetail id={route.id} />}
            </>
          ) : (
            <AdminPageFrame
              title={adminNavItem?.label || 'Console'}
              crumbs={user?.org_name || 'ManuTech · Console'}
            >
              {route.name === 'dashboard' && <AdminDashboard onNavigate={(t) => navigate(t)} />}
              {route.name === 'reports' && <AdminReports initialReportId={initialReportId} />}
              {route.name === 'assistant' && <AdminAssistantPage onOpenReport={() => navigate('reports')} />}
              {route.name === 'machines' && <AdminMachines />}
              {route.name === 'maintenance' && <AdminMaintenance />}
              {route.name === 'spare-parts' && <AdminSpareParts />}
              {route.name === 'technicians' && <AdminTechnicians />}
              {route.name === 'leaderboard' && <AdminLeaderboard />}
              {route.name === 'rewards' && <AdminRewards />}
              {route.name === 'users' && <AdminUsers />}
              {route.name === 'messages' && <AdminMessaging />}
              {route.name === 'notifications' && <AdminNotifSettings />}
            </AdminPageFrame>
          )}

        </Shell>

        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} userRole={user?.role} />
      </div>
    </V6NavContext.Provider>
  )
}
