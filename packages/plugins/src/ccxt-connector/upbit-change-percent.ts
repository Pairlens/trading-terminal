// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * ccxt reports Upbit's 24 h change as a FRACTION. Scale it to a percent.
 *
 * `Ticker.percentage` is a percent everywhere else in ccxt's unified shape —
 * that is the whole reason the bridge's parser trusts it and refuses to
 * multiply. Upbit's `parseTicker` breaks the rule: `upbit.js:772` assigns
 * `'percentage': this.safeString(ticker, 'signed_change_rate')`, and
 * `signed_change_rate` is Upbit's rate, not its percent — a payload reading
 * `-0.0061453136` means -0.61%, and both the REST and the WS ticker take that
 * same path.
 *
 * Measured on `sg-api.upbit.com`, 2026-08-11: the bulk snapshot returned
 * `{"symbol":"BTC-SGD","change24h":-0.001640581}` against a real 24 h move of
 * -0.16%, and the streaming ticker returned `0.0166674566` for +1.67%. A
 * hundred-fold understatement reads as a flat market on every surface that
 * shows a change — the watchlist, the multi-price pane, the markets scanner,
 * and the copilot's "what moved today".
 *
 * Fixed here rather than in the shared parser: the parser's contract is
 * "ccxt already normalized this", which holds for the other thirteen venues,
 * and a venue-specific branch in it would be the wrong place to notice when
 * ccxt fixes Upbit upstream. If they do, this file's test starts describing a
 * double-scale and the wrapper comes off.
 */

import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'
import type { TickerSnapshot } from '@pairlens/market-engine/types'
import type { BulkTickerEntry } from '@pairlens/shared/instrument-types'

/** Rate → percent for a streamed ticker frame. */
export function scaleTickerChange(payload: unknown): unknown {
  const frame = payload as { type?: string; ticker?: TickerSnapshot } | null
  const ticker = frame?.ticker
  if (!ticker || typeof ticker.change24h !== 'number') return payload
  return { ...frame, ticker: { ...ticker, change24h: ticker.change24h * 100 } }
}

/** Rate → percent for every row of a bulk snapshot. */
export function scaleSnapshotChange(result: unknown): unknown {
  const snapshot = result as { tickers?: Array<BulkTickerEntry> } | null
  if (!snapshot || !Array.isArray(snapshot.tickers)) return result
  return {
    ...snapshot,
    tickers: snapshot.tickers.map((row) => ({
      ...row,
      change24h: row.change24h * 100,
    })),
  }
}

/** Wrap a connector so its 24 h change is a percent, like every other venue. */
export function withPercentChange24h(base: PluginInstance): PluginInstance {
  async function execute(params: PluginExecuteParams): Promise<unknown> {
    const result = await base.execute(params)
    return params.capability === 'market-data:ticker-snapshot'
      ? scaleSnapshotChange(result)
      : result
  }

  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    if (params.capability !== 'market-data:ticker') {
      return base.subscribe?.(params, callback) ?? (() => {})
    }
    return (
      base.subscribe?.(params, (data) => callback(scaleTickerChange(data))) ??
      (() => {})
    )
  }

  return { ...base, execute, subscribe }
}
