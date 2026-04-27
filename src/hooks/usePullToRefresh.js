/**
 * usePullToRefresh — Gesto pull-to-refresh nativo per mobile
 */

import { useRef, useState, useCallback, useEffect } from 'react'

const THRESHOLD = 90
const MAX_PULL = 130
const RESISTANCE = 0.25

export function usePullToRefresh(onRefresh) {
  const pullRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  const startY = useRef(0)
  const pulling = useRef(false)

  const pullProgress = Math.min(pullDistance / THRESHOLD, 1)
  const activated = pullDistance >= THRESHOLD

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setPullDistance(0)
    try {
      await onRefresh()
    } catch (e) {
      console.warn('[usePullToRefresh] onRefresh failed', e)
    }
    setRefreshing(false)
  }, [onRefresh, refreshing])

  useEffect(() => {
    const el = pullRef.current
    if (!el) return

    const isAtTop = () => {
      let node = el
      while (node) {
        if (node.scrollTop > 5) return false
        node = node.parentElement
      }
      return true
    }

    const onTouchStart = (e) => {
      if (refreshing) return
      if (!isAtTop()) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    const onTouchMove = (e) => {
      if (!pulling.current || refreshing) return
      const currentY = e.touches[0].clientY
      const diff = (currentY - startY.current) * RESISTANCE
      if (diff > 0) {
        e.preventDefault()
        setPullDistance(Math.min(diff, MAX_PULL))
      } else {
        pulling.current = false
        setPullDistance(0)
      }
    }

    const onTouchEnd = () => {
      if (!pulling.current) return
      pulling.current = false
      if (activated) {
        handleRefresh()
      } else {
        setPullDistance(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [refreshing, activated, handleRefresh])

  return { pullRef, refreshing, pullDistance, pullProgress, activated }
}
