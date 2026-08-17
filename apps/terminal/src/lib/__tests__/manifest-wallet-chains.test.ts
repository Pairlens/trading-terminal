// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The wallet-family normalizer behind both provisioning predicates.
 *
 * A manifest declares `walletChain` as a bare string (every single-family
 * connector) or an array (the bridge, which signs on Solana and receives on
 * EVM). Both the wallet-provisioning loop and the Solana RPC re-point loop
 * compare through this one helper, so a shape neither expects must normalize
 * to "no wallet" rather than coerce.
 */
import { describe, expect, test } from 'bun:test'

import { manifestWalletChains } from '../market-data-provider'

describe('manifestWalletChains', () => {
  test('bare string becomes a one-element list', () => {
    expect(manifestWalletChains({ walletChain: 'solana' })).toEqual(['solana'])
  })

  test('array passes through in order', () => {
    expect(
      manifestWalletChains({ walletChain: ['ethereum', 'solana'] }),
    ).toEqual(['ethereum', 'solana'])
  })

  test('non-string members are dropped, not coerced', () => {
    expect(
      manifestWalletChains({ walletChain: ['ethereum', 7, null, 'solana'] }),
    ).toEqual(['ethereum', 'solana'])
  })

  test('absent, undefined metadata, and junk shapes mean no wallet', () => {
    expect(manifestWalletChains(undefined)).toEqual([])
    expect(manifestWalletChains({})).toEqual([])
    expect(manifestWalletChains({ walletChain: 42 })).toEqual([])
    expect(manifestWalletChains({ walletChain: { chain: 'evm' } })).toEqual([])
  })
})
