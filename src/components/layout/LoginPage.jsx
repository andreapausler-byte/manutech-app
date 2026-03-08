import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Input } from '../ui'
import { ROLES } from '../../lib/constants'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'
import { LogIn, UserPlus, Wrench } from 'lucide-react'

export default function LoginPage() {
  const { login, register } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operatore' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toast = useToast()
  const haptic = useHaptic()

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (isLogin) {
        await login(form.email, form.password)
        haptic.success()
        toast.success('Accesso effettuato!')
      } else {
        if (!form.name.trim()) { toast.warning('Inserisci il tuo nome'); setLoading(false); return }
        await register(form)
        haptic.success()
        toast.success('Registrazione completata!')
      }
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
        </div>

        {/* Card — glassmorphism */}
        <div className="glass-heavy rounded-2xl p-6" style={{ border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-xl)' }}>
          {/* Tab switcher */}
          <div className="flex gap-1 mb-5 rounded-xl p-1" role="tablist" style={{ background: 'var(--color-surface-0)' }}>
            {['Accedi', 'Registrati'].map((label, i) => (
              <button key={i} onClick={() => setIsLogin(i === 0)}
                role="tab"
                aria-selected={(i === 0 ? isLogin : !isLogin)}
                className={`flex-1 py-3.5 text-lg font-bold rounded-xl transition-all press-scale`}
                style={{
                  ...(i === 0 ? isLogin : !isLogin)
                    ? { background: 'var(--color-primary)', color: '#fff', boxShadow: 'var(--shadow-glow-primary)' }
                    : { color: 'var(--color-text-muted)' },
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && <Input label="Nome" placeholder="Mario Rossi" value={form.name} onChange={e => set('name', e.target.value)} />}
            <Input label="Email" type="email" placeholder="mario@azienda.it" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={e => set('password', e.target.value)} />

            {!isLogin && (
              <div>
                <label className="block text-base uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>Ruolo</label>
                <div className="flex gap-2.5">
                  {Object.entries(ROLES).map(([key, { label, icon }]) => (
                    <button type="button" key={key} onClick={() => set('role', key)}
                      aria-pressed={form.role === key}
                      className="flex-1 py-4 rounded-xl border text-center transition-all press-scale"
                      style={{
                        borderColor: form.role === key ? 'var(--color-border-active)' : 'var(--color-border)',
                        background: form.role === key ? 'var(--color-primary-glow)' : 'transparent',
                        color: form.role === key ? 'var(--color-text)' : 'var(--color-text-muted)',
                      }}
                    >
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className="text-base font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl p-4 text-lg" style={{ background: 'var(--color-danger-glow)', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                isLogin ? <><LogIn size={22} /> Accedi</> : <><UserPlus size={22} /> Registrati</>}
            </Button>
          </form>

          {isLogin && <p className="text-center text-base mt-4" style={{ color: 'var(--color-text-faint)' }}>Demo: admin@manutech.it / admin123</p>}
        </div>
      </div>
    </div>
  )
}
