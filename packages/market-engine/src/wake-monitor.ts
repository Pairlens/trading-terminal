// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * WakeMonitor — reports that the host was suspended and has resumed, or that
 * network connectivity came back.
 *
 * Closing a laptop lid freezes the process: timers stop, and the TCP
 * connections under every open WebSocket are torn down by the peer without the
 * local end ever seeing a FIN or RST. On resume the socket is still
 * `readyState === OPEN` over dead plumbing — a half-open socket that will never
 * deliver another byte and, crucially, never fires `close`. Every reconnect
 * path keyed off the close event therefore does nothing, and the app sits on
 * frozen prices until something forces a write that finally makes the OS give
 * up on the connection. Nothing in the WebSocket API reports this state, so it
 * has to be inferred.
 *
 * A repeating timer is the reliable cross-platform probe: a tick scheduled
 * `tickMs` ahead that actually arrives `thresholdMs` late means the process was
 * frozen for roughly that long. This behaves identically in the browser, the
 * Tauri webview, and Bun (the CLI), and needs no native sleep/wake hooks.
 *
 * Deliberately NOT keyed off `visibilitychange`: backgrounding a window is not
 * a suspend, and tearing down healthy sockets on every tab switch would cost
 * far more than the bug this fixes.
 */

export type WakeReason = 'resume' | 'online'

export type WakeEvent = {
  reason: WakeReason
  /** For 'resume', how long the process was frozen. 0 for 'online'. */
  gapMs: number
}

export type WakeListener = (event: WakeEvent) => void

/** The slice of WakeMonitor consumers depend on — injectable in tests. */
export type WakeSource = {
  subscribe: (listener: WakeListener) => () => void
}

export type WakeMonitorOptions = {
  /** How often to check the clock. */
  tickMs?: number
  /** Lateness beyond which a tick counts as a resume rather than timer slop. */
  thresholdMs?: number
  now?: () => number
  /**
   * Network-restored source. Defaults to the global `online` event; returning
   * null (the default outside a DOM) simply disables that trigger.
   */
  subscribeOnline?: (handler: () => void) => (() => void) | null
}

const DEFAULT_TICK_MS = 1_000
// Well above any plausible event-loop stall, well below the ~30s it takes a
// quiet market to look suspicious. A false positive costs one reconnect.
const DEFAULT_THRESHOLD_MS = 20_000

export class WakeMonitor {
  private listeners = new Set<WakeListener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private stopOnline: (() => void) | null = null
  private lastTickAt = 0

  constructor(private readonly opts: WakeMonitorOptions = {}) {}

  /**
   * Register a listener. The clock probe runs only while at least one listener
   * is registered, so a process that holds no sockets holds no timer either.
   */
  subscribe(listener: WakeListener): () => void {
    this.listeners.add(listener)
    this.start()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stop()
    }
  }

  private start(): void {
    if (this.timer) return
    const now = this.opts.now ?? Date.now
    this.lastTickAt = now()

    const timer = setInterval(
      () => this.tick(),
      this.opts.tickMs ?? DEFAULT_TICK_MS,
    )
    // Never be the reason a CLI process stays alive. No-op in browsers.
    const unrefable = timer as unknown as { unref?: () => void }
    unrefable.unref?.()
    this.timer = timer

    const handler = () => this.notify({ reason: 'online', gapMs: 0 })
    this.stopOnline = this.opts.subscribeOnline
      ? this.opts.subscribeOnline(handler)
      : subscribeGlobalOnline(handler)
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.stopOnline?.()
    this.stopOnline = null
  }

  private tick(): void {
    const now = (this.opts.now ?? Date.now)()
    const gapMs = now - this.lastTickAt
    this.lastTickAt = now
    if (gapMs >= (this.opts.thresholdMs ?? DEFAULT_THRESHOLD_MS)) {
      this.notify({ reason: 'resume', gapMs })
    }
  }

  private notify(event: WakeEvent): void {
    // Snapshot: a listener may unsubscribe itself while handling the event.
    for (const listener of [...this.listeners]) listener(event)
  }
}

function subscribeGlobalOnline(handler: () => void): (() => void) | null {
  if (typeof globalThis.addEventListener !== 'function') return null
  globalThis.addEventListener('online', handler)
  return () => globalThis.removeEventListener('online', handler)
}

/** Shared monitor — one clock probe for every session in the process. */
export const wakeMonitor = new WakeMonitor()
