// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bitget venue wiring.
 *
 * Two of these guard failures that are invisible in code and only appear on the
 * wire: an unmapped WS timeframe subscribes to the literal channel
 * `candleundefined` (Bitget answers `code: 30016`), and ccxt's REST describe
 * maps `1M` (month) to `1m` (minute).
 */

import { describe, expect, it } from 'bun:test'
import {
  BITGET_ADAPTER_INFO,
  BITGET_BOOK_DEPTHS,
  bitgetCcxtVenue,
  bitgetMarketConnectorManifest,
  clampBitgetBookDepth,
  resolveBitgetCcxtRestBase,
} from '../venues/bitget'
import { PUBLIC_CTX } from './url-context'

function declaration(capability: string) {
  return bitgetMarketConnectorManifest.capabilities.find(
    (entry) => entry.id === capability,
  )
}

describe('bitget manifest', () => {
  it('keeps the native identity so persisted state and credentials still resolve', () => {
    expect(bitgetMarketConnectorManifest.id).toBe('bitget-market-connector')
    expect(bitgetMarketConnectorManifest.name).toBe('Bitget Market Connector')
    expect(BITGET_ADAPTER_INFO.marketId).toBe('bitget')
    expect(BITGET_ADAPTER_INFO.displayName).toBe('Bitget')
  })

  it('carries the native metadata the terminal reads for the venue card', () => {
    expect(bitgetMarketConnectorManifest.metadata).toMatchObject({
      assetClass: 'crypto-spot',
      abbr: 'BG',
      gradient: 'from-cyan-400 to-teal-500',
      triggerOrders: true,
    })
    expect(bitgetMarketConnectorManifest.metadata?.['requiresDesktop']).toBe(
      undefined,
    )
  })

  it('scopes the bulk snapshot to every market and the tape to bitget', () => {
    expect(declaration('market-data:ticker-snapshot')).toMatchObject({
      markets: ['*'],
      priority: 20,
    })
    expect(declaration('market-data:trades')).toMatchObject({
      markets: ['bitget'],
      priority: 1,
      streaming: true,
    })
  })
})

describe('bitget credentials', () => {
  it('requires the passphrase on both lists, resolving the native disagreement', () => {
    // The native marked it optional in the spec and required in the adapter
    // info. Bitget signs with ACCESS-PASSPHRASE, so a slot without one can only
    // produce auth failures — the required side is the one that matches.
    const passphrase = bitgetCcxtVenue.credentialKeys.find(
      (key) => key.key === 'passphrase',
    )
    expect(passphrase?.required).toBe(true)
    expect(
      BITGET_ADAPTER_INFO.credentialSchema.find(
        (field) => field.key === 'passphrase',
      )?.required,
    ).toBe(true)
  })

  it('declares exactly the three keys the adapter info advertises', () => {
    expect(bitgetCcxtVenue.credentialKeys.map((key) => key.key)).toEqual(
      BITGET_ADAPTER_INFO.credentialSchema.map((field) => field.key),
    )
  })
})

describe('bitget timeframes', () => {
  it('fills the WS channels ccxt would build as `candleundefined`', () => {
    const options = bitgetCcxtVenue.options?.['options'] as Record<
      string,
      unknown
    >
    // ccxt's pro `options.timeframes` stops at 1w; the native streams both of
    // these. `safeString(timeframes, tf)` has no default, so a gap is a
    // subscribe that fails on the wire.
    expect(options['timeframes']).toEqual({ '3d': '3D', '1M': '1M' })
  })

  it('repairs ccxt mapping the month timeframe onto the minute one', () => {
    expect(bitgetCcxtVenue.timeframeOverrides?.['1M']).toBe('1M')
  })
})

describe('bitget orderbook depth', () => {
  it('snaps up to the next books<N> channel', () => {
    expect(clampBitgetBookDepth(1)).toBe(1)
    expect(clampBitgetBookDepth(4)).toBe(5)
    expect(clampBitgetBookDepth(15)).toBe(15)
    expect(clampBitgetBookDepth(16)).toBe(50)
    expect(clampBitgetBookDepth(400)).toBe(50)
  })

  it('defaults to the deepest snapshot channel, books50', () => {
    expect(clampBitgetBookDepth()).toBe(50)
    expect(bitgetCcxtVenue.orderbookDepth).toBe(50)
    expect(BITGET_BOOK_DEPTHS).toContain(
      bitgetCcxtVenue.orderbookDepth as (typeof BITGET_BOOK_DEPTHS)[number],
    )
  })
})

describe('bitget urls', () => {
  it('resolves the REST origin per call, not at module scope', () => {
    // Under bun there is no Vite dev server, so this is the direct origin —
    // the point of the assertion is that the function is called, not cached.
    expect(resolveBitgetCcxtRestBase()).toBe('https://api.bitget.com')
  })

  it('moves every REST section together and leaves the socket tables alone', () => {
    const exchange = {
      urls: {
        api: {
          spot: 'https://api.{hostname}',
          mix: 'https://api.{hostname}',
          ws: { public: 'wss://ws.bitget.com/v2/ws/public' },
          demo: { public: 'wss://wspap.bitget.com/v2/ws/public' },
        },
      },
    }
    bitgetCcxtVenue.applyUrls?.(
      exchange as unknown as Parameters<
        NonNullable<typeof bitgetCcxtVenue.applyUrls>
      >[0],
      '',
      PUBLIC_CTX,
    )
    expect(exchange.urls.api.spot).toBe('https://api.bitget.com')
    expect(exchange.urls.api.mix).toBe('https://api.bitget.com')
    expect(exchange.urls.api.ws).toEqual({
      public: 'wss://ws.bitget.com/v2/ws/public',
    })
  })

  it('declares no paper URL hook — ccxt routes Bitget demo sockets itself', () => {
    // setSandboxMode on Bitget only sets options.sandboxMode, and the pro
    // class picks urls.api.demo from that flag on its own. An applyPaperUrls
    // here would duplicate routing ccxt already owns.
    expect(bitgetCcxtVenue.applyPaperUrls).toBeUndefined()
  })
})

describe('bitget venue config', () => {
  it('asks for the recent endpoint s full page and lets ccxt clamp per timeframe', () => {
    expect(bitgetCcxtVenue.maxHistoryLimit).toBe(1000)
  })

  it('nudges the inclusive `endTime` cursor', () => {
    expect(bitgetCcxtVenue.historyPageParams?.(1_700_000_000_000)).toEqual({
      until: 1_699_999_999_999,
    })
  })

  it('synthesizes the concatenated market id a cold profile needs to subscribe', () => {
    expect(bitgetCcxtVenue.synthesizeMarket?.('BTC-USDT')).toMatchObject({
      id: 'BTCUSDT',
      lowercaseId: 'btcusdt',
      symbol: 'BTC/USDT',
      spot: true,
    })
  })
})
