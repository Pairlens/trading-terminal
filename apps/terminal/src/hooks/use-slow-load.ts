// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Whether a load has been running long enough to be worth explaining.
 *
 * A skeleton says "this pane is coming". It does not say "this pane is coming
 * slowly, on purpose, because the provider behind it is metered and we are
 * pacing ourselves inside its budget" — and after four seconds of shimmer that
 * is the sentence the reader needs, or they reload and start the whole paced
 * queue again from cold.
 *
 * The delay is what keeps it from being noise. Most loads land well inside it
 * and the line is never drawn at all; only the ones that are genuinely taking
 * time get an explanation, which is what makes the explanation believable.
 */
import { useEffect, useState } from 'react'

/**
 * The default patience, in ms.
 *
 * Long enough that a healthy cold open (roughly two paced requests) never
 * trips it, short enough to land before the reader decides the pane is broken.
 */
export const SLOW_LOAD_MS = 4_000

export function useSlowLoad(active: boolean, delayMs = SLOW_LOAD_MS): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!active) {
      // Reset rather than latch: a chain switch starts a new load, and the new
      // one deserves the same silent grace period the first one had.
      setSlow(false)
      return
    }
    const handle = setTimeout(() => setSlow(true), delayMs)
    return () => clearTimeout(handle)
  }, [active, delayMs])

  return slow
}
