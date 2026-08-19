// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { selectDisplayToken, tokenDirectoryKey } from '../token-directory-store'
import type { TokenDirectoryEntry } from '../token-directory-store'

const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const WETH_BASE = '0x4200000000000000000000000000000000000006'

function directory(
  ...entries: Array<TokenDirectoryEntry>
): Record<string, TokenDirectoryEntry> {
  return Object.fromEntries(
    entries.map((e) => [tokenDirectoryKey(e.chain, e.address), e]),
  )
}

describe('selectDisplayToken', () => {
  const usdt: TokenDirectoryEntry = {
    chain: 'ethereum',
    address: USDT,
    symbol: 'USDT',
  }

  it('answers an exact chain + address read', () => {
    expect(selectDisplayToken(directory(usdt), USDT, 'ethereum')).toEqual(usdt)
  })

  it('answers from the address alone, which is all a pair key carries', () => {
    expect(selectDisplayToken(directory(usdt), USDT)).toEqual(usdt)
  })

  it('reads a checksummed address, which is how explorers write them', () => {
    const checksummed = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    expect(selectDisplayToken(directory(usdt), checksummed)?.symbol).toBe(
      'USDT',
    )
  })

  it('answers when two chains agree on the ticker', () => {
    const entries = directory(
      { chain: 'base', address: WETH_BASE, symbol: 'WETH' },
      { chain: 'arbitrum', address: WETH_BASE, symbol: 'WETH' },
    )
    expect(selectDisplayToken(entries, WETH_BASE)?.symbol).toBe('WETH')
  })

  it('refuses when two chains disagree, rather than labelling a row wrong', () => {
    const entries = directory(
      { chain: 'base', address: WETH_BASE, symbol: 'WETH' },
      { chain: 'bsc', address: WETH_BASE, symbol: 'SCAM' },
    )
    expect(selectDisplayToken(entries, WETH_BASE)).toBeNull()
    // The chain resolves it: an exact read is never ambiguous.
    expect(selectDisplayToken(entries, WETH_BASE, 'base')?.symbol).toBe('WETH')
  })

  it('has nothing to say about an address nobody pinned', () => {
    expect(selectDisplayToken(directory(usdt), WETH_BASE)).toBeNull()
    expect(selectDisplayToken(directory(usdt), undefined)).toBeNull()
  })

  it('rebuilds its index when a pin lands', () => {
    const before = directory(usdt)
    expect(selectDisplayToken(before, WETH_BASE)).toBeNull()
    const after = {
      ...before,
      ...directory({ chain: 'base', address: WETH_BASE, symbol: 'WETH' }),
    }
    expect(selectDisplayToken(after, WETH_BASE)?.symbol).toBe('WETH')
  })
})
