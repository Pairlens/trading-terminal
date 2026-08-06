// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Evaluate custom-indicator alert conditions without a chart.
 *
 * `evaluateIndicatorAlerts` used to be reachable only from the chart's compute
 * path, so an indicator-alert rule bound to a pair the user was not looking at
 * never fired — the notification existed but nothing ever produced its event.
 * This runs the same scripts against the notification runtime's own candle
 * buffer when a bar closes.
 *
 * Cost is bounded by intent rather than by script count: a script with no
 * declared `alert.condition(...)` can never raise one, so it is skipped before
 * Python is touched. The shared runtime serializes calls internally, and one
 * in-flight run per (indicator, market, pair, timeframe) is enough — a slow
 * script must not let bar closes queue up behind it.
 */

import type { Candle } from '@pairlens/shared/types'
import {
  customIndicatorRegistry,
  customIndicatorSourceKey,
} from '@/lib/indicators/custom-indicator-registry'
import { defaultParamsFromInputs } from '@/lib/indicators/custom-indicator-definitions'
import { evaluateIndicatorAlerts } from '@/lib/indicators/indicator-alerts'
import {
  resolveRequestSeries,
  toCandleArrays,
} from '@/lib/indicators/request-data'
import {
  PythonScriptError,
  getPythonRuntime,
} from '@/lib/python/python-runtime'

/** Source key last registered with the runtime, per indicator type. */
const registeredSources = new Map<string, string>()
/** Runs currently in flight, keyed by indicator+market+pair+timeframe. */
const inFlight = new Set<string>()
/** One warning per distinct failure, not one per bar close. */
const warned = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

/**
 * True when a rule's `indicator` field selects this script. Blank means "any",
 * which is the documented default; otherwise the rule may name either the
 * engine type (`custom:provider:id`) or the script's display title, matching
 * what the evaluator accepts in `matchesEventFilter`.
 */
function matchesIndicatorFilter(
  filter: string,
  indicatorType: string,
  title: string,
): boolean {
  if (filter.trim() === '') return true
  return filter === indicatorType || filter === title
}

export type HeadlessAlertRun = {
  market: string
  pair: string
  timeframe: string
  /** Closed-bar window, oldest first, with the forming bar still last. */
  bars: Array<Candle>
  /** `indicator` values from the rules that asked for this pair+timeframe. */
  indicatorFilters: Array<string>
}

/**
 * Run every alert-declaring custom indicator the given rules select, and raise
 * notification events for conditions that just turned true. Never throws — a
 * broken script must not take down the notification pipeline.
 */
export async function runHeadlessIndicatorAlerts(
  run: HeadlessAlertRun,
): Promise<void> {
  const { market, pair, timeframe, bars, indicatorFilters } = run
  // evaluateIndicatorAlerts needs a closed bar plus the one before it to see
  // an edge, and treats the last entry as still forming.
  if (bars.length < 3) return

  const entries = customIndicatorRegistry.getAll().filter((entry) => {
    const { meta } = entry.descriptor
    if (!meta.alerts || meta.alerts.length === 0) return false
    return indicatorFilters.some((filter) =>
      matchesIndicatorFilter(filter, entry.type, meta.title),
    )
  })
  if (entries.length === 0) return

  const runtime = getPythonRuntime()
  const context = { market, pair, timeframe }

  for (const entry of entries) {
    const { type, descriptor } = entry
    const { meta, source } = descriptor
    const key = `${type}|${market}|${pair}|${timeframe}`
    if (inFlight.has(key)) continue
    if (bars.length < (meta.minBars ?? 0)) continue

    inFlight.add(key)
    try {
      const sourceKey = customIndicatorSourceKey(descriptor)
      if (registeredSources.get(type) !== sourceKey) {
        await runtime.registerScript(type, source, descriptor.modules ?? [])
        registeredSources.set(type, sourceKey)
      }
      const requestData = await resolveRequestSeries(meta.requests, context)
      // A headless rule has no chart params to inherit, so the script's own
      // declared defaults are the only defensible choice.
      const result = await runtime.compute(
        type,
        // Fresh arrays: the runtime transfers (detaches) these buffers.
        toCandleArrays(bars),
        defaultParamsFromInputs(meta.inputs),
        pair,
        timeframe,
        requestData,
      )
      evaluateIndicatorAlerts({
        indicatorType: type,
        meta,
        bars,
        outputs: result.outputs,
        market,
        pair,
        timeframe,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const firstLine = message.split('\n')[0] || 'Python compute failed'
      warnOnce(
        `${type}:${firstLine}`,
        `[notifications] Indicator alert '${meta.title}' (${type}) failed on ${pair} ${timeframe}: ${firstLine}${
          err instanceof PythonScriptError ? `\n${err.traceback ?? ''}` : ''
        }`,
      )
    } finally {
      inFlight.delete(key)
    }
  }
}

/** Test seam — clears registration/in-flight/warning state. */
export function resetHeadlessIndicatorAlertState(): void {
  registeredSources.clear()
  inFlight.clear()
  warned.clear()
}
