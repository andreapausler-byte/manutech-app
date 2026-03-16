/**
 * PullToRefreshIndicator — Indicatore visivo per il gesto pull-to-refresh
 */

import { RefreshCw } from 'lucide-react'

export default function PullToRefreshIndicator({ pullDistance, pullProgress, refreshing, activated }) {
  if (pullDistance === 0 && !refreshing) return null

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: refreshing ? 48 : pullDistance > 0 ? Math.min(pullDistance, 60) : 0 }}
    >
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200 ${
          activated || refreshing
            ? 'border-violet-500 bg-violet-500/15'
            : 'border-gray-600 bg-surface-2/50'
        }`}
        style={{
          transform: refreshing ? 'none' : `rotate(${pullProgress * 180}deg)`,
          opacity: refreshing ? 1 : Math.max(0.3, pullProgress),
        }}
      >
        <RefreshCw
          size={18}
          className={`transition-colors ${
            activated || refreshing ? 'text-violet-400' : 'text-faint'
          } ${refreshing ? 'animate-spin' : ''}`}
        />
      </div>
    </div>
  )
}
