/**
 * Admin NAV — struttura condivisa tra AdminLayout e PageHeader
 *
 * Estratta per evitare duplicazione del titolo/descrizione pagina
 * tra il layout (sidebar) e l'header locale di ogni pagina.
 */
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Users,
  Cog,
  Bell,
  Shield,
  MessageCircle,
  Trophy,
  Gift,
  Package,
} from 'lucide-react'

export const NAV = [
  { id: 'dashboard',     icon: LayoutDashboard, label: 'Dashboard',    desc: 'Panoramica generale' },
  { id: 'reports',       icon: ClipboardList,   label: 'Segnalazioni', desc: 'Gestisci interventi' },
  { id: 'machines',      icon: Cog,             label: 'Macchinari',   desc: 'Anagrafica impianti' },
  { id: 'maintenance',   icon: Shield,          label: 'Manutenzione', desc: 'Piani e interventi programmati' },
  { id: 'spare-parts',   icon: Package,         label: 'Ricambi',      desc: 'Magazzino e ordini ricambi' },
  { id: 'technicians',   icon: Wrench,          label: 'Tecnici',      desc: 'Carico e performance' },
  { id: 'leaderboard',   icon: Trophy,          label: 'Classifica',   desc: 'Punteggi e premi operatori' },
  { id: 'rewards',       icon: Gift,            label: 'Premi',        desc: 'Catalogo premi e ManuCoin' },
  { id: 'users',         icon: Users,           label: 'Utenti',       desc: 'Account e ruoli' },
  { id: 'messages',      icon: MessageCircle,   label: 'Messaggi',     desc: 'Chat diretta con il team' },
  { id: 'notifications', icon: Bell,            label: 'Notifiche',    desc: 'Preferenze notifiche per ruolo' },
]

export function findNavItem(id) {
  return NAV.find(n => n.id === id)
}
