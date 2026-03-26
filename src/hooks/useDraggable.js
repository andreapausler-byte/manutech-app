/**
 * useDraggable — Hook per rendere un elemento draggabile via mouse/touch
 *
 * Uso:
 *   const { position, dragProps } = useDraggable()
 *   <div {...dragProps} style={{ ...dragProps.style, transform: `translate(${position.x}px, ${position.y}px)` }}>
 *     ...contenuto...
 *   </div>
 *
 * Il drag NON si attiva su elementi interattivi (input, button, select, textarea, a).
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const INTERACTIVE = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'A', 'LABEL']

export function useDraggable({ enabled = true } = {}) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const startPos = useRef({ x: 0, y: 0 })
  const startMouse = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    if (e.button && e.button !== 0) return
    // Non attivare drag su elementi interattivi
    const tag = e.target.tagName
    if (INTERACTIVE.includes(tag)) return
    // Non attivare se il target o un parent vicino è un bottone
    if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return

    e.preventDefault()
    setDragging(true)
    startPos.current = { x: position.x, y: position.y }
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

    const onPointerUp = () => setDragging(false)

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
    style: {
      cursor: enabled ? (dragging ? 'grabbing' : 'default') : 'default',
      touchAction: 'none',
      userSelect: dragging ? 'none' : undefined,
    },
  }

  return { position, dragging, dragProps, reset }
}
