// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { descale, impactFromUsd, summarizeKyberRoute } from '../route-preview'
import type { KyberRoute } from '../types'

/** A two-split route, shaped like a live `/routes` response. */
const ROUTE: KyberRoute = {
  routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
  routeSummary: {
    tokenIn: '0x4200000000000000000000000000000000000006',
    amountIn: '1000000000000000000',
    amountInUsd: '1870.47',
    tokenOut: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    amountOut: '1871086962',
    amountOutUsd: '1860.84',
    gasUsd: 0.0485,
    route: [
      [
        {
          exchange: 'uniswap-v3',
          swapAmount: '600000000000000000',
          amountOut: '1122000000',
        },
      ],
      [
        // Multi-hop split: the share is the FIRST hop's input, and the venue
        // shown is the one the output comes out of.
        {
          exchange: 'aerodrome',
          swapAmount: '400000000000000000',
          amountOut: '900000000000000000',
        },
        {
          exchange: 'curve',
          swapAmount: '900000000000000000',
          amountOut: '749086962',
        },
      ],
    ],
  },
}

describe('descale', () => {
  it('turns raw integer amounts into human units', () => {
    expect(descale('1000000000000000000', 18)).toBe(1)
    expect(descale('1871086962', 6)).toBe(1871.086962)
  })

  it('is zero rather than NaN for a missing amount', () => {
    expect(descale(undefined, 18)).toBe(0)
    expect(descale('', 18)).toBe(0)
  })
})

describe('impactFromUsd', () => {
  it('measures the two legs the aggregator prices', () => {
    expect(impactFromUsd(1000, 995)).toBeCloseTo(0.005, 10)
  })

  it('refuses to answer when a leg is unpriced', () => {
    // "0.00%" and "we could not tell" must not look the same on a ticket.
    expect(impactFromUsd(null, 995)).toBeNull()
    expect(impactFromUsd(1000, null)).toBeNull()
    expect(impactFromUsd(0, 995)).toBeNull()
  })
})

describe('summarizeKyberRoute', () => {
  const quote = summarizeKyberRoute(ROUTE, {
    market: 'base',
    pair: 'WETH-USDC',
    side: 'sell',
    inputSymbol: 'WETH',
    outputSymbol: 'USDC',
    inputDecimals: 18,
    outputDecimals: 6,
    now: 1_700_000_000_000,
  })

  it('scales both sides by their own token decimals', () => {
    expect(quote.amountIn).toBe(1)
    expect(quote.amountOut).toBe(1871.086962)
    expect(quote.executionPrice).toBe(1871.086962)
  })

  it('shares a split by its input, largest first', () => {
    expect(quote.legs.map((l) => l.venue)).toEqual(['uniswap-v3', 'curve'])
    expect(quote.legs[0].share).toBeCloseTo(0.6, 10)
    expect(quote.legs[1].share).toBeCloseTo(0.4, 10)
    // Shares sum to the whole input — the property that makes the bar chart
    // in the route pane mean anything.
    expect(quote.legs.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10)
  })

  it('names a multi-hop split after the venue the output leaves', () => {
    expect(quote.legs[1].venue).toBe('curve')
    expect(quote.legs[1].amountOut).toBe(749.086962)
  })

  it('carries impact and gas from the aggregator, never from reserves', () => {
    expect(quote.priceImpact).toBeCloseTo((1870.47 - 1860.84) / 1870.47, 10)
    expect(quote.gasUsd).toBe(0.0485)
    expect(quote.source).toBe('kyberswap')
    expect(quote.ts).toBe(1_700_000_000_000)
  })

  it('survives a summary with no route array', () => {
    const bare = summarizeKyberRoute(
      {
        routerAddress: ROUTE.routerAddress,
        routeSummary: {
          tokenIn: 'a',
          amountIn: '1000000',
          tokenOut: 'b',
          amountOut: '2000000',
        },
      },
      {
        market: 'base',
        pair: 'A-B',
        side: 'buy',
        inputSymbol: 'A',
        outputSymbol: 'B',
        inputDecimals: 6,
        outputDecimals: 6,
      },
    )
    expect(bare.legs).toEqual([])
    expect(bare.priceImpact).toBeNull()
    expect(bare.gasUsd).toBeNull()
  })
})
