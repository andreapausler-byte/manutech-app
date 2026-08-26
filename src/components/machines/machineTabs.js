/**
 * Le sei schede della scheda macchina, in ordine di lettura:
 * cosa non va adesso → di che pezzo si tratta → cosa si vede → cosa c'è
 * scritto → cosa è stato fatto → cosa va fatto.
 *
 * `Pezzi` sta subito dopo le segnalazioni e non in fondo: davanti alla
 * macchina la seconda domanda è quasi sempre "quale pezzo", e da lì si
 * scatta la foto o si registra l'intervento su quel pezzo.
 */

import { AlertTriangle, Package, Images, FileText, Clock, ShieldCheck } from 'lucide-react'

export const MACHINE_TABS = [
  { id: 'segnalazioni', label: 'Segnal.', icon: AlertTriangle },
  { id: 'componenti', label: 'Pezzi', icon: Package },
  { id: 'foto', label: 'Foto', icon: Images },
  { id: 'documenti', label: 'Doc', icon: FileText },
  { id: 'storico', label: 'Storico', icon: Clock },
  { id: 'manutenzioni', label: 'Manut.', icon: ShieldCheck },
]

/**
 * Spaziature inline della scheda macchina.
 *
 * `src/styles/index.css` apre con un reset `* { margin: 0; padding: 0 }`
 * fuori da `@layer`: in Tailwind v4 il CSS senza layer batte le utility,
 * quindi `px-[4vw]`, `p-4` e `space-y-*` non producono nulla in tutta
 * l'app. Finché il reset resta com'è, qui le spaziature vanno inline —
 * lo style attributo il reset non lo tocca.
 */
export const GUTTER = '4vw'

export const padX = { paddingLeft: GUTTER, paddingRight: GUTTER }

export const padRow = { paddingTop: '3.5vw', paddingBottom: '3.5vw' }
