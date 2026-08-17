// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The LP position shape the panes read, and what it still cannot tell them.
 *
 * The seam this file used to describe is filled on every chain the terminal
 * trades. The EVM connectors read v3-family positions straight off each chain
 * (`lp-positions` action, see `packages/plugins/src/evm-dex-connector/
 * lp-client.ts`) and the Jupiter connector reads Orca Whirlpool and Raydium
 * CLMM positions the same way (`jupiter-dex-connector/lp-client.ts`), so
 * `lp-position` and `fee-accrual` draw real ranges, real compositions and real
 * fee claims for the connected wallet. The wire types live in `@pairlens/shared`
 * with the rest of the connector contract; this module re-exports them so the
 * panes keep one import and the DEX-specific reading of them stays in one place.
 *
 * WHAT CHAIN STATE STILL DOES NOT CARRY, and why the panes say so out loud:
 *
 *   - Cost basis. A position stores liquidity and two bounds, never what was
 *     deposited or when. So there is no "deposited $13,180 · Apr 22" and no
 *     percentage against it.
 *   - Fees earned to date, and therefore fee APR. `collect` tells you what is
 *     claimable NOW (and on Solana, only what was settled at the position's
 *     last touch — see `feesAsOf`). Everything already collected is gone from
 *     state; the total needs an indexer or a fee-growth snapshot diffed over
 *     time.
 *   - Time in range. The pool publishes its current tick, not its history.
 *   - Impermanent loss against holding. It is arithmetic once cost basis and
 *     fee history exist, and derivable from nothing that ships today.
 *
 * A fabricated impermanent-loss figure is a number somebody closes a real
 * position on, so the panes label these as unavailable rather than estimating
 * them. When an indexer lands, the shape below is what grows the fields.
 *
 * WRITES are a separate contract, `LpWriteResult` in the same module: the
 * `lp-collect` / `lp-decrease` / `lp-increase` actions the manage pane sends.
 * None of the four gaps above blocks them, because collecting fees and resizing
 * a range need current state, not history. Moving a BAND still is not offered:
 * it burns the position and mints a new token id rather than editing one.
 */
export type {
  LpPositionEntry,
  LpPositionToken,
  LpPositionsResponse,
  LpWriteAction,
  LpWriteResult,
} from '@pairlens/shared/instrument-types'
