/**
 * PullToRefreshIndicator — Premium: ingranaggio ManuTech che ruota
 */

import { Cog } from 'lucide-react'

export default function PullToRefreshIndicator({ pullDistance, pullProgress, refreshing, activated }) {
  if (pullDistance === 0 && !refreshing) return null

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: refreshing ? 56 : pullDistance > 0 ? Math.min(pullDistance, 64) : 0 }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: 14,
          background: activated || refreshing
            ? 'linear-gradient(135deg, var(--color-primary), #00d4ff)'
            : 'var(--color-surface-2)',
          border: activated || refreshing ? 'none' : '2px solid var(--color-border)',
          transition: 'background 0.3s ease, border 0.3s ease',
          transform: refreshing ? 'none' : `rotate(${pullProgress * 270}deg)`,
          boxShadow: activated || refreshing ? '0 0 20px rgba(124,106,255,0.3)' : 'none',
        }}
      >
        <Cog
          size={22}
          style={{
            color: activated || refreshing ? '#fff' : 'var(--color-text-muted)',
            transition: 'color 0.2s',
          }}
          className={refreshing ? 'ptr-gear spinning' : 'ptr-gear'}
        />
      </div>
      {refreshing && (
        <span style={{
          marginLeft: 10, fontSize: 13, fontWeight: 600,
          color: 'var(--color-primary)',
          animation: 'fadeIn 0.3s ease',
        }}>
          Aggiornamento...
        </span>
      )}
    </div>
  )
}
