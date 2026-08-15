// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The bot on screen, published to the assistant ────────────────────
//
// A bot is the one place where "which one" carries real weight: paper and
// live look the same in a screenshot, and a question about "this bot"
// answered against the wrong deployment is worse than no answer. So the
// summary leads with the id, the mode and the live run status, and points
// at get_bot for the rest.

import type { BotDefinition } from '@pairlens/bot-engine/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'
import { useBotRunsStore } from '@/stores/bot-runs-store'

export function BotsAssistantSurface({
  bot,
  count,
}: {
  /** The deployment the detail pane is showing, or null. */
  bot: BotDefinition | null
  count: number
}) {
  useAssistantSurface({
    id: 'page:bots',
    getPriority: () => 60,
    revision: bot?.id ?? 'none',
    getContext: () => {
      if (!bot) {
        return {
          summary:
            count > 0
              ? `The user is on the Bots page with no bot selected. They have ${count} deployed; list_bots names them.`
              : 'The user is on the Bots page and has no bots yet. create_bot deploys a strategy script to a market.',
        }
      }

      // Live, not a prop: the run state changes on every bar close, and a
      // surface that re-rendered with it would churn the whole dock.
      const run = useBotRunsStore.getState().getRun(bot.id)

      return {
        summary: `The user is looking at the bot "${bot.name}" (id ${bot.id}): ${bot.mode} mode, ${bot.pair} on ${bot.market}, ${bot.timeframe}, currently ${run.status}. Read its full config, ledger and events with get_bot.`,
        detail: {
          botId: bot.id,
          name: bot.name,
          mode: bot.mode,
          market: bot.market,
          pair: bot.pair,
          timeframe: bot.timeframe,
          strategyScriptId: bot.scriptId,
          armed: bot.enabled,
          needsRearm: bot.needsRearm === true,
          status: run.status,
          statusDetail: run.statusDetail,
          openPosition: run.position
            ? { side: run.position.side, quantity: run.position.quantity }
            : null,
          realizedPnl: run.realizedPnl,
          closedTrades: run.trades.length,
          deployedBots: count,
        },
      }
    },
    getSuggestion: () =>
      bot
        ? {
            key: 'assistantDock.suggest.botSelected',
            values: { name: bot.name },
          }
        : { key: 'assistantDock.suggest.bots' },
  })

  return null
}
