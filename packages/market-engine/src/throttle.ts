// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type ThrottleMode = 'performance' | 'balanced' | 'energy-saver'

export type ThrottleConfig = {
  candles: number
  ticker: number
  orderbook: number
  trades: number
}

/** Streams the throttle knows how to rate-limit. */
export type ThrottleStream = keyof ThrottleConfig

/**
 * `trades` is pinned to 0 in every mode, and must stay that way.
 *
 * This throttle is lossy on purpose: a queued frame is REPLACED by the next
 * arrival (`pending = data`), because for candles, ticker and orderbook each
 * frame supersedes the last — dropping intermediates just skips redundant
 * paints of state that was about to be overwritten anyway.
 *
 * A trade frame is not state, it is an event: every frame is a distinct
 * execution that no later frame contains. Throttling it would silently delete
 * prints from the tape, and a tape with holes is worse than no tape. Consumers
 * bound their own render cost instead by buffering arrivals and publishing on
 * a fixed cadence (see use-trades-stream), which costs nothing per trade and
 * loses nothing.
 */
const CONFIGS: Record<ThrottleMode, ThrottleConfig> = {
  performance: { candles: 0, ticker: 0, orderbook: 0, trades: 0 },
  balanced: { candles: 500, ticker: 250, orderbook: 250, trades: 0 },
  'energy-saver': { candles: 2000, ticker: 1000, orderbook: 1000, trades: 0 },
}

/**
 * Client-side stream throttle. Wraps callbacks with rate limiting
 * to reduce re-renders and CPU usage.
 *
 * The interval is read dynamically from the current mode on every call,
 * so changing mode via setMode() takes effect immediately for all
 * existing wrapped callbacks.
 */
export class StreamThrottle {
  private mode: ThrottleMode = 'balanced'
  /** Live wrapped callbacks with a possibly-pending trailing-edge timer. */
  private reschedulers = new Set<() => void>()

  setMode(mode: ThrottleMode): void {
    if (mode === this.mode) return
    this.mode = mode
    // Reschedule any pending trailing-edge timers under the new interval —
    // otherwise a frame queued under the old (slower) mode keeps its stale
    // delay after switching to a faster mode.
    for (const reschedule of this.reschedulers) reschedule()
  }

  getMode(): ThrottleMode {
    return this.mode
  }

  /**
   * Wrap a callback with throttling for the given stream type.
   *
   * The returned function carries a `cancel()` that clears any pending
   * trailing-edge timer. Callers MUST call it on unsubscribe — otherwise the
   * pending timer fires after teardown and delivers a stale frame to the (now
   * defunct) callback, which on a market switch shows the previous pair's last
   * tick on the new pair, and leaks the timer + callback reference.
   *
   * `options.immediate` marks frames that must never be queued and never
   * dropped. The lossiness above is right for frames that supersede each
   * other and wrong for a frame that is a different KIND of thing, arriving
   * once. The candle stream's `snapshot` is exactly that: it carries the
   * venue's REST backfill, and the chart paints no history without one. A
   * live candle update landing inside the same window replaced it in the
   * queue and it was gone for good — the chart then sat on a single forming
   * bar until the user switched pair or timeframe, which is precisely the
   * shape of a bug that reads as "sometimes". The frames most likely to
   * delete a snapshot are the ones that follow it by milliseconds, so this is
   * a race a busy venue wins often.
   *
   * The predicate is the caller's, not a payload sniff, because `snapshot`
   * does not mean the same thing on every stream: an orderbook frame is a
   * snapshot EVERY time, and marking those immediate would throttle the
   * heaviest stream in the terminal not at all.
   */
  wrap<T>(
    streamType: keyof ThrottleConfig,
    callback: (data: T) => void,
    options: { immediate?: (data: T) => boolean } = {},
  ): ((data: T) => void) & { cancel: () => void } {
    let lastCall = 0
    let pending: T | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const fire = () => {
      timer = null
      if (pending !== null) {
        lastCall = Date.now()
        callback(pending)
        pending = null
      }
    }

    const reschedule = () => {
      if (!timer) return
      clearTimeout(timer)
      const intervalMs = CONFIGS[this.mode][streamType]
      timer = setTimeout(fire, Math.max(0, lastCall + intervalMs - Date.now()))
    }
    this.reschedulers.add(reschedule)

    const wrapped = (data: T) => {
      // Never queued, never superseded — see `options.immediate`. Any frame
      // already queued IS superseded: a snapshot carries the whole state.
      if (options.immediate?.(data) === true) {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        pending = null
        lastCall = Date.now()
        callback(data)
        return
      }

      // Read interval dynamically so mode changes take effect immediately
      const intervalMs = CONFIGS[this.mode][streamType]
      if (intervalMs === 0) {
        // Drop any frame queued under a slower mode — it's older than `data`
        // and would otherwise fire after it, delivering out of order.
        if (timer) {
          clearTimeout(timer)
          timer = null
          pending = null
        }
        callback(data)
        return
      }

      const now = Date.now()
      const elapsed = now - lastCall

      if (elapsed >= intervalMs) {
        lastCall = now
        // A newer frame supersedes any queued one; the timer (if any) no-ops.
        pending = null
        callback(data)
      } else {
        pending = data
        if (!timer) {
          timer = setTimeout(fire, intervalMs - elapsed)
        }
      }
    }

    wrapped.cancel = () => {
      this.reschedulers.delete(reschedule)
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    }

    return wrapped
  }
}
