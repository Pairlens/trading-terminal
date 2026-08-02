// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import { api } from '../api'
import { useWatchlistsStore } from '../../stores/watchlists-store'
import { useNotificationStore } from '../../stores/notification-store'
import { normalizePair, resolveTarget } from './tool-deps'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 4 — workspace agency.
//
// Watchlist, price-alert, and journal writes run in the transport via the
// global Zustand stores / api (the whole agent loop is client-side, so
// getState() and api calls work here and the UI updates reactively).
//
// Navigation (switch market / timeframe / pair) needs per-pane React actions,
// so those tools return a confirmation and are FORWARDED to the panel — their
// names are exported in NAVIGATION_TOOL_NAMES.
// ---------------------------------------------------------------------------

export const NAVIGATION_TOOL_NAMES = [
  'switch_market',
  'set_timeframe',
  'switch_pair',
] as const

export function buildWorkspaceTools(deps: CopilotToolDeps) {
  return {
    // ---- Watchlist (transport-executed) ----
    add_to_watchlist: tool({
      description: 'Add a pair to the active watchlist.',
      inputSchema: z.object({
        pair: z.string().describe('Pair to add, e.g. SOL-USDT'),
      }),
      execute: async ({ pair }) => {
        const symbol = normalizePair(pair)
        const store = useWatchlistsStore.getState()
        store.addToWatchlist(symbol, [store.state.activeListId])
        return { ok: true, added: symbol }
      },
    }),
    remove_from_watchlist: tool({
      description: 'Remove a pair from the active watchlist.',
      inputSchema: z.object({ pair: z.string() }),
      execute: async ({ pair }) => {
        const symbol = normalizePair(pair)
        const store = useWatchlistsStore.getState()
        store.removeFromWatchlist(symbol, store.state.activeListId)
        return { ok: true, removed: symbol }
      },
    }),
    get_watchlist: tool({
      description: 'Read the pairs on the user’s watchlists.',
      inputSchema: z.object({}),
      execute: async () => {
        const store = useWatchlistsStore.getState()
        return {
          activeListId: store.state.activeListId,
          lists: store.state.lists.map((l) => ({
            id: l.id,
            name: l.name,
            symbols: l.symbols,
          })),
        }
      },
    }),

    // ---- Price alerts (transport-executed) ----
    create_price_alert: tool({
      description:
        'Create a price alert that notifies the user when a pair crosses a price. Defaults to the on-screen pair/market.',
      inputSchema: z.object({
        pair: z.string().optional(),
        market: z.string().optional(),
        price: z.number().describe('Trigger price'),
        direction: z
          .enum(['above', 'below'])
          .describe('Fire when price goes above or below the trigger'),
      }),
      execute: async ({ pair, market, price, direction }) => {
        const target = resolveTarget(deps, { pair, market })
        const ruleId = useNotificationStore.getState().createPriceAlertRule({
          pair: target.pair,
          market: target.market,
          price,
          direction,
        })
        return {
          ok: true,
          ruleId,
          alert: { pair: target.pair, market: target.market, price, direction },
        }
      },
    }),

    get_price_alerts: tool({
      description:
        'List the user’s price alerts — pair, market, trigger price, direction, enabled state, and the ruleId needed to remove one.',
      inputSchema: z.object({
        pair: z.string().optional().describe('Filter to one pair'),
      }),
      execute: async ({ pair }) => {
        useNotificationStore.getState().load()
        const state = useNotificationStore.getState()
        const filter = pair ? normalizePair(pair) : null
        const alerts = state.rules.flatMap((rule) => {
          const step = rule.steps.find((s) => s.type === 'price-alert')
          if (!step) return []
          const data = step.data as { price?: number; direction?: string }
          return state.bindings
            .filter(
              (b) =>
                b.ruleId === rule.id &&
                (!filter || normalizePair(b.pair) === filter),
            )
            .map((b) => ({
              ruleId: rule.id,
              pair: b.pair,
              market: b.market,
              price: data.price ?? null,
              direction: data.direction ?? null,
              enabled: (rule.enabled ?? true) && b.enabled,
            }))
        })
        return { count: alerts.length, alerts }
      },
    }),
    remove_price_alert: tool({
      description:
        'Delete a price alert by its ruleId (find it with get_price_alerts). Only removes simple price alerts — not custom notification flows.',
      inputSchema: z.object({ ruleId: z.string() }),
      execute: async ({ ruleId }) => {
        useNotificationStore.getState().load()
        const state = useNotificationStore.getState()
        const rule = state.rules.find((r) => r.id === ruleId)
        if (!rule) return { ok: false, error: 'No alert found with that id.' }
        if (!rule.steps.some((s) => s.type === 'price-alert')) {
          return {
            ok: false,
            error:
              'That rule is a custom notification flow — manage it on the Notifications page instead.',
          }
        }
        state.deleteRule(ruleId)
        return { ok: true, removed: ruleId }
      },
    }),

    // ---- Trade journal write (transport-executed) ----
    add_journal_entry: tool({
      description:
        'Log a trade to the user’s trade journal (record-keeping only — this does NOT place an order).',
      inputSchema: z.object({
        pair: z.string().optional(),
        market: z.string().optional(),
        side: z.enum(['buy', 'sell']),
        price: z.number(),
        quantity: z.number(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async ({ pair, market, side, price, quantity, notes, tags }) => {
        const target = resolveTarget(deps, { pair, market })
        try {
          const entry = await api.addTradeJournalEntry({
            market: target.market,
            pairKey: target.pair,
            side,
            price,
            quantity,
            notes,
            tags,
          })
          return { ok: true, entryId: entry.id }
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'Saving a journal entry requires being signed in.',
          }
        }
      },
    }),

    // ---- Navigation (forwarded to the panel) ----
    switch_market: tool({
      description:
        'Switch the active chart to a different exchange/market (keeps the current pair).',
      inputSchema: z.object({
        market: z.string().describe('Exchange id, e.g. binance, okx, kraken'),
      }),
      execute: async ({ market }) =>
        `Switched the chart to ${market.toLowerCase()}.`,
    }),
    set_timeframe: tool({
      description: 'Change the active chart timeframe.',
      inputSchema: z.object({
        timeframe: z.string().describe('e.g. 1m, 5m, 15m, 1h, 4h, 1d, 1w'),
      }),
      execute: async ({ timeframe }) =>
        `Switched the timeframe to ${timeframe}.`,
    }),
    switch_pair: tool({
      description:
        'Open a different trading pair in the active chart, e.g. "show me ETH-USDT".',
      inputSchema: z.object({
        pair: z.string().describe('Pair to open, e.g. ETH-USDT'),
        market: z.string().optional(),
      }),
      execute: async ({ pair }) => `Opening ${normalizePair(pair)}.`,
    }),
  }
}
