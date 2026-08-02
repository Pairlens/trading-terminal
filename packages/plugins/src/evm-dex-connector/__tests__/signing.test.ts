// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { coerceTypedMessage, signTypedPayload } from '../limit-order-client'

// Well-known test vector key (hardhat account #0) — never holds real funds
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const TEST_ADDRESS = privateKeyToAccount(TEST_KEY).address

// Payload shapes captured live from the KyberSwap DSLO API (2026-06-12):
// /write/api/v1/orders/sign-message returns {types, domain, primaryType,
// message} with uints serialized as STRINGS — the exact case our signer's
// coercion handles.
const ORDER_PAYLOAD = {
  primaryType: 'Order',
  domain: {
    name: 'Kyber DSLO Protocol',
    version: '1',
    chainId: 8453,
    verifyingContract:
      '0xcab2FA2eeab7065B45CBcF6E3936dDE2506b4f6C' as `0x${string}`,
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Order: [
      { name: 'salt', type: 'uint256' },
      { name: 'makerAsset', type: 'address' },
      { name: 'takerAsset', type: 'address' },
      { name: 'maker', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'allowedSender', type: 'address' },
      { name: 'makingAmount', type: 'uint256' },
      { name: 'takingAmount', type: 'uint256' },
      { name: 'feeConfig', type: 'uint256' },
      { name: 'makerAssetData', type: 'bytes' },
      { name: 'takerAssetData', type: 'bytes' },
      { name: 'getMakerAmount', type: 'bytes' },
      { name: 'getTakerAmount', type: 'bytes' },
      { name: 'predicate', type: 'bytes' },
      { name: 'interaction', type: 'bytes' },
    ],
  },
  message: {
    salt: '45516154415019814413958125659964',
    makerAsset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    takerAsset: '0x4200000000000000000000000000000000000006',
    maker: TEST_ADDRESS.toLowerCase(),
    receiver: TEST_ADDRESS.toLowerCase(),
    allowedSender: '0x0000000000000000000000000000000000000000',
    makingAmount: '10000000',
    takingAmount: '6000000000000000',
    feeConfig: '0',
    makerAssetData: '0x',
    takerAssetData: '0x',
    getMakerAmount: '0x',
    getTakerAmount: '0x',
    predicate: '0x',
    interaction: '0x',
  },
}

const CANCEL_PAYLOAD = {
  primaryType: 'CancelOrder',
  domain: {
    name: 'Kyber DSLO Protocol',
    version: '1',
    chainId: 8453,
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ],
    CancelOrder: [
      { name: 'chainId', type: 'string' },
      { name: 'maker', type: 'address' },
      { name: 'orderIds', type: 'uint64[]' },
    ],
  },
  message: {
    chainId: '8453',
    maker: TEST_ADDRESS.toLowerCase(),
    orderIds: [42],
  },
}

describe('signTypedPayload — EIP-712 signature recovery', () => {
  it('signs a DSLO Order payload that recovers to the signing address', async () => {
    const signature = await signTypedPayload(ORDER_PAYLOAD, TEST_KEY)

    const { EIP712Domain: _d, ...types } = ORDER_PAYLOAD.types
    const recovered = await recoverTypedDataAddress({
      domain: ORDER_PAYLOAD.domain,
      types,
      primaryType: 'Order',
      message: coerceTypedMessage(
        ORDER_PAYLOAD.types,
        'Order',
        ORDER_PAYLOAD.message,
      ),
      signature,
    } as Parameters<typeof recoverTypedDataAddress>[0])

    expect(recovered).toBe(TEST_ADDRESS)
  })

  it('signs a CancelOrder payload that recovers to the signing address', async () => {
    const signature = await signTypedPayload(CANCEL_PAYLOAD, TEST_KEY)

    const { EIP712Domain: _d, ...types } = CANCEL_PAYLOAD.types
    const recovered = await recoverTypedDataAddress({
      domain: CANCEL_PAYLOAD.domain,
      types,
      primaryType: 'CancelOrder',
      message: coerceTypedMessage(
        CANCEL_PAYLOAD.types,
        'CancelOrder',
        CANCEL_PAYLOAD.message,
      ),
      signature,
    } as Parameters<typeof recoverTypedDataAddress>[0])

    expect(recovered).toBe(TEST_ADDRESS)
  })

  it('accepts keys without the 0x prefix', async () => {
    const signature = await signTypedPayload(CANCEL_PAYLOAD, TEST_KEY.slice(2))
    expect(signature.startsWith('0x')).toBe(true)
    expect(signature.length).toBe(132) // 65-byte r||s||v signature
  })

  it('a different key does NOT recover to the same address', async () => {
    const otherKey =
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    const signature = await signTypedPayload(ORDER_PAYLOAD, otherKey)

    const { EIP712Domain: _d, ...types } = ORDER_PAYLOAD.types
    const recovered = await recoverTypedDataAddress({
      domain: ORDER_PAYLOAD.domain,
      types,
      primaryType: 'Order',
      message: coerceTypedMessage(
        ORDER_PAYLOAD.types,
        'Order',
        ORDER_PAYLOAD.message,
      ),
      signature,
    } as Parameters<typeof recoverTypedDataAddress>[0])

    expect(recovered).not.toBe(TEST_ADDRESS)
  })
})
