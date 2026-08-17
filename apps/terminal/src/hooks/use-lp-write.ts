// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Submitting one liquidity write, and the two gates in front of it.
 *
 * Unlike a position read, this needs a key, so it passes the same lock and
 * vault check every attended order does (`requireUnlockForTrade`, which also
 * resolves false on a sealed vault). Doing it here rather than inside the pane
 * keeps the property true for any second surface that ever sends one of these:
 * an assistant tool, a keyboard action, a mobile sheet.
 *
 * It does NOT go through `placeOrder`. That path hardcodes `action: 'place'`,
 * resolves the connector through the plugin manager's single winner for
 * `trading:orders`, and enforces order-shaped risk limits — a maximum position
 * size measured against a notional this has no side, price or pair to compute.
 * Collecting fees you already earned is not an order, and running it through
 * the order guard would mean either lying about its shape or weakening the
 * guard. The chain is addressed directly, exactly as `useSwapRoute` and
 * `useLpPositions` address it.
 *
 * One write at a time, deliberately: the pane disables every control while
 * `submitting`. Two liquidity transactions from one wallet race for a nonce,
 * and the loser is a stuck transaction the user has to clear by hand.
 */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { LpWriteAction, LpWriteResult } from '@/lib/dex/lp-types'

import { useDexConnectors } from '@/hooks/use-swap-route'
import { getCountrySetting } from '@/lib/region-settings'
import { requireUnlockForTrade } from '@/lib/security/lock-store'
import { track } from '@/lib/analytics-events'

export type LpWriteSubmission = {
  /** Chain the position lives on, which decides the connector. */
  market: string
  action: LpWriteAction
  /** Position manager, straight off the position row. */
  managerAddress: string
  tokenId: string
  walletId: string
  slippageBps: number
  /** `lp-decrease`: whole percentage of the position's liquidity to burn. */
  liquidityPct?: number
  /** `lp-increase`: human decimal amounts, in the pool's token order. */
  amount0Desired?: string
  amount1Desired?: string
}

export type LpWriteState =
  | { status: 'idle' }
  | { status: 'submitting'; action: LpWriteAction }
  /** Refused before anything was sent, by the terminal rather than the chain. */
  | {
      status: 'blocked'
      action: LpWriteAction
      reason: 'locked' | 'no-connector'
    }
  | { status: 'settled'; action: LpWriteAction; result: LpWriteResult }

export type LpWriteController = {
  state: LpWriteState
  busy: boolean
  submit: (submission: LpWriteSubmission) => Promise<void>
  reset: () => void
}

export function useLpWrite(): LpWriteController {
  const connectors = useDexConnectors()
  const queryClient = useQueryClient()
  const [state, setState] = useState<LpWriteState>({ status: 'idle' })

  const submit = useCallback(
    async (submission: LpWriteSubmission) => {
      const { action, market } = submission
      const plugin = connectors.get(market)
      if (!plugin) {
        setState({ status: 'blocked', action, reason: 'no-connector' })
        return
      }
      const allowed = await requireUnlockForTrade()
      if (!allowed) {
        setState({ status: 'blocked', action, reason: 'locked' })
        return
      }

      setState({ status: 'submitting', action })
      track('lp_action_submitted', {
        action: action.replace(/^lp-/, '') as
          | 'collect'
          | 'decrease'
          | 'increase',
        chain: market,
      })
      try {
        const raw: unknown = await plugin.execute({
          capability: 'trading:orders',
          params: {
            action,
            walletId: submission.walletId,
            manager: submission.managerAddress,
            tokenId: submission.tokenId,
            slippageBps: submission.slippageBps,
            ...(submission.liquidityPct === undefined
              ? {}
              : { liquidityPct: submission.liquidityPct }),
            ...(submission.amount0Desired === undefined
              ? {}
              : { amount0Desired: submission.amount0Desired }),
            ...(submission.amount1Desired === undefined
              ? {}
              : { amount1Desired: submission.amount1Desired }),
          },
          context: {
            pair: '',
            market,
            timeframe: '',
            // A liquidity write is a real transaction on a real chain. There is
            // no paper mode to fall back to, and saying otherwise here would be
            // the one lie a connector could act on.
            mode: 'live',
            country: getCountrySetting(),
          },
        })
        const result = raw as LpWriteResult | null

        const settled: LpWriteResult = result ?? {
          success: false,
          action,
          market,
          tokenId: submission.tokenId,
          txHash: null,
          error: 'The connector returned no result',
        }
        setState({ status: 'settled', action, result: settled })
        if (settled.success) {
          // Composition, fees and liquidity all just changed. Invalidated by
          // prefix so every chain's query refetches, not only this one: a
          // position list is per chain but the panes read the union.
          void queryClient.invalidateQueries({ queryKey: ['lp-positions'] })
        }
      } catch (error) {
        setState({
          status: 'settled',
          action,
          result: {
            success: false,
            action,
            market,
            tokenId: submission.tokenId,
            txHash: null,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      }
    },
    [connectors, queryClient],
  )

  const reset = useCallback(() => setState({ status: 'idle' }), [])

  return { state, busy: state.status === 'submitting', submit, reset }
}
