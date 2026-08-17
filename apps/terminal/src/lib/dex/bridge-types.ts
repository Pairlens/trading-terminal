// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The shape a bridge quote and an in-flight transfer WOULD have.
 *
 * No bridge provider is connected. The DEX connectors are single-chain
 * aggregator clients — KyberSwap routes WITHIN a chain, Jupiter within Solana
 * — and nothing in the app watches a cross-chain message or counts its
 * confirmations. So `route-bridge` and `in-flight` render honest unavailable
 * surfaces: an invented "~40s · $0.42" is a number somebody moves six figures
 * on, and a fabricated confirmation counter is worse, because a transfer that
 * is actually stuck would show as progressing.
 *
 * FOLLOW-UP to make them real:
 *   1. A bridge capability (`trading:bridge` or a bridge plugin family) with a
 *      quote action shaped like `BridgeQuote`, served by an aggregator that
 *      publishes fee and ETA (Across, LI.FI, Socket).
 *   2. A transfer watcher keyed by source transaction hash, polling the
 *      bridge's status endpoint, producing `BridgeTransfer` — the pane already
 *      wants `confirmations` / `requiredConfirmations`, which is the field
 *      pair that makes a progress bar honest instead of decorative.
 *   3. Execution, which is a signing path and therefore goes through the same
 *      guarded order machinery as a swap, never through a pane.
 */

export type BridgeQuote = {
  fromMarket: string
  toMarket: string
  /** Asset symbol being moved. Bridges move one asset, not a pair. */
  symbol: string
  amount: number
  /** What lands on the far side, after the bridge's own fee. */
  amountOut: number | null
  feeUsd: number | null
  /** Expected time to finality, in seconds. */
  etaSeconds: number | null
  /** Bridge that produced the quote. */
  provider: string
}

export type BridgeTransferStatus = 'pending' | 'confirmed' | 'failed'

export type BridgeTransfer = {
  id: string
  fromMarket: string
  toMarket: string
  symbol: string
  amount: number
  status: BridgeTransferStatus
  /** Blocks seen against blocks needed. Both, or neither: a bar with only one
   * of them is a spinner pretending to be a measurement. */
  confirmations: number | null
  requiredConfirmations: number | null
  startedAt: number
  sourceTxHash: string | null
  destinationTxHash: string | null
}

/**
 * What a pane got back when it asked about bridging. `provider` is null
 * everywhere today, which is exactly what the panes say.
 */
export type BridgeAvailability = {
  provider: string | null
  quotes: Array<BridgeQuote>
  transfers: Array<BridgeTransfer>
}
