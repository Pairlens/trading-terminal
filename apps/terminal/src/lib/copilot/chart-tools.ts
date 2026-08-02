// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 2 — chart control & read-back.
//
// ACTION tools return a confirmation string; their real effect runs in the
// terminal (copilot-panel's onToolCall) against the bound chart / chart
// actions. QUERY tools read the chart snapshot the terminal pushes at send
// time, so the model can reason about what's actually on screen.
//
// The set of client-executed action tool names is exported as
// CHART_ACTION_TOOL_NAMES so the panel dispatcher knows which calls to forward.
// ---------------------------------------------------------------------------

// A generous but non-exhaustive slice of the engine's 100+ indicator catalog.
// Passed through as a string so any engine indicator type is reachable.
const INDICATOR_HINT =
  'Indicator type. Common: SMA, EMA, WMA, VWAP, RSI, StochRSI, Stochastic, MACD, ' +
  'BollingerBands, KeltnerChannels, DonchianChannels, ATR, ADX, SuperTrend, ' +
  'Ichimoku, OBV, MFI, CMF, CCI, WilliamsR, ParabolicSAR, Aroon, Momentum, ROC, ' +
  'Volume, AwesomeOscillator, PivotPoints. The engine supports many more.'

const point = z.object({ ts: z.number(), price: z.number() })

export const CHART_ACTION_TOOL_NAMES = [
  'add_indicator',
  'remove_indicator',
  'remove_all_indicators',
  'update_indicator',
  'draw_horizontal_line',
  'draw_vertical_line',
  'draw_trendline',
  'draw_rectangle',
  'draw_circle',
  'draw_fibonacci',
  'annotate_chart',
  'draw_stop_loss',
  'draw_take_profit',
  'draw_entry_price',
  'remove_drawing',
  'clear_drawings',
  'undo',
  'redo',
  'set_chart_type',
  'set_price_scale',
  'fit_content',
  'scroll_to_latest',
  'take_screenshot',
  'add_compare_symbol',
  'remove_compare_symbol',
  'start_replay',
  'exit_replay',
] as const

export function buildChartTools(deps: CopilotToolDeps) {
  return {
    // ---- Indicators ----
    add_indicator: tool({
      description:
        'Add a technical indicator to the chart. Supports the engine’s full catalog (100+ types).',
      inputSchema: z.object({
        type: z.string().describe(INDICATOR_HINT),
        period: z.number().optional(),
        color: z.string().optional(),
      }),
      execute: async ({ type, period }) =>
        `Added ${type}${period ? ` (${period})` : ''} to the chart.`,
    }),
    remove_indicator: tool({
      description: 'Remove a technical indicator by its id.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => `Removed indicator ${id}.`,
    }),
    remove_all_indicators: tool({
      description: 'Remove all indicators from the chart.',
      inputSchema: z.object({}),
      execute: async () => 'Removed all indicators.',
    }),
    update_indicator: tool({
      description:
        'Update an existing indicator’s params, color, or visibility.',
      inputSchema: z.object({
        id: z.string(),
        params: z.record(z.unknown()).optional(),
        color: z.string().optional(),
        visible: z.boolean().optional(),
      }),
      execute: async ({ id }) => `Updated indicator ${id}.`,
    }),

    // ---- Drawings ----
    draw_horizontal_line: tool({
      description: 'Draw a horizontal price level line.',
      inputSchema: z.object({
        price: z.number(),
        color: z.string().optional(),
        lineWidth: z.number().optional(),
      }),
      execute: async ({ price }) =>
        `Drew a horizontal line at ${price.toLocaleString()}.`,
    }),
    draw_vertical_line: tool({
      description: 'Draw a vertical line at a timestamp.',
      inputSchema: z.object({
        ts: z.number(),
        color: z.string().optional(),
        lineWidth: z.number().optional(),
      }),
      execute: async () => 'Drew a vertical line.',
    }),
    draw_trendline: tool({
      description:
        'Draw a trendline between two time/price points. Do NOT extend unless asked.',
      inputSchema: z.object({
        start: point,
        end: point,
        extend: z.enum(['none', 'left', 'right', 'both']).optional(),
        color: z.string().optional(),
        lineWidth: z.number().optional(),
      }),
      execute: async () => 'Drew a trendline.',
    }),
    draw_rectangle: tool({
      description: 'Draw a rectangle zone between two time/price points.',
      inputSchema: z.object({
        start: point,
        end: point,
        color: z.string().optional(),
        lineWidth: z.number().optional(),
      }),
      execute: async () => 'Drew a rectangle zone.',
    }),
    draw_circle: tool({
      description: 'Draw a circle to highlight candles.',
      inputSchema: z.object({
        center: point,
        radiusBars: z.number().optional(),
        color: z.string().optional(),
        lineWidth: z.number().optional(),
      }),
      execute: async () => 'Drew a circle.',
    }),
    draw_fibonacci: tool({
      description: 'Draw a Fibonacci retracement between two points.',
      inputSchema: z.object({
        start: point,
        end: point,
        levels: z.array(z.number()).optional(),
        color: z.string().optional(),
      }),
      execute: async () => 'Drew a Fibonacci retracement.',
    }),
    annotate_chart: tool({
      description: 'Add a text annotation at a point on the chart.',
      inputSchema: z.object({
        text: z.string(),
        ts: z.number(),
        price: z.number(),
        fontSize: z.number().optional(),
        color: z.string().optional(),
      }),
      execute: async ({ text }) => `Added annotation “${text}”.`,
    }),
    draw_stop_loss: tool({
      description: 'Draw a red stop-loss line at a price.',
      inputSchema: z.object({ price: z.number() }),
      execute: async ({ price }) =>
        `Drew a stop-loss at ${price.toLocaleString()}.`,
    }),
    draw_take_profit: tool({
      description: 'Draw a green take-profit line at a price.',
      inputSchema: z.object({ price: z.number() }),
      execute: async ({ price }) =>
        `Drew a take-profit at ${price.toLocaleString()}.`,
    }),
    draw_entry_price: tool({
      description: 'Draw a blue entry price line at a price.',
      inputSchema: z.object({ price: z.number() }),
      execute: async ({ price }) =>
        `Drew an entry line at ${price.toLocaleString()}.`,
    }),
    remove_drawing: tool({
      description: 'Remove a drawing by its id.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => `Removed drawing ${id}.`,
    }),
    clear_drawings: tool({
      description: 'Remove all drawings from the chart.',
      inputSchema: z.object({}),
      execute: async () => 'Cleared all drawings.',
    }),
    undo: tool({
      description: 'Undo the last drawing change.',
      inputSchema: z.object({}),
      execute: async () => 'Undid the last change.',
    }),
    redo: tool({
      description: 'Redo the last undone change.',
      inputSchema: z.object({}),
      execute: async () => 'Redid the last change.',
    }),

    // ---- View ----
    set_chart_type: tool({
      description: 'Change the chart type.',
      inputSchema: z.object({
        chartType: z.enum([
          'candles',
          'heikinAshi',
          'line',
          'area',
          'bar',
          'baseline',
          'histogram',
        ]),
      }),
      execute: async ({ chartType }) => `Changed chart type to ${chartType}.`,
    }),
    set_price_scale: tool({
      description: 'Change the price scale mode.',
      inputSchema: z.object({
        mode: z.enum(['normal', 'logarithmic', 'percentage', 'indexedTo100']),
      }),
      execute: async ({ mode }) => `Set the price scale to ${mode}.`,
    }),
    fit_content: tool({
      description: 'Auto-fit the viewport to show all data.',
      inputSchema: z.object({}),
      execute: async () => 'Fit the chart to all data.',
    }),
    scroll_to_latest: tool({
      description: 'Scroll the chart to the latest candle.',
      inputSchema: z.object({}),
      execute: async () => 'Scrolled to the latest candle.',
    }),
    take_screenshot: tool({
      description: 'Capture a screenshot of the current chart.',
      inputSchema: z.object({}),
      execute: async () => 'Captured a chart screenshot.',
    }),

    // ---- Compare & replay ----
    add_compare_symbol: tool({
      description:
        'Overlay another pair on the chart for visual comparison (TradingView-style compare).',
      inputSchema: z.object({
        pair: z.string().describe('Pair to overlay, e.g. ETH-USDT'),
        market: z.string().optional(),
      }),
      execute: async ({ pair }) => `Added ${pair} as a comparison overlay.`,
    }),
    remove_compare_symbol: tool({
      description: 'Remove a comparison overlay by its series id or pair.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => `Removed comparison ${id}.`,
    }),
    start_replay: tool({
      description: 'Start bar-replay mode to step through history.',
      inputSchema: z.object({}),
      execute: async () => 'Started replay mode.',
    }),
    exit_replay: tool({
      description: 'Exit bar-replay mode and return to live.',
      inputSchema: z.object({}),
      execute: async () => 'Exited replay mode.',
    }),

    // ---- Queries (read the pushed chart snapshot) ----
    get_chart_state: tool({
      description:
        'Read what is currently on the chart: type, timeframe, price-scale mode, active indicators, drawings, comparison overlays, and visible range.',
      inputSchema: z.object({}),
      execute: async () => {
        const snap = deps.getChartSnapshot()
        if (!snap)
          return { available: false, message: 'Chart state unavailable.' }
        return {
          timeframe: snap.timeframe,
          chartType: snap.chartType,
          priceScaleMode: snap.priceScaleMode,
          indicatorCount: snap.indicators?.length ?? 0,
          indicators: snap.indicators,
          drawingCount: snap.drawings?.length ?? 0,
          compareSymbols: snap.compareSymbols ?? [],
          visibleRange: snap.visibleRange,
          barCount: snap.barCount,
        }
      },
    }),
    get_chart_indicators: tool({
      description:
        'Read the indicators currently applied to the chart, with their latest computed values where available (e.g. current RSI).',
      inputSchema: z.object({}),
      execute: async () => {
        const snap = deps.getChartSnapshot()
        return { indicators: snap?.indicators ?? [] }
      },
    }),
    get_chart_drawings: tool({
      description: 'Read the drawings currently on the chart.',
      inputSchema: z.object({}),
      execute: async () => {
        const snap = deps.getChartSnapshot()
        return { drawings: snap?.drawings ?? [] }
      },
    }),
  }
}
