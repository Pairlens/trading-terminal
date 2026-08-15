// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The builder assistant's tool set: create, read, edit, delete and validate
 * Python script files, drive the preview target, run backtests, configure
 * bots, ask the user a question, and hand the work to the other surface.
 *
 * Same execution split as the copilot: every tool here executes in the
 * transport, client-side, against the same stores and the same Pyodide
 * runtime the workbench uses — so an assistant edit is indistinguishable
 * from the user typing it (version history included).
 *
 * Safety is structural, not prompt-deep: `create_bot` goes through the bots
 * store, whose `createBot` hardcodes paper mode and disabled; `update_bot`'s
 * schema simply has no `mode` or `enabled` field. The assistant can build and
 * tune a bot but arming stays a human act in the ARM LIVE dialog.
 *
 * The Python runtime is injected (`deps.getPython`) rather than imported:
 * `python-runtime.ts` pulls the worker in through a Vite-only `?worker`
 * import, and injecting it keeps this module loadable in bun tests.
 */
import { tool } from 'ai'
import { z } from 'zod'

import { SDK_REFERENCE_SECTIONS, SDK_REFERENCE_TOPICS } from './sdk-guide'
import { buildSharedAssistantTools } from './assistant-shared-tools'
import type { AssistantSurface } from './assistant-shared-tools'
import type {
  IndicatorFile,
  IndicatorScript,
} from '@/stores/indicator-scripts-store'
import type { CandleArrays, RequestSeries } from '@/lib/python/protocol'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type {
  CustomIndicatorMeta,
  CustomIndicatorModule,
} from '@pairlens/shared/plugin-types'
import type { AssistantPromptContext } from './assistant-brain'
import type { BacktestSignals } from '@/lib/indicators/backtest'
import {
  ENTRY_FILE,
  isValidModulePath,
  scriptFiles,
  useIndicatorScriptsStore,
} from '@/stores/indicator-scripts-store'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { fetchHistoryDepth } from '@/lib/indicators/fetch-depth'
import { runBacktest } from '@/lib/indicators/backtest'
import {
  resolveRequestSeries,
  toCandleArrays,
} from '@/lib/indicators/request-data'

/** Timeframes both the chart engine and the bot runtime accept. */
const TIMEFRAMES = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '3d',
  '1w',
] as const

const timeframeSchema = z.enum(TIMEFRAMES)

/** The slice of the Pyodide runtime the tools need — injected, see header. */
export type AssistantPythonRuntime = {
  registerScript: (
    id: string,
    source: string,
    modules?: Array<CustomIndicatorModule>,
  ) => Promise<CustomIndicatorMeta>
  compute: (
    id: string,
    candles: CandleArrays,
    params: Record<string, unknown>,
    pair: string,
    timeframe: string,
    requestData?: Array<RequestSeries>,
  ) => Promise<{ outputs: Record<string, Float64Array> }>
}

/** The slice of MarketDataProvider's context the tools need. */
export type AssistantMarketDataHandle = {
  availableMarkets: Array<{ marketId: string }>
  getTimeframes: (market: string) => Array<string>
  fetchHistory: (
    market: string,
    pair: string,
    timeframe: string,
    limit: number,
    endTs?: number,
  ) => Promise<Array<ChartBar>>
}

/** What the workbench preview (and its backtest) is pointed at. */
export type AssistantPreviewTarget = {
  market: string
  pair: string
  timeframe: string
  /** How much history the preview pulls. */
  bars: number
}

/**
 * Callbacks the workbench hands the assistant when it hosts the panel, so
 * edits land in the editor the user is looking at (unsaved buffers respected,
 * stale buffers cleared, preview re-run).
 */
export type AssistantWorkbenchBridge = {
  getSelectedScriptId: () => string | null
  selectScript: (id: string) => void
  /** Files with unsaved editor buffers overlaid, or null for other scripts. */
  getFiles: (scriptId: string) => Array<IndicatorFile> | null
  /** Persist an edit and drop any stale unsaved buffer for that file. */
  applyEdit: (scriptId: string, path: string, source: string) => void
  /** Remove a helper module and forget its buffer. Never the entry file. */
  deleteFile: (scriptId: string, path: string) => void
  /** Re-run the preview so the user sees the change immediately. */
  runPreview: (scriptId: string) => void
  getPreviewTarget: () => AssistantPreviewTarget
  /** Re-point the preview and re-run it against the new target. */
  setPreviewTarget: (patch: Partial<AssistantPreviewTarget>) => void
}

/** Re-exported so the surfaces that only build scripts and bots can keep
 *  importing it from here. Defined with the shared tools, which every
 *  surface's tool set spreads in. */
export type { AssistantSurface }

export type AssistantToolDeps = {
  /** Only 'indicators' or 'bots' host this tool set. */
  surface: AssistantSurface
  getWorkbench: () => AssistantWorkbenchBridge | null
  getMarketData: () => AssistantMarketDataHandle | null
  getPython: () => AssistantPythonRuntime
  /**
   * Take the user to the other builder. Injected rather than imported so this
   * module stays free of the router (and loadable in bun tests).
   */
  navigate: (route: { to: AssistantSurface; scriptId?: string }) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tools report failures as values — a thrown error ends the whole run. */
function toolError(err: unknown): { error: string; traceback?: string } {
  const message = err instanceof Error ? err.message : String(err)
  const traceback =
    err && typeof err === 'object' && 'traceback' in err
      ? (err as { traceback?: string }).traceback
      : undefined
  return traceback ? { error: message, traceback } : { error: message }
}

function scriptKind(
  script: IndicatorScript,
): 'strategy' | 'indicator' | 'draft' {
  if (!script.meta) return 'draft'
  return script.meta.strategy ? 'strategy' : 'indicator'
}

/** What the model needs to know about a meta without the full JSON blob. */
function summarizeMeta(meta: CustomIndicatorMeta) {
  return {
    title: meta.title,
    pane: meta.pane,
    inputs: meta.inputs.map((input) => ({
      key: input.key,
      kind: input.kind,
      default: input.default,
    })),
    series: meta.series.map((s) => s.key),
    markers: meta.markers?.map((m) => m.key) ?? [],
    strategy: meta.strategy
      ? {
          initialCapital: meta.strategy.initialCapital,
          fee: meta.strategy.fee,
          slippage: meta.strategy.slippage,
          allowShort: meta.strategy.allowShort,
          risk: meta.strategy.risk ?? null,
        }
      : null,
  }
}

function defaultParams(meta: CustomIndicatorMeta): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const input of meta.inputs) params[input.key] = input.default
  return params
}

/** Declared defaults, with provided values overlaid where the type matches. */
function mergeParams(
  meta: CustomIndicatorMeta,
  provided: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const params = defaultParams(meta)
  if (!provided) return params
  for (const input of meta.inputs) {
    const value = provided[input.key]
    if (value !== undefined && typeof value === typeof input.default) {
      params[input.key] = value
    }
  }
  return params
}

function findScript(id: string): IndicatorScript | null {
  return (
    useIndicatorScriptsStore.getState().scripts.find((s) => s.id === id) ?? null
  )
}

/** Resolve the script a tool call targets: explicit id, else the open one. */
function resolveScript(
  deps: AssistantToolDeps,
  scriptId: string | undefined,
): IndicatorScript | { error: string } {
  const id = scriptId ?? deps.getWorkbench()?.getSelectedScriptId() ?? null
  if (!id) {
    return {
      error:
        'No script is selected. Pass scriptId, or create one with create_script.',
    }
  }
  const script = findScript(id)
  if (!script) return { error: `No script with id '${id}'. Use list_scripts.` }
  return script
}

/** The script's files, preferring the workbench's live editor buffers. */
function currentFiles(
  deps: AssistantToolDeps,
  script: IndicatorScript,
): Array<IndicatorFile> {
  return deps.getWorkbench()?.getFiles(script.id) ?? scriptFiles(script)
}

/**
 * Register (validate) a script's current files in the Python runtime and
 * cache the outcome, exactly like the workbench Run button does.
 */
async function validateFiles(
  deps: AssistantToolDeps,
  scriptId: string,
  files: Array<IndicatorFile>,
): Promise<
  { meta: CustomIndicatorMeta } | { error: string; traceback?: string }
> {
  const entry = files.find((f) => f.path === ENTRY_FILE)?.source ?? ''
  const modules = files.filter((f) => f.path !== ENTRY_FILE)
  const { cacheMeta } = useIndicatorScriptsStore.getState()
  try {
    const meta = await deps.getPython().registerScript(scriptId, entry, modules)
    cacheMeta(scriptId, { meta, metaError: null })
    return { meta }
  } catch (err) {
    const failure = toolError(err)
    // Only script failures poison the cached meta — infra errors (runtime
    // timeout, worker death) don't invalidate the script. Same rule as the
    // workbench: a traceback means Python itself rejected the code.
    if (failure.traceback !== undefined) {
      cacheMeta(scriptId, { metaError: failure.error })
    }
    return failure
  }
}

/**
 * Venue pairs are upper case. A DEX pool id carries a raw token address, and
 * upper-casing one is how you hand a connector a market it cannot find.
 */
function normalizePair(pair: string): string {
  return pair.startsWith('0x') ? pair : pair.toUpperCase()
}

/** BASE-QUOTE, one separator. Loose enough for `0xabc…-USDC`. */
function isPairShaped(pair: string): boolean {
  return /^[^\s-]+-[^\s-]+$/.test(pair)
}

function backtestTarget(
  deps: AssistantToolDeps,
  overrides: { market?: string; pair?: string; timeframe?: string },
): { market: string; pair: string; timeframe: string } {
  const preview = deps.getWorkbench()?.getPreviewTarget()
  const venues = deps.getMarketData()?.availableMarkets ?? []
  const fallback =
    venues.length === 0 || venues.some((m) => m.marketId === 'okx')
      ? 'okx'
      : venues[0].marketId
  return {
    market: overrides.market ?? preview?.market ?? fallback,
    pair: normalizePair(overrides.pair ?? preview?.pair ?? 'BTC-USDT'),
    timeframe: overrides.timeframe ?? preview?.timeframe ?? '1h',
  }
}

const sizingSchema = z
  .object({
    kind: z
      .enum(['percent-equity', 'fixed-quote', 'fixed-base'])
      .describe(
        'percent-equity: fraction of equity per entry (value 0..1). fixed-quote: quote currency per entry. fixed-base: base units per entry.',
      ),
    value: z.number().positive(),
  })
  .refine((s) => s.kind !== 'percent-equity' || s.value <= 1, {
    message: 'percent-equity value is a fraction and must be <= 1',
  })

const guardsSchema = z
  .object({
    maxDailyLossPercent: z
      .number()
      .positive()
      .max(1)
      .optional()
      .describe(
        'Halt the bot once the day loses this fraction of equity (0.05 = 5%)',
      ),
    maxTradesPerDay: z.number().int().positive().optional(),
    maxPositionQuote: z
      .number()
      .positive()
      .optional()
      .describe('Skip entries whose notional exceeds this, in quote currency'),
    cooldownBars: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Skip entries within N bars of a losing exit'),
    maxConsecutiveLosses: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Halt the bot after N losses in a row'),
  })
  .describe('Omitted fields mean no limit. Replaces the existing guard config.')

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function buildAssistantTools(deps: AssistantToolDeps) {
  return {
    ...buildSharedAssistantTools(deps),

    list_scripts: tool({
      description:
        "List the user's Python scripts (indicators and strategies). Drafts have not registered successfully yet — they cannot chart or deploy until validated.",
      inputSchema: z.object({}),
      execute: async () => {
        const { scripts } = useIndicatorScriptsStore.getState()
        return {
          scripts: scripts.map((script) => ({
            id: script.id,
            name: script.name,
            kind: scriptKind(script),
            metaError: script.metaError,
            updatedAt: new Date(script.updatedAt).toISOString(),
          })),
        }
      },
    }),

    get_script: tool({
      description:
        'Read a script: every file with its full source, plus the extracted metadata. Defaults to the script open in the workbench.',
      inputSchema: z.object({ scriptId: z.string().optional() }),
      execute: async ({ scriptId }) => {
        const script = resolveScript(deps, scriptId)
        if ('error' in script) return script
        return {
          id: script.id,
          name: script.name,
          kind: scriptKind(script),
          metaError: script.metaError,
          meta: script.meta ? summarizeMeta(script.meta) : null,
          files: currentFiles(deps, script),
        }
      },
    }),

    create_script: tool({
      description:
        'Create a new Python script and validate it in the runtime. Use strategy(...) in the source when it should be backtestable and deployable as a bot, indicator(...) for a chart study. On a validation error the script is kept as a draft — fix it with update_script.',
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        source: z.string().min(1).describe('Full content of main.py'),
      }),
      execute: async ({ name, source }) => {
        const store = useIndicatorScriptsStore.getState()
        store.load()
        const scriptId = store.createScript(name, source)
        deps.getWorkbench()?.selectScript(scriptId)
        const result = await validateFiles(deps, scriptId, [
          { path: ENTRY_FILE, source },
        ])
        if ('error' in result) return { scriptId, ...result }
        deps.getWorkbench()?.runPreview(scriptId)
        return {
          scriptId,
          kind: result.meta.strategy ? 'strategy' : 'indicator',
          meta: summarizeMeta(result.meta),
        }
      },
    }),

    update_script: tool({
      description:
        'Replace the full content of one file of a script, then validate it in the runtime. A new module path creates the file. Edits are saved with version history, so the user can always roll back. Returns the validation outcome — on a Python error, read the traceback and fix it with another update_script call.',
      inputSchema: z.object({
        scriptId: z
          .string()
          .optional()
          .describe('Defaults to the script open in the workbench'),
        path: z
          .string()
          .optional()
          .describe("File to write, defaults to 'main.py'"),
        source: z.string().min(1).describe('Full new content of the file'),
      }),
      execute: async ({ scriptId, path = ENTRY_FILE, source }) => {
        const script = resolveScript(deps, scriptId)
        if ('error' in script) return script
        if (path !== ENTRY_FILE && !isValidModulePath(path)) {
          return {
            error: `'${path}' is not a valid module path (lowercase .py, importable name).`,
          }
        }

        const workbench = deps.getWorkbench()
        const store = useIndicatorScriptsStore.getState()
        const exists = scriptFiles(script).some((f) => f.path === path)
        if (!exists && path !== ENTRY_FILE) {
          store.addModule(script.id, path, source)
        } else if (workbench) {
          workbench.applyEdit(script.id, path, source)
        } else {
          store.setFileSource(script.id, path, source)
        }

        const updated = findScript(script.id)
        if (!updated) return { error: 'Script disappeared while editing.' }
        const files = currentFiles(deps, updated)
        const result = await validateFiles(deps, script.id, files)
        if ('error' in result) return { scriptId: script.id, ...result }
        workbench?.runPreview(script.id)
        return {
          scriptId: script.id,
          kind: result.meta.strategy ? 'strategy' : 'indicator',
          meta: summarizeMeta(result.meta),
        }
      },
    }),

    delete_file: tool({
      description:
        'Delete one helper module from a script and re-validate what is left. Use it when a module you added is no longer imported. main.py is the entry point and can only be rewritten, never removed.',
      inputSchema: z.object({
        scriptId: z
          .string()
          .optional()
          .describe('Defaults to the script open in the workbench'),
        path: z.string().describe("Module file, e.g. 'helpers.py'"),
      }),
      execute: async ({ scriptId, path }) => {
        const script = resolveScript(deps, scriptId)
        if ('error' in script) return script
        if (path === ENTRY_FILE) {
          return {
            error: `${ENTRY_FILE} is the entry point and cannot be deleted. Rewrite it with update_script instead.`,
          }
        }
        const files = scriptFiles(script)
        if (!files.some((f) => f.path === path)) {
          return {
            error: `'${path}' is not a file of this script. It has: ${files.map((f) => f.path).join(', ')}.`,
          }
        }

        const workbench = deps.getWorkbench()
        if (workbench) workbench.deleteFile(script.id, path)
        else useIndicatorScriptsStore.getState().deleteModule(script.id, path)

        const updated = findScript(script.id)
        if (!updated) return { error: 'Script disappeared while editing.' }
        // Deleting a module that something still imports breaks the script,
        // and the user should hear that from the traceback, not at run time.
        const result = await validateFiles(
          deps,
          script.id,
          currentFiles(deps, updated),
        )
        if ('error' in result) {
          return { scriptId: script.id, deleted: path, ...result }
        }
        workbench?.runPreview(script.id)
        return {
          scriptId: script.id,
          deleted: path,
          meta: summarizeMeta(result.meta),
        }
      },
    }),

    validate_script: tool({
      description:
        'Run a script through the Python runtime without changing it: extracts metadata on success, returns the traceback on failure. Needs no market data.',
      inputSchema: z.object({ scriptId: z.string().optional() }),
      execute: async ({ scriptId }) => {
        const script = resolveScript(deps, scriptId)
        if ('error' in script) return script
        const result = await validateFiles(
          deps,
          script.id,
          currentFiles(deps, script),
        )
        if ('error' in result) return { scriptId: script.id, ...result }
        return {
          scriptId: script.id,
          kind: result.meta.strategy ? 'strategy' : 'indicator',
          meta: summarizeMeta(result.meta),
        }
      },
    }),

    run_backtest: tool({
      description:
        'Backtest a strategy script over real exchange candles and return the stats and recent trades. Uses the same engine as live bots (signals fill at the next bar open; protective exits run first). Defaults to the workbench preview target.',
      inputSchema: z.object({
        scriptId: z.string().optional(),
        market: z.string().optional().describe('Venue id, e.g. okx'),
        pair: z.string().optional().describe('BASE-QUOTE, e.g. BTC-USDT'),
        timeframe: timeframeSchema.optional(),
        bars: z.number().int().min(100).max(2000).optional(),
        params: z
          .record(z.unknown())
          .optional()
          .describe('Overrides for the declared inputs; defaults otherwise'),
      }),
      execute: async ({ scriptId, market, pair, timeframe, bars, params }) => {
        const script = resolveScript(deps, scriptId)
        if ('error' in script) return script
        const marketData = deps.getMarketData()
        if (!marketData) return { error: 'Market data is not available yet.' }
        const target = backtestTarget(deps, { market, pair, timeframe })

        try {
          const registered = await validateFiles(
            deps,
            script.id,
            currentFiles(deps, script),
          )
          if ('error' in registered)
            return { scriptId: script.id, ...registered }
          const { meta } = registered
          if (!meta.strategy) {
            return {
              error:
                'This script is an indicator. Only strategy(...) scripts can be backtested — convert it or pick another script.',
            }
          }

          const [candles, requestData] = await Promise.all([
            fetchHistoryDepth(
              (limit, endTs) =>
                marketData.fetchHistory(
                  target.market,
                  target.pair,
                  target.timeframe,
                  limit,
                  endTs,
                ),
              bars ?? deps.getWorkbench()?.getPreviewTarget().bars ?? 500,
            ),
            resolveRequestSeries(meta.requests, target),
          ])
          if (candles.length === 0) {
            return {
              error: `No candles for ${target.pair} on ${target.market} (${target.timeframe}).`,
            }
          }

          const computed = await deps
            .getPython()
            .compute(
              script.id,
              toCandleArrays(candles),
              mergeParams(meta, params),
              target.pair,
              target.timeframe,
              requestData,
            )
          const signals: BacktestSignals = {
            long: computed.outputs.long,
            short: computed.outputs.short,
            position: computed.outputs.position,
            entries: computed.outputs.entries,
            exits: computed.outputs.exits,
          }
          if (Object.values(signals).every((s) => s === undefined)) {
            return {
              error:
                'compute() returned none of the signal keys (position, long/short, entries/exits), so there is nothing to backtest.',
            }
          }
          const result = runBacktest(candles, signals, meta.strategy)
          return {
            target,
            bars: candles.length,
            stats: result.stats,
            recentTrades: result.trades.slice(-10),
          }
        } catch (err) {
          return toolError(err)
        }
      },
    }),

    list_venues: tool({
      description:
        'List the venues connected right now and the timeframes each one offers. Call it before set_preview_target or create_bot rather than guessing a venue id — what is connected is the user’s choice, not a fixed list.',
      inputSchema: z.object({}),
      execute: async () => {
        const marketData = deps.getMarketData()
        if (!marketData) return { error: 'Market data is not available yet.' }
        if (marketData.availableMarkets.length === 0) {
          return {
            venues: [],
            note: 'No connectors are ready yet. The user connects venues on the Accounts page; public market data needs no keys.',
          }
        }
        return {
          venues: marketData.availableMarkets.map((venue) => ({
            id: venue.marketId,
            timeframes: marketData.getTimeframes(venue.marketId),
          })),
        }
      },
    }),

    set_preview_target: tool({
      description:
        'Re-point the workbench preview (venue, pair, timeframe, history depth) and re-run it. This is the chart the user is looking at and the data a backtest reads, so change it when the script needs different data, and say why. Workbench only: from the Bots page pass market/pair/timeframe to run_backtest instead.',
      inputSchema: z.object({
        market: z.string().optional().describe('Venue id, e.g. okx'),
        pair: z.string().optional().describe('BASE-QUOTE, e.g. SOL-USDT'),
        timeframe: timeframeSchema.optional(),
        bars: z
          .number()
          .int()
          .min(100)
          .max(2000)
          .optional()
          .describe('How many candles to load'),
      }),
      execute: async ({ market, pair, timeframe, bars }) => {
        const workbench = deps.getWorkbench()
        if (!workbench) {
          return {
            error:
              'The preview only exists in the script workbench. From the Bots page, pass market, pair and timeframe to run_backtest, or hand the user over with handoff_to_builder.',
          }
        }
        if (
          market === undefined &&
          pair === undefined &&
          timeframe === undefined &&
          bars === undefined
        ) {
          return { error: 'Nothing to change — pass at least one field.' }
        }

        const marketData = deps.getMarketData()
        const venues = marketData?.availableMarkets.map((m) => m.marketId) ?? []
        if (market !== undefined && venues.length > 0) {
          if (!venues.includes(market)) {
            return {
              error: `'${market}' is not a connected venue. Available: ${venues.join(', ')}.`,
            }
          }
        }

        const current = workbench.getPreviewTarget()
        const nextMarket = market ?? current.market
        if (timeframe !== undefined && marketData) {
          const supported = marketData.getTimeframes(nextMarket)
          if (supported.length > 0 && !supported.includes(timeframe)) {
            return {
              error: `${nextMarket} does not offer ${timeframe}. It offers: ${supported.join(', ')}.`,
            }
          }
        }

        const patch: Partial<AssistantPreviewTarget> = {}
        if (market !== undefined) patch.market = market
        if (timeframe !== undefined) patch.timeframe = timeframe
        if (bars !== undefined) patch.bars = bars
        if (pair !== undefined) {
          const normalized = normalizePair(pair)
          if (!isPairShaped(normalized)) {
            return {
              error: `'${pair}' is not a BASE-QUOTE pair like BTC-USDT.`,
            }
          }
          patch.pair = normalized
        }

        workbench.setPreviewTarget(patch)
        return { target: { ...current, ...patch }, note: 'Preview re-running.' }
      },
    }),

    get_sdk_reference: tool({
      description:
        'Read one section of the pairlens Python SDK reference. Topics: declarations (indicator/strategy signatures), signals (strategy signal shapes + fill model), context (compute ctx), library (pairlens.ta functions), examples (two complete working scripts), bots (sizing, guards, arming rules).',
      inputSchema: z.object({ topic: z.enum(SDK_REFERENCE_TOPICS) }),
      execute: async ({ topic }) => ({
        reference: SDK_REFERENCE_SECTIONS[topic],
      }),
    }),

    list_bots: tool({
      description:
        "List the user's bots with their deployment config and current run status.",
      inputSchema: z.object({}),
      execute: async () => {
        const { bots } = useBotsStore.getState()
        const runs = useBotRunsStore.getState()
        return {
          bots: bots.map((bot) => {
            const run = runs.getRun(bot.id)
            return {
              id: bot.id,
              name: bot.name,
              scriptId: bot.scriptId,
              scriptName: findScript(bot.scriptId)?.name ?? null,
              market: bot.market,
              pair: bot.pair,
              timeframe: bot.timeframe,
              mode: bot.mode,
              enabled: bot.enabled,
              status: run.status,
              realizedPnl: run.realizedPnl,
              closedTrades: run.trades.filter((t) => t.exitTs !== null).length,
            }
          }),
        }
      },
    }),

    get_bot: tool({
      description:
        "Read one bot's full configuration (params, sizing, guards) and run summary.",
      inputSchema: z.object({ botId: z.string() }),
      execute: async ({ botId }) => {
        const bot = useBotsStore.getState().bots.find((b) => b.id === botId)
        if (!bot) return { error: `No bot with id '${botId}'. Use list_bots.` }
        const run = useBotRunsStore.getState().getRun(bot.id)
        const script = findScript(bot.scriptId)
        return {
          id: bot.id,
          name: bot.name,
          script: script
            ? { id: script.id, name: script.name, kind: scriptKind(script) }
            : null,
          market: bot.market,
          pair: bot.pair,
          timeframe: bot.timeframe,
          mode: bot.mode,
          enabled: bot.enabled,
          needsRearm: bot.needsRearm ?? false,
          params: bot.params,
          sizing: bot.sizing,
          guards: bot.guards,
          run: {
            status: run.status,
            statusDetail: run.statusDetail ?? null,
            position: run.position,
            realizedPnl: run.realizedPnl,
            unrealizedPnl: run.unrealizedPnl,
            closedTrades: run.trades.filter((t) => t.exitTs !== null).length,
            recentEvents: run.events.slice(-5).map((event) => ({
              ts: new Date(event.ts).toISOString(),
              level: event.level,
              kind: event.kind,
              message: event.message,
            })),
          },
        }
      },
    }),

    create_bot: tool({
      description:
        'Deploy a strategy script as a new bot. The bot is ALWAYS created in paper mode and switched off — only the user can arm it, from the bots page. Ask the user for market/pair/timeframe when they have not said; do not invent sizing or guards beyond what they asked for.',
      inputSchema: z.object({
        scriptId: z.string().describe('A script whose kind is strategy'),
        market: z.string().describe('Venue id, e.g. okx'),
        pair: z.string().describe('BASE-QUOTE, e.g. BTC-USDT'),
        timeframe: timeframeSchema,
        name: z.string().min(1).max(80).optional(),
        params: z
          .record(z.unknown())
          .optional()
          .describe('Overrides for the declared inputs; defaults otherwise'),
        sizing: sizingSchema.optional(),
        guards: guardsSchema.optional(),
      }),
      execute: async ({
        scriptId,
        market,
        pair,
        timeframe,
        name,
        params,
        sizing,
        guards,
      }) => {
        const script = findScript(scriptId)
        if (!script) {
          return { error: `No script with id '${scriptId}'. Use list_scripts.` }
        }
        if (!script.meta?.strategy) {
          return {
            error:
              'Only strategy(...) scripts can run as bots. This one is ' +
              (script.meta ? 'an indicator' : 'an unvalidated draft') +
              ' — convert it with update_script and validate it first.',
          }
        }
        const marketData = deps.getMarketData()
        if (
          marketData &&
          marketData.availableMarkets.length > 0 &&
          !marketData.availableMarkets.some((m) => m.marketId === market)
        ) {
          return {
            error: `'${market}' is not an available venue. Available: ${marketData.availableMarkets.map((m) => m.marketId).join(', ')}.`,
          }
        }
        const normalizedPair = normalizePair(pair)
        if (!isPairShaped(normalizedPair)) {
          return { error: `'${pair}' is not a BASE-QUOTE pair like BTC-USDT.` }
        }

        const bots = useBotsStore.getState()
        bots.load()
        const botId = bots.createBot({
          name: name ?? `${script.name} · ${normalizedPair}`,
          scriptId,
          market,
          pair: normalizedPair,
          timeframe,
          params: mergeParams(script.meta, params),
          ...(sizing ? { sizing } : {}),
          ...(guards ? { guards } : {}),
        })
        return {
          botId,
          mode: 'paper',
          enabled: false,
          note: 'Created in paper mode, switched off. The user arms it from the bots page; going live additionally requires their typed ARM LIVE confirmation.',
        }
      },
    }),

    update_bot: tool({
      description:
        "Edit a bot's name, strategy params, sizing, or guards. Sizing and guards REPLACE the existing config when given; params merge onto the declared inputs. Cannot change mode, enabled state, market, pair, timeframe, or script — those are the user's, on the bots page.",
      inputSchema: z.object({
        botId: z.string(),
        name: z.string().min(1).max(80).optional(),
        params: z.record(z.unknown()).optional(),
        sizing: sizingSchema.optional(),
        guards: guardsSchema.optional(),
      }),
      execute: async ({ botId, name, params, sizing, guards }) => {
        const store = useBotsStore.getState()
        const bot = store.bots.find((b) => b.id === botId)
        if (!bot) return { error: `No bot with id '${botId}'. Use list_bots.` }
        const script = findScript(bot.scriptId)
        const patch: Parameters<typeof store.updateBot>[1] = {}
        if (name !== undefined) patch.name = name
        if (params !== undefined) {
          patch.params = script?.meta
            ? mergeParams(script.meta, { ...bot.params, ...params })
            : { ...bot.params, ...params }
        }
        if (sizing !== undefined) patch.sizing = sizing
        if (guards !== undefined) patch.guards = guards
        if (Object.keys(patch).length === 0) {
          return {
            error: 'Nothing to change — pass name, params, sizing, or guards.',
          }
        }
        store.updateBot(botId, patch)
        const updated = useBotsStore.getState().bots.find((b) => b.id === botId)
        return {
          botId,
          name: updated?.name ?? bot.name,
          params: updated?.params ?? bot.params,
          sizing: updated?.sizing ?? bot.sizing,
          guards: updated?.guards ?? bot.guards,
          note: bot.enabled
            ? 'The bot is running — params and guards take effect on the next bar.'
            : undefined,
        }
      },
    }),
  }
}

export type AssistantToolSet = ReturnType<typeof buildAssistantTools>

// ---------------------------------------------------------------------------
// Prompt context — the fresh snapshot the transport reads at send time
// ---------------------------------------------------------------------------

export function collectAssistantPromptContext(
  deps: AssistantToolDeps,
): AssistantPromptContext {
  const { scripts } = useIndicatorScriptsStore.getState()
  const { bots } = useBotsStore.getState()
  const runs = useBotRunsStore.getState()
  const workbench = deps.getWorkbench()
  const selectedId = workbench?.getSelectedScriptId() ?? null
  const selected = selectedId ? findScript(selectedId) : null

  return {
    surface: deps.surface,
    selectedScript: selected
      ? {
          id: selected.id,
          name: selected.name,
          kind: scriptKind(selected),
          metaError: selected.metaError,
          files: workbench?.getFiles(selected.id) ?? scriptFiles(selected),
        }
      : null,
    scriptCount: scripts.length,
    strategyCount: scripts.filter((s) => s.meta?.strategy).length,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      scriptName: findScript(bot.scriptId)?.name ?? null,
      market: bot.market,
      pair: bot.pair,
      timeframe: bot.timeframe,
      mode: bot.mode,
      enabled: bot.enabled,
      status: runs.getRun(bot.id).status,
    })),
    venues: deps.getMarketData()?.availableMarkets.map((m) => m.marketId) ?? [],
    previewTarget: workbench?.getPreviewTarget() ?? null,
  }
}
