// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  DEX_CHAINS,
  dexChain,
  explorerAddressUrl,
  explorerTxUrl,
} from '../chain-catalog'
import { splitPairKey } from '../pair-legs'
import { poolPairKey } from '../pool-pair'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const EVM_TOKEN = '0xbf927b841994731c573bdf09ceb0c6b0aa887cdd'

describe('splitPairKey', () => {
  it('splits on the LAST dash, so an address base survives', () => {
    // The invariant a user notices when it breaks: an address-keyed pair is
    // how the see-what-you-trade rule pins one PEPE out of hundreds, and a
    // split on the first dash would truncate it into a different token.
    expect(splitPairKey(`${EVM_TOKEN}-USDC`)).toEqual({
      base: EVM_TOKEN,
      quote: 'USDC',
    })
    expect(splitPairKey(`${SOL_MINT}-USDC`)).toEqual({
      base: SOL_MINT,
      quote: 'USDC',
    })
    expect(splitPairKey('SOL-USDC')).toEqual({ base: 'SOL', quote: 'USDC' })
  })

  it('rejects a key that is not two legs', () => {
    expect(splitPairKey('SOL')).toBeNull()
    expect(splitPairKey('-USDC')).toBeNull()
    expect(splitPairKey('SOL-')).toBeNull()
    expect(splitPairKey(undefined)).toBeNull()
  })
})

describe('poolPairKey', () => {
  const base = {
    market: 'base',
    address: '0xpool',
    name: 'TOKEN / USDC',
    dexName: 'aerodrome',
    baseSymbol: 'TOKEN',
    quoteSymbol: 'USDC',
  }

  it('prefers the base ADDRESS the row displayed', () => {
    expect(poolPairKey({ ...base, baseAddress: EVM_TOKEN })).toBe(
      `${EVM_TOKEN}-USDC`,
    )
  })

  it('falls back to the ticker only when the listing had no address', () => {
    expect(poolPairKey({ ...base, baseAddress: null })).toBe('TOKEN-USDC')
  })

  it('is undefined when there is nothing to resolve', () => {
    expect(
      poolPairKey({ ...base, baseAddress: null, baseSymbol: null }),
    ).toBeUndefined()
  })
})

describe('chain catalog', () => {
  it('carries every bundled DEX chain, Solana first', () => {
    expect(DEX_CHAINS[0].market).toBe('jupiter')
    expect(DEX_CHAINS.map((c) => c.market)).toEqual([
      'jupiter',
      'ethereum',
      'base',
      'arbitrum',
      'bsc',
      'polygon',
    ])
  })

  it('names a connector id that matches the bundled plugin ids', () => {
    expect(dexChain('base')!.connectorPluginId).toBe('base-dex-connector')
    expect(dexChain('jupiter')!.connectorPluginId).toBe('jupiter-dex-connector')
  })

  it('quotes Solana with no gas price, because there is none to quote', () => {
    expect(dexChain('jupiter')!.hasGasPrice).toBe(false)
    expect(dexChain('base')!.hasGasPrice).toBe(true)
  })

  it('links a transaction on the right explorer', () => {
    expect(explorerTxUrl('base', '0xabc')).toBe('https://basescan.org/tx/0xabc')
    expect(explorerTxUrl('jupiter', 'sig')).toBe('https://solscan.io/tx/sig')
  })

  it('uses each explorer own word for a wallet page', () => {
    // Solscan has no /address route; an EVM scanner has no /account one, so
    // one shared path would 404 on half the tape.
    expect(explorerAddressUrl('base', '0xabc')).toBe(
      'https://basescan.org/address/0xabc',
    )
    expect(explorerAddressUrl('jupiter', 'pubkey')).toBe(
      'https://solscan.io/account/pubkey',
    )
  })

  it('links nothing for an unknown chain or a missing hash', () => {
    expect(explorerTxUrl('okx', '0xabc')).toBeNull()
    expect(explorerTxUrl('base', null)).toBeNull()
    expect(dexChain(undefined)).toBeNull()
  })
})
