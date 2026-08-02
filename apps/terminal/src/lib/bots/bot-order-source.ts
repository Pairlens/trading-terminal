// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The seam between the bot runtime and React.
 *
 * The runtime is a plain module — it outlives any component, runs off a
 * WebSocket callback, and must never depend on a render. But everything it
 * needs to touch the market (order routing, history paging, cached prices)
 * lives behind the market data provider's hooks. So the provider *installs*
 * itself here on mount and detaches on unmount, exactly like
 * `setIndicatorHistorySource` does for Python indicators.
 *
 * Detaching matters as much as attaching: with no source the runtime refuses
 * to trade rather than reaching for a stale closure over a torn-down provider.
 */
import type { Candle, OrderResult } from '@pairlens/market-engine/types'

/** Everything the runtime can ask the app to do on its behalf. */
export type BotOrderSource = {
  /**
   * Route a real order. This is the app's *guarded* order path — it runs the
   * risk-config checks and can THROW (orders locked, position cap) as well as
   * return `{ success: false }`. Callers must handle both.
   */
  placeOrder: (params: Record<string, unknown>) => Promise<OrderResult>
  /** One page of candles, ending strictly before `endTs` when given. */
  fetchHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
    endTs?: number,
  ) => Promise<Array<Candle>>
  /**
   * Last price the app already has cached for this market/pair, or null.
   *
   * Read-only by design: a bot must never open a ticker stream of its own just
   * to mark a position. The runtime's own candle stream is the primary price
   * source; this only fills gaps (e.g. valuing equity in another currency).
   */
  getLastPrice: (market: string, pair: string) => number | null
}

let source: BotOrderSource | null = null

/**
 * Point the bot runtime at the app's market data provider. Passing null
 * detaches it, which stops the runtime from placing any further orders.
 */
export function setBotOrderSource(next: BotOrderSource | null): void {
  source = next
}

/** The installed source, or null when no provider is mounted. */
export function getBotOrderSource(): BotOrderSource | null {
  return source
}
