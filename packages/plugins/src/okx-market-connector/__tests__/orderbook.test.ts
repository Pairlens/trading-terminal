// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import { hasSeqGap, okxBookChecksum } from '../orderbook'
import snapshot from './fixtures/okx-book-snapshot.json'
import type { RawLevel } from '../orderbook'

describe('okxBookChecksum — validated against a real OKX snapshot', () => {
  it("reproduces OKX's published checksum byte-for-byte", () => {
    // Captured live from wss://ws.okx.com books channel (BTC-USDT). If this
    // fails, the checksum algorithm is wrong and would cause false rebuilds.
    const bids = snapshot.bids as Array<RawLevel>
    const asks = snapshot.asks as Array<RawLevel>
    expect(okxBookChecksum(bids, asks)).toBe(snapshot.checksum)
  })

  it('changes when a level is altered (detects corruption)', () => {
    const bids = snapshot.bids as Array<RawLevel>
    const asks = snapshot.asks as Array<RawLevel>
    const corrupted = bids.map((l, i) =>
      i === 0 ? ([l[0], '0.00000001'] as RawLevel) : l,
    )
    expect(okxBookChecksum(corrupted, asks)).not.toBe(snapshot.checksum)
  })
})

describe('hasSeqGap', () => {
  it('reports no gap with no baseline yet', () => {
    expect(hasSeqGap(-1, 100, null)).toBe(false)
  })

  it('reports no gap when prevSeqId chains onto the last applied seqId', () => {
    expect(hasSeqGap(100, 132, 100)).toBe(false)
  })

  it('reports a gap when prevSeqId skips ahead of the last seqId', () => {
    expect(hasSeqGap(150, 180, 100)).toBe(true)
  })

  it('treats a repeated push (prevSeqId === seqId) as a no-op, not a gap', () => {
    expect(hasSeqGap(100, 100, 80)).toBe(false)
  })
})
