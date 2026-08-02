// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Running a bot's strategy script in the shared Python runtime.
 *
 * There is exactly one Pyodide worker per window, and the indicators workbench
 * is using it interactively while bots run in the background. Everything here
 * exists to keep a bot from being a bad neighbour on that worker:
 *
 * - one compute in flight per bot, and computes queued behind each other, so a
 *   dozen bots closing a 1m bar at the same second can't fan out into a dozen
 *   parallel round-trips the worker would run one at a time anyway;
 * - a bounded window (500 bars by default), because Python cost scales with
 *   the window and a bot doesn't need the chart's full scrollback;
 * - a compute timeout, because Python is synchronous — a script with a runaway
 *   loop wedges the worker's message loop, and a bot that hangs its own
 *   subscription forever is a bot that stops trading without saying so.
 *
 * Bots also never compute on a tick. Only on a closed bar (see `bot-runtime`).
 */
import type { ChartBar } from 'fast-financial-charts/types'
import type { CustomIndicatorModule } from '@pairlens/shared/plugin-types'
import {
  PythonScriptError,
  getPythonRuntime,
} from '@/lib/python/python-runtime'
import { toCandleArrays } from '@/lib/indicators/request-data'

/**
 * Bars handed to `compute()` on each bar close. Deep enough for a long moving
 * average to be meaningful, shallow enough that the call stays well inside the
 * timeout on a slow machine.
 */
export const BOT_WINDOW_BARS = 500

/**
 * Ceiling on one bot compute. The shared runtime enforces its own 10s and
 * respawns the worker on expiry; this mirrors it so the runtime's promise can
 * never leave a bot's bar-close handler pending if that ever changes.
 */
export const BOT_COMPUTE_TIMEOUT_MS = 10_000

/** Registration id for a bot's script — namespaced away from chart indicators. */
export const botScriptKey = (botId: string): string => `bot:${botId}`

/** Identity of the exact code registered, entry plus helper modules. */
const sourceKey = (
  source: string,
  modules: Array<CustomIndicatorModule>,
): string =>
  modules.length === 0
    ? source
    : JSON.stringify([source, modules.map((m) => [m.path, m.source])])

/** What is currently registered in the worker, per bot script key. */
const registered = new Map<string, string>()

/** In-flight compute per bot key — a second bar close never doubles up. */
const inFlight = new Set<string>()

/** Serializes bot computes against each other. */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Python compute timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

export type BotComputeRequest = {
  botId: string
  /** Entry module source (defines `meta` + `compute(ctx)`). */
  source: string
  /** Helper modules the entry imports. */
  modules: Array<CustomIndicatorModule>
  /** Trailing window, oldest first. Trimmed to `BOT_WINDOW_BARS`. */
  bars: Array<ChartBar>
  params: Record<string, unknown>
  pair: string
  timeframe: string
  /** Override for `BOT_COMPUTE_TIMEOUT_MS`. Exists so tests aren't 10s long. */
  timeoutMs?: number
}

/** Raised when a bot's compute is already running — the caller skips this bar. */
export class BotComputeBusyError extends Error {
  constructor(botId: string) {
    super(`Bot '${botId}' is still computing the previous bar`)
    this.name = 'BotComputeBusyError'
  }
}

/**
 * Run a bot's `compute()` over its trailing window and return the raw output
 * arrays, aligned to the bars that were passed in.
 *
 * Rejects with `BotComputeBusyError` when the previous bar's compute has not
 * finished — the caller must treat that as "skip this bar", never as an error
 * worth halting for. Every other rejection is a real script or runtime failure
 * and the runtime halts the bot on it: a strategy that cannot be evaluated
 * must not keep holding a position on stale intentions.
 */
export async function computeBotOutputs(
  request: BotComputeRequest,
): Promise<Record<string, Float64Array>> {
  const key = botScriptKey(request.botId)
  if (inFlight.has(key)) throw new BotComputeBusyError(request.botId)
  inFlight.add(key)

  const bars =
    request.bars.length > BOT_WINDOW_BARS
      ? request.bars.slice(-BOT_WINDOW_BARS)
      : request.bars

  try {
    return await enqueue(async () => {
      const runtime = getPythonRuntime()
      const identity = sourceKey(request.source, request.modules)
      if (registered.get(key) !== identity) {
        // Registration can pull wheels on first use, so it gets the runtime's
        // own (longer) budget rather than the compute timeout.
        await runtime.registerScript(key, request.source, request.modules)
        registered.set(key, identity)
      }
      // Fresh arrays every call: the runtime TRANSFERS these buffers to the
      // worker, which detaches ours. Reusing them would send an empty window.
      const result = await withTimeout(
        runtime.compute(
          key,
          toCandleArrays(bars),
          request.params,
          request.pair,
          request.timeframe,
        ),
        request.timeoutMs ?? BOT_COMPUTE_TIMEOUT_MS,
      )
      return result.outputs
    })
  } catch (err) {
    // A failed run may have died mid-registration (the runtime terminates and
    // respawns the worker on timeout), so forget what we think is registered.
    registered.delete(key)
    if (err instanceof PythonScriptError) {
      throw new Error(err.message.split('\n')[0] || 'Python compute failed')
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    inFlight.delete(key)
  }
}

/** Drop a bot's script from the worker. Safe to call for unknown bots. */
export async function disposeBotScript(botId: string): Promise<void> {
  const key = botScriptKey(botId)
  if (!registered.has(key)) return
  registered.delete(key)
  try {
    await getPythonRuntime().disposeScript(key)
  } catch {
    // The worker may already be gone; nothing here is worth surfacing.
  }
}

/** Test seam: forget every registration and in-flight marker. */
export function resetBotPythonState(): void {
  registered.clear()
  inFlight.clear()
  queue = Promise.resolve()
}
