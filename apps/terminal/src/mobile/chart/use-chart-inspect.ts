// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The press-and-hold gesture that raises the inspect crosshair.
 *
 * ## Why the listeners sit on the chart WRAPPER, in the capture phase
 *
 * The engine binds `pointerdown`/`pointermove`/`pointerup` to its own UI
 * canvas, and a touch pointer is implicitly captured by the element the touch
 * started on — so a layer mounted over the chart mid-gesture would never see
 * the rest of that gesture, and the chart would keep panning under a crosshair
 * that could not follow. Listening on the wrapper instead catches the same
 * events on their way down to the canvas: the hold is detected without taking
 * anything away, and once the crosshair is up a single `stopPropagation` on
 * each move keeps the engine from panning while the finger scrubs. Nothing is
 * ever preventDefault'd, so the engine's own pointerdown/up bookkeeping — the
 * one thing that resets its drag mode — still runs.
 *
 * ## Per-tick discipline
 *
 * A scrub is a stream of pointer moves and it must not re-render the chart.
 * `armed` is React state (twice per interaction: up, down); the POSITION rides
 * a tiny external store the inspector layer subscribes to on its own, so a
 * finger dragging across 400px repaints one overlay and nothing else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { INSPECT_HOLD_MS, exceedsSlop } from './chart-inspect'
import type { ReticlePoint } from './drawing-placement'
import type { RefObject } from 'react'
import { haptic } from '@/lib/haptics'

/** Chart-local pixel position of the finger, or null when nothing is held. */
export type InspectStore = {
  read: () => ReticlePoint | null
  subscribe: (onChange: () => void) => () => void
}

export type ChartInspect = {
  /** True while the crosshair is on the chart — it outlives the finger. */
  armed: boolean
  /** Live finger position, read by the overlay and by nothing else. */
  store: InspectStore
  /** Take the crosshair down: the ✕ button, a new market, a docked panel. */
  dismiss: () => void
}

export type UseChartInspectOptions = {
  frameRef: RefObject<HTMLDivElement | null>
  /** False disarms and unbinds — a drawing tool is armed, or a panel is up. */
  enabled: boolean
  /**
   * Anything that makes the crosshair point at a different market: a pair, a
   * venue, a timeframe. Changing it takes the crosshair down rather than
   * leaving it hanging over bars it was never placed on.
   */
  resetKey: string
  /** Fired once per raise, from the gesture — never from the state change. */
  onArm?: () => void
}

export function useChartInspect({
  frameRef,
  enabled,
  resetKey,
  onArm,
}: UseChartInspectOptions): ChartInspect {
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  const pointRef = useRef<ReticlePoint | null>(null)
  const listeners = useRef(new Set<() => void>())
  // A ref, so a caller that hands over a fresh closure every render does not
  // rebind the listeners under a finger that is mid-hold.
  const onArmRef = useRef(onArm)
  onArmRef.current = onArm

  const store = useMemo<InspectStore>(
    () => ({
      read: () => pointRef.current,
      subscribe: (onChange) => {
        listeners.current.add(onChange)
        return () => {
          listeners.current.delete(onChange)
        }
      },
    }),
    [],
  )

  const publish = useCallback((at: ReticlePoint | null) => {
    pointRef.current = at
    for (const listener of listeners.current) listener()
  }, [])

  const dismiss = useCallback(() => {
    if (!armedRef.current) return
    armedRef.current = false
    publish(null)
    setArmed(false)
  }, [publish])

  // A new market, timeframe or venue: the bars under the crosshair are not the
  // bars it was placed on.
  useEffect(() => {
    dismiss()
  }, [dismiss, resetKey])

  useEffect(() => {
    const el = frameRef.current
    if (!enabled || !el) {
      dismiss()
      return
    }

    let hold: ReturnType<typeof setTimeout> | null = null
    let tracked: number | null = null
    let origin: ReticlePoint | null = null

    const clearHold = () => {
      if (hold !== null) clearTimeout(hold)
      hold = null
    }

    const localPoint = (event: PointerEvent): ReticlePoint => {
      const box = el.getBoundingClientRect()
      return { x: event.clientX - box.left, y: event.clientY - box.top }
    }

    const release = () => {
      clearHold()
      tracked = null
      origin = null
    }

    const onPointerDown = (event: PointerEvent) => {
      // A second finger is a pinch. Hand the whole gesture back to the engine
      // rather than fighting it for one of the two contacts.
      if (tracked !== null) {
        release()
        dismiss()
        return
      }
      tracked = event.pointerId
      origin = localPoint(event)
      // Already up: a touch anywhere re-grabs it, so scrubbing back and forth
      // across the series costs one hold and not one per look.
      if (armedRef.current) {
        publish(origin)
        return
      }
      hold = setTimeout(() => {
        hold = null
        if (!origin) return
        armedRef.current = true
        haptic('impact')
        publish(origin)
        setArmed(true)
        onArmRef.current?.()
      }, INSPECT_HOLD_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== tracked) return
      const at = localPoint(event)
      if (armedRef.current) {
        // The one thing this layer takes from the engine, and only while the
        // crosshair is up: a move now scrubs instead of panning.
        event.stopPropagation()
        publish(at)
        return
      }
      if (origin && exceedsSlop(origin, at)) release()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== tracked) return
      release()
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('pointermove', onPointerMove, true)
    el.addEventListener('pointerup', onPointerUp, true)
    el.addEventListener('pointercancel', onPointerUp, true)
    return () => {
      release()
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('pointermove', onPointerMove, true)
      el.removeEventListener('pointerup', onPointerUp, true)
      el.removeEventListener('pointercancel', onPointerUp, true)
    }
  }, [dismiss, enabled, frameRef, publish])

  return { armed, store, dismiss }
}
