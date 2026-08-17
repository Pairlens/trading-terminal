// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Venue wiring, and the venue-local ccxt defects the modules repair.
 *
 * The manifest assertions are not decoration. `requiresDesktop`,
 * `credentialAlias` and `timeframes` are each read by a different terminal
 * surface, each one silently degrades when wrong (a venue that looks ordinary
 * until the chart refuses, a credential the user is asked to enter twice, a
 * timeframe that draws nothing and blames the network), and none of the three
 * can be observed from a passing unit test of the runtime.
 */

import { describe, expect, it } from 'bun:test'
import { GeoRestrictedError } from '@pairlens/market-engine/errors'
import { pluginFamilyOf } from '@pairlens/shared/plugin-families'
import { parseCcxtTicker } from '../../ccxt-connector/parser'
import {
  BINANCE_FUTURES_ADAPTER_INFO,
  binanceFuturesCcxtVenue,
  binanceFuturesMarketConnectorManifest,
} from '../venues/binance-futures'
import {
  KUCOIN_FUTURES_ADAPTER_INFO,
  fetchKucoinFuturesSeedTicker,
  kucoinFuturesCcxtVenue,
  kucoinFuturesMarketConnectorManifest,
  patchKucoinFuturesTicker,
} from '../venues/kucoin-futures'
import {
  KRAKEN_FUTURES_ADAPTER_INFO,
  krakenFuturesCandleWindow,
  krakenFuturesCcxtVenue,
  krakenFuturesMarketConnectorManifest,
  patchKrakenFutures,
  repairKrakenFuturesWsTicker,
} from '../venues/kraken-futures'
import type { PluginManifest } from '@pairlens/plugin-system/types'

const VENUES = [
  {
    label: 'binance-futures',
    manifest: binanceFuturesMarketConnectorManifest,
    venue: binanceFuturesCcxtVenue,
    info: BINANCE_FUTURES_ADAPTER_INFO,
  },
  {
    label: 'kucoin-futures',
    manifest: kucoinFuturesMarketConnectorManifest,
    venue: kucoinFuturesCcxtVenue,
    info: KUCOIN_FUTURES_ADAPTER_INFO,
  },
  {
    label: 'kraken-futures',
    manifest: krakenFuturesMarketConnectorManifest,
    venue: krakenFuturesCcxtVenue,
    info: KRAKEN_FUTURES_ADAPTER_INFO,
  },
] as const

function capability(manifest: PluginManifest, id: string) {
  return manifest.capabilities.find((entry) => entry.id === id)
}

for (const { label, manifest, venue, info } of VENUES) {
  describe(`${label} manifest`, () => {
    it('stamps the family and asset class the Store and the picker group by', () => {
      expect(manifest.metadata?.['family']).toBe('cex-futures')
      expect(manifest.metadata?.['assetClass']).toBe('crypto-perp')
      expect(pluginFamilyOf(manifest)).toBe('cex-futures')
    })

    it('agrees with its venue config and adapter info on identity', () => {
      expect(manifest.id).toBe(`${venue.marketId}-market-connector`)
      expect(info.marketId).toBe(venue.marketId)
      expect(info.displayName).toBe(venue.displayName)
      expect(info.assetClasses).toEqual(['crypto-perp'])
    })

    it('publishes an explicit timeframe list matching the adapter info', () => {
      const timeframes = manifest.metadata?.['timeframes']
      expect(Array.isArray(timeframes)).toBe(true)
      expect(timeframes).toEqual(info.supportedTimeframes)
      expect((timeframes as Array<string>).length).toBeGreaterThan(0)
    })

    it('publishes the leverage ceiling the ticket clamps to', () => {
      expect(manifest.metadata?.['maxLeverage']).toBe(venue.maxLeverage)
      expect(info.maxLeverage).toBe(venue.maxLeverage)
    })

    it('stamps paperTrading: false exactly where the venue has no sandbox', () => {
      // The terminal reads this to decide whether a paper credential may be
      // fanned here at all — without it a paper slot initializes the connector
      // against the PRODUCTION host and only fails at the first order.
      expect(manifest.metadata?.['paperTrading']).toBe(
        venue.noPaperReason ? false : undefined,
      )
    })

    it('declares funding, market-scoped, with a settlement period behind it', () => {
      // Market-scoped rather than wildcard: the funding panes address venues by
      // name, and a wildcard declaration would make this venue a fallback
      // answer for a question about a different one. The period is what an
      // annualised rate divides by — Kraken settles hourly, and inheriting the
      // eight-hour default there would understate its carry eightfold.
      expect(capability(manifest, 'market-data:funding')).toMatchObject({
        markets: [venue.marketId],
        streaming: false,
      })
      expect(venue.fundingIntervalHours).toBeGreaterThan(0)
    })

    it('declares positions and a side-effecting order capability', () => {
      expect(capability(manifest, 'trading:positions')).toMatchObject({
        markets: [venue.marketId],
      })
      expect(capability(manifest, 'trading:orders')).toMatchObject({
        sideEffect: true,
      })
    })

    it('declares NO bulk ticker snapshot', () => {
      // The bulk row parser strips `:SETTLE`, so every perp would arrive as a
      // plausible-looking spot row and collide with the real one in the markets
      // scanner. The same bug the Crypto.com venue patch exists to prevent.
      expect(
        capability(manifest, 'market-data:ticker-snapshot'),
      ).toBeUndefined()
    })

    it('says desktop-only in both halves or in neither', () => {
      // The spec flag makes the CONNECTOR refuse; the manifest copy makes the
      // terminal SAY so. One without the other is a venue that looks ordinary
      // right up until the chart refuses.
      expect(manifest.metadata?.['requiresDesktop'] === true).toBe(
        venue.requiresDesktop === true,
      )
      expect(info.requiresDesktop === true).toBe(venue.requiresDesktop === true)
    })
  })
}

describe('per-venue platform and credential posture', () => {
  it('binance-futures is the one browser-capable venue', () => {
    // fapi.binance.com serves `access-control-allow-origin: *`; the KuCoin and
    // Kraken futures hosts send no origin header at all.
    expect(binanceFuturesCcxtVenue.requiresDesktop).toBeUndefined()
    expect(kucoinFuturesCcxtVenue.requiresDesktop).toBe(true)
    expect(krakenFuturesCcxtVenue.requiresDesktop).toBe(true)
  })

  it('aliases the two venues whose spot key also signs futures, and only those', () => {
    expect(
      binanceFuturesMarketConnectorManifest.metadata?.['credentialAlias'],
    ).toBe('binance')
    expect(
      kucoinFuturesMarketConnectorManifest.metadata?.['credentialAlias'],
    ).toBe('kucoin')
    // Kraken futures keys are minted separately and do not sign on spot.
    expect(
      krakenFuturesMarketConnectorManifest.metadata?.['credentialAlias'],
    ).toBeUndefined()
  })

  it('asks KuCoin for the passphrase its signature needs', () => {
    expect(kucoinFuturesCcxtVenue.credentialKeys.map((k) => k.key)).toEqual([
      'apiKey',
      'apiSecret',
      'passphrase',
    ])
    expect(KUCOIN_FUTURES_ADAPTER_INFO.credentialSchema).toHaveLength(3)
  })

  it('defaults KuCoin to live and carries the sentence a paper slot is refused with', () => {
    expect(kucoinFuturesCcxtVenue.defaultMode).toBe('live')
    expect(kucoinFuturesCcxtVenue.noPaperReason).toContain('no sandbox')
    // Both other venues have a real second environment.
    expect(binanceFuturesCcxtVenue.defaultMode).toBe('paper')
    expect(krakenFuturesCcxtVenue.defaultMode).toBe('paper')
    expect(binanceFuturesCcxtVenue.noPaperReason).toBeUndefined()
    expect(krakenFuturesCcxtVenue.noPaperReason).toBeUndefined()
  })

  it('refuses the US where the venue has no derivatives host to route to', () => {
    expect(() => binanceFuturesCcxtVenue.geoCheck?.('US', 'x')).toThrow(
      GeoRestrictedError,
    )
    expect(() => kucoinFuturesCcxtVenue.geoCheck?.('us', 'x')).toThrow(
      GeoRestrictedError,
    )
    expect(() => binanceFuturesCcxtVenue.geoCheck?.('DE', 'x')).not.toThrow()
  })

  it('points every instance at swap markets — the host defaults to spot', () => {
    for (const { venue } of VENUES) {
      const options = venue.options?.['options'] as Record<string, unknown>
      expect(options?.['defaultType']).toBe('swap')
    }
  })
})

describe('kraken-futures candle window', () => {
  it('leaves an unpaged read to ccxt, whose default is already right', () => {
    expect(krakenFuturesCandleWindow('1h', 300)).toEqual({})
  })

  it('nudges the cursor exclusive and sizes the window to exactly `limit` bars', () => {
    // The endpoint returns the bar sitting on the cursor, and one duplicated
    // boundary bar makes a page filter to empty — which the chart latches as
    // "no more history" for the session. ccxt also slices the response from the
    // FRONT, so a wider window would drop the newest bars.
    const window = krakenFuturesCandleWindow('1h', 10, 1_700_000_000_000)
    expect(window['to']).toBe(1_699_999_999)
    expect(window['from']).toBe(1_699_999_999 - 3600 * 10)
  })

  it('is what the venue config hands to fetchOHLCV', () => {
    expect(
      krakenFuturesCcxtVenue.historyParams?.({
        timeframe: '1h',
        limit: 10,
        endTs: 1_700_000_000_000,
      }),
    ).toEqual(krakenFuturesCandleWindow('1h', 10, 1_700_000_000_000))
  })
})

describe('kraken-futures WS ticker defects', () => {
  /** The `ticker` feed payload, trimmed to the fields that matter. */
  const FRAME = {
    product_id: 'PF_XBTUSD',
    time: 1_680_811_086_487,
    last: 28053.5,
    // A PERCENT, in a field ccxt treats as an absolute price delta.
    change: -0.7710945651981715,
    bid: 28060,
    ask: 28070,
    markPrice: 28064.92,
  }

  /** What ccxt's parseWsTicker + safeTicker actually produce from that. */
  function ccxtParsed(): Record<string, unknown> {
    const change = FRAME.change
    const close = FRAME.last
    const open = close - change
    return {
      symbol: 'BTC/USD:USD',
      // parse8601(safeString(ticker, 'lastTime')) — and there is no lastTime.
      timestamp: undefined,
      datetime: undefined,
      last: close,
      close,
      open,
      change,
      percentage: (change / open) * 100,
      bid: FRAME.bid,
      ask: FRAME.ask,
    }
  }

  it('stamps the timestamp from `time`, which is the field the feed sends', () => {
    const repaired = repairKrakenFuturesWsTicker(FRAME, ccxtParsed())
    expect(repaired['timestamp']).toBe(1_680_811_086_487)
    expect(repaired['datetime']).toBe(new Date(1_680_811_086_487).toISOString())
  })

  it('reads `change` as the percent it is, instead of ~280x too small', () => {
    const wrong = ccxtParsed()
    // The shipped behavior: -0.0027% where the venue means -0.77%.
    expect(Math.abs(wrong['percentage'] as number)).toBeLessThan(0.01)

    const repaired = repairKrakenFuturesWsTicker(FRAME, wrong)
    expect(repaired['percentage']).toBe(-0.7710945651981715)
  })

  it('recomputes the absolute change and the open so all three agree', () => {
    const repaired = repairKrakenFuturesWsTicker(FRAME, ccxtParsed())
    const absolute = repaired['change'] as number
    expect(absolute).toBeCloseTo((28053.5 * -0.7710945651981715) / 100, 6)
    expect(repaired['open']).toBeCloseTo(28053.5 - absolute, 6)
  })

  it('reaches the app as a percent through the shared normalizer', () => {
    const ticker = parseCcxtTicker(
      repairKrakenFuturesWsTicker(FRAME, ccxtParsed()),
    )
    expect(ticker.change24h).toBeCloseTo(-0.771, 3)
    expect(ticker.last).toBe(28053.5)
    expect(ticker.ts).toBe(1_680_811_086_487)
  })

  it('drops the absolute change rather than leaving a percent in its slot', () => {
    const priceless = { ...ccxtParsed(), last: undefined, close: undefined }
    const repaired = repairKrakenFuturesWsTicker(FRAME, priceless)
    expect(repaired['change']).toBeUndefined()
    expect(repaired['percentage']).toBe(-0.7710945651981715)
  })

  it('leaves a frame carrying neither field alone', () => {
    const parsed = { symbol: 'BTC/USD:USD', last: 1 }
    expect(
      repairKrakenFuturesWsTicker({ product_id: 'PF_XBTUSD' }, parsed),
    ).toEqual(parsed)
    expect(repairKrakenFuturesWsTicker(null, parsed)).toEqual(parsed)
  })

  it('is installed on the class, so no instance can exist without it', () => {
    class FakeKrakenFutures {
      constructor(_config: Record<string, unknown>) {}
      parseWsTicker(_ticker: unknown, _market?: unknown) {
        return ccxtParsed()
      }
    }
    const Patched = patchKrakenFutures(FakeKrakenFutures)
    const exchange = new Patched({})
    expect(exchange.parseWsTicker(FRAME)['percentage']).toBe(
      -0.7710945651981715,
    )
  })
})

describe('kraken-futures candle source', () => {
  it('never seeds the tape, because candles are folded from it', () => {
    // A REST page of historical prints would re-add its volume to the forming
    // bar. The other two venues stream candles natively and may seed.
    expect(krakenFuturesCcxtVenue.seedTrades).toBeUndefined()
    expect(binanceFuturesCcxtVenue.seedTrades).toBe(true)
    expect(kucoinFuturesCcxtVenue.seedTrades).toBe(true)
  })
})

describe('kucoin-futures ticker', () => {
  /**
   * `contracts/{symbol}` — the one endpoint that publishes the daily
   * statistics. `priceChgPct` is a FRACTION here, exactly as in ccxt's own
   * doc comment (`priceChgPct: 0.0447` against `priceChg: 2878.7`).
   */
  const CONTRACT_ROW = {
    symbol: 'XBTUSDTM',
    lastTradePrice: 67191.8,
    highPrice: 67737.3,
    lowPrice: 64041.6,
    volumeOf24h: 9998.54,
    turnoverOf24h: 659795309.25,
    priceChg: 2878.7,
    priceChgPct: 0.0447,
  }

  /** The WS `/contractMarket/ticker` frame: a last trade and top of book. */
  const WS_FRAME = {
    symbol: 'XBTUSDTM',
    sequence: 45,
    side: 'sell',
    price: '67200.0',
    size: 16,
    tradeId: '5c9dcf4170744d6f5a3d32fb',
    bestBidSize: 795,
    bestBidPrice: '67199.0',
    bestAskPrice: '67201.0',
    bestAskSize: 284,
    // Nanoseconds, as the venue sends them — a string because the literal
    // loses precision as a JS number, which is the venue's problem not ours.
    ts: '1553846081210004941',
  }

  /**
   * ccxt's `parseContractTicker`, reduced to the fields this patch touches.
   * Absent keys come back `undefined`, which is what `safeString` produces and
   * what the shared normalizer then floors at 0.
   */
  class FakeKucoinFutures {
    constructor(_config: Record<string, unknown>) {}
    parseTicker(ticker: unknown, _market?: unknown): Record<string, unknown> {
      const raw = (ticker ?? {}) as Record<string, unknown>
      return {
        symbol: 'BTC/USDT:USDT',
        last: raw['price'] ?? raw['lastTradePrice'],
        high: raw['highPrice'],
        low: raw['lowPrice'],
        baseVolume: raw['volumeOf24h'],
        quoteVolume: raw['turnoverOf24h'],
        change: raw['priceChg'],
        percentage:
          raw['priceChgPct'] === undefined
            ? undefined
            : Number(raw['priceChgPct']),
      }
    }
  }

  function patched() {
    const Patched = patchKucoinFuturesTicker(FakeKucoinFutures)
    return new Patched({})
  }

  it('scales priceChgPct from a fraction to the percent the app expects', () => {
    // ccxt multiplies KuCoin's SPOT changeRate by 100 and passes the contract
    // parser's priceChgPct straight through — unpatched, 4.47% reads +0.04%.
    const parsed = patched().parseTicker(CONTRACT_ROW)
    expect(parsed['percentage']).toBe(4.47)
    expect(parseCcxtTicker(parsed).change24h).toBeCloseTo(4.47, 6)
  })

  it('carries the daily stats forward across a stats-less WS frame', () => {
    const exchange = patched()
    exchange.parseTicker(CONTRACT_ROW)

    const live = parseCcxtTicker(exchange.parseTicker(WS_FRAME))
    // The last trade is the frame's; everything daily is the seed's.
    expect(live.last).toBe(67200)
    expect(live.high24h).toBe(67737.3)
    expect(live.low24h).toBe(64041.6)
    expect(live.volume24h).toBe(9998.54)
    expect(live.change24h).toBeCloseTo(4.47, 6)
  })

  it('reports zeros only while nothing has ever published the stats', () => {
    // The honest cold state: no invented numbers, and no crash either.
    const cold = parseCcxtTicker(patched().parseTicker(WS_FRAME))
    expect(cold.last).toBe(67200)
    expect(cold.high24h).toBe(0)
    expect(cold.change24h).toBe(0)
  })

  it('remembers a genuine zero — presence on the wire is the discriminator', () => {
    const exchange = patched()
    exchange.parseTicker({
      ...CONTRACT_ROW,
      priceChgPct: 0,
      priceChg: 0,
      volumeOf24h: 0,
    })
    const live = exchange.parseTicker(WS_FRAME)
    expect(live['percentage']).toBe(0)
    expect(live['baseVolume']).toBe(0)
    // Still the real high — a flat day is not an unknown one.
    expect(live['high']).toBe(67737.3)
  })

  it('seeds the first paint from contracts/{symbol}, not the last-trade ticker', async () => {
    const calls: Array<Record<string, string>> = []
    const exchange = {
      market: () => ({ id: 'XBTUSDTM', symbol: 'BTC/USDT:USDT' }),
      futuresPublicGetContractsSymbol: async (
        params: Record<string, string>,
      ) => {
        calls.push(params)
        return { data: CONTRACT_ROW }
      },
      parseTicker: (raw: unknown) => patched().parseTicker(raw),
    } as unknown as Parameters<typeof fetchKucoinFuturesSeedTicker>[0]

    const seeded = await fetchKucoinFuturesSeedTicker(exchange, 'BTC/USDT:USDT')
    expect(calls).toEqual([{ symbol: 'XBTUSDTM' }])
    expect(parseCcxtTicker(seeded).high24h).toBe(67737.3)
    expect(kucoinFuturesCcxtVenue.seedTickerFetch).toBe(
      fetchKucoinFuturesSeedTicker,
    )
  })
})
