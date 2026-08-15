// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Client-executed tool effects ─────────────────────────────────────
//
// Chart mutations and navigation are the tools that cannot resolve in the
// transport: they need the live chart engine and the router. They run here,
// on the client, against whichever chart handle the caller passes in.
//
// This lives in lib/ rather than inside a panel so both the pane copilot
// and the assistant dock (mounted above the routed content, reaching the
// chart through the ServiceRegistry) run one table rather than two.

import { putScreenshot } from './screenshot-store'
import type { useNavigate } from '@tanstack/react-router'
import type {
  FastFinancialChartRef,
  IndicatorInstanceInput,
} from '@pairlens/fast-financial-charts/types'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'
import type {
  CopilotChartSnapshot,
  CopilotMarketDataHandle,
} from '@/lib/copilot/tool-deps'
import type { useMarketData } from '@/lib/market-data-provider'
import type { ChartServiceHandle } from './chart-service'
import { legacySymbolToInstrumentRef } from '@/lib/market-ref/legacy'
import { chartLinkProps } from '@/lib/market-ref/link'
import { normalizePair, normalizeTimeframe } from '@/lib/copilot/tool-deps'

type MarketData = ReturnType<typeof useMarketData>
type NavigateFn = ReturnType<typeof useNavigate>

// Map per-type drawing tools to addDrawing command payloads.
// DrawingBase requires visible, color, and lineWidth — the chart engine
// does NOT default these, so we must always provide them.
const DEFAULT_COLOR = '#ffb020'
const DEFAULT_LINE_WIDTH = 1.5

const drawingToolMap: Record<
  string,
  (
    p: Record<string, unknown>,
    chart?: FastFinancialChartRef,
  ) => Record<string, unknown>
> = {
  draw_horizontal_line: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_vertical_line: (p) => ({
    type: 'vline',
    ts: p.ts,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_trendline: (p) => ({
    type: 'line',
    points: [p.start, p.end],
    extend: p.extend,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_rectangle: (p) => ({
    type: 'rectangle',
    points: [p.start, p.end],
    visible: true,
    color: (p.color as string) ?? '#ffb02040',
    lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
  }),
  draw_circle: (p, chart) => {
    const center = p.center as { ts: number; price: number }
    const radiusBars = (p.radiusBars as number) ?? 3
    const bars = chart?.data() ?? []
    let barInterval = 60_000
    if (bars.length >= 2) {
      barInterval = bars[1].ts - bars[0].ts
    }
    const edge = {
      ts: center.ts + barInterval * radiusBars,
      price: center.price * (1 + 0.01 * radiusBars),
    }
    return {
      type: 'circle',
      points: [center, edge],
      visible: true,
      color: (p.color as string) ?? DEFAULT_COLOR,
      lineWidth: (p.lineWidth as number) ?? DEFAULT_LINE_WIDTH,
    }
  },
  draw_fibonacci: (p) => ({
    type: 'fibonacci',
    points: [p.start, p.end],
    levels: p.levels,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: DEFAULT_LINE_WIDTH,
  }),
  annotate_chart: (p) => ({
    type: 'text',
    point: { ts: p.ts, price: p.price },
    content: p.text,
    fontSize: p.fontSize,
    visible: true,
    color: (p.color as string) ?? DEFAULT_COLOR,
    lineWidth: 1,
  }),
  draw_stop_loss: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    // Warm Precision --down / --up / --primary (WebGL needs concrete hex)
    color: '#e94f55',
    lineWidth: 2,
  }),
  draw_take_profit: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: '#40c786',
    lineWidth: 2,
  }),
  draw_entry_price: (p) => ({
    type: 'hline',
    price: p.price,
    visible: true,
    color: '#929bf5',
    lineWidth: 2,
  }),
}

// Client-executed chart command names → executeCommand type.
// `take_screenshot` is deliberately absent: it is the one command whose
// return value matters, so it is handled on its own below.
const SIMPLE_CHART_COMMANDS: Record<string, string> = {
  remove_drawing: 'removeDrawing',
  clear_drawings: 'clearDrawings',
  undo: 'undo',
  redo: 'redo',
  fit_content: 'fitContent',
  scroll_to_latest: 'scrollToLatest',
}

export type ClientToolContext = {
  /** The chart the effect lands on, or null when none is open. */
  chart: ChartServiceHandle | null
  navigate: NavigateFn
  /** Instrument → venue, the shared policy. Null when nothing serves it. */
  resolveMarketRef: (
    inst: InstrumentRef,
    preferred?: string,
  ) => MarketRef | null
  /** Arm a deferred copilot check (schedule_check tool). */
  scheduleCheck?: (delayMinutes: number, instruction: string) => void
  /** Identifies the call, so a captured screenshot can find its chip again. */
  toolCallId?: string
}

/**
 * Perform the real effect of a client-forwarded tool call (chart mutations +
 * navigation). Data/read tools resolve in the transport; trading tools render
 * a confirmation card — both are ignored here.
 */
export function executeClientTool(
  toolName: string,
  input: Record<string, unknown> | undefined,
  ctx: ClientToolContext,
): void {
  const handle = ctx.chart
  const actions = handle?.chartActions
  const chart = handle?.chartRef.current ?? null
  const p = input ?? {}
  try {
    // ── Indicators ──
    if (toolName === 'add_indicator') {
      const payload: Record<string, unknown> = { type: p.type }
      if (p.period != null) payload.params = { period: p.period }
      if (p.color) payload.color = p.color
      handle?.addIndicator(payload as IndicatorInstanceInput)
      return
    }
    if (toolName === 'remove_indicator') {
      if (p.id) handle?.removeIndicator(p.id as string)
      return
    }
    if (toolName === 'remove_all_indicators') {
      handle?.removeAllIndicators()
      return
    }
    if (toolName === 'update_indicator') {
      if (p.id) {
        actions?.updateIndicator(
          p.id as string,
          (p.params as Record<string, string | number | boolean>) ?? {},
        )
      }
      return
    }

    // ── Navigation ──
    if (toolName === 'switch_market') {
      if (p.market) actions?.setMarket(String(p.market).toLowerCase())
      return
    }
    if (toolName === 'set_timeframe') {
      const tf = p.timeframe ? normalizeTimeframe(String(p.timeframe)) : null
      if (tf) actions?.setTimeframe(tf as never)
      return
    }
    if (toolName === 'switch_pair') {
      const pair = normalizePair(String(p.pair ?? ''))
      if (!pair) return
      // The tool may name a venue; when it does not, the ref resolves the way
      // every other surface does rather than inheriting whatever the chart
      // happens to be on, which for a cross-class switch was the wrong tape.
      const named = p.market ? String(p.market).toLowerCase() : undefined
      const resolved = ctx.resolveMarketRef(
        legacySymbolToInstrumentRef(pair),
        named,
      )
      if (!resolved) return
      void ctx.navigate(chartLinkProps(resolved))
      return
    }

    // ── Scheduled checks ──
    if (toolName === 'schedule_check') {
      const mins = Number(p.delayMinutes)
      const instruction = String(p.instruction ?? '').trim()
      if (Number.isFinite(mins) && mins >= 1 && instruction) {
        ctx.scheduleCheck?.(Math.min(mins, 240), instruction)
      }
      return
    }

    // ── Compare & replay ──
    if (toolName === 'add_compare_symbol') {
      if (handle) {
        handle.chartActions.addCompareSymbol({
          pairKey: normalizePair(String(p.pair ?? '')),
          market: (p.market as string)?.toLowerCase() ?? handle.market,
        })
      }
      return
    }
    if (toolName === 'remove_compare_symbol') {
      if (p.id) actions?.removeCompareSymbol(p.id as string)
      return
    }
    if (toolName === 'start_replay') {
      actions?.startReplay()
      return
    }
    if (toolName === 'exit_replay') {
      actions?.exitReplay()
      return
    }

    if (!chart) return

    // ── View config (route through chart actions for state sync) ──
    if (toolName === 'set_chart_type') {
      actions?.setChartType(p.chartType as never)
      return
    }
    if (toolName === 'set_price_scale') {
      actions?.setPriceScaleMode(p.mode as never)
      return
    }

    // ── Drawings ──
    const drawingMapper = drawingToolMap[toolName]
    if (drawingMapper) {
      chart.executeCommand({
        type: 'addDrawing',
        payload: drawingMapper(p, chart),
      } as Parameters<FastFinancialChartRef['executeCommand']>[0])
      return
    }

    // ── Simple pass-through commands ──
    // The engine hands the PNG back and this used to discard it, so the
    // tool reported a screenshot the user never got. Park it for the
    // renderer instead; it cannot ride in the tool result, which is what
    // the model reads.
    if (toolName === 'take_screenshot') {
      const shot = chart?.executeCommand({
        type: 'takeScreenshot',
        payload: p,
      } as Parameters<FastFinancialChartRef['executeCommand']>[0]) as
        | { ok?: boolean; result?: { dataUrl?: string } }
        | undefined
      const dataUrl = shot?.result?.dataUrl
      if (dataUrl && ctx.toolCallId) putScreenshot(ctx.toolCallId, dataUrl)
      return
    }

    const command = SIMPLE_CHART_COMMANDS[toolName]
    if (command) {
      chart.executeCommand({
        type: command,
        payload: p,
      } as Parameters<FastFinancialChartRef['executeCommand']>[0])
    }
  } catch {
    // Client tool execution is best-effort — never break the chat loop.
  }
}

/** Extract a compact chart snapshot for the copilot's chart-query tools. */
export function buildChartSnapshot(
  chart: FastFinancialChartRef | null,
): CopilotChartSnapshot | null {
  if (!chart) return null
  const ref = chart as unknown as {
    getSnapshot?: (o?: unknown) => Record<string, unknown>
    data?: () => Array<unknown>
    seriesOrder?: () => Array<string>
  }
  if (!ref.getSnapshot) return null
  try {
    const s = ref.getSnapshot() ?? {}
    const indicators = Array.isArray(s.indicators)
      ? (s.indicators as Array<Record<string, unknown>>).map((ind) => ({
          id: String(ind.id ?? ''),
          type: String(ind.type ?? ''),
          params: ind.params as Record<string, unknown> | undefined,
        }))
      : []
    const drawings = Array.isArray(s.drawings)
      ? (s.drawings as Array<Record<string, unknown>>).map((d) => ({
          id: String(d.id ?? ''),
          type: String(d.type ?? ''),
        }))
      : []
    const viewport = s.viewport as
      | { startIndex?: number; endIndex?: number }
      | undefined
    const seriesOrder = ref.seriesOrder?.() ?? []
    return {
      timeframe: s.timeframe as string | undefined,
      chartType: s.chartType as string | undefined,
      priceScaleMode: s.priceScaleMode as string | undefined,
      indicators,
      drawings,
      visibleRange:
        viewport?.startIndex != null && viewport?.endIndex != null
          ? { startIndex: viewport.startIndex, endIndex: viewport.endIndex }
          : undefined,
      barCount: ref.data?.().length,
      compareSymbols: seriesOrder.slice(1),
    }
  } catch {
    return null
  }
}

export function toMarketDataHandle(
  md: MarketData | null,
): CopilotMarketDataHandle | null {
  if (!md) return null
  return {
    availableMarkets: md.availableMarkets.map((m) => ({
      marketId: m.marketId,
      displayName: m.displayName,
      assetClasses: m.assetClasses as unknown as Array<string> | undefined,
      supportedTimeframes: m.supportedTimeframes as unknown as
        | Array<string>
        | undefined,
      capabilities: md.getCapabilities(m.marketId),
    })),
    getTimeframes: md.getTimeframes,
    getCapabilities: md.getCapabilities,
    fetchHistory: md.fetchHistory,
    subscribeOrderbook: md.subscribeOrderbook,
  }
}
