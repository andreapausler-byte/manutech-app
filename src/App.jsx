import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoginPage from './components/layout/LoginPage'
import MobileLayout from './components/layout/MobileLayout'
import AdminLayout from './components/layout/AdminLayout'
import { Spinner } from './components/ui'

function AppContent() {
  const { user, loading } = useAuth()

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
  if (user.role === 'admin') return <AdminLayout />
  return <MobileLayout />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  )
}
