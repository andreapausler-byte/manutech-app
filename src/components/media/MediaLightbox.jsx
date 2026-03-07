/**
 * MediaLightbox v2.0 — Viewer fullscreen con DOWNLOAD
 *
 * Features:
 *  ✅ Pinch-to-zoom con due dita (touch)
 *  ✅ Mouse wheel zoom (desktop)
 *  ✅ Double-tap / double-click per zoom in/out
 *  ✅ Swipe orizzontale per navigare tra immagini
 *  ✅ Chiusura con swipe verticale o bottone X
 *  ✅ Counter "2/5" in alto
 *  ✅ DOWNLOAD foto su PC (bottone in header)
 *  ✅ Frecce keyboard (← → Esc)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, Download } from 'lucide-react'

// Download utility
async function downloadImage(url, filename) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename || 'foto.jpg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch {
    window.open(url, '_blank')
  }
}

export default function MediaLightbox({ images, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isZoomed, setIsZoomed] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const containerRef = useRef(null)
  const touchStartRef = useRef({})
  const lastTapRef = useRef(0)
  const pinchStartRef = useRef(null)

  const current = images[currentIndex]
  const total = images.length

  const resetZoom = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    setIsZoomed(false)
  }, [])

  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < total) { resetZoom(); setCurrentIndex(idx) }
  }, [total, resetZoom])

  const goPrev = () => goTo(currentIndex - 1)
  const goNext = () => goTo(currentIndex + 1)

  // Handle download
  const handleDownload = async () => {
    setDownloading(true)
    const name = current.name || `foto-${currentIndex + 1}.jpg`
    await downloadImage(current.url, name)
    setDownloading(false)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleDownload() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, onClose])

  // Mouse wheel zoom (desktop)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      setScale(prev => {
        const newScale = Math.max(1, Math.min(5, prev + delta))
        if (newScale <= 1.05) {
          setTranslate({ x: 0, y: 0 })
          setIsZoomed(false)
          return 1
        }
        setIsZoomed(true)
        return newScale
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // Mouse drag to pan (desktop, when zoomed)
  const mouseDownRef = useRef(null)

  const handleMouseDown = (e) => {
    if (!isZoomed || e.button !== 0) return
    mouseDownRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const handleMouseMove = (e) => {
    if (!mouseDownRef.current || !isZoomed) return
    const dx = e.clientX - mouseDownRef.current.x
    const dy = e.clientY - mouseDownRef.current.y
    setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    mouseDownRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = () => { mouseDownRef.current = null }

  // Double-click to zoom (desktop)
  const handleDoubleClick = () => {
    if (isZoomed) resetZoom()
    else { setScale(2.5); setIsZoomed(true) }
  }

  // Touch handlers (mobile)
  const handleTouchStart = (e) => {
    const touches = e.touches
    if (touches.length === 2) {
      const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
      pinchStartRef.current = { dist, scale }
    } else if (touches.length === 1) {
      touchStartRef.current = { x: touches[0].clientX, y: touches[0].clientY, time: Date.now() }
    }
  }

  const handleTouchMove = (e) => {
    const touches = e.touches
    if (touches.length === 2 && pinchStartRef.current) {
      e.preventDefault()
      const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
      const newScale = Math.max(1, Math.min(4, pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)))
      setScale(newScale)
      setIsZoomed(newScale > 1.1)
    } else if (touches.length === 1 && isZoomed) {
      const dx = touches[0].clientX - touchStartRef.current.x
      const dy = touches[0].clientY - touchStartRef.current.y
      setTranslate(prev => ({ x: prev.x + dx * 0.5, y: prev.y + dy * 0.5 }))
      touchStartRef.current.x = touches[0].clientX
      touchStartRef.current.y = touches[0].clientY
    }
  }

  const handleTouchEnd = (e) => {
    const now = Date.now()

    if (pinchStartRef.current) {
      pinchStartRef.current = null
      if (scale < 1.15) resetZoom()
      return
    }

    if (!touchStartRef.current.x) return

    const dx = (e.changedTouches[0]?.clientX || 0) - touchStartRef.current.x
    const dy = (e.changedTouches[0]?.clientY || 0) - touchStartRef.current.y
    const elapsed = now - touchStartRef.current.time

    // Double-tap to zoom
    if (elapsed < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (now - lastTapRef.current < 300) {
        if (isZoomed) resetZoom()
        else { setScale(2.5); setIsZoomed(true) }
        lastTapRef.current = 0
        return
      }
      lastTapRef.current = now
    }

    // Swipe to navigate (not zoomed)
    if (!isZoomed && elapsed < 400 && Math.abs(dx) > 50 && Math.abs(dy) < 80) {
      if (dx > 0) goPrev(); else goNext()
    }

    // Swipe down to close
    if (!isZoomed && dy > 100 && Math.abs(dx) < 60) onClose()

    touchStartRef.current = {}
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-md flex flex-col animate-fade-in">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between px-4 py-3 relative z-10">
        {/* Left: counter */}
        <span className="text-sm text-muted font-bold">
          {total > 1 ? `${currentIndex + 1} / ${total}` : ''}
        </span>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {!isZoomed && (
            <span className="text-xs text-faint hidden sm:flex items-center gap-1">
              <ZoomIn size={14} /> Scroll / doppio click per zoom
            </span>
          )}

          {/* ★ DOWNLOAD BUTTON */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="h-11 px-4 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30
              flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-all active:scale-95"
            title="Scarica foto (Ctrl+S)"
          >
            {downloading
              ? <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              : <Download size={18} />}
            <span className="text-sm font-medium hidden sm:inline">Scarica</span>
          </button>

          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
          >
            <X size={22} className="text-white" />
          </button>
        </div>
      </div>

      {/* ═══ Image area ═══ */}
      <div
        ref={containerRef}
        className={`flex-1 flex items-center justify-center overflow-hidden touch-none ${isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={current.url}
          alt=""
          className="max-w-full max-h-full object-contain select-none transition-transform duration-150"
          style={{ transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)` }}
          draggable={false}
        />
      </div>

      {/* ═══ Navigation ═══ */}
      {total > 1 && !isZoomed && (
        <>
          {currentIndex > 0 && (
            <button onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors">
              <ChevronLeft size={24} className="text-white" />
            </button>
          )}
          {currentIndex < total - 1 && (
            <button onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors">
              <ChevronRight size={24} className="text-white" />
            </button>
          )}

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 pb-6 pt-2">
            {images.map((_, i) => (
              <button key={i} onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === currentIndex ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30 hover:bg-white/50'
                }`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
