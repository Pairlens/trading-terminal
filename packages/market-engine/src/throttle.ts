// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type ThrottleMode = 'performance' | 'balanced' | 'energy-saver'

type ThrottleConfig = {
  candles: number
  ticker: number
  orderbook: number
}

const CONFIGS: Record<ThrottleMode, ThrottleConfig> = {
  performance: { candles: 0, ticker: 0, orderbook: 0 },
  balanced: { candles: 500, ticker: 250, orderbook: 250 },
  'energy-saver': { candles: 2000, ticker: 1000, orderbook: 1000 },
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
   */
  wrap<T>(
    streamType: 'candles' | 'ticker' | 'orderbook',
    callback: (data: T) => void,
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
