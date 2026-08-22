// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Picking WHICH contract a Legendary row opens.
 *
 * The numbers below were measured on 2026-08-22 and are the reason this rule
 * is liquidity-based rather than a chain-preference list. Note what they show:
 * BONK is Solana-native and SPX6900 is Ethereum-native, so no fixed ordering
 * of chains can serve both, and whichever order you pick sends one of them to
 * a bridged wrapper holding a rounding error of liquidity.
 */
import { describe, expect, test } from 'bun:test'

import { depthKey, pickDeepest } from '../legendary-links'
import type { LinkCandidate } from '../legendary-links'

const candidate = (
  coinId: string,
  market: string,
  chain: string,
  address: string,
): LinkCandidate => ({ coinId, market, chain, address })

describe('pickDeepest', () => {
  test('sends BONK to Solana and SPX6900 to Ethereum, which no fixed order can', () => {
    const candidates = [
      candidate('bonk', 'jupiter', 'solana', 'DezXAZ8z'),
      candidate('bonk', 'bsc', 'bsc', '0xbonkBsc'),
      candidate('bonk', 'ethereum', 'ethereum', '0xbonkEth'),
      candidate('spx6900', 'jupiter', 'solana', 'J3NKxxXZ'),
      candidate('spx6900', 'ethereum', 'ethereum', '0xE0f63A42'),
      candidate('spx6900', 'base', 'base', '0xspxBase'),
    ]
    const depths = new Map([
      [depthKey('solana', 'DezXAZ8z'), 2_206_673],
      [depthKey('bsc', '0xbonkBsc'), 122_689],
      [depthKey('ethereum', '0xbonkEth'), 117_867],
      // The Solana SPX contract CoinGecko lists has no pools at all.
      [depthKey('solana', 'J3NKxxXZ'), 0],
      [depthKey('ethereum', '0xE0f63A42'), 12_823_287],
      [depthKey('base', '0xspxBase'), 982_495],
    ])

    const picked = pickDeepest(candidates, depths)
    expect(picked.get('bonk')).toEqual({
      chain: 'solana',
      market: 'jupiter',
      address: 'DezXAZ8z',
    })
    expect(picked.get('spx6900')).toEqual({
      chain: 'ethereum',
      market: 'ethereum',
      address: '0xE0f63A42',
    })
  })

  test('a cross-chain address collision cannot leak liquidity between chains', () => {
    // Real case: querying PEPE's Ethereum contract returns $32.6M on Ethereum
    // AND $37k on PulseChain under the IDENTICAL address string. Keyed on the
    // address alone those sum, and a chain that holds nothing can inherit the
    // depth of one that holds everything.
    const shared = '0x6982508145454ce325ddbe47a25d4ec3d2311933'
    const candidates = [
      candidate('pepe', 'ethereum', 'ethereum', shared),
      candidate('pepe', 'arbitrum', 'arbitrum', shared),
    ]
    const depths = new Map([
      [depthKey('ethereum', shared), 32_580_874],
      [depthKey('arbitrum', shared), 355_204],
    ])
    expect(pickDeepest(candidates, depths).get('pepe')?.chain).toBe('ethereum')
  })

  test('is case-insensitive on EVM addresses and exact on base58', () => {
    // An EVM address arrives checksummed from one source and lowercased from
    // another; a Solana mint is base58 and case-SENSITIVE, so the key
    // lowercases only for matching and never rewrites what gets linked.
    expect(depthKey('ethereum', '0xAbCd')).toBe(depthKey('ethereum', '0xabcd'))
    expect(depthKey('solana', 'DezXAZ')).not.toBe(
      depthKey('ethereum', 'DezXAZ'),
    )
  })

  test('believes a lone candidate even with nothing measured', () => {
    // GIGACHAD lists exactly one contract. There is no tiebreak to lose, and a
    // token DexScreener has not indexed is still the right token.
    const picked = pickDeepest(
      [candidate('gigachad-2', 'jupiter', 'solana', '63LfDmNb')],
      new Map(),
    )
    expect(picked.get('gigachad-2')?.address).toBe('63LfDmNb')
  })

  test('refuses to guess when several candidates all measured zero', () => {
    // The tiebreak told us nothing, so picking the first one CoinGecko listed
    // is how a wrapper with no pools wins. No link is the honest answer.
    const picked = pickDeepest(
      [
        candidate('mystery', 'bsc', 'bsc', '0xa'),
        candidate('mystery', 'polygon', 'polygon', '0xb'),
      ],
      new Map(),
    )
    expect(picked.has('mystery')).toBe(false)
  })

  test('a coin with no candidates at all is simply absent', () => {
    // DOGE has no contract on any chain. It stays informational rather than
    // being linked to a wrapped representation nobody asked for.
    expect(pickDeepest([], new Map()).size).toBe(0)
  })
})
