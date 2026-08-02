// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  IndicatorComputeContext,
  IndicatorDefinition,
  IndicatorParams,
  IndicatorValuePoint,
} from '@pairlens/fast-financial-charts/types'
import type {
  CustomIndicatorInputSpec,
  CustomIndicatorMeta,
} from '@pairlens/shared/plugin-types'
import type { CustomIndicatorRenderSpec } from '@/lib/indicators/custom-indicator-presenter'
import type { CustomIndicatorEntry } from '@/lib/indicators/custom-indicator-registry'
import { createCustomIndicatorPresenter } from '@/lib/indicators/custom-indicator-presenter'
import {
  customIndicatorRegistry,
  customIndicatorSourceKey,
  isCustomIndicatorType,
} from '@/lib/indicators/custom-indicator-registry'
import { evaluateIndicatorAlerts } from '@/lib/indicators/indicator-alerts'
import {
  resolveRequestSeries,
  toCandleArrays,
} from '@/lib/indicators/request-data'
import {
  PythonScriptError,
  getPythonRuntime,
} from '@/lib/python/python-runtime'

// ---------------------------------------------------------------------------
// Bridges registry-defined custom indicators (Python scripts collected by
// customIndicatorRegistry) into chart-engine IndicatorDefinitions: the
// presenter renders the script's declared series/hlines, and the compute fn
// runs the script in the local Pyodide runtime with a tight recompute policy
// so live ticks never turn into per-tick Python round-trips.
// ---------------------------------------------------------------------------

/** Minimum ms between Python calls for a forming-bar (close-only) refresh. */
const FORMING_BAR_REFRESH_MS = 1000

/** Default params derived from a meta's input specs. */
export function defaultParamsFromInputs(
  inputs: Array<CustomIndicatorInputSpec>,
): IndicatorParams {
  const params: IndicatorParams = {}
  for (const input of inputs) {
    params[input.key] = input.default
  }
  return params
}

/** Default params for a custom indicator type; `{}` when unregistered. */
export function customIndicatorDefaultParams(type: string): IndicatorParams {
  const entry = customIndicatorRegistry.get(type)
  if (!entry) return {}
  return defaultParamsFromInputs(entry.descriptor.meta.inputs)
}

/**
 * Human-readable label for an indicator type: the script's declared title for
 * registered custom indicators, the type string for everything else (built-in
 * types ARE their display code, e.g. 'RSI').
 */
export function getIndicatorDisplayLabel(type: string): string {
  if (!isCustomIndicatorType(type)) return type
  const entry = customIndicatorRegistry.get(type)
  if (entry) return entry.descriptor.meta.title
  // Unregistered (plugin not loaded yet / uninstalled): show the meta id
  // rather than the full `custom:provider:id` machine string.
  const metaId = type.split(':').slice(2).join(':')
  return metaId || type
}

// ── Market context ──────────────────────────────────────────────────────────
// The engine's compute context carries bars/params only; scripts also receive
// the active market/pair/timeframe — for display, per-market logic, and to
// resolve `request.security(...)` declarations that inherit the chart's own
// context. The chart host (use-chart-terminal-state) keeps this fresh.

let currentMarketContext = { market: '', pair: '', timeframe: '' }

export function setCustomIndicatorMarketContext(
  pair: string,
  timeframe: string,
  market = '',
): void {
  currentMarketContext = { market, pair, timeframe }
}

// ── Compute ─────────────────────────────────────────────────────────────────

/** One console.warn per distinct Python error, not one per recompute. */
const warnedErrors = new Set<string>()

const warnOnce = (key: string, message: string, traceback?: string): void => {
  if (warnedErrors.has(key)) return
  warnedErrors.add(key)
  console.warn(message, traceback ? `\n${traceback}` : '')
}

const buildValuePoints = (
  ctx: IndicatorComputeContext,
  outputs: Record<string, Float64Array>,
): Array<IndicatorValuePoint> => {
  const keys = Object.keys(outputs)
  const n = ctx.bars.length
  const points: Array<IndicatorValuePoint> = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const point: IndicatorValuePoint = { ts: ctx.bars[i].ts }
    for (const key of keys) {
      const series = outputs[key]
      const value = i < series.length ? series[i] : Number.NaN
      point[key] = Number.isNaN(value) ? undefined : value
    }
    points[i] = point
  }
  return points
}

const resolveParams = (
  meta: CustomIndicatorMeta,
  params: IndicatorParams,
): IndicatorParams => {
  const resolved = defaultParamsFromInputs(meta.inputs)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) resolved[key] = value
  }
  return resolved
}

type ComputeState = {
  /** Bar-identity key of the last completed Python run: len|lastTs|params. */
  identity: string | null
  lastClose: number
  lastRunAt: number
  points: Array<IndicatorValuePoint> | null
  error: Error | null
  /** Source key registered in the Python runtime for this definition. */
  registeredSource: string | null
  /** In-flight run, keyed by identity, so concurrent computes coalesce. */
  inFlight: {
    identity: string
    promise: Promise<Array<IndicatorValuePoint>>
  } | null
}

const createCompute = (
  entry: CustomIndicatorEntry,
  renderSpec: CustomIndicatorRenderSpec,
) => {
  const { type, descriptor } = entry
  const { meta, source } = descriptor
  const modules = descriptor.modules ?? []
  const sourceKey = customIndicatorSourceKey(descriptor)
  const state: ComputeState = {
    identity: null,
    lastClose: Number.NaN,
    lastRunAt: 0,
    points: null,
    error: null,
    registeredSource: null,
    inFlight: null,
  }

  const runPython = async (
    ctx: IndicatorComputeContext,
    params: IndicatorParams,
    identity: string,
    lastClose: number,
  ): Promise<Array<IndicatorValuePoint>> => {
    const runtime = getPythonRuntime()
    const context = currentMarketContext
    try {
      if (state.registeredSource !== sourceKey) {
        await runtime.registerScript(type, source, modules)
        state.registeredSource = sourceKey
      }
      // Higher-timeframe / cross-symbol series the script declared. Cached by
      // the request layer, so this is usually a map lookup.
      const requestData = await resolveRequestSeries(meta.requests, context)
      // Fresh arrays per call — the runtime transfers (detaches) the buffers.
      const result = await runtime.compute(
        type,
        toCandleArrays(ctx.bars),
        params,
        context.pair,
        context.timeframe,
        requestData,
      )
      const points = buildValuePoints(ctx, result.outputs)
      // The presenter reads palettes off the shared render spec, so per-bar
      // colors follow the values they were computed with.
      renderSpec.palettes = result.palettes
      evaluateIndicatorAlerts({
        indicatorType: type,
        meta,
        bars: ctx.bars,
        outputs: result.outputs,
        market: context.market,
        pair: context.pair,
        timeframe: context.timeframe,
      })
      state.identity = identity
      state.lastClose = lastClose
      state.lastRunAt = Date.now()
      state.points = points
      state.error = null
      return points
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const firstLine = message.split('\n')[0] || 'Python compute failed'
      if (err instanceof PythonScriptError) {
        warnOnce(
          `${type}:${message}`,
          `[custom-indicator] ${meta.title} (${type}) failed: ${firstLine}`,
          err.traceback,
        )
      } else {
        warnOnce(
          `${type}:${message}`,
          `[custom-indicator] ${meta.title} (${type}) failed: ${firstLine}`,
        )
      }
      // Cache the failure under the same identity so unchanged data doesn't
      // re-run a broken script; new bars/params (or a throttled forming-bar
      // refresh) retry naturally.
      const error = new Error(firstLine)
      state.identity = identity
      state.lastClose = lastClose
      state.lastRunAt = Date.now()
      state.points = null
      state.error = error
      throw error
    } finally {
      if (state.inFlight?.identity === identity) state.inFlight = null
    }
  }

  return (
    ctx: IndicatorComputeContext,
  ): Array<IndicatorValuePoint> | Promise<Array<IndicatorValuePoint>> => {
    const bars = ctx.bars
    if (bars.length === 0) return []
    if (meta.minBars !== undefined && bars.length < meta.minBars) return []

    const params = resolveParams(meta, ctx.params)
    const last = bars[bars.length - 1]
    const identity = `${bars.length}|${last.ts}|${JSON.stringify(params)}`

    // Recompute policy: call Python only when the bar identity changed
    // (new bar, new history window, new params), or — for the forming bar —
    // when its close moved AND the throttle window has elapsed. Everything
    // else returns the cached points (same array reference).
    if (state.identity === identity) {
      const closeChanged = last.close !== state.lastClose
      const throttled = Date.now() - state.lastRunAt < FORMING_BAR_REFRESH_MS
      if (!closeChanged || throttled) {
        if (state.error) throw state.error
        return state.points ?? []
      }
    }

    if (state.inFlight?.identity === identity) return state.inFlight.promise

    const promise = runPython(ctx, params, identity, last.close)
    state.inFlight = { identity, promise }
    return promise
  }
}

// ── Definition builder ──────────────────────────────────────────────────────

const definitionCache = new Map<
  string,
  { source: string; definition: IndicatorDefinition }
>()

/**
 * Build (or reuse) the chart-engine IndicatorDefinition for a registry entry.
 * Cached per (type, source): registry re-emissions with unchanged source get
 * the same definition object, so engine re-registrations are cheap and the
 * compute cache survives; a source change produces a fresh definition (and a
 * fresh Python registration on its first compute).
 */
export function buildCustomIndicatorDefinition(
  entry: CustomIndicatorEntry,
): IndicatorDefinition {
  const sourceKey = customIndicatorSourceKey(entry.descriptor)
  const cached = definitionCache.get(entry.type)
  if (cached && cached.source === sourceKey) {
    return cached.definition
  }

  const meta = entry.descriptor.meta
  // Shared between compute and presenter: compute refreshes `palettes` after
  // every run and the next frame draws with them.
  const renderSpec: CustomIndicatorRenderSpec = {
    series: meta.series,
    hlines: meta.hlines,
    markers: meta.markers,
    fills: meta.fills,
  }
  const definition: IndicatorDefinition = {
    type: entry.type,
    pane: meta.pane === 'overlay' ? 'overlay' : 'separate',
    compute: createCompute(entry, renderSpec),
    presenter: createCustomIndicatorPresenter(renderSpec),
    supportsIncremental: false,
  }

  definitionCache.set(entry.type, { source: sourceKey, definition })
  return definition
}
