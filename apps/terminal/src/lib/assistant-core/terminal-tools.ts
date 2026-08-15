// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Tools that only a terminal-wide assistant can have ───────────────
//
// Navigation, a read of the current screen, and the research report
// that used to be a pane of its own. None of these made sense for a
// chat pinned inside one pane; all of them are obvious once the
// assistant lives above the whole terminal.

import { tool } from 'ai'
import { z } from 'zod'

import { computeSignals } from '@pairlens/strategy-engine'
import type { Candle } from '@pairlens/shared/types'

import type { AssistantDeps } from './tool-deps'
import type { TerminalPageId } from '@/lib/routing/pages'
import {
  TERMINAL_PAGES,
  TERMINAL_PAGE_IDS,
  pageLink,
} from '@/lib/routing/pages'
import { runResearch } from '@/lib/research-brain'
import { normalizePair, toOldestFirst } from '@/lib/copilot/tool-deps'

// ── Navigation ───────────────────────────────────────────────────────

/**
 * The page menu is a closed list on purpose: a free-form path would let
 * the model invent routes that 404, and the whole point of navigating is
 * that the user lands somewhere real.
 *
 * `target` is what makes it worth calling twice. Every page that shows
 * one thing at a time takes an id — a workflow, a bot, an alert, a
 * script, a Discovery section — so the assistant can open the exact
 * thing it just talked about rather than dropping the user on a list and
 * asking them to find it again.
 */
const PAGE_LIST = TERMINAL_PAGE_IDS.map((id) => {
  const page = TERMINAL_PAGES[id]
  const target = page.targetLabel ? `, target = ${page.targetLabel}` : ''
  return `${id} (${page.label}${target})`
}).join('; ')

export function buildNavigationTools(deps: AssistantDeps) {
  return {
    navigate_to: tool({
      description: `Take the user to a page of the terminal, optionally opening one specific thing on it. Use this when acting somewhere else is clearer than describing it, or when the user asks to go somewhere. Available pages: ${PAGE_LIST}. To change the charted instrument instead, use switch_pair or switch_market.`,
      inputSchema: z.object({
        page: z
          .enum(TERMINAL_PAGE_IDS as [TerminalPageId, ...Array<TerminalPageId>])
          .describe('Which page to open'),
        target: z
          .string()
          .optional()
          .describe(
            'The id of the thing to open on that page. See the target note for each page above. Omit to open the page itself.',
          ),
      }),
      execute: ({ page, target }) => {
        const path = pageLink(page, target)
        deps.navigate(path)
        return {
          navigatedTo: path,
          openedTarget: target && path.includes('=') ? target : null,
          note: 'The user is now on this page. Actions that page offers become available on your next turn.',
        }
      },
    }),

    get_screen: tool({
      description:
        'Read what the user is currently looking at: the exact page and which record is open on it, which panes are mounted, what each is showing, and which screen-specific actions are available. Use it when the user says "this", "here" or "what I am looking at" and the answer is not already obvious. The detail carries real ids, so follow up with get_workflow, get_alert, get_bot or get_script to read the record itself.',
      inputSchema: z.object({}),
      execute: () => {
        const contexts = deps.registry.getContexts()
        if (contexts.length === 0) {
          return {
            surfaces: [],
            note: 'Nothing is reporting a context right now.',
          }
        }
        return {
          surfaces: contexts.map((context) => ({
            id: context.surfaceId,
            showing: context.summary,
            detail: context.detail ?? null,
          })),
          availableActions: deps.registry.getActions().map((a) => a.name),
        }
      },
    }),
  }
}

// ── Research ─────────────────────────────────────────────────────────

const RESEARCH_DAILY_BARS = 200
const RESEARCH_HOURLY_BARS = 200

export function buildResearchTools(deps: AssistantDeps) {
  return {
    deep_research: tool({
      description:
        'Produce a full research report on one instrument: web search across news and analysis, combined with daily and hourly price structure and signals, written up with sources. Slow (tens of seconds) and thorough. Use it for "research X" or "give me a full write-up"; for a quick read use get_market_snapshot instead.',
      inputSchema: z.object({
        market: z
          .string()
          .optional()
          .describe('Venue id, e.g. okx. Defaults to the on-screen venue.'),
        pair: z
          .string()
          .optional()
          .describe(
            'BASE-QUOTE, e.g. BTC-USDT. Defaults to the on-screen pair.',
          ),
      }),
      execute: async (args, { abortSignal }) => {
        const focus = deps.getFocus()
        const market = (args.market ?? focus.market ?? 'okx').toLowerCase()
        const pair = normalizePair(args.pair ?? focus.pair ?? 'BTC-USDT')

        const marketData = deps.getMarketData()
        if (!marketData) {
          return {
            error: 'Market data is not available yet. Try again in a moment.',
          }
        }

        try {
          const [dailyCandles, hourlyCandles] = await Promise.all([
            marketData.fetchHistory(market, pair, '1d', RESEARCH_DAILY_BARS),
            marketData.fetchHistory(market, pair, '1h', RESEARCH_HOURLY_BARS),
          ])

          if (dailyCandles.length === 0 && hourlyCandles.length === 0) {
            return { error: `No price history for ${pair} on ${market}.` }
          }

          // computeSignals needs a full lookback window; below it the
          // report simply runs without a signal section.
          const oldestFirst = toOldestFirst(dailyCandles)
          const signals =
            oldestFirst.length >= 39
              ? [computeSignals(oldestFirst as Array<Candle>)].filter(Boolean)
              : []

          const { report, sources } = await runResearch({
            market,
            pair,
            marketData: {
              dailyCandles,
              hourlyCandles,
              ticker: null,
              signals,
            },
            pluginManager: deps.pluginManager,
            abortSignal,
          })

          return {
            market,
            pair,
            report,
            sources,
            note: 'Present the findings in your own words. Cite the sources you actually used.',
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
    }),
  }
}
