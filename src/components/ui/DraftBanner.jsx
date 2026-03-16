/**
 * DraftBanner — Banner che appare quando esiste una bozza salvata
 */

import { useState } from 'react'
import { FileText, X } from 'lucide-react'

export default function DraftBanner({ lastSaved, onDiscard }) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  const timeStr = lastSaved
    ? `Salvata ${formatTimeAgo(lastSaved)}`
    : 'Bozza ripristinata'

  return (
    <div className="bg-violet-600/15 border border-violet-500/30 rounded-2xl px-[4vw] py-[3vw] flex items-center gap-[3vw] animate-fade-in">
      <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
        <FileText size={20} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-violet-300">Bozza ripristinata</p>
        <p className="text-sm text-violet-400/70">{timeStr}</p>
      </div>
      <button
        onClick={() => { setVisible(false); onDiscard?.() }}
        className="px-3 py-1.5 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 active:bg-red-500/20 press-scale"
      >
        Scarta
      </button>
      <button
        onClick={() => setVisible(false)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-faint active:bg-white/10"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'adesso'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min fa`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h fa`
  return 'più di un giorno fa'
}
