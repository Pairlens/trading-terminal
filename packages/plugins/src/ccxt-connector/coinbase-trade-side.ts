// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Coinbase reports the MAKER's side on `market_trades`. Flip it.
 *
 * `Trade.side` in Pairlens is the aggressor — the taker who crossed the spread
 * — because that is what the tape, the delta ribbon and the copilot's flow
 * reads all mean by "buy". Coinbase is the only venue in the fleet that names
 * the resting order instead, it is not documented as doing so, and ccxt's
 * `parseTrade` passes the field through unchanged (`coinbase.js:1316`), so the
 * inversion the native connector applies has to be re-applied here.
 *
 * Measured against ccxt's unified trades before this file was written, the
 * same way the native's was: classify each print from a concurrently
 * maintained top-of-book (at/above the ask = a buyer crossed, at/below the bid
 * = a seller did), skip prints inside the spread, and compare.
 *
 *   BTC/USD, 160 s, 519 classifiable prints of 525 (6 inside the spread)
 *   ccxt's side as-is       11.9% agreement with the aggressor
 *   ccxt's side inverted    88.1% agreement
 *
 * The 11.9% reproduces the native's 11% almost exactly, on ccxt's unified
 * payload rather than the raw frame — ccxt inherits the venue's convention
 * here, it does not normalize it. (The residual on both sides is the usual
 * noise: a print classified against a book state one frame stale.)
 *
 * The wrapper sits UNDER the derived-candle decorator, so the candle
 * aggregator and the terminal's tape both read corrected sides. Everything
 * other than `market-data:trades` passes straight through.
 */

import type {
  PluginExecuteParams,
  PluginInstance,
} from '@pairlens/plugin-system/types'
import type { Trade } from '@pairlens/market-engine/types'

/** Flip one frame's sides, leaving the frame's shape untouched. */
export function invertTradeSides(payload: unknown): unknown {
  const frame = payload as { type?: string; trades?: Array<Trade> } | null
  if (!frame || !Array.isArray(frame.trades)) return payload
  return {
    ...frame,
    trades: frame.trades.map((trade) => ({
      ...trade,
      side: trade.side === 'buy' ? ('sell' as const) : ('buy' as const),
    })),
  }
}

/** Wrap a connector so its `market-data:trades` frames name the aggressor. */
export function withAggressorTradeSides(base: PluginInstance): PluginInstance {
  function subscribe(
    params: PluginExecuteParams,
    callback: (data: unknown) => void,
  ): () => void {
    if (params.capability !== 'market-data:trades') {
      return base.subscribe?.(params, callback) ?? (() => {})
    }
    return (
      base.subscribe?.(params, (data) => callback(invertTradeSides(data))) ??
      (() => {})
    )
  }

  return { ...base, subscribe }
}
