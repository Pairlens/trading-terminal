// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * MEXC's three ccxt-side hazards, fixed by subclassing.
 *
 * 1. **The protobuf decoder loads asynchronously and nobody awaits it.**
 *    MEXC's entire spot WS is binary Protobuf. ccxt does not import the decoder
 *    at module load; the base `Exchange` constructor kicks off
 *    `loadExchangeSpecificFiles()` — `if (this.id === 'mexc') await
 *    import('../protobuf/mexc/compiled.cjs')` — as a fire-and-forget promise
 *    inside a swallowing try/catch. A binary frame that lands before that import
 *    settles hits `decodeProtoMsg`'s guard and throws `NotSupported`, which in
 *    the watch loop reads as a connection fault and costs a full backoff. Under
 *    bun the window is a few milliseconds; in a Vite/Rollup build it is a chunk
 *    fetch, which is exactly the moment the first subscribe happens.
 *
 *    So every `watch*` awaits readiness first. Readiness is probed rather than
 *    imported: the module-scope `protobufMexc` binding lives inside ccxt's
 *    `Exchange.js` and is not observable, but `decodeProtoMsg` throws a
 *    distinguishable error while it is unset — so a decode of an empty buffer
 *    answers the question with no coupling to ccxt's file layout, which the
 *    patched `./js/src/*.js` export map could not reach anyway (the decoder is
 *    a `.cjs`).
 *
 *    A fixed sleep was the alternative and is worse: too short in a cold
 *    browser, pure latency everywhere else.
 *
 *    NOTE: this only works because `protobufjs` is now a real dependency of
 *    `packages/plugins`. ccxt declares it as an OPTIONAL peer, so before that it
 *    was simply absent and every MEXC spot channel was dead — silent at
 *    construction, `NotSupported` on the first frame.
 *
 * 2. **The spot ticker is top-of-book only.** ccxt subscribes `watchTicker` to
 *    `aggre.bookTicker`, so `last`, `high`, `low`, `volume` and `percentage` all
 *    come back 0 — a chart header pinned at zero. The 24 h channel
 *    (`public.miniTicker.v3.api.pb`, what the native uses) is subscribable but
 *    its protobuf frames have no branch in ccxt's `handleProtobufMessage`, so
 *    they decode and vanish. Both halves are fixed below.
 *
 * 3. **`fetchMarkets` always fetches swap too.** Unlike okx/binance/bybit,
 *    MEXC's `fetchMarkets` ignores `options.fetchMarkets.types` and
 *    unconditionally awaits `fetchSpotMarkets` *and* `fetchSwapMarkets`
 *    (measured: 3 205 markets instead of 2 119). Pairlens is spot-only and the
 *    markets cache drops every non-spot row anyway, so the contract call is pure
 *    cost on every cold load.
 *
 * The overrides are class FIELDS holding arrow functions rather than methods:
 * `CcxtExchangeLike` models ccxt's surface as properties, and TypeScript refuses
 * to let a method override a base member typed as a property.
 */

import type { CcxtExchangeCtor, CcxtExchangeLike } from '../types'

/** How long to wait for the decoder before giving up and trying anyway. */
const PROTOBUF_READY_TIMEOUT_MS = 10_000
const PROTOBUF_POLL_MS = 10

const MINI_TICKER_CHANNEL_ID = 'public.miniTicker.v3.api.pb'

/**
 * `UTC+0` matches the native connector's channel exactly.
 *
 * The zone is not cosmetic: the frame's `rate` is the change since that zone's
 * midnight, NOT a rolling 24 h (measured 00:37 UTC — `rate` -0.49 % against a
 * rolling -1.56 % on the same pair at KuCoin and Gate, while `high`/`low` in the
 * same frame ARE the rolling figures). The native has always reported the zoned
 * number, so the bridge does too rather than quietly changing what the Multi-
 * Price pane shows for MEXC.
 */
function miniTickerChannel(marketId: string): string {
  return `spot@${MINI_TICKER_CHANNEL_ID}@${marketId}@UTC+0`
}

/**
 * A decoded `publicMiniTicker` → the ccxt unified ticker fields the bridge's
 * parser reads. Exported for the unit test; the units are the whole point.
 *
 * - `price` is the last trade, `quantity` the 24 h BASE volume and `volume` the
 *   quote volume — MEXC's naming is the other way round from ccxt's.
 * - `rate` is a FRACTION (-0.0049), and the app's contract is a percent.
 * - `bid`/`ask` are absent from this channel; leaving them undefined makes the
 *   bridge emit 0, which the validator reads as "not provided". The native
 *   emits 0 here too.
 */
export function parseMexcMiniTicker(
  raw: Record<string, unknown>,
  symbol: string,
  sendTime: number,
): Record<string, unknown> {
  const timestamp =
    Number.isFinite(sendTime) && sendTime > 0 ? sendTime : undefined
  const rate = Number(raw['rate'])
  return {
    symbol,
    timestamp,
    last: raw['price'],
    close: raw['price'],
    high: raw['high'],
    low: raw['low'],
    baseVolume: raw['quantity'],
    quoteVolume: raw['volume'],
    percentage: Number.isFinite(rate) ? rate * 100 : undefined,
    info: raw,
  }
}

/** The extra ccxt surface these overrides reach for. */
type MexcBase = CcxtExchangeLike & {
  decodeProtoMsg: (data: Uint8Array) => unknown
  tickers?: Record<string, unknown>
  safeMarket: (marketId?: string) => Record<string, unknown>
  safeTicker: (
    ticker: Record<string, unknown>,
    market?: Record<string, unknown>,
  ) => Record<string, unknown>
  watchSpotPublic: (
    channel: string,
    messageHash: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  handleProtobufMessage: (client: unknown, message: unknown) => boolean
  fetchSwapMarkets: (params?: Record<string, unknown>) => Promise<unknown>
}

type MexcBaseCtor = new (config: Record<string, unknown>) => MexcBase

/**
 * True once ccxt's MEXC protobuf decoder has finished loading.
 *
 * `decodeProtoMsg` throws `NotSupported: … requires protobuf …` while the
 * dynamic import is still in flight; once it lands, decoding an empty buffer is
 * a no-op. Any OTHER error means the decoder is present and merely unhappy with
 * the input, which is also "ready".
 */
export function isMexcProtobufReady(exchange: {
  decodeProtoMsg: (data: Uint8Array) => unknown
}): boolean {
  try {
    exchange.decodeProtoMsg(new Uint8Array(0))
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return !message.includes('requires protobuf')
  }
}

export function withMexcQuirks(Base: CcxtExchangeCtor): CcxtExchangeCtor {
  class MexcBridge extends (Base as MexcBaseCtor) {
    #protobufReady: Promise<void> | null = null

    /** Spot only — see the header. */
    override fetchSwapMarkets = async (): Promise<unknown> => []

    override watchOHLCV = async (
      symbol: string,
      timeframe?: string,
      since?: number,
      limit?: number,
      params?: Record<string, unknown>,
    ): ReturnType<CcxtExchangeLike['watchOHLCV']> => {
      await this.#whenProtobufReady()
      return await super.watchOHLCV(symbol, timeframe, since, limit, params)
    }

    override watchOrderBook = async (
      symbol: string,
      limit?: number,
      params?: Record<string, unknown>,
    ): ReturnType<CcxtExchangeLike['watchOrderBook']> => {
      await this.#whenProtobufReady()
      return await super.watchOrderBook(symbol, limit, params)
    }

    override watchTrades = async (
      symbol: string,
      since?: number,
      limit?: number,
      params?: Record<string, unknown>,
    ): ReturnType<CcxtExchangeLike['watchTrades']> => {
      await this.#whenProtobufReady()
      return await super.watchTrades(symbol, since, limit, params)
    }

    /**
     * ccxt's spot `watchTicker` subscribes to `aggre.bookTicker`, which carries
     * ONLY the top of book — every other field of the unified ticker comes back
     * 0 (measured: `last=0 high=0 low=0 volume=0 change=0`, bid/ask live). The
     * terminal's price readout reads `last`, so that is a chart header pinned
     * at zero.
     */
    override watchTicker = async (
      symbol: string,
      params: Record<string, unknown> = {},
    ): ReturnType<CcxtExchangeLike['watchTicker']> => {
      await this.#whenProtobufReady()
      const market = await this.#spotMarket(symbol)
      if (!market) return await super.watchTicker(symbol, params)
      return await this.watchSpotPublic(
        miniTickerChannel(market['id'] as string),
        `ticker:${market['symbol'] as string}`,
        params,
      )
    }

    override unWatchTicker = async (
      symbol: string,
      params: Record<string, unknown> = {},
    ): Promise<unknown> => {
      const market = await this.#spotMarket(symbol)
      if (!market) return await super.unWatchTicker?.(symbol)
      // `unsubscribed` is how ccxt's own unWatch* flips the frame to
      // UNSUBSCRIPTION; the channel has to match the one we subscribed with or
      // the venue is asked to drop a topic nobody opened.
      return await this.watchSpotPublic(
        miniTickerChannel(market['id'] as string),
        `unsubscribe:ticker:${market['symbol'] as string}`,
        { ...params, unsubscribed: true },
      )
    }

    /**
     * The 24 h ticker channel is subscribable but its protobuf frames have no
     * branch in ccxt's dispatcher, so they decode and vanish (verified: the
     * watch never resolves). Route them; leave every other channel to ccxt.
     */
    override handleProtobufMessage = (
      client: unknown,
      message: unknown,
    ): boolean => {
      const frame = (message ?? {}) as Record<string, unknown>
      const channel = String(frame['channel'] ?? '')
      if (channel.split('@')[1] === MINI_TICKER_CHANNEL_ID) {
        this.#resolveMiniTicker(client, frame)
        return true
      }
      return super.handleProtobufMessage(client, message)
    }

    #resolveMiniTicker(client: unknown, frame: Record<string, unknown>): void {
      const raw = frame['publicMiniTicker']
      if (!raw || typeof raw !== 'object') return
      const market = this.safeMarket(String(frame['symbol'] ?? ''))
      const symbol = market['symbol']
      if (typeof symbol !== 'string') return
      const ticker = this.safeTicker(
        parseMexcMiniTicker(
          raw as Record<string, unknown>,
          symbol,
          Number(frame['sendTime'] ?? 0),
        ),
        market,
      )
      if (this.tickers) this.tickers[symbol] = ticker
      ;(client as { resolve: (value: unknown, hash: string) => void }).resolve(
        ticker,
        `ticker:${symbol}`,
      )
    }

    /** The spot market for `symbol`, or null when it is not a spot market. */
    async #spotMarket(symbol: string): Promise<Record<string, unknown> | null> {
      if (this.markets === undefined) await this.loadMarkets()
      const market = this.market(symbol)
      return market['spot'] === true ? market : null
    }

    #whenProtobufReady(): Promise<void> {
      if (isMexcProtobufReady(this)) return Promise.resolve()
      this.#protobufReady ??= this.#pollProtobuf().finally(() => {
        this.#protobufReady = null
      })
      return this.#protobufReady
    }

    async #pollProtobuf(): Promise<void> {
      const deadline = Date.now() + PROTOBUF_READY_TIMEOUT_MS
      while (!isMexcProtobufReady(this) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, PROTOBUF_POLL_MS))
      }
      // Past the deadline we proceed regardless: a loud NotSupported in the
      // watch loop is a better signal than a subscribe that never returns.
    }
  }

  return MexcBridge as unknown as CcxtExchangeCtor
}
