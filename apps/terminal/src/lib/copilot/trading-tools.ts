// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import { useTradeConsentStore } from '../../stores/trade-consent-store'
import { resolveTarget } from './tool-deps'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 5 — gated execution.
//
// place_order / cancel_order NEVER execute directly. They return a structured
// proposal (status: 'awaiting_confirmation'); the panel renders a confirmation
// card and only calls the risk-guarded MarketDataProvider.placeOrder /
// cancelOrder when the user explicitly confirms. Paper is the default; live
// requires an explicit choice on the card. The AI proposes; the human commits.
//
// "Don't ask again": the user can grant standing consent (trade-consent-store)
// per scope — paper globally, live per market. When consent covers a fresh
// proposal, the card auto-executes it and says so. Consent never bypasses the
// risk guardrails; it only skips the confirm click.
// ---------------------------------------------------------------------------

export const TRADING_TOOL_NAMES = ['place_order', 'cancel_order'] as const

export function buildTradingTools(deps: CopilotToolDeps) {
  return {
    place_order: tool({
      description:
        'Prepare a spot order for the user to confirm. This does NOT place the order — it returns a proposal that the user must explicitly approve (paper or live) in the chat. Every order is enforced against the user’s risk guardrails. Use get_risk_limits / get_portfolio first when sizing.',
      inputSchema: z.object({
        pair: z.string().optional(),
        market: z.string().optional(),
        side: z.enum(['buy', 'sell']),
        type: z.enum(['market', 'limit']).default('market'),
        size: z.number().positive().describe('Order size in the base asset'),
        price: z
          .number()
          .positive()
          .optional()
          .describe('Limit price (required for limit orders)'),
        reason: z
          .string()
          .optional()
          .describe(
            'Short rationale shown to the user on the confirmation card',
          ),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, {
          market: args.market,
          pair: args.pair,
        })
        if (args.type === 'limit' && !args.price) {
          return {
            status: 'invalid',
            error: 'A limit order requires a price.',
          }
        }
        // Standing consent covering this proposal? The card auto-executes
        // fresh consented proposals; stale/replayed ones still require a click.
        const consent = useTradeConsentStore.getState()
        const paperAuto = consent.isAutoApproved('paper', target.market)
        const liveAuto = consent.isAutoApproved('live', target.market)
        return {
          status: 'awaiting_confirmation',
          proposalId: crypto.randomUUID(),
          proposedAt: Date.now(),
          autoApproval: { paper: paperAuto, live: liveAuto },
          order: {
            market: target.market,
            pair: target.pair,
            side: args.side,
            type: args.type,
            size: args.size,
            price: args.price ?? null,
            reason: args.reason ?? null,
          },
          message:
            paperAuto || liveAuto
              ? `Order prepared. The user has standing auto-approval (paper: ${paperAuto}, live on ${target.market}: ${liveAuto}) — the card executes automatically when the user's default trading mode is covered; otherwise it waits for their confirmation. Verify the outcome with get_open_orders before claiming the order was placed.`
              : 'Order prepared. It will NOT be placed until the user confirms it (paper or live) on the confirmation card. Tell the user to review and confirm.',
        }
      },
    }),

    cancel_order: tool({
      description:
        'Prepare a cancellation of an open order for the user to confirm. Does NOT cancel directly — the user must approve it. Use get_open_orders to find the order id.',
      inputSchema: z.object({
        orderId: z.string(),
        pair: z.string().optional(),
        market: z.string().optional(),
      }),
      execute: async (args) => {
        const target = resolveTarget(deps, {
          market: args.market,
          pair: args.pair,
        })
        return {
          status: 'awaiting_confirmation',
          cancel: {
            orderId: args.orderId,
            market: target.market,
            pair: target.pair,
          },
          message:
            'Cancellation prepared. It will NOT run until the user confirms on the card.',
        }
      },
    }),
  }
}
