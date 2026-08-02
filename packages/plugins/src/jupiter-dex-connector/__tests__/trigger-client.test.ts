// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { toNormalizedTriggerOrder } from '../trigger-client'
import { assertOrderConformant } from '../../test-utils/conformance'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL = 'So11111111111111111111111111111111111111112'

describe('toNormalizedTriggerOrder — Jupiter Trigger API mapping', () => {
  it('maps a buy (stable escrowed for base) with price = quote/base', () => {
    const order = toNormalizedTriggerOrder({
      orderKey: 'ORDER1',
      inputMint: USDC,
      outputMint: SOL,
      makingAmount: '90',
      takingAmount: '0.5',
      remainingMakingAmount: '90',
      status: 'Open',
      createdAt: '2026-06-12T10:00:00Z',
    })

    expect(order?.side).toBe('buy')
    expect(order?.type).toBe('limit')
    expect(Number(order?.size)).toBeCloseTo(0.5)
    expect(Number(order?.price)).toBeCloseTo(180)
    expect(order?.status).toBe('live')
    expect(Number(order?.fillSize)).toBe(0)
    assertOrderConformant(order!)
  })

  it('maps a sell (base escrowed for stable) and partial fills', () => {
    const order = toNormalizedTriggerOrder({
      orderKey: 'ORDER2',
      inputMint: SOL,
      outputMint: USDC,
      makingAmount: '2',
      takingAmount: '400',
      remainingMakingAmount: '1',
      status: 'Open',
      createdAt: '2026-06-12T10:00:00Z',
    })

    expect(order?.side).toBe('sell')
    expect(Number(order?.size)).toBeCloseTo(2)
    expect(Number(order?.price)).toBeCloseTo(200)
    // Half the making amount remains → half filled
    expect(Number(order?.fillSize)).toBeCloseTo(1)
  })

  it('maps history statuses', () => {
    const filled = toNormalizedTriggerOrder({
      orderKey: 'O3',
      inputMint: SOL,
      outputMint: USDC,
      makingAmount: '1',
      takingAmount: '200',
      status: 'Completed',
    })
    const cancelled = toNormalizedTriggerOrder({
      orderKey: 'O4',
      inputMint: SOL,
      outputMint: USDC,
      makingAmount: '1',
      takingAmount: '200',
      status: 'Cancelled',
    })
    expect(filled?.status).toBe('filled')
    expect(Number(filled?.fillSize)).toBeCloseTo(1)
    expect(cancelled?.status).toBe('cancelled')
  })

  it('rejects malformed orders', () => {
    expect(toNormalizedTriggerOrder({})).toBeNull()
    expect(toNormalizedTriggerOrder({ orderKey: 'X' })).toBeNull()
  })
})
