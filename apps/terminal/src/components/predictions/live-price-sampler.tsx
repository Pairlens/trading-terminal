// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The active instrument's streaming price, sampled rather than followed, and
 * subscribed from a LEAF.
 *
 * Written for the probability charts, which recharts re-renders in full on
 * every data change: eight SVG paths re-laid-out at tape speed, for a line
 * whose narrowest bucket is a minute wide, is work with no reader.
 *
 * Throttling the VALUE is only half of it, and the half that is easy to get
 * wrong. `useOptionalTickerData()` is a context read, so any component calling
 * it re-renders on every tick whether or not it uses the new number — a hook
 * form of this would have made the chart's own function body, and every memo
 * in it, run at tape rate while carefully handing back the same value. So the
 * subscription lives in a component that renders nothing, and the price
 * crosses into the tree through a callback at most once per interval. That is
 * the phone's render rule (`mobile/mobile-surface.tsx`: only the readout, the
 * chart, and the book may subscribe) honoured rather than argued with.
 *
 * Mount it as a sibling of the chart and keep the sampled value in the
 * parent's state:
 *
 *   const [live, setLive] = useState<number | null>(null)
 *   <LivePriceSampler onSample={setLive} />
 *
 * It renders null off a pair route, where no ticker provider is mounted.
 */
import { useEffect, useRef } from 'react'

import { useOptionalTickerData } from '@/lib/chart-terminal-context'

/** How often a streaming probability is allowed to redraw the field. */
export const LIVE_SAMPLE_MS = 4_000

export function LivePriceSampler({
  intervalMs = LIVE_SAMPLE_MS,
  onSample,
}: {
  intervalMs?: number
  onSample: (price: number | null) => void
}): null {
  const ticker = useOptionalTickerData()
  const raw = ticker?.lastTradePrice ?? ticker?.midPrice ?? null

  const pending = useRef<number | null>(raw)
  pending.current = raw

  // Both through refs so the interval is set up once: a dependency on the
  // callback would tear down and restart the timer on every parent render,
  // which is the one thing that would let the tick rate back in.
  const callback = useRef(onSample)
  callback.current = onSample
  const emitted = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    const emit = () => {
      if (emitted.current === pending.current) return
      emitted.current = pending.current
      callback.current(pending.current)
    }
    // Once up front, so the chart's right edge is live within a frame of
    // mounting rather than after a full interval of looking stale.
    emit()
    const timer = setInterval(emit, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return null
}
