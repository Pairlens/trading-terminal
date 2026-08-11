// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Kraken, HTX and Bitfinex: the drop-in check.
 *
 * The strongest parity assertion available at unit level is to hold the ccxt
 * manifest next to the native one and demand they are the same object — the
 * terminal reads the manifest and nothing else to decide a venue's id, display
 * name, capability scopes and desktop gate, so an equal manifest is an
 * indistinguishable venue.
 *
 * The rest pins the venue-specific values that throw at RUNTIME when they are
 * wrong, which is the whole reason this trio was split out: three of the four
 * depth arguments below are enums that reject anything else with an exception
 * on the first orderbook frame, and HTX's `fetchMarkets.types` shape is the
 * difference between a market table and an empty one.
 */

import { describe, expect, it } from 'bun:test'
import * as nativeBitfinex from '../../bitfinex-market-connector'
import * as nativeHtx from '../../htx-market-connector'
import * as nativeKraken from '../../kraken-market-connector'
import {
  bitfinexCcxtVenue,
  bitfinexMarketConnectorManifest,
} from '../venues/bitfinex'
import { htxCcxtVenue, htxMarketConnectorManifest } from '../venues/htx'
import {
  krakenCcxtVenue,
  krakenMarketConnectorManifest,
} from '../venues/kraken'
import type { PluginManifest } from '@pairlens/plugin-system/types'

describe('manifest parity with the native connectors', () => {
  it('kraken is byte-equal', () => {
    expect(krakenMarketConnectorManifest).toEqual(
      nativeKraken.krakenMarketConnectorManifest,
    )
  })

  it('htx is byte-equal', () => {
    expect(htxMarketConnectorManifest).toEqual(
      nativeHtx.htxMarketConnectorManifest,
    )
  })

  it('bitfinex differs in exactly one field: requiresDesktop', () => {
    const native = nativeBitfinex.bitfinexMarketConnectorManifest
    expect(native.metadata?.['requiresDesktop']).toBeUndefined()
    expect(bitfinexMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(
      true,
    )

    // Everything else has to match, or "one deliberate deviation" is a story
    // rather than a fact.
    const stripped = (manifest: PluginManifest) => ({
      ...manifest,
      metadata: {
        ...manifest.metadata,
        requiresDesktop: undefined,
      },
    })
    expect(stripped(bitfinexMarketConnectorManifest)).toEqual(stripped(native))
  })
})

describe('venue configuration', () => {
  const venues = [
    { name: 'kraken', venue: krakenCcxtVenue },
    { name: 'htx', venue: htxCcxtVenue },
    { name: 'bitfinex', venue: bitfinexCcxtVenue },
  ]

  it('keeps the marketId as the plugin-id stem credential provisioning derives', () => {
    for (const { name, venue } of venues) {
      expect(venue.marketId).toBe(name)
      expect(venue.exchangeId).toBe(name)
    }
  })

  it('is live-only, matching CREDENTIAL_SCHEMAS for all three', () => {
    for (const { venue } of venues) {
      expect(venue.defaultMode).toBe('live')
      expect(venue.credentialKeys).toEqual([
        { key: 'apiKey', required: true },
        { key: 'apiSecret', required: true },
      ])
    }
  })

  it('only bitfinex refuses in a CORS-constrained browser', () => {
    expect(krakenCcxtVenue.requiresDesktop).toBeUndefined()
    expect(htxCcxtVenue.requiresDesktop).toBeUndefined()
    expect(bitfinexCcxtVenue.requiresDesktop).toBe(true)
  })

  it('asks for a depth each venue`s enum actually accepts', () => {
    // ccxt throws on anything outside these — the failure lands on the first
    // orderbook subscription, not at construction.
    const legal = (allowed: Array<number>, depth: number | undefined) =>
      depth !== undefined && allowed.includes(depth)
    expect(
      legal([10, 25, 100, 500, 1000], krakenCcxtVenue.orderbookDepth),
    ).toBe(true)
    expect(legal([5, 20, 150, 400], htxCcxtVenue.orderbookDepth)).toBe(true)
    expect(legal([25, 100], bitfinexCcxtVenue.orderbookDepth)).toBe(true)
  })

  it('caps history at what one call can really return', () => {
    expect(krakenCcxtVenue.maxHistoryLimit).toBe(720)
    // The historical spot endpoint — the only one that honours from/to.
    expect(htxCcxtVenue.maxHistoryLimit).toBe(1000)
    expect(bitfinexCcxtVenue.maxHistoryLimit).toBe(10_000)
  })
})

describe('history cursors', () => {
  const endTs = 1_700_000_000_000

  it('nudges the inclusive cursors and leaves the exclusive one alone', () => {
    // HTX `to` and Bitfinex `end` both include the boundary bar; a page made
    // only of that bar filters to empty and latches `exhausted` for good.
    expect(htxCcxtVenue.historyPageParams?.(endTs)).toEqual({
      until: endTs - 1,
    })
    expect(bitfinexCcxtVenue.historyPageParams?.(endTs)).toEqual({
      until: endTs - 1,
    })
    // Kraken's is consumed by the guard, which filters strictly-older itself.
    expect(krakenCcxtVenue.historyPageParams?.(endTs)).toEqual({ until: endTs })
  })
})

describe('htx market loading', () => {
  it('passes fetchMarkets.types as an OBJECT — the array form loads nothing', () => {
    // `htx.fetchMarkets` walks Object.keys(types) and reads safeBool(types, key).
    // With the bridge default `['spot']` the only key is '0', holding a string,
    // so no branch fires and loadMarkets resolves to zero markets.
    const options = htxCcxtVenue.options?.['options'] as Record<string, unknown>
    expect(options['fetchMarkets']).toEqual({
      types: { spot: true, linear: false, inverse: false },
    })
  })

  it('synthesizes the lowercase concatenated id htx uses', () => {
    expect(htxCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'btcusdt',
      lowercaseId: 'btcusdt',
      symbol: 'BTC/USDT',
      baseId: 'btc',
      quoteId: 'usdt',
      spot: true,
    })
  })

  it('has no stand-in where the venue id is not derivable from BASE/QUOTE', () => {
    // Kraken altnames (XBTUSDT) and Bitfinex t-prefixed ids (tBTCUST) would
    // both name a pair that does not exist.
    expect(krakenCcxtVenue.synthesizeMarket).toBeUndefined()
    expect(bitfinexCcxtVenue.synthesizeMarket).toBeUndefined()
  })
})

describe('bitfinex keepalive', () => {
  it('disables ccxt`s ping timer — Bitfinex never pongs it', () => {
    // With no app-level ping, ccxt falls through to a protocol ping that only
    // exists off-browser and that Bitfinex ignores, so its own keepalive check
    // kills a perfectly healthy socket every ~90 s under bun (measured). The
    // bridge's inbound-silence watchdog owns liveness instead.
    expect(bitfinexCcxtVenue.options?.['streaming']).toEqual({ keepAlive: 0 })
  })
})

describe('liveness budgets', () => {
  it('gives each venue a budget its own heartbeat can meet', () => {
    // Kraken pings every 6 s and ccxt answers the pong; 3 x 6 s floors at the
    // session's 45 s minimum.
    expect(krakenCcxtVenue.livenessTimeoutMs).toEqual(45_000)
    // HTX answers server pings, Bitfinex sends `hb` every ~15 s — both reach
    // the host's wrapped handleMessage even though ccxt itself ignores them.
    expect(htxCcxtVenue.livenessTimeoutMs).toEqual(60_000)
    expect(bitfinexCcxtVenue.livenessTimeoutMs).toEqual(60_000)
  })
})
