// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { crc32 } from '@pairlens/market-engine/checksum'

// OKX orderbook integrity helpers.
//
// OKX publishes, on every `books` push, a `checksum` (signed-int32 CRC32 over
// the top 25 levels) and a `seqId`/`prevSeqId` pair. A correct local book must
// reproduce the checksum and observe a contiguous seqId chain; a mismatch or
// gap means we dropped/misapplied an update and must rebuild from a fresh
// snapshot. See https://www.okx.com/docs-v5/ → "Order book channel".

export type RawLevel = [price: string, size: string]

/**
 * Compute OKX's orderbook checksum: build a colon-joined string by interleaving
 * the first 25 bid and ask levels (`bidPx:bidSz:askPx:askSz:...`), then CRC32.
 * Uses the RAW exchange strings — reparsing to numbers would change the byte
 * representation and break the checksum.
 */
export function okxBookChecksum(
  bids: Array<RawLevel>,
  asks: Array<RawLevel>,
): number {
  const parts: Array<string> = []
  for (let i = 0; i < 25; i++) {
    const bid = bids[i]
    if (bid) parts.push(bid[0], bid[1])
    const ask = asks[i]
    if (ask) parts.push(ask[0], ask[1])
  }
  return crc32(parts.join(':'))
}

/**
 * True when an incremental update's `prevSeqId` does not chain onto the last
 * seqId we applied — i.e. we missed an update. `lastSeqId === null` means we
 * have no baseline yet (treat as no gap). OKX may repeat a push with
 * `prevSeqId === seqId` (no-op); that is not a gap.
 */
export function hasSeqGap(
  prevSeqId: number,
  seqId: number,
  lastSeqId: number | null,
): boolean {
  if (lastSeqId === null) return false
  if (prevSeqId === seqId) return false // exchange heartbeat/no-op repeat
  return prevSeqId !== lastSeqId
}
