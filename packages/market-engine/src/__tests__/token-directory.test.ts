// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  clearTokenDirectory,
  isEvmAddress,
  isSolanaAddress,
  isTokenAddress,
  lookupToken,
  registerToken,
} from '../token-directory'

beforeEach(() => {
  clearTokenDirectory()
})

describe('token directory — register/lookup', () => {
  it('is case-insensitive on symbol and scoped by network', () => {
    registerToken({
      network: 'base',
      symbol: 'Brett',
      address: '0xccc1',
      decimals: 18,
    })
    expect(lookupToken('base', 'BRETT')?.address).toBe('0xccc1')
    expect(lookupToken('base', 'brett')?.address).toBe('0xccc1')
    expect(lookupToken('ethereum', 'BRETT')).toBeNull()
  })

  it('last registration wins for the same (network, symbol)', () => {
    registerToken({ network: 'solana', symbol: 'WIF', address: 'mint1' })
    registerToken({ network: 'solana', symbol: 'WIF', address: 'mint2' })
    expect(lookupToken('solana', 'WIF')?.address).toBe('mint2')
  })
})

describe('address detection', () => {
  it('detects EVM contract addresses', () => {
    expect(isEvmAddress('0x532f27101965dd16442E59d40670FaF5eBB142E4')).toBe(
      true,
    )
    expect(isEvmAddress('0x123')).toBe(false)
    expect(isEvmAddress('532f27101965dd16442E59d40670FaF5eBB142E4')).toBe(false)
  })

  it('detects Solana mint addresses but not short tickers', () => {
    expect(
      isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    ).toBe(true)
    expect(isSolanaAddress('SOL')).toBe(false)
    expect(isSolanaAddress('PEPE')).toBe(false)
    // base58 alphabet excludes 0, O, I, l
    expect(isSolanaAddress('0OIl000000000000000000000000000000000000')).toBe(
      false,
    )
  })

  it('isTokenAddress covers both chains', () => {
    expect(isTokenAddress('0x532f27101965dd16442E59d40670FaF5eBB142E4')).toBe(
      true,
    )
    expect(isTokenAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(
      true,
    )
    expect(isTokenAddress('BTC')).toBe(false)
  })
})
