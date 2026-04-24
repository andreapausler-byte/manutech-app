import { useMemo, useState, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { Spinner } from './components/ui'

const LoginPage = lazy(() => import('./components/layout/LoginPage'))
const MobileLayout = lazy(() => import('./components/layout/MobileLayout'))
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'))
const V6App = lazy(() => import('./pages/manutech-v6/V6App'))
const OperatorApp = lazy(() => import('./pages/operator/OperatorApp'))
const GuestChatPage = lazy(() => import('./components/guest/GuestChatPage'))
const AcceptInvitePage = lazy(() => import('./components/layout/AcceptInvitePage'))
const DesignPreview = lazy(() => import('./pages/DesignPreview'))

function AppLoader({ label = 'Caricamento ManuTech...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Caricamento applicazione" style={{ background: 'var(--color-bg)' }}>
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'var(--color-primary-glow)' }}>
          <span className="text-2xl" aria-hidden="true">🔧</span>
        </div>
        <Spinner />
        <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      </div>
    </div>
  )
}

function getGuestParams() {
  const match = window.location.pathname.match(/^\/guest\/([^/]+)\/([^/]+)$/)
  return match ? { reportId: match[1], token: match[2] } : null
}

function getInviteToken() {
  const match = window.location.pathname.match(/^\/invite\/([^/]+)$/)
  return match ? match[1] : null
}

const guestParams = getGuestParams()
const inviteToken = getInviteToken()
const isDesignPreview = window.location.pathname === '/design-preview'

function AuthenticatedApp() {
  const { user, loading } = useAuth()
  const initialReportId = useMemo(() => {
    const match = window.location.pathname.match(/^\/reports\/(.+)$/)
    return match ? match[1] : null
  }, [])

  // Admin desktop layout preference: 'v6' (default) | 'classic'
  // Persist on localStorage so l'utente può tornare al classico.
  const [adminLayout, setAdminLayout] = useState(() => {
    try {
      const stored = localStorage.getItem('manutech_admin_layout')
      if (stored === 'classic' || stored === 'v6') return stored
    } catch { /* noop */ }
    return 'v6'
  })

  const switchAdminLayout = (next) => {
    setAdminLayout(next)
    try { localStorage.setItem('manutech_admin_layout', next) } catch { /* noop */ }
  }

  if (loading) return <AppLoader />

  if (!user) return <Suspense fallback={<AppLoader />}><LoginPage /></Suspense>

  if (user.role === 'admin') {
    if (adminLayout === 'classic') {
      return (
        <Suspense fallback={<AppLoader />}>
          <AdminLayout
            initialReportId={initialReportId}
            onSwitchToV6={() => switchAdminLayout('v6')}
          />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={<AppLoader />}>
        <V6App
          userName={user.name}
          initialReportId={initialReportId}
          onExit={() => switchAdminLayout('classic')}
        />
      </Suspense>
    )
  }
  if (user.role === 'operatore') return <Suspense fallback={<AppLoader />}><OperatorApp /></Suspense>
  return <Suspense fallback={<AppLoader />}><MobileLayout initialReportId={initialReportId} /></Suspense>
}

export default function App() {
  // Design preview: mockup statico fuori da auth/theme
  if (isDesignPreview) {
    return (
      <Suspense fallback={<AppLoader label="Caricamento mockup..." />}>
        <DesignPreview />
      </Suspense>
    )
  }

  // Guest route: render outside AuthProvider (no auth needed)
  if (guestParams) {
    return (
      <ThemeProvider>
        <Suspense fallback={<AppLoader />}>
          <GuestChatPage reportId={guestParams.reportId} token={guestParams.token} />
        </Suspense>
      </ThemeProvider>
    )
  }

  // Invite route: dentro AuthProvider (acceptInvite aggiorna user)
  if (inviteToken) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<AppLoader />}>
            <AcceptInvitePage token={inviteToken} />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ThemeProvider>
  )
}
