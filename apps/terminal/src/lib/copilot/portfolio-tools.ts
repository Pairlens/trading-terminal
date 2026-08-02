// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import { api } from '../api'
import { getBalances } from '../../stores/balances-store'
import { getOrderEvents } from '../../stores/order-events-store'
import { useRiskConfigStore } from '../../stores/risk-config-store'
import { useTradeConsentStore } from '../../stores/trade-consent-store'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 3 (account state) — read-only portfolio, open orders, and the risk
// guardrails the trade pipe enforces. Zustand stores + order-events store are
// globally accessible, so these execute directly in the transport.
// ---------------------------------------------------------------------------

export function buildPortfolioTools(_deps: CopilotToolDeps) {
  return {
    get_portfolio: tool({
      description:
        'Get the user’s current account holdings across connected exchanges/wallets (currency, available, total). Requires connected credentials.',
      inputSchema: z.object({}),
      execute: async () => {
        const balances = getBalances()
          .filter((b) => Number(b.total) > 0)
          .map((b) => ({
            currency: b.currency,
            available: b.available,
            total: b.total,
            frozen: b.frozen,
          }))
        if (balances.length === 0) {
          return {
            holdings: [],
            message:
              'No balances found — connect exchange API keys or a wallet to see holdings. (Credentials stay local; the copilot only reads the resulting balances.)',
          }
        }
        return { holdingCount: balances.length, holdings: balances }
      },
    }),

    get_open_orders: tool({
      description:
        'Get the user’s current open orders and recent order history (side, size, price, fill, status, paper/live).',
      inputSchema: z.object({
        pair: z.string().optional().describe('Filter to one pair'),
        includeHistory: z.boolean().optional().default(false),
      }),
      execute: async ({ pair, includeHistory }) => {
        const all = getOrderEvents()
        const match = (o: { pair: string }) =>
          !pair || o.pair.toUpperCase() === pair.toUpperCase()
        const open = all.filter(
          (o) =>
            match(o) &&
            (o.status === 'live' || o.status === 'partially_filled'),
        )
        const history = includeHistory
          ? all
              .filter(
                (o) =>
                  match(o) &&
                  (o.status === 'filled' ||
                    o.status === 'cancelled' ||
                    o.status === 'failed'),
              )
              .slice(0, 25)
          : []
        return { openCount: open.length, open, history }
      },
    }),

    get_risk_limits: tool({
      description:
        'Get the user’s risk guardrails and current usage — max position size, max daily loss, max daily trades, today’s P&L and trade count, and whether orders are currently locked. Every order the copilot places is enforced against these.',
      inputSchema: z.object({}),
      execute: async () => {
        const r = useRiskConfigStore.getState()
        r.checkWindowReset?.()
        const s = useRiskConfigStore.getState()
        return {
          local: {
            maxPositionSizePct: s.maxPositionSize,
            maxDailyLoss: s.maxDailyLoss,
            maxDailyTrades: s.maxDailyTrades,
            dailyPnl: s.dailyPnl,
            dailyTradeCount: s.dailyTradeCount,
            ordersLocked: s.ordersLocked,
            buyOrdersLocked: s.buyOrdersLocked,
            resetInterval: s.resetInterval,
            actions: {
              dailyLoss: s.dailyLossAction,
              dailyTrades: s.dailyTradesAction,
              positionSize: s.positionSizeAction,
            },
          },
        }
      },
    }),

    get_account_settings: tool({
      description:
        'Get the user’s trading preferences: paper vs live trading mode, AI persona, and the standing trade auto-approval permissions (paper globally, live per market).',
      inputSchema: z.object({}),
      execute: async () => {
        const consent = useTradeConsentStore.getState()
        const autoApproval = {
          paper: consent.paper,
          liveMarkets: consent.liveMarkets,
        }
        try {
          const cfg = await api.getUserConfig()
          return {
            tradingMode: cfg.tradingMode ?? 'paper',
            aiPersona: cfg.aiPersona ?? 'balanced',
            autoApproval,
          }
        } catch {
          return {
            tradingMode: 'paper',
            autoApproval,
            note: 'Signed out — defaulting to paper mode.',
          }
        }
      },
    }),
  }
}
