// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

import { usePersistedState } from './use-persisted-state'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { TradeConfirmMode } from '@/lib/settings/trade-confirm'
import {
  TRADE_CONFIRM_MODE_DEFAULT,
  TRADE_CONFIRM_MODE_KEY,
  normalizeTradeConfirmMode,
  resolveConfirmGesture,
} from '@/lib/settings/trade-confirm'

/**
 * The user's trade-confirmation gesture. Every surface that commits an order
 * reads it from here, so the choice made in settings governs the ticket and
 * the copilot's confirm card alike.
 */
export function useTradeConfirmMode(): [
  TradeConfirmMode,
  (mode: TradeConfirmMode) => void,
] {
  const [stored, setStored] = usePersistedState<TradeConfirmMode>(
    TRADE_CONFIRM_MODE_KEY,
    TRADE_CONFIRM_MODE_DEFAULT,
  )
  return [normalizeTradeConfirmMode(stored), setStored]
}

type HoldConfirmOptions = {
  /** How long the hold runs before it fires. Ignored in click mode. */
  holdMs: number
  disabled?: boolean
  /** In-flight state: keeps the fill at 100% and blocks a second commit. */
  busy?: boolean
  onConfirm: () => void
}

type HoldConfirmResult = {
  /** The configured gesture, for microcopy and layout decisions. */
  mode: TradeConfirmMode
  /** True while the user is holding down. */
  holding: boolean
  /** Spread onto the confirm control (a native <button>). */
  controlProps: {
    onPointerDown: (event: ReactPointerEvent) => void
    onPointerUp: () => void
    onPointerLeave: () => void
    onPointerCancel: () => void
    onClick: (event: { detail: number }) => void
  }
  /**
   * Spread onto a `<span>` inside the control to draw the progress fill, or
   * `null` when nothing should be drawn (click mode, sitting idle).
   */
  fillProps: {
    'aria-hidden': true
    className: string
    style: CSSProperties
  } | null
}

/**
 * The press-and-hold commit gesture, minus the chrome.
 *
 * Two surfaces confirm orders — the trade ticket and the copilot's order card —
 * and they look nothing alike, so this owns the timing and the fill and lets
 * each render its own button. In click mode the control is an ordinary button:
 * the press does nothing and the click commits.
 *
 * Keyboard activation always commits immediately, in either mode. A held key
 * repeats rather than reporting duration, so a keyboard "hold" would be a
 * fiction; Enter on a focused confirm button is already deliberate.
 */
export function useHoldConfirm({
  holdMs,
  disabled,
  busy,
  onConfirm,
}: HoldConfirmOptions): HoldConfirmResult {
  const [mode] = useTradeConfirmMode()
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduced = useRef(false)
  // Keep the latest onConfirm so a fire at the end of the hold never runs a
  // stale closure (the ticket rebuilds it on every keystroke in the amount).
  const confirmRef = useRef(onConfirm)
  confirmRef.current = onConfirm

  useEffect(() => {
    reduced.current =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const blocked = Boolean(disabled) || Boolean(busy)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }, [])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (blocked) return
      if (
        resolveConfirmGesture(mode, { reducedMotion: reduced.current }) !==
        'hold'
      ) {
        // Click mode (and reduced motion): the click event commits, so the
        // press must not — otherwise the order fires twice.
        return
      }
      // Keeps the press from selecting the label text mid-hold.
      event.preventDefault()
      setHolding(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        setHolding(false)
        confirmRef.current()
      }, holdMs)
    },
    [blocked, holdMs, mode],
  )

  const onClick = useCallback(
    (event: { detail: number }) => {
      if (blocked) return
      // detail === 0 is a keyboard-activated click (Enter/Space on a focused
      // button); a pointer click always carries a click count.
      const fromKeyboard = event.detail === 0
      const gesture = resolveConfirmGesture(mode, {
        reducedMotion: reduced.current,
      })
      if (fromKeyboard || gesture === 'immediate') confirmRef.current()
    },
    [blocked, mode],
  )

  return {
    mode,
    holding,
    controlProps: {
      onPointerDown,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onClick,
    },
    fillProps:
      mode === 'hold' || busy
        ? {
            'aria-hidden': true,
            className: 'absolute inset-y-0 left-0',
            style: {
              width: holding || busy ? '100%' : '0%',
              background: 'color-mix(in oklch, white 26%, transparent)',
              transition: holding
                ? `width ${holdMs}ms linear`
                : 'width .16s ease',
            },
          }
        : null,
  }
}
