// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three things ccxt's KuCoin class does that the bridge cannot live with,
 * fixed by subclassing rather than by patching an instance — `loadExchangeClass`
 * is the venue's own seam, the overrides are then part of the class the exchange
 * host constructs, and `super.*` keeps ccxt's own logic intact.
 *
 * 1. **Pan-left paging.** `fetchSpotOHLCV` has no `until`. Passing `startAt`/
 *    `endAt` through `params` does reach the wire (they win the `extend`), but
 *    ccxt has already computed `since = now - limit·duration` for its own
 *    `filterBySinceLimit`, so a page of older candles is fetched and then
 *    filtered to nothing. Measured: the request returned 50 rows, ccxt returned
 *    0. The fix is to translate `until` into the `since` ARGUMENT, which ccxt
 *    then uses for both the request window and the filter.
 * 2. **Margin symbols on `loadMarkets`.** `fetchMarkets` calls
 *    `privateGetMarginSymbols` + `privateGetIsolatedSymbols` whenever
 *    credentials are set, gated on `params.marginables` — a params-only flag, so
 *    `options` cannot reach it and neither can the markets provider, which calls
 *    `loadMarkets(true)` with no params. Pairlens trades spot; those two signed
 *    requests are pure cost.
 * 3. **The bullet URL is cached forever.** `negotiate()` memoizes the negotiated
 *    `wss://…?token=…` in `options.urls[connectId]` and only ever deletes it
 *    when the negotiation itself throws. Once the token expires and the socket
 *    dies, every reconnect dials the same dead URL — a permanent loop, because
 *    ccxt's client cache is keyed by that URL too. The exchange host discards
 *    the whole instance on a liveness/wake/region restart, which clears it; what
 *    it does not cover is a plain socket drop, where the instance survives and
 *    the watch loop simply re-enters. So: if the cached URL has no client left
 *    in `exchange.clients`, ccxt has already buried that socket — drop the
 *    memo and negotiate a fresh token.
 *
 * The overrides are class FIELDS holding arrow functions rather than methods.
 * That is not a style choice: `CcxtExchangeLike` models ccxt's surface as
 * properties (it is a structural stand-in for a package that ships no usable
 * declarations on the deep subpaths), and TypeScript refuses to let a method
 * override a base member typed as a property.
 */

import type { CcxtExchangeCtor, CcxtExchangeLike } from '../types'

/** The extra ccxt surface these overrides reach for. */
type KucoinBase = CcxtExchangeLike & {
  clients?: Record<string, unknown>
  parseTimeframe: (timeframe: string) => number
  fetchMarkets: (params?: Record<string, unknown>) => Promise<unknown>
  negotiate: (
    privateChannel: boolean,
    isFuturesMethod?: boolean,
    params?: Record<string, unknown>,
  ) => Promise<string | undefined>
}

type KucoinBaseCtor = new (config: Record<string, unknown>) => KucoinBase

/**
 * Translate a `params.until` cursor into the `since` argument KuCoin actually
 * honors. Exported for the unit test — the arithmetic is the whole fix.
 *
 * `until` is already exclusive (the caller nudges with `pageEndMs`), and ccxt
 * derives `endAt = since + limit·duration`, so handing back exactly that window
 * puts the boundary bar just outside the page.
 */
export function kucoinPagedSince(
  until: number,
  limit: number,
  timeframeSeconds: number,
): number {
  return until - limit * timeframeSeconds * 1000
}

/** Default page size when a paged read arrives without one (ccxt's spot cap). */
const KUCOIN_MAX_LIMIT = 1500

export function withKucoinQuirks(Base: CcxtExchangeCtor): CcxtExchangeCtor {
  class KucoinBridge extends (Base as KucoinBaseCtor) {
    /** Dead socket URLs already re-negotiated — bounds the invalidation. */
    readonly #retiredWsUrls = new Set<string>()

    override fetchMarkets = async (
      params: Record<string, unknown> = {},
    ): Promise<unknown> => {
      return await super.fetchMarkets({ marginables: false, ...params })
    }

    override fetchOHLCV = async (
      symbol: string,
      timeframe = '1m',
      since?: number,
      limit?: number,
      params: Record<string, unknown> = {},
    ): ReturnType<CcxtExchangeLike['fetchOHLCV']> => {
      const until = params['until']
      if (typeof until !== 'number' || since !== undefined) {
        return await super.fetchOHLCV(symbol, timeframe, since, limit, params)
      }
      const { until: _cursor, ...rest } = params
      const count = limit ?? KUCOIN_MAX_LIMIT
      const start = kucoinPagedSince(
        until,
        count,
        this.parseTimeframe(timeframe),
      )
      return await super.fetchOHLCV(symbol, timeframe, start, count, rest)
    }

    override negotiate = async (
      privateChannel: boolean,
      isFuturesMethod = false,
      params: Record<string, unknown> = {},
    ): Promise<string | undefined> => {
      await this.#dropRetiredUrl(privateChannel, isFuturesMethod)
      return await super.negotiate(privateChannel, isFuturesMethod, params)
    }

    async #dropRetiredUrl(
      privateChannel: boolean,
      isFuturesMethod: boolean,
    ): Promise<void> {
      const cache = this.options['urls'] as
        | Record<string, Promise<string | undefined> | undefined>
        | undefined
      if (!cache) return
      const connectId =
        (privateChannel ? 'private' : 'public') +
        (isFuturesMethod ? 'Futures' : '')
      const pending = cache[connectId]
      if (pending === undefined) return

      const url = await Promise.resolve(pending).catch(() => undefined)
      if (url === undefined) return
      // ccxt removes a client from `clients` the moment its socket errors or
      // closes, so a memoized URL with no client behind it is a socket ccxt has
      // already given up on.
      if (this.clients?.[url] !== undefined) return
      if (this.#retiredWsUrls.has(url)) return
      this.#retiredWsUrls.add(url)
      // Only clear the entry we actually inspected: a concurrent subscriber may
      // already have negotiated a replacement while we were awaiting.
      if (cache[connectId] === pending) delete cache[connectId]
    }
  }

  return KucoinBridge as unknown as CcxtExchangeCtor
}
