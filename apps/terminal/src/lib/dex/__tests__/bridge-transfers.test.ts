// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The transfer ledger's rules, which are all about what must NOT be forgotten.
 *
 * A transfer is the only record the terminal keeps of funds that have left one
 * chain and not yet arrived on another. So the pruning has an exception carved
 * into it (a pending transfer is never dropped by age: that is a stuck
 * transfer, not stale data), and folding a status poll never blanks a field the
 * row already had.
 */
import { describe, expect, it } from 'bun:test'

import {
  TRANSFER_RETENTION_MS,
  pruneTransfers,
  transfersForWallet,
  upsertTransfer,
} from '../bridge-transfers-store'
import { applyStatusUpdate, transferFromExecution } from '../bridge-types'
import type { BridgeQuote, BridgeTransfer } from '../bridge-types'

const NOW = 1_800_000_000_000
const WALLET = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'

const QUOTE: BridgeQuote = {
  fromMarket: 'base',
  toMarket: 'arbitrum',
  symbol: 'USDC',
  toSymbol: 'USDC',
  amount: 100,
  amountOut: 99.75,
  amountOutMin: 99.5,
  feeUsd: 0.25,
  feeIncluded: true,
  gasUsd: 0.01,
  etaSeconds: 7,
  tool: 'eco',
  provider: 'LI.FI',
  quotedAt: NOW,
}

function transfer(over: Partial<BridgeTransfer> = {}): BridgeTransfer {
  return {
    ...transferFromExecution({
      quote: QUOTE,
      sourceTxHash: '0xaaa',
      walletAddress: WALLET,
      now: NOW,
    }),
    ...over,
  }
}

describe('transferFromExecution', () => {
  it('records the quote that was signed, and nothing it cannot know yet', () => {
    const row = transfer()
    expect(row.id).toBe('0xaaa')
    // Lowercased: the wallet list is keyed on it, and an address is
    // case-insensitive on every EVM chain.
    expect(row.walletAddress).toBe(WALLET.toLowerCase())
    expect(row.expectedAmountOut).toBe(99.75)
    expect(row.amountOut).toBeNull()
    expect(row.status).toBe('pending')
    // Both, or neither. LI.FI publishes stages, not block counts.
    expect(row.confirmations).toBeNull()
    expect(row.requiredConfirmations).toBeNull()
  })
})

describe('applyStatusUpdate', () => {
  const base = transfer()

  it('folds in a landed transfer', () => {
    const next = applyStatusUpdate(
      base,
      {
        status: 'confirmed',
        substatus: 'COMPLETED',
        substatusMessage: 'The transfer is complete.',
        sourceTxHash: '0xaaa',
        destinationTxHash: '0xbbb',
        amountOut: 99.74,
        explorerUrl: 'https://scan.li.fi/tx/0xaaa',
        found: true,
      },
      NOW + 30_000,
    )
    expect(next.status).toBe('confirmed')
    expect(next.amountOut).toBe(99.74)
    expect(next.destinationTxHash).toBe('0xbbb')
    expect(next.updatedAt).toBe(NOW + 30_000)
  })

  it('leaves an unindexed poll alone rather than blanking the row', () => {
    const known = applyStatusUpdate(
      base,
      {
        status: 'pending',
        substatus: 'WAIT_DESTINATION_TRANSACTION',
        substatusMessage: null,
        sourceTxHash: '0xaaa',
        destinationTxHash: '0xbbb',
        amountOut: null,
        explorerUrl: 'https://scan.li.fi/tx/0xaaa',
        found: true,
      },
      NOW + 10_000,
    )
    const afterMiss = applyStatusUpdate(
      known,
      {
        status: 'pending',
        substatus: null,
        substatusMessage: null,
        sourceTxHash: null,
        destinationTxHash: null,
        amountOut: null,
        explorerUrl: null,
        found: false,
      },
      NOW + 20_000,
    )
    expect(afterMiss.destinationTxHash).toBe('0xbbb')
    expect(afterMiss.substatus).toBe('WAIT_DESTINATION_TRANSACTION')
    expect(afterMiss.updatedAt).toBe(NOW + 20_000)
  })

  it('never un-knows a field a later poll omits', () => {
    const landed = applyStatusUpdate(
      base,
      {
        status: 'confirmed',
        substatus: 'COMPLETED',
        substatusMessage: null,
        sourceTxHash: '0xaaa',
        destinationTxHash: '0xbbb',
        amountOut: 99.74,
        explorerUrl: 'https://scan.li.fi/tx/0xaaa',
        found: true,
      },
      NOW + 30_000,
    )
    const thin = applyStatusUpdate(
      landed,
      {
        status: 'confirmed',
        substatus: null,
        substatusMessage: null,
        sourceTxHash: '0xaaa',
        destinationTxHash: null,
        amountOut: null,
        explorerUrl: null,
        found: true,
      },
      NOW + 60_000,
    )
    expect(thin.destinationTxHash).toBe('0xbbb')
    expect(thin.amountOut).toBe(99.74)
    expect(thin.explorerUrl).toBe('https://scan.li.fi/tx/0xaaa')
  })
})

describe('pruneTransfers', () => {
  it('drops settled transfers past the retention window', () => {
    const old = transfer({
      id: '0xold',
      status: 'confirmed',
      startedAt: NOW - TRANSFER_RETENTION_MS - 1,
    })
    const recent = transfer({ id: '0xnew', status: 'confirmed' })
    const kept = pruneTransfers([old, recent], NOW)
    expect(kept.map((t) => t.id)).toEqual(['0xnew'])
  })

  it('keeps a pending transfer no matter how old it is', () => {
    // A fortnight-old pending transfer is not stale data. It is a transfer
    // that has not arrived, and it is the only record of one.
    const stuck = transfer({
      id: '0xstuck',
      startedAt: NOW - TRANSFER_RETENTION_MS * 2,
    })
    expect(pruneTransfers([stuck], NOW).map((t) => t.id)).toEqual(['0xstuck'])
  })

  it('orders newest first', () => {
    const rows = [
      transfer({ id: '0x1', startedAt: NOW - 3_000 }),
      transfer({ id: '0x2', startedAt: NOW - 1_000 }),
      transfer({ id: '0x3', startedAt: NOW - 2_000 }),
    ]
    expect(pruneTransfers(rows, NOW).map((t) => t.id)).toEqual([
      '0x2',
      '0x3',
      '0x1',
    ])
  })
})

describe('upsertTransfer', () => {
  it('replaces by hash rather than duplicating a row', () => {
    const first = transfer({ id: '0xaaa' })
    const updated = transfer({ id: '0xaaa', status: 'confirmed' })
    const rows = upsertTransfer([first], updated)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('confirmed')
  })
})

describe('transfersForWallet', () => {
  it('matches on address regardless of casing, and on nothing else', () => {
    const mine = transfer({ id: '0x1' })
    const theirs = transfer({
      id: '0x2',
      walletAddress: '0x1111111111111111111111111111111111111111',
    })
    expect(
      transfersForWallet([mine, theirs], WALLET.toUpperCase()).map((t) => t.id),
    ).toEqual(['0x1'])
    expect(transfersForWallet([mine, theirs], null)).toEqual([])
  })
})
