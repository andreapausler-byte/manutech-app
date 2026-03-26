/**
 * useMobileEffects — Ripple effect + Swipe actions per mobile
 */

import { useCallback, useRef } from 'react'

/**
 * useRipple — Aggiunge effetto ripple al tap
 *
 * Uso:
 *   const rippleRef = useRipple()
 *   <button ref={rippleRef} className="ripple-container">...</button>
 */
export function useRipple() {
  const ref = useRef(null)

  const handlePointerDown = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const ripple = document.createElement('span')
    ripple.className = 'ripple-wave'
    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    el.appendChild(ripple)

    ripple.addEventListener('animationend', () => ripple.remove())
  }, [])

  const setRef = useCallback((node) => {
    if (ref.current) {
      ref.current.removeEventListener('pointerdown', handlePointerDown)
    }
    ref.current = node
    if (node) {
      node.addEventListener('pointerdown', handlePointerDown)
    }
  }, [handlePointerDown])

  return setRef
}

/**
 * useSwipeAction — Gestisce swipe orizzontale su card
 *
 * Uso:
 *   const { swipeRef, offset, swiping } = useSwipeAction({
 *     onSwipeRight: () => console.log('swiped right'),
 *     onSwipeLeft: () => console.log('swiped left'),
 *     threshold: 80,
 *   })
 */
export function useSwipeAction({ onSwipeRight, onSwipeLeft, threshold = 80 } = {}) {
  const ref = useRef(null)
  const state = useRef({ startX: 0, startY: 0, offset: 0, swiping: false, locked: false })

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    state.current.startX = touch.clientX
    state.current.startY = touch.clientY
    state.current.locked = false
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!ref.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - state.current.startX
    const dy = touch.clientY - state.current.startY

    // Lock direction: if vertical, don't swipe
    if (!state.current.locked) {
      if (Math.abs(dy) > Math.abs(dx)) {
        state.current.locked = true
        return
      }
    }
    if (state.current.locked) return

    state.current.offset = dx
    state.current.swiping = true
    // Dampen the offset
    const dampened = dx > 0 ? Math.min(dx * 0.5, 120) : Math.max(dx * 0.5, -120)
    ref.current.style.transform = `translateX(${dampened}px)`

    // Show action indicators
    const rightAction = ref.current.querySelector('.swipe-card-action.right')
    const leftAction = ref.current.querySelector('.swipe-card-action.left')
    if (rightAction) rightAction.style.opacity = Math.min(dx / threshold, 1)
    if (leftAction) leftAction.style.opacity = Math.min(-dx / threshold, 1)
  }, [threshold])

  const handleTouchEnd = useCallback(() => {
    if (!ref.current || !state.current.swiping) return
    const dx = state.current.offset

    if (dx > threshold && onSwipeRight) {
      ref.current.style.transform = 'translateX(100px)'
      ref.current.style.opacity = '0'
      setTimeout(() => {
        onSwipeRight()
        if (ref.current) {
          ref.current.style.transform = 'translateX(0)'
          ref.current.style.opacity = '1'
        }
      }, 200)
    } else if (dx < -threshold && onSwipeLeft) {
      ref.current.style.transform = 'translateX(-100px)'
      ref.current.style.opacity = '0'
      setTimeout(() => {
        onSwipeLeft()
        if (ref.current) {
          ref.current.style.transform = 'translateX(0)'
          ref.current.style.opacity = '1'
        }
      }, 200)
    } else {
      ref.current.style.transform = 'translateX(0)'
    }

    // Reset action indicators
    const rightAction = ref.current.querySelector('.swipe-card-action.right')
    const leftAction = ref.current.querySelector('.swipe-card-action.left')
    if (rightAction) rightAction.style.opacity = '0'
    if (leftAction) leftAction.style.opacity = '0'

    state.current.swiping = false
    state.current.offset = 0
  }, [onSwipeRight, onSwipeLeft, threshold])

  const setRef = useCallback((node) => {
    if (ref.current) {
      ref.current.removeEventListener('touchstart', handleTouchStart)
      ref.current.removeEventListener('touchmove', handleTouchMove)
      ref.current.removeEventListener('touchend', handleTouchEnd)
    }
    ref.current = node
    if (node) {
      node.addEventListener('touchstart', handleTouchStart, { passive: true })
      node.addEventListener('touchmove', handleTouchMove, { passive: true })
      node.addEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return { swipeRef: setRef }
}
