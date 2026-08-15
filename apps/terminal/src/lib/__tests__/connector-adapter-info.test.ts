// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a venue's manifest tells the terminal about itself.
 *
 * `getConnectorAdapterInfo` is the only place a manifest becomes a
 * `MarketAdapterInfo`, and every venue surface downstream (the picker, the
 * timeframe control, the ticket's order-type toggle) reads that struct rather
 * than the manifest. A field that stops being read fails silently: the chart
 * offers Kalshi a 15m timeframe its OHLCV endpoint answers 400 to, and the
 * ticket offers a market order the venue refuses outright.
 *
 * Walks the real bundled manifests, so a connector whose metadata drifts
 * fails here rather than in a user's chart.
 */

import { describe, expect, test } from 'bun:test'

import type { PluginInstance, PluginManifest } from '@pairlens/plugin-system'
import { clampTimeframeToVenue } from '@/lib/chart-timeframes'
import { installBrowserGlobals } from '@/lib/security/vault/__tests__/test-globals'

installBrowserGlobals()

const { getConnectorAdapterInfo } = await import('@/lib/market-data-provider')
const { BOOTSTRAP_PLUGINS } = await import('@/lib/plugins/bootstrap-bundle')

/** The struct is built from the manifest alone, so a stub instance suffices. */
function asPlugin(manifest: PluginManifest): PluginInstance {
  return { manifest } as PluginInstance
}

function infoFor(id: string) {
  const bundled = BOOTSTRAP_PLUGINS.find((p) => p.manifest.id === id)
  if (!bundled) throw new Error(`bootstrap plugin '${id}' is no longer bundled`)
  const info = getConnectorAdapterInfo(asPlugin(bundled.manifest))
  if (!info) throw new Error(`'${id}' no longer reads as a venue`)
  return info
}

describe('getConnectorAdapterInfo — timeframes', () => {
  test('a venue that declares its timeframes gets exactly those', () => {
    expect(infoFor('kalshi-market-connector').supportedTimeframes).toEqual([
      '1m',
      '1h',
      '1d',
    ])
    expect(infoFor('polymarket-market-connector').supportedTimeframes).toEqual([
      '1m',
      '5m',
      '1h',
      '1d',
    ])
  })

  test('a venue that declares nothing keeps the full default list', () => {
    // The FULL eleven, matching the chart toolbar: the toolbar filters its
    // chips by this list, so a shorter default would silently remove 3d/1M
    // from every CEX venue.
    expect(infoFor('binance-market-connector').supportedTimeframes).toEqual([
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '1d',
      '3d',
      '1w',
      '1M',
    ])
  })

  test('strings outside the shared union never reach the chart', () => {
    const info = getConnectorAdapterInfo(
      asPlugin({
        ...infoManifest(),
        metadata: { timeframes: ['1m', '7s', 'hourly', '1d'] },
      }),
    )
    expect(info?.supportedTimeframes).toEqual(['1m', '1d'])
  })

  test('an all-invalid list falls back rather than leaving none', () => {
    const info = getConnectorAdapterInfo(
      asPlugin({
        ...infoManifest(),
        metadata: { timeframes: ['fortnightly'] },
      }),
    )
    expect(info?.supportedTimeframes.length).toBeGreaterThan(0)
    expect(info?.supportedTimeframes).toContain('1h')
  })
})

describe('getConnectorAdapterInfo — prediction venues', () => {
  test('the prediction asset class reaches assetClasses', () => {
    expect(infoFor('kalshi-market-connector').assetClasses).toEqual([
      'prediction',
    ])
    expect(infoFor('polymarket-market-connector').assetClasses).toEqual([
      'prediction',
    ])
  })

  test('the venue id and display name survive the -market-connector strip', () => {
    const kalshi = infoFor('kalshi-market-connector')
    expect(kalshi.marketId).toBe('kalshi')
    expect(kalshi.displayName).toBe('Kalshi')
    const polymarket = infoFor('polymarket-market-connector')
    expect(polymarket.marketId).toBe('polymarket')
    expect(polymarket.displayName).toBe('Polymarket')
  })

  test('limit-only is carried, and only by the venue that declares it', () => {
    expect(infoFor('kalshi-market-connector').limitOnly).toBe(true)
    expect(infoFor('polymarket-market-connector').limitOnly).toBe(false)
    expect(infoFor('binance-market-connector').limitOnly).toBe(false)
  })

  test('marketOrders is read when declared and dropped when nonsense', () => {
    expect(
      getConnectorAdapterInfo(
        asPlugin({ ...infoManifest(), metadata: { marketOrders: 'native' } }),
      )?.marketOrders,
    ).toBe('native')
    expect(
      getConnectorAdapterInfo(
        asPlugin({ ...infoManifest(), metadata: { marketOrders: 'none' } }),
      )?.marketOrders,
    ).toBe('none')
    // Anything outside the two-value union — a stale connector value, a typo —
    // is dropped rather than passed to a ticket that would switch on it.
    for (const bogus of ['sometimes', 'emulated', 'cost-buy-only', true, 3]) {
      expect(
        getConnectorAdapterInfo(
          asPlugin({ ...infoManifest(), metadata: { marketOrders: bogus } }),
        )?.marketOrders,
      ).toBeUndefined()
    }
  })

  test('limitOnly and marketOrders can never disagree', () => {
    // One fact, two fields: `marketOrders: 'none'` IS limit-only, whether or
    // not the venue also set the flag, so a surface reading either one gets
    // the same answer.
    expect(
      getConnectorAdapterInfo(
        asPlugin({ ...infoManifest(), metadata: { marketOrders: 'none' } }),
      )?.limitOnly,
    ).toBe(true)
    expect(
      getConnectorAdapterInfo(
        asPlugin({ ...infoManifest(), metadata: { marketOrders: 'native' } }),
      )?.limitOnly,
    ).toBe(false)
    // The flag alone still stands on its own for a venue that sets only it.
    expect(
      getConnectorAdapterInfo(
        asPlugin({ ...infoManifest(), metadata: { limitOnly: true } }),
      )?.limitOnly,
    ).toBe(true)
  })

  test('both venues trade, and Kalshi says it needs the desktop app', () => {
    expect(infoFor('kalshi-market-connector').capabilities).toContain('trade')
    expect(infoFor('kalshi-market-connector').requiresDesktop).toBe(true)
    expect(infoFor('polymarket-market-connector').capabilities).toContain(
      'trade',
    )
    expect(infoFor('polymarket-market-connector').requiresDesktop).toBe(false)
  })

  test('Polymarket routes trading through a wallet, Kalshi through keys', () => {
    // The wallet chain is what binds an existing EVM wallet to the venue, so
    // an unpinned one would leave a funded user unable to trade.
    expect(infoFor('polymarket-market-connector').walletChain).toBe('ethereum')
    expect(infoFor('kalshi-market-connector').walletChain).toBeUndefined()
  })
})

/** A minimal venue manifest to vary one metadata field at a time. */
function infoManifest(): PluginManifest {
  return {
    id: 'test-market-connector',
    name: 'Test Market Connector',
    version: '1.0.0',
    author: 'Test',
    description: 'Test',
    capabilities: [
      {
        id: 'market-data:candles',
        singleton: false,
        markets: ['test'],
        priority: 1,
        streaming: true,
      },
    ],
    config: {},
  }
}

/**
 * The provider's egress clamp, composed exactly as `clampForMarket` composes
 * it: look the venue up in the adapter table, clamp against its declared
 * intervals. Asserted over the REAL bundled manifests rather than a fixture,
 * because the value being protected is "what a connector actually publishes
 * reaches the wire intact" — every path out of the provider (`subscribe`,
 * `fetchHistory`, `probeVenueHistory`, `warmupMarket`) runs this, which is
 * what makes the keyboard shortcuts, the copilot's candle tools and the
 * Python indicators' `request.security` safe without each fixing it itself.
 */
describe('provider egress clamp over real manifests', () => {
  const clampForMarket = (market: string, timeframe: string) =>
    clampTimeframeToVenue(timeframe, infoFor(market).supportedTimeframes)

  test("a venue is never asked for an interval it doesn't publish", () => {
    for (const id of [
      'kalshi-market-connector',
      'polymarket-market-connector',
      'binance-market-connector',
      'alpaca-market-connector',
    ]) {
      const supported = infoFor(id).supportedTimeframes
      for (const requested of ['1m', '5m', '15m', '30m', '1h', '4h', '1d']) {
        expect(supported).toContain(clampForMarket(id, requested))
      }
    }
  })

  test('the copilot default set survives every venue', () => {
    // `get_candles` / `get_multi_timeframe` default to these four; three of
    // them 400 on Kalshi, and the copilot then answered "no data" about a
    // pair whose chart was drawing fine.
    for (const requested of ['15m', '1h', '4h', '1d']) {
      expect(infoFor('kalshi-market-connector').supportedTimeframes).toContain(
        clampForMarket('kalshi-market-connector', requested),
      )
    }
    expect(clampForMarket('kalshi-market-connector', '15m')).toBe('1m')
    expect(clampForMarket('kalshi-market-connector', '4h')).toBe('1h')
    expect(clampForMarket('polymarket-market-connector', '15m')).toBe('5m')
  })

  test('a CEX venue is untouched — no clamp where none is needed', () => {
    for (const requested of ['1m', '15m', '4h', '1d', '1w']) {
      expect(clampForMarket('binance-market-connector', requested)).toBe(
        requested,
      )
    }
  })
})
