// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'

/** Which way the last change went; null once the flash has faded. */
export type TickDirection = 'up' | 'down' | null

/**
 * Long enough to catch the eye, short enough that a fast tape does not
 * strobe. Pairs with the `.tick-up` / `.tick-down` background flash in
 * `packages/ui/src/styles.css`, which fades over the same window.
 */
const FLASH_MS = 700

/**
 * Flags a price change for a moment so a row can flash it.
 *
 * Works off the value alone, not off a stream, so it serves both kinds of
 * price a pane can have: a per-trade ticker subscription, and a bulk snapshot
 * that refreshes on an interval. In the second case the flash marks the
 * refresh rather than a trade — still the honest signal, since that is when
 * the number on screen actually changed.
 */
export function usePriceTick(price: number | null | undefined): TickDirection {
  const [direction, setDirection] = useState<TickDirection>(null)
  const previousRef = useRef<number | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (price == null) return
    const previous = previousRef.current
    previousRef.current = price
    // The first price a row ever sees is not a change — flashing it would
    // make every scroll look like a market-wide move.
    if (previous == null || price === previous) return

    setDirection(price > previous ? 'up' : 'down')
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setDirection(null), FLASH_MS)
  }, [price])

  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  return direction
}
