/**
 * useDraggable — Hook per rendere un elemento draggabile via mouse/touch
 *
 * Uso:
 *   const { position, handleRef, dragProps } = useDraggable()
 *   <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
 *     <div ref={handleRef} {...dragProps}>Drag handle</div>
 *     ...contenuto...
 *   </div>
 */

import { useState, useRef, useCallback, useEffect } from 'react'

export function useDraggable({ enabled = true } = {}) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const handleRef = useRef(null)
  const startPos = useRef({ x: 0, y: 0 })
  const startMouse = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    // Solo tasto sinistro del mouse o touch
    if (e.button && e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    startPos.current = { ...position }
    startMouse.current = { x: e.clientX, y: e.clientY }
  }, [enabled, position])

  useEffect(() => {
    if (!dragging) return

    const onPointerMove = (e) => {
      const dx = e.clientX - startMouse.current.x
      const dy = e.clientY - startMouse.current.y
      setPosition({
        x: startPos.current.x + dx,
        y: startPos.current.y + dy,
      })
    }

    const onPointerUp = () => {
      setDragging(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging])

  const reset = useCallback(() => setPosition({ x: 0, y: 0 }), [])

  const dragProps = {
    onPointerDown,
    style: { cursor: enabled ? (dragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none', userSelect: 'none' },
  }

  return { position, dragging, handleRef, dragProps, reset }
}
