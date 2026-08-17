// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the bridge panes read, and what they remember.
 *
 * The wire shapes live in `@pairlens/shared/instrument-types` because a
 * connector produces them: `BridgeQuote` is one route priced, `BridgeStatusUpdate`
 * is where a transfer is right now. Both are re-exported here so a pane imports
 * its whole vocabulary from one place.
 *
 * What is local to the terminal is `BridgeTransfer`: the row the in-flight pane
 * draws, which is a quote and a status stitched to a source transaction hash and
 * kept across reloads. No connector holds it, because no connector survives a
 * refresh and a transfer routinely does.
 *
 * The honesty rules the old seam stated still bind, now that there is real data
 * behind them:
 *
 *   - Fees stay split. `feeUsd` is the bridge's cut, `gasUsd` is the source
 *     chain's charge, and they are shown as two numbers because two different
 *     things go wrong with them.
 *   - `amountOut` never travels without `amountOutMin`. The floor is what
 *     execution is checked against.
 *   - `confirmations` / `requiredConfirmations` stay both-or-neither, and today
 *     they are both null: LI.FI publishes a staged status, not a block count, so
 *     the pane draws stages. A bar with one of the two numbers is a spinner
 *     pretending to be a measurement, and a transfer that is stuck would render
 *     as advancing.
 */
import type {
  BridgeQuote,
  BridgeRefusalReason,
  BridgeRouteRefused,
  BridgeStatusUpdate,
  BridgeTransferStatus,
} from '@pairlens/shared/instrument-types'

export type {
  BridgeExecutionResult,
  BridgeQuote,
  BridgeQuoteResponse,
  BridgeRefusalReason,
  BridgeRouteRefused,
  BridgeStatusUpdate,
  BridgeTransferStatus,
} from '@pairlens/shared/instrument-types'

/** True when a bridge read came back as a refusal instead of a quote. */
export function isBridgeRefusal(value: unknown): value is BridgeRouteRefused {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { refused?: unknown }).refused === true
  )
}

/** i18n key for a refusal, so the pane never renders a provider's wording. */
export function bridgeRefusalKey(reason: BridgeRefusalReason): string {
  return `routeBridge.refusal.${reason}`
}

/**
 * One transfer the terminal is watching.
 *
 * Keyed by source transaction hash: that is the only identifier that exists on
 * both sides of the send (it is what the status endpoint is polled with) and it
 * is unique, so a reload cannot duplicate a row.
 */
export type BridgeTransfer = {
  /** Source-chain transaction hash. The transfer's identity. */
  id: string
  /** Lowercased wallet address that signed it, so a second wallet is a second list. */
  walletAddress: string
  fromMarket: string
  toMarket: string
  symbol: string
  amount: number
  /** Expected landing amount at send time, and what actually landed once known. */
  expectedAmountOut: number | null
  amountOut: number | null
  status: BridgeTransferStatus
  /** Provider substatus verbatim, for the row's detail line. */
  substatus: string | null
  /** Blocks seen against blocks needed. Both, or neither. See the note above. */
  confirmations: number | null
  requiredConfirmations: number | null
  startedAt: number
  /** Last time a status poll came back, epoch ms. */
  updatedAt: number
  sourceTxHash: string
  destinationTxHash: string | null
  /** The bridge that carried it, as the quote named it. */
  tool: string | null
  /** Quoted time to land, in seconds. What the elapsed timer is read against. */
  etaSeconds: number | null
  /** The provider's own page for the transfer. */
  explorerUrl: string | null
}

/** A transfer that will not change again without a user doing something. */
export function isTerminalTransfer(transfer: BridgeTransfer): boolean {
  return transfer.status !== 'pending'
}

/** Build the tracked row from the quote that was signed and the hash it produced. */
export function transferFromExecution(opts: {
  quote: BridgeQuote
  sourceTxHash: string
  walletAddress: string
  now?: number
}): BridgeTransfer {
  const now = opts.now ?? Date.now()
  return {
    id: opts.sourceTxHash,
    walletAddress: opts.walletAddress.toLowerCase(),
    fromMarket: opts.quote.fromMarket,
    toMarket: opts.quote.toMarket,
    symbol: opts.quote.symbol,
    amount: opts.quote.amount,
    expectedAmountOut: opts.quote.amountOut,
    amountOut: null,
    status: 'pending',
    substatus: null,
    confirmations: null,
    requiredConfirmations: null,
    startedAt: now,
    updatedAt: now,
    sourceTxHash: opts.sourceTxHash,
    destinationTxHash: null,
    tool: opts.quote.tool,
    etaSeconds: opts.quote.etaSeconds,
    explorerUrl: null,
  }
}

/**
 * Fold a status poll into a tracked transfer.
 *
 * Pure, and the rules are the ones a stuck transfer depends on. A status the
 * aggregator has not indexed yet (`found: false`) leaves the row exactly as it
 * was rather than blanking the hashes it already had. And a field the poll does
 * not carry never overwrites one the row already holds: bridges publish the
 * destination hash and the landed amount at different moments, and a later poll
 * that omits one must not un-know it.
 */
export function applyStatusUpdate(
  transfer: BridgeTransfer,
  update: BridgeStatusUpdate,
  now: number = Date.now(),
): BridgeTransfer {
  if (!update.found) {
    return { ...transfer, updatedAt: now }
  }
  return {
    ...transfer,
    status: update.status,
    substatus: update.substatus ?? transfer.substatus,
    amountOut: update.amountOut ?? transfer.amountOut,
    destinationTxHash: update.destinationTxHash ?? transfer.destinationTxHash,
    explorerUrl: update.explorerUrl ?? transfer.explorerUrl,
    updatedAt: now,
  }
}
