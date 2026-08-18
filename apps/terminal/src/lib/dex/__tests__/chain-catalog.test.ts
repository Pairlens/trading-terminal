// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { dexChain, dexChainByNetwork } from '../chain-catalog'

describe('dexChainByNetwork', () => {
  it('finds Solana by its network slug, which its market id is not', () => {
    // The whole reason the lookup exists: token rows say 'solana', the rail
    // says 'jupiter', and a market-keyed lookup answers null for the chain
    // every DEX token row in the terminal belongs to.
    expect(dexChain('solana')).toBeNull()
    expect(dexChainByNetwork('solana')?.displayName).toBe('Solana')
    expect(dexChainByNetwork('solana')?.market).toBe('jupiter')
  })

  it('finds an EVM chain, whose slug and market are the same string', () => {
    expect(dexChainByNetwork('base')?.market).toBe('base')
    expect(dexChainByNetwork('BASE')?.market).toBe('base')
  })

  it('answers null rather than guessing at an unknown chain', () => {
    expect(dexChainByNetwork('sui')).toBeNull()
    expect(dexChainByNetwork(undefined)).toBeNull()
    expect(dexChainByNetwork('')).toBeNull()
  })
})
