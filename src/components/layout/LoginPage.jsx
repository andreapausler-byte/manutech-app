import { lazy, Suspense, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input, Spinner } from '../ui'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { LogIn, Wrench, Building2 } from 'lucide-react'

const SignupPage = lazy(() => import('./SignupPage'))

export default function LoginPage() {
  const { login } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await login(form.email, form.password)
      haptic.success()
      toast.success('Accesso effettuato!')
    } catch (err) {
      const msg = err.message || 'Errore durante l\'accesso'
      setError(msg)
      toast.error(msg)
    }
    setLoading(false)
  }

  if (showSignup) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
        <SignupPage onBack={() => setShowSignup(false)} />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center px-5 py-8 ambient-glow" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md animate-scale-in relative z-[1]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{
              background: 'var(--gradient-primary)',
              boxShadow: 'var(--shadow-glow-primary)',
            }}
          >
            <Wrench className="text-white" size={36} />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>ManuTech</h1>
          <p className="text-lg mt-1" style={{ color: 'var(--color-text-muted)' }}>Gestione Manutenzione</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>v{__APP_VERSION__}</p>
        </div>

        {/* Card — glassmorphism */}
        <div className="glass-heavy rounded-2xl p-6" style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}>
          <h2 className="text-xl font-bold mb-5 text-center" style={{ color: 'var(--color-text)' }}>Accedi</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Email" type="email" placeholder="mario@azienda.it" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} />

            {error && (
              <div role="alert" className="rounded-xl p-4 text-lg" style={{ background: 'var(--color-danger-glow)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                <><LogIn size={22} /> Accedi</>}
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              size="lg"
              onClick={() => { setError(''); setShowSignup(true) }}
            >
              <Building2 size={20} /> Crea una nuova organizzazione
            </Button>
            <p className="text-xs mt-3 text-center" style={{ color: 'var(--color-text-faint)' }}>
              Sei stato invitato? Apri il link ricevuto via email per attivare il tuo account.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
