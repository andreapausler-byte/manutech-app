/**
 * VideoPlayer v2.0 — Player video inline con download
 *
 * Features:
 *  ✅ Play/Pause overlay con tap
 *  ✅ Progress bar interattiva
 *  ✅ Timer current/duration
 *  ✅ Fullscreen nativo
 *  ✅ DOWNLOAD video su PC
 *  ✅ Auto-hide controls dopo 3s
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Maximize, Download } from 'lucide-react'

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function downloadVideo(url, filename) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename || 'video.mp4'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch {
    window.open(url, '_blank')
  }
}

export default function VideoPlayer({ src, name }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const hideTimerRef = useRef(null)

  const progress = duration > 0 ? currentTime / duration : 0

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onLoaded = () => setDuration(video.duration)
    const onTime = () => setCurrentTime(video.currentTime)
    const onEnd = () => { setPlaying(false); setCurrentTime(0); setShowControls(true) }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnd)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnd)
    }
  }, [src])

  // Auto-hide controls after 3s of playback
  useEffect(() => {
    clearTimeout(hideTimerRef.current)
    if (playing && showControls) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
    return () => clearTimeout(hideTimerRef.current)
  }, [playing, showControls])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) video.pause()
    else video.play().catch(() => {})
    setPlaying(!playing)
    setShowControls(true)
  }, [playing])

  const handleTap = () => {
    if (playing) setShowControls(prev => !prev)
    else togglePlay()
  }

  const seekTo = (e) => {
    e.stopPropagation()
    const video = videoRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    if (video && duration) {
      video.currentTime = pct * duration
      setCurrentTime(pct * duration)
    }
  }

  const goFullscreen = (e) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.requestFullscreen) video.requestFullscreen()
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen()
  }

  const handleDownload = (e) => {
    e.stopPropagation()
    downloadVideo(src, name || 'video.mp4')
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black border border-token/50">
      <video ref={videoRef} src={src} preload="metadata" playsInline
        className="w-full aspect-[16/10] object-contain bg-black" />

      {/* Tap area */}
      <div className="absolute inset-0 flex items-center justify-center" onClick={handleTap}>
        {(!playing || showControls) && (
          <button onClick={(e) => { e.stopPropagation(); togglePlay() }}
            className={`w-16 h-16 rounded-full flex items-center justify-center press-scale transition-all ${
              playing ? 'bg-black/50 backdrop-blur-sm' : 'bg-emerald-500/90 shadow-xl shadow-emerald-500/30'
            }`}>
            {playing
              ? <Pause size={28} className="text-white" fill="white" />
              : <Play size={28} className="text-white ml-1" fill="white" />}
          </button>
        )}
      </div>

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-6 transition-opacity duration-200 ${
        showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Progress bar */}
        <div className="w-full h-7 flex items-center cursor-pointer mb-1"
          onClick={seekTo} onTouchEnd={seekTo}>
          <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-[width] duration-100"
              style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        {/* Time + actions */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-300 font-medium">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="flex items-center gap-1">
            {/* Download */}
            <button onClick={handleDownload}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-white/20 hover:bg-white/10 transition-colors"
              title="Scarica video">
              <Download size={15} className="text-white" />
            </button>
            {/* Fullscreen */}
            <button onClick={goFullscreen}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-white/20 hover:bg-white/10 transition-colors"
              title="Schermo intero">
              <Maximize size={16} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
