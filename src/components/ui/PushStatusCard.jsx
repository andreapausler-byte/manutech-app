/**
 * PushStatusCard — "ricevo le notifiche su questo telefono?"
 *
 * Nel Profilo mobile, sempre visibile. Il banner che chiede il permesso
 * compare una volta sola: chi l'aveva chiuso o aveva toccato "Blocca" non
 * aveva più nessun posto dove riattivarle, ed è così che a ott 2026 solo 5
 * tecnici su 27 ricevevano i push.
 *
 * Autonoma: chiede il permesso, iscrive il telefono con la chiave del
 * server (lib/push.js), manda una prova e ripara l'iscrizione. Spiega cosa
 * fare quando l'app non può farlo da sola (notifiche bloccate, iPhone senza
 * l'app sulla schermata Home).
 */
import { useEffect, useState } from 'react'
import { Bell, BellOff, Send, Wrench, Loader2, CheckCircle2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { ensurePushSubscription, checkSubscriptionKey } from '../../lib/push'
import { useToast } from '../../hooks/useToast'
import { useHaptic } from '../../hooks/useHaptic'

const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
const getRegistration = async () => (
  'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration('/') : null
)

// Il telefono è iscritto con la chiave del server?
async function readSubscribed(supported) {
  if (!supported || Notification.permission !== 'granted') return false
  try {
    const reg = await getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return false
    const { matches } = await checkSubscriptionKey(reg)
    return matches !== false
  } catch {
    return false
  }
}

export default function PushStatusCard({ user }) {
  const toast = useToast()
  const haptic = useHaptic()
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
  const [permission, setPermission] = useState(supported ? Notification.permission : 'unsupported')
  // null = sto controllando; true/false = iscrizione valida per il server
  const [subscribed, setSubscribed] = useState(null)
  const [busy, setBusy] = useState(null) // 'enable' | 'test' | 'repair'

  useEffect(() => {
    let alive = true
    readSubscribed(supported).then(v => { if (alive) setSubscribed(v) })
    return () => { alive = false }
  }, [supported])

  const subscribe = async (force = false) => {
    const reg = await getRegistration()
    if (!reg) throw new Error('Service worker non pronto: ricarica l\'app')
    await ensurePushSubscription(reg, user.id, user.org_id, { force })
    setSubscribed(true)
  }

  const enable = async () => {
    setBusy('enable')
    haptic.medium()
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        await subscribe()
        toast.success('Notifiche attive su questo telefono')
      }
    } catch (err) {
      toast.error('Non riuscito: ' + (err?.message || 'riprova'))
    }
    setBusy(null)
  }

  const repair = async () => {
    setBusy('repair')
    try {
      await subscribe(true)
      toast.success('Iscrizione rifatta')
    } catch (err) {
      toast.error('Non riuscito: ' + (err?.message || 'riprova'))
    }
    setBusy(null)
  }

  // Prova dall'inizio alla fine: riga in notifications → trigger → push.
  const sendTest = async () => {
    setBusy('test')
    try {
      await db.addNotification({
        type: 'status_change',
        title: 'Notifica di prova',
        body: 'Se la vedi con l\'app chiusa, le notifiche funzionano.',
        target_user: user.id,
      })
      toast.success('Inviata: chiudi l\'app e aspetta qualche secondo', { duration: 5000 })
    } catch (err) {
      toast.error('Invio non riuscito: ' + (err?.message || 'riprova'))
    }
    setBusy(null)
  }

  const iosNeedsInstall = isIOS() && !isStandalone()
  const active = permission === 'granted' && subscribed === true

  let tone = 'var(--color-warning)'
  let title = 'Notifiche non attive'
  let text = 'Attivale per sapere subito quando ti assegnano un lavoro, quando qualcuno risponde e quando una manutenzione scade.'
  if (active) {
    tone = 'var(--color-success)'
    title = 'Notifiche attive'
    text = 'Ricevi avvisi su assegnazioni, messaggi e scadenze anche con l\'app chiusa.'
  } else if (iosNeedsInstall || permission === 'unsupported') {
    text = iosNeedsInstall
      ? 'Su iPhone le notifiche arrivano solo se l\'app è sulla schermata Home: in Safari tocca Condividi → "Aggiungi alla schermata Home", poi apri ManuTech da quell\'icona.'
      : 'Questo browser non supporta le notifiche. Apri ManuTech con Chrome (Android) o dall\'icona sulla schermata Home (iPhone).'
  } else if (permission === 'denied') {
    title = 'Notifiche bloccate'
    text = 'Le hai bloccate su questo telefono. Riattivale dalle impostazioni: Android → tieni premuta l\'icona di ManuTech → Info app → Notifiche → Consenti. Su Chrome: lucchetto accanto all\'indirizzo → Notifiche → Consenti. Poi riapri l\'app.'
  } else if (permission === 'granted' && subscribed === false) {
    text = 'Il permesso c\'è, ma questo telefono non è iscritto correttamente. Tocca "Ripara".'
  }

  const btn = (primary) => ({
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--color-border)',
    background: primary ? 'var(--color-primary)' : 'var(--color-surface-2)',
    color: primary ? '#fff' : 'var(--color-text)',
  })

  return (
    <div className="card-elevated rounded-2xl" style={{
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14,
      background: 'var(--color-surface-1)', border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${tone} 14%, transparent)`,
        }}>
          {active ? <CheckCircle2 size={22} style={{ color: tone }} />
            : permission === 'denied' ? <BellOff size={22} style={{ color: tone }} />
            : <Bell size={22} style={{ color: tone }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="text-sm uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>Notifiche</p>
          <p className="text-lg font-semibold" style={{ color: 'var(--color-text)', marginTop: 2 }}>{title}</p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.45 }}>{text}</p>
        </div>
      </div>

      {permission === 'default' && supported && !iosNeedsInstall && (
        <button onClick={enable} disabled={!!busy} className="press-scale" style={btn(true)}>
          {busy === 'enable' ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
          Attiva notifiche
        </button>
      )}

      {permission === 'granted' && (
        <div style={{ display: 'flex', gap: 10 }}>
          {active && (
            <button onClick={sendTest} disabled={!!busy} className="press-scale" style={btn(true)}>
              {busy === 'test' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Prova
            </button>
          )}
          <button onClick={repair} disabled={!!busy} className="press-scale" style={btn(!active)}>
            {busy === 'repair' ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}
            Ripara
          </button>
        </div>
      )}
    </div>
  )
}
