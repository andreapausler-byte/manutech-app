/**
 * useOnlineStatus — Monitora lo stato della connessione di rete
 */

import { useState, useEffect, useRef } from 'react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [wasOffline, setWasOffline] = useState(false)
  const wasOfflineTimerRef = useRef(null)

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true)
      setWasOffline(true)
      clearTimeout(wasOfflineTimerRef.current)
      wasOfflineTimerRef.current = setTimeout(() => setWasOffline(false), 3000)
    }

    const goOffline = () => {
      setIsOnline(false)
      setWasOffline(false)
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      clearTimeout(wasOfflineTimerRef.current)
    }
  }, [])

  return { isOnline, wasOffline }
}
