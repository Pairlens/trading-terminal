// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Dragging the chat window ─────────────────────────────────────────
//
// Until the user drags it, the window is positioned by CSS at whichever
// anchor its placement implies, so it stays responsive: an anchor
// expressed in pixels would need recomputing on every resize and would
// drift out of step with the orb it is supposed to grow from.
//
// The first drag switches it to absolute viewport coordinates, read off
// the element's own rect, so it does not jump when the mode changes.
// After that the position is the user's and it persists.
//
// Pointer events rather than mouse events: one path covers mouse,
// trackpad and pen, and pointer capture means a fast drag that outruns
// the cursor keeps tracking instead of dropping the window mid-flight.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AssistantWindowPosition } from '@/stores/assistant-store'
import { useAssistantStore } from '@/stores/assistant-store'

/** However the user drags, this much stays reachable. */
const MIN_VISIBLE_X = 140
const EDGE_GAP = 8

function clampToViewport(
  position: AssistantWindowPosition,
  size: { width: number; height: number },
): AssistantWindowPosition {
  return {
    // Negative left is allowed so a wide window can hang off the left
    // edge, but never far enough to put the header out of reach.
    x: Math.min(
      Math.max(position.x, MIN_VISIBLE_X - size.width),
      Math.max(window.innerWidth - MIN_VISIBLE_X, 0),
    ),
    // The top edge is the drag handle, so it must never leave the
    // viewport in either direction.
    y: Math.min(
      Math.max(position.y, EDGE_GAP),
      Math.max(window.innerHeight - 40, EDGE_GAP),
    ),
  }
}

export function useWindowDrag() {
  const stored = useAssistantStore((state) => state.windowPosition)
  const setStored = useAssistantStore((state) => state.setWindowPosition)

  const windowRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  // Held locally while the pointer is down, so a drag repaints at
  // pointer rate without writing to the store and to localStorage on
  // every frame.
  const [live, setLive] = useState<AssistantWindowPosition | null>(null)
  const originRef = useRef({ pointerX: 0, pointerY: 0, x: 0, y: 0 })

  const sizeOf = useCallback(() => {
    const rect = windowRef.current?.getBoundingClientRect()
    return { width: rect?.width ?? 420, height: rect?.height ?? 620 }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      // The header carries the persona menu, clear and close. A drag must
      // not start on any of them.
      if ((event.target as HTMLElement).closest('button,a,input,textarea')) {
        return
      }
      const rect = windowRef.current?.getBoundingClientRect()
      if (!rect) return

      originRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: rect.left,
        y: rect.top,
      }
      // Seed from the live rect: this is the handoff from CSS anchoring to
      // coordinates, and seeding from anything else makes it jump.
      setLive({ x: rect.left, y: rect.top })
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return
      const origin = originRef.current
      setLive(
        clampToViewport(
          {
            x: origin.x + (event.clientX - origin.pointerX),
            y: origin.y + (event.clientY - origin.pointerY),
          },
          sizeOf(),
        ),
      )
    },
    [dragging, sizeOf],
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return
      setDragging(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      // Hand the position over to the store and DROP the live copy in the
      // same commit. `position` below reads `live ?? stored`, so a live value
      // that outlives its drag shadows the store permanently: reset would
      // null the store, the button would correctly disappear, and the window
      // would not move an inch. Both settle in one render, so nothing jumps.
      if (live) setStored(live)
      setLive(null)
    },
    [dragging, live, setStored],
  )

  // A stored position can end up off screen when the window shrinks or a
  // display is unplugged. Pull it back rather than stranding the window.
  useEffect(() => {
    if (!stored) return
    const onResize = () => {
      const next = clampToViewport(stored, sizeOf())
      if (next.x !== stored.x || next.y !== stored.y) setStored(next)
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [stored, setStored, sizeOf])

  const position = live ?? stored

  return {
    windowRef,
    dragging,
    /** Spread onto the header that doubles as the title bar. */
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    /** Null while the window is still CSS-anchored. */
    style: position
      ? ({ left: `${position.x}px`, top: `${position.y}px` } as const)
      : undefined,
    /** True once the user has moved it, so the UI can offer a reset. */
    isCustom: stored !== null,
    /** Back to the CSS anchor. Clears both sources or it does nothing. */
    reset: useCallback(() => {
      setLive(null)
      setStored(null)
    }, [setStored]),
  }
}
