// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  buildJupiterLegs,
  parsePriceImpact,
  summarizeJupiterQuote,
} from '../route-preview'
import type { JupiterRoutePlanLeg } from '../route-preview'
import type { JupiterQuote } from '../types'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL = 'So11111111111111111111111111111111111111112'
const JITOSOL = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'

const QUOTE: JupiterQuote = {
  inputMint: USDC,
  outputMint: SOL,
  inAmount: '1000000000',
  outAmount: '13463381723',
  otherAmountThreshold: '13396064815',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.0001194124980973151617677139',
  routePlan: [
    {
      percent: 70,
      swapInfo: {
        label: 'Orca',
        ammKey: 'CNC5TaeNQEoS',
        inputMint: USDC,
        outputMint: SOL,
        inAmount: '700000000',
        outAmount: '9424367206',
      },
    },
    {
      percent: 30,
      swapInfo: {
        label: 'Raydium CLMM',
        ammKey: 'HQ2sTaeNQ9zz',
        inputMint: USDC,
        outputMint: SOL,
        inAmount: '300000000',
        outAmount: '4039014517',
      },
    },
  ],
}

describe('parsePriceImpact', () => {
  it('reads the field as the fraction it is', () => {
    // Named `priceImpactPct` and verified against the live quote endpoint as a
    // FRACTION. Treating it as a percentage understates impact 100x, which is
    // the difference between "free" and "do not send this size".
    expect(parsePriceImpact('0.00011941')).toBeCloseTo(0.00011941, 12)
    expect(parsePriceImpact(0.0046)).toBeCloseTo(0.0046, 12)
  })

  it('is null for a missing or nonsensical value', () => {
    expect(parsePriceImpact(undefined)).toBeNull()
    expect(parsePriceImpact('')).toBeNull()
    // >= 100% impact is not a quote we can render as a percentage.
    expect(parsePriceImpact(4)).toBeNull()
  })
})

describe('buildJupiterLegs', () => {
  it('splits on the hops that consume the swap own input', () => {
    const legs = buildJupiterLegs(
      QUOTE.routePlan as Array<JupiterRoutePlanLeg>,
      USDC,
      1_000_000_000,
      9,
    )
    expect(legs.map((l) => l.venue)).toEqual(['Orca', 'Raydium CLMM'])
    expect(legs[0].share).toBeCloseTo(0.7, 10)
    expect(legs[1].share).toBeCloseTo(0.3, 10)
    expect(legs.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10)
  })

  it('folds a multi-hop path into one leg instead of two full-size ones', () => {
    // The live bug this exists for: `routePlan` reports `percent` per HOP, so
    // a two-hop path came back as `Deriverse 100%` plus `Scorch 100%` and
    // rendered as two venues each filling the whole order.
    const plan: Array<JupiterRoutePlanLeg> = [
      {
        percent: 100,
        swapInfo: {
          label: 'Deriverse',
          inputMint: USDC,
          outputMint: JITOSOL,
          inAmount: '1000000000',
          outAmount: '11000000000',
        },
      },
      {
        percent: 100,
        swapInfo: {
          label: 'Scorch',
          inputMint: JITOSOL,
          outputMint: SOL,
          inAmount: '11000000000',
          outAmount: '13463381723',
        },
      },
    ]
    const legs = buildJupiterLegs(plan, USDC, 1_000_000_000, 9)
    expect(legs.length).toBe(1)
    expect(legs[0].venue).toBe('Deriverse → Scorch')
    expect(legs[0].share).toBeCloseTo(1, 10)
    // The path's output is the LAST hop's, not the intermediate token's.
    expect(legs[0].amountOut).toBeCloseTo(13.463381723, 9)
  })

  it('handles a split where one branch is multi-hop', () => {
    const plan: Array<JupiterRoutePlanLeg> = [
      {
        swapInfo: {
          label: 'Aquifer',
          inputMint: USDC,
          outputMint: SOL,
          inAmount: '600000000',
          outAmount: '8000000000',
        },
      },
      {
        swapInfo: {
          label: 'BisonFi',
          inputMint: USDC,
          outputMint: JITOSOL,
          inAmount: '400000000',
          outAmount: '4400000000',
        },
      },
      {
        swapInfo: {
          label: 'Scorch',
          inputMint: JITOSOL,
          outputMint: SOL,
          inAmount: '4400000000',
          outAmount: '5463381723',
        },
      },
    ]
    const legs = buildJupiterLegs(plan, USDC, 1_000_000_000, 9)
    expect(legs.map((l) => l.venue)).toEqual(['Aquifer', 'BisonFi → Scorch'])
    expect(legs.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10)
  })

  it('returns nothing when no hop takes the swap input', () => {
    expect(buildJupiterLegs([], USDC, 1_000, 9)).toEqual([])
    expect(
      buildJupiterLegs(
        [{ swapInfo: { label: 'X', inputMint: SOL, outputMint: USDC } }],
        USDC,
        1_000,
        9,
      ),
    ).toEqual([])
  })
})

describe('summarizeJupiterQuote', () => {
  const quote = summarizeJupiterQuote(QUOTE, {
    market: 'jupiter',
    pair: 'SOL-USDC',
    side: 'buy',
    inputSymbol: 'USDC',
    outputSymbol: 'SOL',
    inputDecimals: 6,
    outputDecimals: 9,
    now: 1_700_000_000_000,
  })

  it('scales each side by its own decimals', () => {
    expect(quote.amountIn).toBe(1000)
    expect(quote.amountOut).toBeCloseTo(13.463381723, 9)
    expect(quote.executionPrice).toBeCloseTo(0.013463381723, 12)
  })

  it('states no USD legs and no gas, because Jupiter states neither', () => {
    expect(quote.amountInUsd).toBeNull()
    expect(quote.amountOutUsd).toBeNull()
    expect(quote.gasUsd).toBeNull()
    expect(quote.priceImpact).toBeCloseTo(0.0001194124980973, 12)
    expect(quote.source).toBe('jupiter')
    expect(quote.ts).toBe(1_700_000_000_000)
  })
})
