// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  chainAbbr,
  learnedTokenPin,
  splitDexPairKey,
  tokenTicker,
} from '../token-label'

const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const WSOL = 'So11111111111111111111111111111111111111112'

describe('splitDexPairKey', () => {
  it('splits on the last dash, because the quote is one plain ticker', () => {
    expect(splitDexPairKey(`${USDT}-USDC`)).toEqual([USDT, 'USDC'])
  })

  it('leaves a key with no quote leg whole', () => {
    expect(splitDexPairKey(USDT)).toEqual([USDT, ''])
  })
})

describe('tokenTicker', () => {
  it('renders the pinned ticker when the directory knows the address', () => {
    expect(
      tokenTicker(USDT, { chain: 'ethereum', address: USDT, symbol: 'USDT' }),
    ).toEqual({ label: 'USDT', isAddress: false })
  })

  it('shortens both ends when nothing is pinned', () => {
    expect(tokenTicker(USDT, null)).toEqual({
      label: '0xdac1…1ec7',
      isAddress: true,
    })
  })

  it('shortens a Solana mint too', () => {
    expect(tokenTicker(WSOL, null).label).toBe('So1111…1112')
  })

  it('leaves a CEX leg untouched, so the common path is unchanged', () => {
    expect(tokenTicker('BTC', null)).toEqual({
      label: 'BTC',
      isAddress: false,
    })
  })
})

describe('chainAbbr', () => {
  it('names a catalog chain', () => {
    expect(chainAbbr('jupiter')).toBe('SOL')
  })

  it('falls back to the market id for a connector the catalog lacks', () => {
    expect(chainAbbr('somechain')).toBe('SOMECHAIN')
  })

  it('says nothing without a market', () => {
    expect(chainAbbr(undefined)).toBeNull()
  })
})

describe('learnedTokenPin', () => {
  const stats = { baseSymbol: 'USDT', quoteSymbol: 'USDC' }

  it('names the base token of the pool it resolved', () => {
    expect(learnedTokenPin('ethereum', `${USDT}-USDC`, stats)).toEqual({
      chain: 'ethereum',
      address: USDT,
      symbol: 'USDT',
    })
  })

  it('refuses a flipped pool rather than labelling the wrong leg', () => {
    expect(
      learnedTokenPin('ethereum', `${USDT}-USDC`, {
        baseSymbol: 'PEPE',
        quoteSymbol: 'WETH',
      }),
    ).toBeNull()
  })

  it('matches the quote case-insensitively', () => {
    expect(learnedTokenPin('ethereum', `${USDT}-usdc`, stats)?.symbol).toBe(
      'USDT',
    )
  })

  it('learns nothing from a CEX pair key', () => {
    expect(learnedTokenPin('okx', 'BTC-USDT', stats)).toBeNull()
  })

  it('learns nothing when the provider answers with an address', () => {
    expect(
      learnedTokenPin('ethereum', `${USDT}-USDC`, {
        baseSymbol: USDT,
        quoteSymbol: 'USDC',
      }),
    ).toBeNull()
  })

  it('learns nothing from a half-answered pool', () => {
    expect(
      learnedTokenPin('ethereum', `${USDT}-USDC`, {
        baseSymbol: 'USDT',
        quoteSymbol: null,
      }),
    ).toBeNull()
  })
})
