/**
 * AudioPlayer — Player audio inline con waveform animata
 * 
 * Features:
 *  - Barre waveform animate durante la riproduzione
 *  - Play/Pause con bottone grande (glove-friendly)
 *  - Progress bar interattiva
 *  - Timer current / duration
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Volume2 } from 'lucide-react'

// Genera barre waveform pseudo-casuali (deterministiche per URL)
function generateBars(count = 32, seed = 0) {
  const bars = []
  let s = seed || 42
  for (let i = 0; i < count; i++) {
    s = (s * 16807 + 7) % 2147483647
    const height = 0.2 + (s % 100) / 100 * 0.8
    bars.push(height)
  }
  return bars
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioPlayer({ src, name }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [bars] = useState(() => generateBars(32, src?.length || 0))

  const progress = duration > 0 ? currentTime / duration : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => setDuration(audio.duration)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
    setPlaying(!playing)
  }, [playing])

  const seekTo = (e) => {
    const audio = audioRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    if (audio && duration) {
      audio.currentTime = pct * duration
      setCurrentTime(pct * duration)
    }
  }

  return (
    <div className="bg-surface-2/70 border border-token/40 rounded-2xl p-[3.5vw] space-y-[2.5vw]">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header row */}
      <div className="flex items-center gap-[3vw]">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className={`w-[13vw] h-[13vw] max-w-14 max-h-14 rounded-full flex items-center justify-center shrink-0 press-scale transition-all ${
            playing
              ? 'bg-orange-500 shadow-lg shadow-orange-500/30'
              : 'bg-orange-500/20 border-2 border-orange-500/50'
          }`}
        >
          {playing ? (
            <Pause size={22} className="text-white" fill="white" />
          ) : (
            <Play size={22} className="text-orange-400 ml-0.5" fill="currentColor" />
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-base text-themed font-semibold truncate">
            {name || 'Nota vocale'}
          </p>
          <p className="text-sm text-faint flex items-center gap-1">
            <Volume2 size={13} />
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>
      </div>

      {/* Waveform */}
      <div
        className="relative h-12 flex items-end gap-[2px] cursor-pointer rounded-xl overflow-hidden"
        onClick={seekTo}
        onTouchEnd={seekTo}
      >
        {bars.map((height, i) => {
          const barProgress = i / bars.length
          const isPlayed = barProgress <= progress
          const isActive = playing && isPlayed && Math.abs(barProgress - progress) < 0.05

          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-150"
              style={{
                height: `${height * 100}%`,
                minHeight: 4,
                background: isPlayed ? '#f97316' : '#374151',
                opacity: isPlayed ? 1 : 0.5,
                transform: isActive && playing ? 'scaleY(1.15)' : 'scaleY(1)',
                transition: 'background 0.15s, transform 0.2s, opacity 0.15s',
              }}
            />
          )
        })}

        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-orange-400 rounded-full transition-[left] duration-100"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}
