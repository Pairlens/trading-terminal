// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Staleness tracker for live data streams.
//
// A market-data stream can look "connected" at the socket level while no data
// is actually arriving (silent stall). This tracks the last time data was seen
// and reports staleness once a threshold elapses. It is data-staleness, not a
// connection probe: a genuinely idle (illiquid) market may legitimately go
// quiet, so consumers should choose a conservative threshold and treat `stale`
// as "no recent market activity" rather than "disconnected".

export class StalenessTracker {
  private lastActivityMs = 0

  /** Record that data arrived at `nowMs` (epoch ms). */
  mark(nowMs: number): void {
    this.lastActivityMs = nowMs
  }

  /** Whether any activity has been recorded yet. */
  hasActivity(): boolean {
    return this.lastActivityMs > 0
  }

  /**
   * True when data has been seen before but not within `thresholdMs`.
   * Returns false before the first activity (nothing to be stale about yet).
   */
  isStale(nowMs: number, thresholdMs: number): boolean {
    return this.lastActivityMs > 0 && nowMs - this.lastActivityMs > thresholdMs
  }

  /** Forget activity (e.g. on resubscribe). */
  reset(): void {
    this.lastActivityMs = 0
  }
}
