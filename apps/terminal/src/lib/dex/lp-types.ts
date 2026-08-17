// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The shape an LP position WOULD have, and the seam that would fill it.
 *
 * Nothing produces these yet, and that is the whole point of writing them
 * down. No DEX connector declares `trading:positions`, none reads a
 * position-manager contract (Uniswap v3's NonfungiblePositionManager, Orca's
 * Whirlpool position NFTs), and no data provider serves per-wallet pool state.
 * So `fee-accrual`, `lp-position` and `manage-liquidity` render honest
 * unavailable surfaces rather than a range slider over invented numbers: a
 * fabricated impermanent-loss figure is a number somebody closes a real
 * position on.
 *
 * FOLLOW-UP to make them real, in the order the panes need it:
 *   1. `trading:positions` on the DEX connectors, reading the chain's position
 *      manager for the connected wallet (EVM: NFPM `positions()` + `ownerOf`;
 *      Solana: Whirlpool position accounts).
 *   2. Fees earned per day, which needs either an indexer or a fee-growth
 *      snapshot diffed over time — `feesEarnedUsd` and `feeSeries` below.
 *   3. Impermanent loss against holding, which is arithmetic once 1 and 2
 *      exist (entry composition, current composition, both priced) and is
 *      NOT derivable from anything shipping today.
 *
 * When a source lands, these types are what the panes already read; the
 * unavailable state is one hook away from becoming a table.
 */

/** A concentrated-liquidity range, in quote units per base unit. */
export type LpRange = {
  lower: number
  upper: number
  /** True while the pool's current price sits inside the range. */
  inRange: boolean
}

/** One day of accrued fees, in USD, plus whether the range was live for it. */
export type LpFeeDay = {
  /** Day start, epoch ms. */
  ts: number
  feesUsd: number
  inRange: boolean
}

export type LpPosition = {
  /** Wallet the position belongs to. */
  walletId: string
  market: string
  poolAddress: string
  pairLabel: string
  dexName: string
  range: LpRange | null
  /** Current value of both legs, in USD. */
  valueUsd: number | null
  depositedUsd: number | null
  depositedAt: number | null
  baseAmount: number | null
  quoteAmount: number | null
  baseSymbol: string
  quoteSymbol: string
  /** Fees earned since deposit, USD, and what is claimable right now. */
  feesEarnedUsd: number | null
  feesClaimableUsd: number | null
  /** Fee APR at the pool's current volume, as a fraction. */
  feeApr: number | null
  /** Share of the measured window the price spent inside the range, 0..1. */
  timeInRange: number | null
  /** Value against simply holding both legs, USD. Negative is a loss. */
  impermanentLossUsd: number | null
}

export type LpFeeHistory = {
  positionId: string
  days: Array<LpFeeDay>
}

/**
 * What a pane got back when it asked for positions.
 *
 * `source` is null today for every wallet, which is the state the panes
 * render: "no position source is connected", naming the wallet and pool it
 * would read, rather than an empty table that reads as "you have no positions".
 */
export type LpPositionsResult = {
  positions: Array<LpPosition>
  /** Connector or indexer that answered, or null when nothing can. */
  source: string | null
}
