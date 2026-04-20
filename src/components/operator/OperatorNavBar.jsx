import { Home, List, User } from 'lucide-react'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'list', label: 'Ticket', icon: List },
  { id: 'profile', label: 'Profilo', icon: User },
]

export default function OperatorNavBar({ active, onChange }) {
  return (
    <nav className="op-nav" aria-label="Navigazione operatore">
      {TABS.map(t => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            className={`op-nav__btn ${isActive ? 'op-nav__btn--active' : ''}`}
            onClick={() => onChange(t.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t.label}
          >
            <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} />
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
