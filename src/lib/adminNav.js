/**
 * Admin NAV — struttura condivisa tra layout admin e PageHeader.
 *
 * Ordine: dashboard → ottimizzazione → operatività (segnalazioni / assistente)
 * → gestione macchine/manutenzione/ricambi → persone → comunicazione → setup.
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
  Sparkles,
  TrendingUp,
  Calendar,
} from 'lucide-react'

export const NAV = [
  { id: 'dashboard',     icon: LayoutDashboard, label: 'Dashboard',    desc: 'Panoramica generale' },
  { id: 'optimization',  icon: TrendingUp,      label: 'Ottimizzazione', desc: 'KPI e insight per ridurre fermi macchina' },
  { id: 'reports',       icon: ClipboardList,   label: 'Segnalazioni', desc: 'Gestisci interventi' },
  { id: 'calendar',      icon: Calendar,        label: 'Calendario',   desc: 'Pianificazione interventi' },
  { id: 'assistant',     icon: Sparkles,        label: 'Assistente AI', desc: 'Cerca soluzioni nello storico' },
  { id: 'machines',      icon: Cog,             label: 'Macchinari',   desc: 'Anagrafica impianti' },
  { id: 'maintenance',   icon: Shield,          label: 'Manutenzione', desc: 'Piani e interventi programmati' },
  { id: 'spare-parts',   icon: Package,         label: 'Richieste esterne', desc: 'Ricambi, interventi e magazzino' },
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
