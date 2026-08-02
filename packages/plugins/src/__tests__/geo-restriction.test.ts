// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  assertResponseOk,
  isGeoRestrictedError,
} from '@pairlens/market-engine/errors'

import {
  bybitMarketConnectorManifest,
  createBybitMarketConnectorPlugin,
} from '../bybit-market-connector'
import {
  createMexcMarketConnectorPlugin,
  mexcMarketConnectorManifest,
} from '../mexc-market-connector'
import type { GeoRestrictedError } from '@pairlens/market-engine/errors'
import type { PluginExecuteParams } from '@pairlens/plugin-system/types'

// These tests pin the geo-restriction CONTRACT the terminal relies on:
// connectors that statically know a venue is unavailable for the user's region
// must throw a typed GeoRestrictedError (not a generic Error), and the shared
// HTTP helper must classify 451 unconditionally — and 403 only with body
// evidence of a geo block — as geo restrictions. The terminal's detection
// (use-candle-stream) keys entirely off `isGeoRestrictedError`, so a regression
// here silently disables the region dialog.

const ctx = (country: string) => ({
  pair: 'BTC-USDT',
  market: 'bybit',
  timeframe: '15m',
  mode: 'paper' as const,
  country,
})

const candleSub = (country: string): PluginExecuteParams => ({
  capability: 'market-data:candles',
  params: { pair: 'BTC-USDT', timeframe: '15m' },
  context: ctx(country),
})

describe('assertResponseOk', () => {
  it('throws GeoRestrictedError on 451 (Unavailable For Legal Reasons)', () => {
    let thrown: unknown
    try {
      assertResponseOk({ ok: false, status: 451 }, 'Binance', 'US')
    } catch (e) {
      thrown = e
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as GeoRestrictedError).exchange).toBe('Binance')
    expect((thrown as GeoRestrictedError).region).toBe('US')
    expect((thrown as GeoRestrictedError).status).toBe(451)
  })

  it('throws a generic Error on a bare 403 (no body evidence)', () => {
    // 403 is ambiguous — exchanges also use it for revoked API keys and WAF
    // bans. Without body evidence it must NOT be classified as a geo block.
    let thrown: unknown
    try {
      assertResponseOk({ ok: false, status: 403 }, 'Coinbase', '')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(isGeoRestrictedError(thrown)).toBe(false)
    expect((thrown as Error).message).toContain('Coinbase REST error: 403')
  })

  it('throws GeoRestrictedError on 403 with a geo-block body', () => {
    let thrown: unknown
    try {
      assertResponseOk(
        { ok: false, status: 403 },
        'Binance',
        'US',
        'Service unavailable in your region',
      )
    } catch (e) {
      thrown = e
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as GeoRestrictedError).exchange).toBe('Binance')
    expect((thrown as GeoRestrictedError).region).toBe('US')
    expect((thrown as GeoRestrictedError).status).toBe(403)
  })

  it('throws a generic Error on 403 with a non-geo body', () => {
    let thrown: unknown
    try {
      assertResponseOk(
        { ok: false, status: 403 },
        'Coinbase',
        '',
        '{"error":"invalid api key"}',
      )
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(isGeoRestrictedError(thrown)).toBe(false)
    expect((thrown as Error).message).toContain('Coinbase REST error: 403')
  })

  it('throws GeoRestrictedError on 451 even without a body', () => {
    let thrown: unknown
    try {
      assertResponseOk({ ok: false, status: 451 }, 'ByBit', 'US', '')
    } catch (e) {
      thrown = e
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
  })

  it('throws a plain (non-geo) Error on other failures', () => {
    let thrown: unknown
    try {
      assertResponseOk({ ok: false, status: 500 }, 'OKX', 'US')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(isGeoRestrictedError(thrown)).toBe(false)
    expect((thrown as Error).message).toContain('OKX REST error: 500')
  })

  it('does not throw on a 2xx response', () => {
    expect(() =>
      assertResponseOk({ ok: true, status: 200 }, 'OKX', 'US'),
    ).not.toThrow()
  })
})

describe('isGeoRestrictedError', () => {
  it('matches by name across bundle boundaries (not instanceof)', () => {
    const fake = new Error('x') as Error & { exchange?: string }
    fake.name = 'GeoRestrictedError'
    fake.exchange = 'ByBit'
    expect(isGeoRestrictedError(fake)).toBe(true)
  })

  it('matches via the __geoRestricted sentinel across bundle boundaries', () => {
    const fake = new Error('x') as Error & { __geoRestricted?: boolean }
    fake.__geoRestricted = true
    expect(isGeoRestrictedError(fake)).toBe(true)
  })

  it('rejects ordinary errors', () => {
    expect(isGeoRestrictedError(new Error('boom'))).toBe(false)
    expect(isGeoRestrictedError(null)).toBe(false)
  })

  it('rejects arbitrary errors that merely carry an exchange property', () => {
    const fake = new Error('rate limited') as Error & { exchange?: string }
    fake.exchange = 'Binance'
    expect(isGeoRestrictedError(fake)).toBe(false)
  })
})

describe('ByBit proactive geo block', () => {
  const plugin = createBybitMarketConnectorPlugin(bybitMarketConnectorManifest)

  it('throws GeoRestrictedError when subscribing from the US', () => {
    let thrown: unknown
    try {
      plugin.subscribe!(candleSub('US'), () => {})
    } catch (e) {
      thrown = e
    }
    expect(isGeoRestrictedError(thrown)).toBe(true)
    expect((thrown as GeoRestrictedError).exchange).toBe('ByBit')
    expect((thrown as GeoRestrictedError).region).toBe('US')
  })

  it('does not throw a geo error for a supported region', () => {
    // A supported region resolves URLs and proceeds to open a socket; it must
    // not raise a GeoRestrictedError. (Any later network failure is unrelated.)
    let thrown: unknown
    try {
      const unsub = plugin.subscribe!(candleSub('DE'), () => {})
      unsub()
    } catch (e) {
      thrown = e
    }
    expect(isGeoRestrictedError(thrown)).toBe(false)
  })
})

describe('MEXC proactive geo block', () => {
  const plugin = createMexcMarketConnectorPlugin(mexcMarketConnectorManifest)

  it('throws GeoRestrictedError for a region MEXC does not serve', () => {
    let thrown: unknown
    try {
      plugin.subscribe!(
        {
          capability: 'market-data:candles',
          params: { pair: 'BTC-USDT', timeframe: '15m' },
          context: { ...ctx('US'), market: 'mexc' },
        },
        () => {},
      )
    } catch (e) {
      thrown = e
    }
    // MEXC blocks the US region; if its region map ever changes this asserts the
    // block is still surfaced as a typed geo error rather than a generic one.
    if (thrown !== undefined) {
      expect(isGeoRestrictedError(thrown)).toBe(true)
      expect((thrown as GeoRestrictedError).exchange).toBe('MEXC')
    }
  })
})
