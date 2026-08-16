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
import { track } from '@/lib/analytics-events'
import {
  SHELL_SPOTLIGHT_ID,
  listSpotlightTargets,
  requestPendingSpotlight,
  useAiSpotlightStore,
} from '@/stores/ai-spotlight-store'
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
        // Whether a target actually landed, not whether one was passed:
        // an unusable id is dropped, and counting it would report a
        // precision the user never got.
        const opened = path.includes('=') ? (target ?? null) : null
        deps.navigate(path)
        // The screen just changed under someone who was reading it. The
        // frame glows so the change is attributable: it says the
        // assistant did this, rather than leaving the user to wonder
        // what they clicked. Pending, because the page being navigated
        // to has not mounted its own targets yet.
        requestPendingSpotlight(SHELL_SPOTLIGHT_ID)
        track('assistant_navigated', { page, with_target: opened !== null })
        return {
          navigatedTo: path,
          openedTarget: opened,
          note: 'The user is now on this page, and the terminal frame is glowing to show it changed. Actions that page offers become available on your next turn, as do its highlight targets.',
        }
      },
    }),

    highlight_ui: tool({
      description:
        'Put a glow on part of the terminal for a few seconds, to show the user WHERE something you just did landed. Use it right after acting somewhere they may not be looking: adding indicators to a chart, writing a script, opening a record. Say what you did in your reply as well; the glow points, it does not explain. Do not use it to decorate an answer that changed nothing, and do not point at the same thing twice in a row. Call get_screen if you are unsure what is on screen.',
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            'Id of the thing to glow. Use the exact id from the list this tool returns when it fails, from get_screen, or a pane id like "pane:chart". "shell" is the whole terminal frame and is always available.',
          ),
      }),
      execute: ({ target }) => {
        // A live list rather than a zod enum on purpose. The tool set is
        // fixed for the whole run, but the model navigates mid-run — the
        // "show me the script" case opens the workbench and then points
        // at an editor that did not exist when the run started. An enum
        // frozen at turn start would reject exactly the call that
        // matters most.
        const landed = useAiSpotlightStore.getState().highlight(target)
        track('assistant_highlighted', { target, landed })

        if (!landed) {
          const available = listSpotlightTargets()
          return {
            error: `Nothing called '${target}' is on screen, so nothing was highlighted.`,
            availableTargets: available.map((entry) => ({
              id: entry.id,
              name: entry.label,
              what: entry.description,
            })),
            note: available.length
              ? 'Pick one of these, or navigate first and try again.'
              : 'Nothing is offering a highlight target right now. Move on without pointing.',
          }
        }

        return {
          highlighted: target,
          note: 'The user can see it glowing. Tell them what changed there.',
        }
      },
    }),

    get_screen: tool({
      description:
        'Read what the user is currently looking at: the exact page and which record is open on it, which panes are mounted, what each is showing, which screen-specific actions are available, and what can be pointed at with highlight_ui. Use it when the user says "this", "here" or "what I am looking at" and the answer is not already obvious. The detail carries real ids, so follow up with get_workflow, get_alert, get_bot or get_script to read the record itself.',
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
          // What can be pointed at, listed here rather than in a tool of
          // its own: whether to point is a question about the screen,
          // and this is already the tool that answers those.
          highlightTargets: listSpotlightTargets().map((entry) => ({
            id: entry.id,
            name: entry.label,
            what: entry.description,
          })),
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
