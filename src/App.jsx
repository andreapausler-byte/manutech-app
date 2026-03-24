import { useMemo } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoginPage from './components/layout/LoginPage'
import MobileLayout from './components/layout/MobileLayout'
import AdminLayout from './components/layout/AdminLayout'
import GuestChatPage from './components/guest/GuestChatPage'
import { Spinner } from './components/ui'

function getGuestParams() {
  const match = window.location.pathname.match(/^\/guest\/([^/]+)\/([^/]+)$/)
  return match ? { reportId: match[1], token: match[2] } : null
}

const guestParams = getGuestParams()

function AuthenticatedApp() {
  const { user, loading } = useAuth()
  const initialReportId = useMemo(() => {
    const match = window.location.pathname.match(/^\/reports\/(.+)$/)
    return match ? match[1] : null
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Caricamento applicazione" style={{ background: 'var(--color-bg)' }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--color-primary-glow)' }}>
            <span className="text-2xl" aria-hidden="true">🔧</span>
          </div>
          <Spinner />
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>Caricamento ManuTech...</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  // Admin → desktop layout, others → mobile layout
  if (user.role === 'admin') return <AdminLayout initialReportId={initialReportId} />
  return <MobileLayout initialReportId={initialReportId} />
}

export default function App() {
  // Guest route: render outside AuthProvider (no auth needed)
  if (guestParams) {
    return (
      <ThemeProvider>
        <GuestChatPage reportId={guestParams.reportId} token={guestParams.token} />
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
