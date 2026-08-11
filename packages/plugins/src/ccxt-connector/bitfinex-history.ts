// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitfinex's `sort` trap, patched onto the instance.
 *
 * `GET /v2/candles/.../hist` walks history from whichever END `sort` names,
 * and ccxt hardcodes `sort: 1` — oldest first — into the request
 * (`bitfinex.js`, `fetchOHLCV`). With no `start`/`end` that means the walk
 * begins at PAIR INCEPTION, so a plain "give me the last 300 hourly candles"
 * comes back as the first 300 hours Bitfinex ever recorded for the pair.
 *
 * Measured, before this patch: a 300-bar 1h request for BTC/USDT returned
 * 2019-03-11 → 2019-04-03 at a close of 4962, and the chart drew it as the
 * present. Nothing downstream can catch that — the candles are ascending,
 * millisecond-stamped, internally consistent and pass every validator; they
 * are simply seven years old. The next pan-left page then came back EMPTY,
 * which latches `exhausted` and ends paging for the session.
 *
 * The native connector documents the same trap and pins `sort=-1`
 * (`bitfinex-market-connector/rest-client.ts:7-11`). This restores that:
 * newest-first on the wire, and ccxt's own `parseOHLCVs` sorts the page back
 * into ascending order before it returns, so callers see no difference.
 *
 * A caller that passes its own `sort` keeps it — the override is a default,
 * not a policy.
 */

import type { CcxtExchangeCtor, CcxtExchangeLike, CcxtOhlcvRow } from './types'

const INSTALLED = Symbol.for('pairlens.bitfinex.history-order')

type BitfinexInternals = CcxtExchangeLike & { [INSTALLED]?: boolean }

/** Wrap `ccxt.pro.bitfinex` so every instance reads history from the right end. */
export function withBitfinexHistoryOrder(
  Base: CcxtExchangeCtor,
): CcxtExchangeCtor {
  function BitfinexOrdered(config: Record<string, unknown>): CcxtExchangeLike {
    const exchange = new Base(config)
    installBitfinexHistoryOrder(exchange)
    return exchange
  }
  return BitfinexOrdered as unknown as CcxtExchangeCtor
}

/** Patch `fetchOHLCV` on one instance. Idempotent. */
export function installBitfinexHistoryOrder(exchange: CcxtExchangeLike): void {
  const target = exchange as BitfinexInternals
  if (target[INSTALLED]) return
  target[INSTALLED] = true

  const original = exchange.fetchOHLCV.bind(exchange)
  exchange.fetchOHLCV = (
    symbol: string,
    timeframe = '1m',
    since?: number,
    limit?: number,
    params: Record<string, unknown> = {},
  ): Promise<Array<CcxtOhlcvRow>> => {
    // `since` means the caller really does want to walk forwards from a point
    // in time, which is what `sort: 1` is for.
    if (since !== undefined || params['sort'] !== undefined) {
      return original(symbol, timeframe, since, limit, params)
    }
    return original(symbol, timeframe, since, limit, { ...params, sort: -1 })
  }
}
