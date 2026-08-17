// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The checks that stand between an API response and a signature.
 *
 * Every case here is a way a bridge transfer loses money that no amount of UI
 * polish would catch: an unknown contract holding an ERC-20 approval, native
 * value attached to a token transfer, a route built for another chain, a
 * re-quote that dropped below what the user confirmed.
 */
import { describe, expect, it } from 'bun:test'

import {
  acceptableRequote,
  isAllowedLifiContract,
  parseTxValue,
  validateBridgeTransaction,
} from '../bridge-executor'

const DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'
const CALLDATA = `0x9e75aa95${'0'.repeat(64)}`

function input(over: Record<string, unknown> = {}) {
  return {
    tx: { to: DIAMOND, data: CALLDATA, value: '0x0', chainId: 8453 },
    approvalAddress: DIAMOND,
    expectedChainId: 8453,
    fromAmountRaw: 100_000_000n,
    isNativeSend: false,
    ...over,
  } as Parameters<typeof validateBridgeTransaction>[0]
}

describe('isAllowedLifiContract', () => {
  it('accepts the diamond in any casing and nothing else', () => {
    expect(isAllowedLifiContract(DIAMOND)).toBe(true)
    expect(isAllowedLifiContract(DIAMOND.toLowerCase())).toBe(true)
    expect(
      isAllowedLifiContract('0x0000000000000000000000000000000000000001'),
    ).toBe(false)
    expect(isAllowedLifiContract(undefined)).toBe(false)
  })
})

describe('parseTxValue', () => {
  it('reads hex and decimal, and treats absent as zero', () => {
    expect(parseTxValue('0x0')).toBe(0n)
    expect(parseTxValue('0x16345785d8a0000')).toBe(100_000_000_000_000_000n)
    expect(parseTxValue('250')).toBe(250n)
    expect(parseTxValue(null)).toBe(0n)
  })

  it('refuses anything else rather than defaulting it to zero', () => {
    // A value that cannot be read is a refusal: reading it as zero would send
    // a native transfer with no funds attached and burn the gas.
    expect(parseTxValue('lots')).toBeNull()
    expect(parseTxValue('1.5')).toBeNull()
  })
})

describe('validateBridgeTransaction', () => {
  it('passes a well-formed ERC-20 route', () => {
    const result = validateBridgeTransaction(input())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.to).toBe(DIAMOND as `0x${string}`)
      expect(result.value).toBe(0n)
    }
  })

  it('passes a native route whose value is exactly the amount', () => {
    const result = validateBridgeTransaction(
      input({
        isNativeSend: true,
        fromAmountRaw: 100_000_000_000_000_000n,
        tx: {
          to: DIAMOND,
          data: CALLDATA,
          value: '0x16345785d8a0000',
          chainId: 8453,
        },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('refuses an unknown target contract', () => {
    const result = validateBridgeTransaction(
      input({
        tx: {
          to: '0x00000000000000000000000000000000000000ff',
          data: CALLDATA,
          value: '0x0',
          chainId: 8453,
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('unrecognised contract')
  })

  it('refuses an unknown approval spender', () => {
    const result = validateBridgeTransaction(
      input({ approvalAddress: '0x00000000000000000000000000000000000000ff' }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('unrecognised spender')
  })

  it('ignores the spender on a native transfer, which grants no allowance', () => {
    const result = validateBridgeTransaction(
      input({
        isNativeSend: true,
        approvalAddress: '0x0000000000000000000000000000000000000000',
        fromAmountRaw: 5n,
        tx: { to: DIAMOND, data: CALLDATA, value: '5', chainId: 8453 },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('refuses malformed calldata', () => {
    for (const data of ['not-hex', '0x', '0xzz', '0x1234']) {
      const result = validateBridgeTransaction(
        input({ tx: { to: DIAMOND, data, value: '0x0', chainId: 8453 } }),
      )
      expect(result.ok).toBe(false)
    }
  })

  it('refuses a route built for another chain', () => {
    const result = validateBridgeTransaction(
      input({ tx: { to: DIAMOND, data: CALLDATA, value: '0x0', chainId: 1 } }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('chain 1')
  })

  it('accepts a route that states no chain id', () => {
    const result = validateBridgeTransaction(
      input({
        tx: { to: DIAMOND, data: CALLDATA, value: '0x0', chainId: null },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('refuses native value attached to a token transfer', () => {
    const result = validateBridgeTransaction(
      input({ tx: { to: DIAMOND, data: CALLDATA, value: '1', chainId: 8453 } }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('alongside a token transfer')
  })

  it('refuses a native transfer whose value is not the amount', () => {
    // Both directions: too much drains the wallet, too little sends a transfer
    // the bridge will not honour.
    for (const value of ['0x16345785d8a0001', '0x16345785d89ffff']) {
      const result = validateBridgeTransaction(
        input({
          isNativeSend: true,
          fromAmountRaw: 100_000_000_000_000_000n,
          tx: { to: DIAMOND, data: CALLDATA, value, chainId: 8453 },
        }),
      )
      expect(result.ok).toBe(false)
    }
  })
})

describe('acceptableRequote', () => {
  it('accepts drift inside the tolerance', () => {
    expect(
      acceptableRequote({
        accepted: 100,
        requoted: 99.6,
        maxSlippageBps: 50,
      }).ok,
    ).toBe(true)
  })

  it('refuses a re-quote below the confirmed floor', () => {
    const result = acceptableRequote({
      accepted: 100,
      requoted: 99,
      maxSlippageBps: 50,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Nothing was sent')
  })

  it('refuses a route that stopped guaranteeing anything', () => {
    const result = acceptableRequote({
      accepted: 100,
      requoted: null,
      maxSlippageBps: 50,
    })
    expect(result.ok).toBe(false)
  })

  it('has nothing to check when the caller accepted no floor', () => {
    expect(
      acceptableRequote({ accepted: 0, requoted: null, maxSlippageBps: 50 }).ok,
    ).toBe(true)
  })
})
