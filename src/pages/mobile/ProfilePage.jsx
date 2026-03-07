import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { ROLES } from '../../lib/constants'
import { Button } from '../../components/ui'
import { LogOut, Mail, Shield, Wifi, Palette } from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { accent, resolved } = useTheme()
  const role = ROLES[user.role] || ROLES.operatore

  return (
    <div className="px-4 py-6 space-y-5 animate-fade-in">
      {/* Avatar */}
      <div className="text-center">
        <div
          className="w-24 h-24 mx-auto rounded-full flex items-center justify-center text-4xl"
          style={{ background: 'var(--color-surface-2)', border: '2px solid var(--color-border-hover)', boxShadow: 'var(--shadow-lg)' }}
        >
          {role.icon}
        </div>
        <h2 className="text-2xl font-extrabold mt-3 tracking-tight" style={{ color: 'var(--color-text)' }}>{user.name}</h2>
        <p className="text-lg mt-1" style={{ color: 'var(--color-text-muted)' }}>{role.label}</p>
      </div>

      {/* Info cards */}
      <div className="card-elevated rounded-2xl overflow-hidden">
        {[
          { icon: Mail, label: 'Email', value: user.email, color: 'var(--color-info)' },
          { icon: Shield, label: 'Ruolo', value: role.label, color: 'var(--color-warning)' },
          { icon: Wifi, label: 'Modalità', value: isSupabaseConfigured() ? 'Online' : 'Demo (locale)', color: isSupabaseConfigured() ? 'var(--color-success)' : 'var(--color-warning)' },
          { icon: Palette, label: 'Tema', value: `${accent.name} (${resolved === 'dark' ? 'scuro' : 'chiaro'})`, color: 'var(--color-primary)' },
        ].map(({ icon: Icon, label, value, color }, idx) => (
          <div
            key={label}
            className="flex items-center gap-4 px-5 py-4"
            style={{ borderTop: idx > 0 ? '1px solid var(--color-border-subtle)' : 'none' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
              <Icon size={22} style={{ color }} />
            </div>
            <div>
              <p className="text-sm uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>{label}</p>
              <p className="text-lg mt-0.5" style={{ color: 'var(--color-text)' }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={logout} variant="danger" className="w-full" size="lg">
        <LogOut size={22} /> Esci
      </Button>

      <p className="text-center text-sm" style={{ color: 'var(--color-text-faint)' }}>ManuTech v5.2c — Sprint 3.6c Realtime Notifications</p>
    </div>
  )
}
