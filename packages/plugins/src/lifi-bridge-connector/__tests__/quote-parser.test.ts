// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The quote parser, against five recorded LI.FI responses: two EVM-to-EVM
 * routes (Base USDC to Arbitrum USDC via Eco, Base ETH to Arbitrum ETH via
 * LayerSwap) and three that involve Solana (native SOL out via Relay, SPL USDC
 * out via LayerSwap, and Base USDC in via Mayan).
 *
 * Three things are being pinned. The numbers a user reads, each scaled by the
 * right token's decimals rather than by whichever one came first. The anchor: a
 * response that does not describe the transfer that was requested is rejected,
 * because this quote is what the signing path re-derives its transaction from.
 * And the shape of that transaction, which now comes in two kinds and must be
 * decided by the chain that will sign it rather than by which fields the
 * response happened to fill in.
 *
 * The three Solana fixtures were recorded from live `/v1/quote` calls against
 * three different bridge tools on purpose: the transaction shape has to be a
 * property of the chain, not of whichever tool priced best that morning.
 */
import { describe, expect, it } from 'bun:test'

import {
  addressesMatch,
  isBase64Payload,
  parseLifiQuote,
  toHumanAmount,
} from '../quote-client'
import { bridgeChain } from '../chains'
import erc20Quote from './fixtures/quote-erc20-base-arbitrum.json'
import nativeQuote from './fixtures/quote-native-base-arbitrum.json'
import solNativeQuote from './fixtures/quote-solana-base-native.json'
import solSplQuote from './fixtures/quote-solana-base-spl.json'
import toSolanaQuote from './fixtures/quote-base-solana.json'
import type { QuoteAnchor } from '../quote-client'

const ADDRESS = '0x000000000000000000000000000000000000dEaD'
const SOL_ADDRESS = '1nc1nerator11111111111111111111111111111111'

const BASE = bridgeChain('base')!
const ARBITRUM = bridgeChain('arbitrum')!
const SOLANA = bridgeChain('jupiter')!

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
const USDC_SOLANA = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
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
const SOL = {
  address: '11111111111111111111111111111111',
  symbol: 'SOL',
  decimals: 9,
  native: true,
}

function anchor(over: Partial<QuoteAnchor> = {}): QuoteAnchor {
  return {
    fromChain: BASE,
    toChain: ARBITRUM,
    fromToken: USDC_BASE,
    toToken: USDC_ARBITRUM,
    fromAmountRaw: 100_000_000n,
    fromAddress: ADDRESS,
    toAddress: ADDRESS,
    quotedAt: 1_700_000_000_000,
    ...over,
  }
}

const nativeAnchor = anchor({
  fromToken: ETH,
  toToken: ETH,
  fromAmountRaw: 100_000_000_000_000_000n,
})

/** SOL out of Solana, landing as USDC on Base. */
const solNativeAnchor = anchor({
  fromChain: SOLANA,
  toChain: BASE,
  fromToken: SOL,
  toToken: USDC_BASE,
  fromAmountRaw: 100_000_000n,
  fromAddress: SOL_ADDRESS,
  toAddress: ADDRESS,
})

/** SPL USDC out of Solana, landing as USDC on Base. */
const solSplAnchor = anchor({
  fromChain: SOLANA,
  toChain: BASE,
  fromToken: USDC_SOLANA,
  toToken: USDC_BASE,
  fromAmountRaw: 10_000_000n,
  fromAddress: SOL_ADDRESS,
  toAddress: ADDRESS,
})

/** USDC out of Base, landing as SOL on Solana. */
const toSolanaAnchor = anchor({
  fromChain: BASE,
  toChain: SOLANA,
  fromToken: USDC_BASE,
  toToken: SOL,
  fromAmountRaw: 10_000_000n,
  fromAddress: ADDRESS,
  toAddress: SOL_ADDRESS,
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

describe('addressesMatch', () => {
  it('folds case on EVM, where it is only a checksum', () => {
    expect(addressesMatch('evm', ADDRESS.toLowerCase(), ADDRESS)).toBe(true)
    expect(addressesMatch('evm', ADDRESS.toUpperCase(), ADDRESS)).toBe(true)
  })

  it('does NOT fold case on Solana, where it changes the key', () => {
    // base58 uses both cases as distinct symbols. Lowercasing a pubkey before
    // comparing would make two different accounts compare equal, which on the
    // signing path is the difference between paying the user and paying
    // somebody else.
    const mixed = 'F6VBTS4nJfQ3ojKryYWsfDiwGiLnhcpg3Ruq8Tv8hiJz'
    expect(addressesMatch('svm', mixed, mixed)).toBe(true)
    expect(addressesMatch('svm', mixed.toLowerCase(), mixed)).toBe(false)
    expect(addressesMatch('svm', SOL_ADDRESS, SOL_ADDRESS)).toBe(true)
  })

  it('refuses a non-string, rather than coercing it', () => {
    expect(addressesMatch('evm', undefined, ADDRESS)).toBe(false)
    expect(addressesMatch('svm', null, SOL_ADDRESS)).toBe(false)
  })
})

describe('isBase64Payload', () => {
  it('accepts a padded base64 body and refuses everything else', () => {
    expect(isBase64Payload('AQAAAA==')).toBe(true)
    expect(isBase64Payload('0x1234')).toBe(false)
    expect(isBase64Payload('AQA')).toBe(false)
    expect(isBase64Payload('')).toBe(false)
    expect(isBase64Payload(undefined)).toBe(false)
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
    expect(route.tx.kind).toBe('evm')
    if (route.tx.kind !== 'evm') throw new Error('expected an EVM transaction')
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
    if (route.tx.kind !== 'evm') throw new Error('expected an EVM transaction')
    expect(route.tx.value).toBe('0x16345785d8a0000')
  })
})

describe('parseLifiQuote — Solana source legs', () => {
  it('parses a native SOL leg into a serialized transaction', () => {
    const route = parsed(solNativeQuote, solNativeAnchor)
    expect(route.quote.fromMarket).toBe('jupiter')
    expect(route.quote.toMarket).toBe('base')
    // 0.1 SOL at 9 decimals, not 18: a Solana leg scaled by the EVM default
    // would show a hundred-millionth of the transfer.
    expect(route.quote.amount).toBeCloseTo(0.1, 12)
    expect(route.tx.kind).toBe('svm')
    if (route.tx.kind !== 'svm')
      throw new Error('expected a Solana transaction')
    expect(isBase64Payload(route.tx.serializedTransaction)).toBe(true)
  })

  it('carries no approval address, because Solana grants no allowance', () => {
    // LI.FI fills the field with an EVM address even on a Solana leg. Carrying
    // it would invite an approval on the wrong chain.
    const route = parsed(solSplQuote, solSplAnchor)
    expect(route.approvalAddress).toBeNull()
  })

  it('reads an SPL leg through the mint decimals', () => {
    const route = parsed(solSplQuote, solSplAnchor)
    expect(route.quote.amount).toBe(10)
    expect(route.quote.symbol).toBe('USDC')
    expect(route.tx.kind).toBe('svm')
  })

  it('anchors the sender to the Solana pubkey it asked about', () => {
    const result = parseLifiQuote(
      solNativeQuote,
      anchor({
        ...solNativeAnchor,
        fromAddress: 'F6VBTS4nJfQ3ojKryYWsfDiwGiLnhcpg3Ruq8Tv8hiJz',
      }),
    )
    expect('problem' in result ? result.problem : '').toContain('sender is')
  })

  it('anchors the recipient to the EVM address on the far side', () => {
    const result = parseLifiQuote(
      anchorlessCopy(solNativeQuote),
      solNativeAnchor,
    )
    expect('problem' in result && result.problem).toContain('recipient is')
  })
})

describe('parseLifiQuote — Solana destination legs', () => {
  const route = parsed(toSolanaQuote, toSolanaAnchor)

  it('stays an EVM transaction: only the recipient is on Solana', () => {
    expect(route.tx.kind).toBe('evm')
    if (route.tx.kind !== 'evm') throw new Error('expected an EVM transaction')
    expect(route.tx.chainId).toBe(8453)
    expect(route.approvalAddress).not.toBeNull()
  })

  it('scales what lands by the destination chain decimals', () => {
    expect(route.quote.toMarket).toBe('jupiter')
    expect(route.quote.toSymbol).toBe('SOL')
    expect(route.quote.amountOut).toBeCloseTo(0.131387531, 12)
    expect(route.quote.amountOutMin).toBeCloseTo(0.130730593, 12)
  })

  it('refuses a recipient that is not the wallet pubkey it asked about', () => {
    const result = parseLifiQuote(
      toSolanaQuote,
      anchor({
        ...toSolanaAnchor,
        toAddress: 'So11111111111111111111111111111111111111112',
      }),
    )
    expect('problem' in result && result.problem).toContain('recipient is')
  })
})

describe('parseLifiQuote — the transaction kind', () => {
  it('refuses an EVM transaction on a Solana source leg', () => {
    const swapped = {
      ...solNativeQuote,
      transactionRequest: {
        to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
        data: '0xdeadbeef',
      },
    }
    const result = parseLifiQuote(swapped, solNativeAnchor)
    expect('problem' in result && result.problem).toContain(
      'answered with an EVM transaction',
    )
  })

  it('refuses a Solana leg whose payload is not base64', () => {
    const mangled = {
      ...solNativeQuote,
      transactionRequest: { data: '0xnot-base64' },
    }
    const result = parseLifiQuote(mangled, solNativeAnchor)
    expect('problem' in result && result.problem).toContain(
      'no serialized transaction',
    )
  })

  it('refuses an EVM leg with no transaction request', () => {
    const { transactionRequest: _dropped, ...noTx } = erc20Quote as Record<
      string,
      unknown
    >
    expect(parseLifiQuote(noTx, anchor())).toEqual({
      problem: 'no transaction request',
    })
  })
})

describe('parseLifiQuote — the anchor', () => {
  it('refuses a response about a different chain', () => {
    const result = parseLifiQuote(erc20Quote, anchor({ toChain: BASE }))
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
    // The recipient is encoded inside a payload this connector cannot decode.
    // The stated one is checkable, and a mismatch is the shape of the attack
    // that matters most here.
    const result = parseLifiQuote(
      erc20Quote,
      anchor({ fromAddress: '0x1111111111111111111111111111111111111111' }),
    )
    expect('problem' in result && result.problem).toContain('sender is')
  })

  it('refuses a body that is not a quote at all', () => {
    expect(parseLifiQuote(null, anchor())).toEqual({ problem: 'not an object' })
    expect(parseLifiQuote({}, anchor())).toEqual({
      problem: 'missing action or estimate',
    })
  })
})

/** The same recording with the destination address moved to somebody else. */
function anchorlessCopy(raw: typeof solNativeQuote): unknown {
  return {
    ...raw,
    action: {
      ...raw.action,
      toAddress: '0x1111111111111111111111111111111111111111',
    },
  }
}
