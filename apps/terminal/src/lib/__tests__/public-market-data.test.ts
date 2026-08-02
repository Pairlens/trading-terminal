// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  fetchFearGreedWithFallback,
  fetchTopCoinsWithFallback,
  normalizeAlternativeFng,
  normalizeCoinGeckoMarkets,
  topCoinsToHeatmap,
} from '../public-market-data'
import type { CoinGeckoMarket } from '../public-market-data'

const CG_ROW: CoinGeckoMarket = {
  id: 'bitcoin',
  symbol: 'btc',
  name: 'Bitcoin',
  image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
  current_price: 62688,
  market_cap: 1257106993145,
  market_cap_rank: 1,
  total_volume: 17904549136,
  price_change_percentage_1h_in_currency: -0.01,
  price_change_percentage_24h_in_currency: 0.42,
  price_change_percentage_7d_in_currency: -3.1,
}

describe('normalizeCoinGeckoMarkets', () => {
  it('maps CoinGecko rows into TopCoinsResponse', () => {
    const out = normalizeCoinGeckoMarkets([CG_ROW])
    expect(out.coins).toHaveLength(1)
    const coin = out.coins[0]
    expect(coin.symbol).toBe('BTC')
    expect(coin.rank).toBe(1)
    expect(coin.slug).toBe('bitcoin')
    expect(coin.price).toBe(62688)
    expect(coin.percentChange24h).toBe(0.42)
    expect(coin.percentChange7d).toBe(-3.1)
    expect(coin.logoUrl).toContain('coingecko.com')
    expect(Date.parse(out.updatedAt)).toBeGreaterThan(0)
  })

  it('falls back to price_change_percentage_24h and drops unpriced rows', () => {
    const out = normalizeCoinGeckoMarkets([
      {
        ...CG_ROW,
        price_change_percentage_24h_in_currency: null,
        price_change_percentage_24h: 1.5,
      },
      { ...CG_ROW, id: 'ghost', current_price: null },
      { ...CG_ROW, id: 'unranked', market_cap_rank: null },
    ])
    expect(out.coins).toHaveLength(1)
    expect(out.coins[0].percentChange24h).toBe(1.5)
  })
})

describe('topCoinsToHeatmap', () => {
  it('reshapes coins into heatmap items, preserving updatedAt', () => {
    const top = normalizeCoinGeckoMarkets([CG_ROW])
    const heat = topCoinsToHeatmap(top)
    expect(heat.items).toHaveLength(1)
    expect(heat.items[0].symbol).toBe('BTC')
    expect(heat.items[0].marketCap).toBe(CG_ROW.market_cap)
    expect(heat.updatedAt).toBe(top.updatedAt)
  })
})

describe('normalizeAlternativeFng', () => {
  it('maps entries with the newest first as latest', () => {
    const out = normalizeAlternativeFng([
      {
        value: '23',
        value_classification: 'Extreme Fear',
        timestamp: '1783209600',
      },
      {
        value: '22',
        value_classification: 'Extreme Fear',
        timestamp: '1783123200',
      },
    ])
    expect(out.latest.value).toBe(23)
    expect(out.latest.valueClassification).toBe('Extreme Fear')
    expect(out.historical).toHaveLength(2)
    expect(out.historical[1].timestamp).toBe('1783123200')
  })

  it('drops non-numeric values and throws when nothing remains', () => {
    expect(() => normalizeAlternativeFng([])).toThrow()
    expect(() =>
      normalizeAlternativeFng([
        { value: 'nan', value_classification: 'x', timestamp: '1' },
      ]),
    ).toThrow()
  })
})

describe('fetch*WithFallback', () => {
  it('returns the App Server payload when the primary succeeds', async () => {
    const payload = normalizeCoinGeckoMarkets([CG_ROW])
    const apiFetch = () =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))
    const out = await fetchTopCoinsWithFallback(apiFetch)
    expect(out.coins[0].symbol).toBe('BTC')
  })

  it('falls back when the primary is unreachable', async () => {
    const original = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('alternative.me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  value: '31',
                  value_classification: 'Fear',
                  timestamp: '1783209600',
                },
              ],
            }),
            { status: 200 },
          ),
        )
      }
      return Promise.reject(new Error('unexpected fetch: ' + url))
    }) as typeof fetch
    try {
      const apiFetch = () => Promise.reject(new Error('ECONNREFUSED'))
      const out = await fetchFearGreedWithFallback(apiFetch)
      expect(out.latest.value).toBe(31)
      expect(out.latest.valueClassification).toBe('Fear')
    } finally {
      globalThis.fetch = original
    }
  })

  it('falls back when the primary returns a non-OK status', async () => {
    const original = globalThis.fetch
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('coingecko.com')) {
        return Promise.resolve(
          new Response(JSON.stringify([CG_ROW]), { status: 200 }),
        )
      }
      return Promise.reject(new Error('unexpected fetch: ' + url))
    }) as typeof fetch
    try {
      const apiFetch = () =>
        Promise.resolve(new Response('not found', { status: 404 }))
      const out = await fetchTopCoinsWithFallback(apiFetch)
      expect(out.coins[0].slug).toBe('bitcoin')
    } finally {
      globalThis.fetch = original
    }
  })
})
