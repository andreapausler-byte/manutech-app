/**
 * OfflineBanner — Banner di stato connessione
 */

import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineBanner({ isOnline, wasOffline }) {
  if (isOnline && !wasOffline) return null

  const isReconnected = isOnline && wasOffline

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold transition-all duration-300 ${
        isReconnected
          ? 'bg-emerald-600 text-white'
          : 'bg-red-600/90 text-white'
      }`}
    >
      {isReconnected ? (
        <>
          <Wifi size={16} />
          <span>Riconnesso!</span>
        </>
      ) : (
        <>
          <WifiOff size={16} className="animate-pulse" />
          <span>Sei offline — le modifiche saranno sincronizzate</span>
        </>
      )}
    </div>
  )
}
