// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The quote parser, against two recorded LI.FI responses: an ERC-20 route
 * (Base USDC to Arbitrum USDC, via Eco) and a native one (Base ETH to Arbitrum
 * ETH, via LayerSwap).
 *
 * Two things are being pinned. The numbers a user reads: what lands, the floor
 * under it, the bridge's fee and the source gas, each scaled by the right
 * token's decimals rather than by whichever one came first. And the anchor: a
 * response that does not describe the transfer that was requested is rejected,
 * because this quote is what the signing path re-derives its calldata from.
 */
import { describe, expect, it } from 'bun:test'

import { parseLifiQuote, toHumanAmount } from '../quote-client'
import erc20Quote from './fixtures/quote-erc20-base-arbitrum.json'
import nativeQuote from './fixtures/quote-native-base-arbitrum.json'
import type { QuoteAnchor } from '../quote-client'

const ADDRESS = '0x000000000000000000000000000000000000dEaD'

const USDC_BASE = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  symbol: 'USDC',
  decimals: 6,
  native: false,
}
const USDC_ARBITRUM = {
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  symbol: 'USDC',
  decimals: 6,
  native: false,
}
const ETH = {
  address: '0x0000000000000000000000000000000000000000',
  symbol: 'ETH',
  decimals: 18,
  native: true,
}

function anchor(over: Partial<QuoteAnchor> = {}): QuoteAnchor {
  return {
    fromMarket: 'base',
    toMarket: 'arbitrum',
    fromChainId: 8453,
    toChainId: 42161,
    fromToken: USDC_BASE,
    toToken: USDC_ARBITRUM,
    fromAmountRaw: 100_000_000n,
    address: ADDRESS,
    quotedAt: 1_700_000_000_000,
    ...over,
  }
}

const nativeAnchor = anchor({
  fromToken: ETH,
  toToken: ETH,
  fromAmountRaw: 100_000_000_000_000_000n,
})

function parsed(raw: unknown, a: QuoteAnchor = anchor()) {
  const result = parseLifiQuote(raw, a)
  if ('problem' in result)
    throw new Error(`unexpected refusal: ${result.problem}`)
  return result.route
}

describe('toHumanAmount', () => {
  it('keeps the tail of an 18-decimal amount', () => {
    // Through BigInt: `Number('99745550000000000') / 1e18` is fine, but a
    // memecoin balance with 18 significant digits is not, and the same code
    // path serves both.
    expect(toHumanAmount('99745550000000000', 18)).toBeCloseTo(0.09974555, 12)
    expect(toHumanAmount('100000000', 6)).toBe(100)
    expect(toHumanAmount('0', 6)).toBe(0)
  })

  it('refuses anything that is not raw units', () => {
    expect(toHumanAmount('1.5', 6)).toBeNull()
    expect(toHumanAmount('0x64', 6)).toBeNull()
    expect(toHumanAmount('', 6)).toBeNull()
  })
})

describe('parseLifiQuote — ERC-20 route', () => {
  const route = parsed(erc20Quote)

  it('reads the amounts through each side own decimals', () => {
    expect(route.quote.amount).toBe(100)
    expect(route.quote.amountOut).toBe(99.75)
    expect(route.quote.amountOutMin).toBe(99.75)
    expect(route.quote.symbol).toBe('USDC')
    expect(route.quote.toSymbol).toBe('USDC')
  })

  it('separates the bridge fee from the source gas', () => {
    // Summing them would hide which half the user can do something about.
    expect(route.quote.feeUsd).toBeCloseTo(0.2497, 6)
    expect(route.quote.gasUsd).toBeCloseTo(0.0065, 6)
    expect(route.quote.feeIncluded).toBe(true)
  })

  it('carries the bridge name and the ETA', () => {
    expect(route.quote.tool).toBe('eco')
    expect(route.quote.etaSeconds).toBe(7)
    expect(route.quote.provider).toBe('LI.FI')
    expect(route.quote.quotedAt).toBe(1_700_000_000_000)
  })

  it('keeps the calldata out of the quote and beside it', () => {
    expect(route.tx.to).toBe('0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE')
    expect(route.tx.value).toBe('0x0')
    expect(route.tx.chainId).toBe(8453)
    expect(route.approvalAddress).toBe(
      '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    )
    expect(Object.keys(route.quote)).not.toContain('data')
  })
})

describe('parseLifiQuote — native route', () => {
  const route = parsed(nativeQuote, nativeAnchor)

  it('scales 18-decimal amounts', () => {
    expect(route.quote.amount).toBeCloseTo(0.1, 12)
    expect(route.quote.amountOut).toBeCloseTo(0.09974555, 12)
  })

  it('sums every fee the route charges', () => {
    // Two fee costs on this one: LI.FI's fixed fee and LayerSwap's.
    expect(route.quote.feeUsd).toBeCloseTo(0.484497, 6)
    expect(route.quote.feeIncluded).toBe(true)
  })

  it('states the native value the transfer must carry', () => {
    expect(route.tx.value).toBe('0x16345785d8a0000')
  })
})

describe('parseLifiQuote — the anchor', () => {
  it('refuses a response about a different chain', () => {
    const result = parseLifiQuote(erc20Quote, anchor({ toChainId: 137 }))
    expect(result).toEqual({ problem: 'destination chain is 42161' })
  })

  it('refuses a response about a different token', () => {
    const result = parseLifiQuote(
      erc20Quote,
      anchor({ toToken: { ...USDC_ARBITRUM, address: '0xdead' } }),
    )
    expect('problem' in result && result.problem).toContain('destination token')
  })

  it('refuses a response that changed the amount', () => {
    const result = parseLifiQuote(
      erc20Quote,
      anchor({ fromAmountRaw: 200_000_000n }),
    )
    expect(result).toEqual({ problem: 'amount is 100000000' })
  })

  it('refuses a route addressed to somebody else', () => {
    // The recipient is encoded inside calldata this connector cannot decode.
    // The stated one is checkable, and a mismatch is the shape of the attack
    // that matters most here.
    const result = parseLifiQuote(
      erc20Quote,
      anchor({ address: '0x1111111111111111111111111111111111111111' }),
    )
    expect('problem' in result && result.problem).toContain('sender is')
  })

  it('refuses a response with no transaction request', () => {
    const { transactionRequest: _dropped, ...noTx } = erc20Quote as Record<
      string,
      unknown
    >
    expect(parseLifiQuote(noTx, anchor())).toEqual({
      problem: 'no transaction request',
    })
  })

  it('refuses a body that is not a quote at all', () => {
    expect(parseLifiQuote(null, anchor())).toEqual({ problem: 'not an object' })
    expect(parseLifiQuote({}, anchor())).toEqual({
      problem: 'missing action or estimate',
    })
  })
})
