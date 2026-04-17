import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../ui'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { LogIn, Wrench, Mail } from 'lucide-react'

export default function LoginPage() {
  const { login } = useAuth()
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

          <div className="mt-5 pt-5 border-t flex items-start gap-3" style={{ borderColor: 'var(--color-border)' }}>
            <Mail size={18} style={{ color: 'var(--color-text-muted)', marginTop: 2 }} />
            <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--color-text)' }}>Non hai un account?</p>
              <p>L'accesso è solo su invito. Contatta l'amministratore della tua organizzazione per ricevere un link di attivazione.</p>
            </div>
          </div>

          <p className="text-center text-base mt-4" style={{ color: 'var(--color-text-faint)' }}>Demo: admin@manutech.it / admin123</p>
        </div>
      </div>
    </div>
  )
}
