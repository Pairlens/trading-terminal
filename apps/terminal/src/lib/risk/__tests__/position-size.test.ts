// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  evaluatePositionSize,
  orderNotionalUsd,
  priceUsdFor,
} from '../position-size'
import { registerPredictionOutcome } from '@/stores/prediction-directory-store'

const prices = new Map<string, number>([
  ['BTC', 60000],
  ['ETH', 3000],
])

describe('priceUsdFor', () => {
  it('prices stablecoins at $1', () => {
    expect(priceUsdFor('USDT', prices)).toBe(1)
    expect(priceUsdFor('usdc', prices)).toBe(1)
  })
  it('uses the price map for other assets, null when unknown', () => {
    expect(priceUsdFor('BTC', prices)).toBe(60000)
    expect(priceUsdFor('DOGE', prices)).toBeNull()
  })
})

describe('orderNotionalUsd', () => {
  it('base-denominated buy on a USDT pair: size × price', () => {
    const n = orderNotionalUsd(
      { pair: 'BTC-USDT', size: 0.5, quoteDenominated: false, price: 60000 },
      prices,
    )
    expect(n).toBe(30000)
  })

  it('quote-denominated order: size is already the quote (USD) amount', () => {
    const n = orderNotionalUsd(
      { pair: 'BTC-USDT', size: 250, quoteDenominated: true, price: 60000 },
      prices,
    )
    expect(n).toBe(250)
  })

  it('falls back to a direct base→USD price when no order price given', () => {
    const n = orderNotionalUsd(
      { pair: 'ETH-USDT', size: 2, quoteDenominated: false, price: null },
      prices,
    )
    expect(n).toBe(6000)
  })

  it('returns null when the asset cannot be priced', () => {
    const n = orderNotionalUsd(
      { pair: 'DOGE-USDT', size: 100, quoteDenominated: false, price: null },
      prices,
    )
    expect(n).toBeNull()
  })

  it('prices a pinned prediction outcome as contracts × price, never null', () => {
    const pairKey = 'KXBTCD-26AUG15-T53'
    registerPredictionOutcome(pairKey, {
      market: 'kalshi',
      predictionMarketId: 'KXBTCD-26AUG15-T53',
      outcome: 'Yes',
      name: 'Will BTC close above $53,000?',
    })
    // 10,000 contracts at 90¢ = $9,000 — the dash-split "quote" (26AUG15)
    // must never make this fail open.
    const n = orderNotionalUsd(
      { pair: pairKey, size: 10_000, quoteDenominated: false, price: 0.9 },
      prices,
    )
    expect(n).toBe(9000)
    // Unknown price: a contract is bounded by $1, so the guard uses the
    // conservative upper bound instead of skipping.
    const upper = orderNotionalUsd(
      { pair: pairKey, size: 10_000, quoteDenominated: false, price: null },
      prices,
    )
    expect(upper).toBe(10_000)
  })
})

/**
 * A perpetual key is BASE-QUOTE-SETTLE, and its size is a CONTRACT COUNT. Left
 * to the spot arm, the dash-split would read the third leg as noise and price
 * the count as if it were a base amount: correct only by accident on the
 * venues whose contract happens to be one unit of the base, and off by three
 * orders of magnitude on the ones where it is not.
 */
describe('orderNotionalUsd — perpetual futures', () => {
  it('prices a contract count, not a base amount', () => {
    // KuCoin XBTUSDTM: 0.001 BTC per contract. 10 contracts at $60,000 is
    // $600, not $600,000.
    const n = orderNotionalUsd(
      {
        pair: 'BTC-USDT-USDT',
        size: 10,
        quoteDenominated: false,
        price: 60_000,
        contractSize: 0.001,
      },
      prices,
    )
    expect(n).toBeCloseTo(600, 6)
  })

  it('defaults the contract size to 1, which is right for Binance and Kraken', () => {
    const n = orderNotionalUsd(
      {
        pair: 'BTC-USDT-USDT',
        size: 0.5,
        quoteDenominated: false,
        price: 60_000,
      },
      prices,
    )
    expect(n).toBe(30_000)
  })

  it('prices the settle currency, and treats an unknown one as $1', () => {
    // Every v1 venue settles in USDT or USD. An unrecognised settle currency
    // must not make this return null: a leveraged order is the LAST one that
    // should slip past the cap unmeasured.
    expect(
      orderNotionalUsd(
        {
          pair: 'BTC-USD-USD',
          size: 2,
          quoteDenominated: false,
          price: 60_000,
        },
        prices,
      ),
    ).toBe(120_000)
    expect(
      orderNotionalUsd(
        {
          pair: 'BTC-XYZ-XYZ',
          size: 2,
          quoteDenominated: false,
          price: 60_000,
        },
        prices,
      ),
    ).toBe(120_000)
  })

  it('falls back to the base asset price when the order carries none', () => {
    const n = orderNotionalUsd(
      { pair: 'ETH-USDT-USDT', size: 3, quoteDenominated: false, price: null },
      prices,
    )
    expect(n).toBe(9000)
  })

  it('a quote-denominated perp size is already the settle amount', () => {
    // 10 USDT of exposure is $10, not ten contracts at $60,000. Multiplying by
    // the price here reported a $10 order as a $600,000 one, which the
    // position cap then refused.
    expect(
      orderNotionalUsd(
        {
          pair: 'BTC-USDT-USDT',
          size: 10,
          quoteDenominated: true,
          price: 60_000,
        },
        prices,
      ),
    ).toBe(10)
    // The contract size plays no part on this arm: the size is not a count.
    expect(
      orderNotionalUsd(
        {
          pair: 'BTC-USDT-USDT',
          size: 250,
          quoteDenominated: true,
          price: 60_000,
          contractSize: 0.001,
        },
        prices,
      ),
    ).toBe(250)
  })

  it('an unrecognised settle currency still prices a quote-denominated size', () => {
    // Every v1 venue settles in USDT or USD, so $1 is the right fallback —
    // and a perp is the one instrument where waving an unpriced order through
    // is the dangerous outcome.
    expect(
      orderNotionalUsd(
        { pair: 'BTC-XYZ-XYZ', size: 40, quoteDenominated: true, price: null },
        prices,
      ),
    ).toBe(40)
  })

  it('a nonsense contract size falls back to 1 rather than to zero', () => {
    for (const bad of [0, -1, Number.NaN]) {
      expect(
        orderNotionalUsd(
          {
            pair: 'BTC-USDT-USDT',
            size: 2,
            quoteDenominated: false,
            price: 60_000,
            contractSize: bad,
          },
          prices,
        ),
      ).toBe(120_000)
    }
  })

  it('leverage is not an input: it changes the margin, not the exposure', () => {
    // Stated as a test because the cap is on exposure, and dividing by
    // leverage here would have let a 25x order report a twenty-fifth of its
    // real size and sail past a maxPositionSize the user set deliberately.
    // One contract of BTC at $60,000 is $60,000 of exposure at 1x and at 25x
    // alike; what leverage changes is the margin the venue holds against it.
    const n = orderNotionalUsd(
      {
        pair: 'BTC-USDT-USDT',
        size: 1,
        quoteDenominated: false,
        price: 60_000,
      },
      prices,
    )
    expect(n).toBe(60_000)
  })
})

describe('evaluatePositionSize', () => {
  it('flags an order exceeding the % limit', () => {
    // 30000 / 100000 = 30% > 25%
    const v = evaluatePositionSize(30000, 100000, 25)
    expect(v.exceeds).toBe(true)
    expect(v.ratioPct).toBeCloseTo(30, 6)
  })

  it('allows an order within the limit', () => {
    const v = evaluatePositionSize(20000, 100000, 25)
    expect(v.exceeds).toBe(false)
    expect(v.ratioPct).toBeCloseTo(20, 6)
  })

  it('fail-open: disabled limit, zero portfolio, or unknown notional never blocks', () => {
    expect(evaluatePositionSize(30000, 100000, 0).exceeds).toBe(false)
    expect(evaluatePositionSize(30000, 0, 25).exceeds).toBe(false)
    expect(evaluatePositionSize(null, 100000, 25).exceeds).toBe(false)
  })
})
