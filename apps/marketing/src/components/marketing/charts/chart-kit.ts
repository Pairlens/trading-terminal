// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Shared plumbing for /charts. Every chart on that page is a real
// fast-financial-charts instance, so this module owns the three things they all
// need: a palette the engine can parse, the seeded synthetic market they
// render, and the tick stream that keeps them moving. Chrome lives in the
// components; nothing here draws anything.

import type {
  ChartBar,
  ChartThemeInput,
  ChartType,
  IndicatorInstanceInput,
  Timeframe,
} from 'fast-financial-charts/types'

/**
 * Colours handed to the engine must be literal `#rrggbb`: the WebGL price pass
 * parses them with a hex-only reader, so `var(--token)` — or the oklch() the
 * design system is authored in — renders as nothing at all. These are the dark
 * ("Graphite") DS tokens, converted once. Page chrome still uses the tokens.
 */
export const HEX = {
  background: '#0a0806',
  card: '#110e0b',
  inset: '#090705',
  border: '#282521',
  foreground: '#edebe7',
  mutedForeground: '#96918c',
  primary: '#929bf5',
  /** --chart-2 */
  green: '#40c786',
  /** --destructive */
  red: '#e94f55',
  /** --chart-3 */
  iris: '#8b94f4',
  /** --chart-4 */
  amber: '#ddb049',
  /** --chart-5 */
  magenta: '#c97adb',
  /** --magic-3 */
  cyan: '#30c8cf',
} as const

export const FONT_MONO = "'JetBrains Mono Variable', ui-monospace, monospace"

/** Tints used by the chips that toggle each indicator, in token form. */
export const TONE = {
  ema: 'var(--chart-4)',
  bb: 'var(--magic-3)',
  rsi: 'var(--chart-5)',
  vol: 'var(--chart-3)',
} as const

export type IndicatorKey = keyof typeof TONE

const TF_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
}

/** A chart's visible configuration — what the chips on each card toggle. */
export type ChartConfig = {
  type: ChartType
  ema: boolean
  bb: boolean
  rsi: boolean
  vol: boolean
}

/** Everything the engine paints for one card: the three "same series, three
 *  products" cards each pin one, and the rest take theirs from the page skin
 *  (`skin.ts`) so the bar at the bottom can repaint them all at once. */
export type ChartSkin = {
  bg: string
  grid: string
  text: string
  fg: string
  up: string
  down: string
  ema: string
  bb: string
  rsi: string
}

type ThemeOptions = {
  /** Off hides the gridlines (and, with them, the axis hairlines). */
  showGrid?: boolean
  /** Axis type face. The skin bar's font control drives this. */
  fontFamily?: string
}

export function skinToTheme(
  skin: ChartSkin,
  priceAxisWidth = 62,
  { showGrid = true, fontFamily = FONT_MONO }: ThemeOptions = {},
) {
  const theme: ChartThemeInput = {
    background: skin.bg,
    axisBackground: skin.bg,
    // Canvas strokes, so a zero-alpha colour is how gridlines switch off.
    grid: showGrid ? skin.grid : 'rgba(0, 0, 0, 0)',
    axisText: skin.text,
    upCandle: skin.up,
    downCandle: skin.down,
    crosshair: skin.text,
    // The engine tints a corner glow with `selection`; leave it on the skin's
    // own grid hue so no default blue bleeds into a warm or paper card.
    selection: `${skin.grid}66`,
    drawingHandle: skin.fg,
    hudBg: `${skin.bg}ee`,
    hudText: skin.fg,
    fontFamilyMono: fontFamily,
    fontSizeAxis: 10,
    fontSizeHud: 10,
    indicator: {
      volume: { up: `${skin.up}55`, down: `${skin.down}55` },
      rsi: { guide: `${skin.grid}` },
      oscillator: { zeroLine: `${skin.grid}` },
    },
    layout: { priceAxisWidth, timeAxisHeight: 22, gridRows: 4, gridColumns: 6 },
  }
  return theme
}

export function buildIndicators(
  seriesId: string,
  cfg: ChartConfig,
  skin: ChartSkin,
): Array<IndicatorInstanceInput> {
  const out: Array<IndicatorInstanceInput> = []
  if (cfg.ema) {
    out.push({
      id: `${seriesId}:ema`,
      type: 'EMA',
      seriesId,
      params: { period: 21 },
      pane: 'overlay',
      color: skin.ema,
    })
  }
  if (cfg.bb) {
    out.push({
      id: `${seriesId}:bb`,
      type: 'BollingerBands',
      seriesId,
      params: { period: 20, stdDev: 2 },
      pane: 'overlay',
      color: skin.bb,
    })
  }
  if (cfg.vol) {
    out.push({
      id: `${seriesId}:vol`,
      type: 'Volume',
      seriesId,
      pane: 'separate',
      color: skin.up,
    })
  }
  if (cfg.rsi) {
    out.push({
      id: `${seriesId}:rsi`,
      type: 'RSI',
      seriesId,
      params: { period: 14 },
      pane: 'separate',
      color: skin.rsi,
    })
  }
  return out
}

export const decimalsFor = (base: number) =>
  base < 5 ? 4 : base < 1000 ? 2 : 0

export function formatPrice(value: number, base: number) {
  const digits = decimalsFor(base)
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Deterministic LCG so every visitor sees the same synthetic market. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

export function makeBars(
  count: number,
  seed: number,
  base: number,
  timeframe: Timeframe,
): Array<ChartBar> {
  const rnd = seeded(seed)
  const stepMs = TF_MS[timeframe]
  const start = Date.now() - (count - 1) * stepMs
  const scale = base / 63200
  const bars: Array<ChartBar> = []
  let price = base

  for (let i = 0; i < count; i++) {
    const drift = (rnd() - 0.47) * 150 * scale
    const open = price
    const close = Math.max(base * 0.2, open + drift)
    const wick = Math.abs(drift) * (0.5 + rnd() * 1.4) + 20 * scale
    bars.push({
      ts: start + i * stepMs,
      open,
      close,
      high: Math.max(open, close) + wick * rnd(),
      low: Math.min(open, close) - wick * rnd(),
      volume: 0.3 + rnd() * 1.6,
    })
    price = close
  }
  return bars
}

export type LiveTick = {
  ts: number
  price: number
  volume: number
  /** Open of the bar this tick lands in — drives the up/down price colour. */
  open: number
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One synthetic feed, fanned out to every chart subscribed to it. The three
 * "same series, three products" cards share a single stream so their bars can
 * never drift apart; every other card owns one.
 *
 * The clock is virtual: each tick advances a sixth of a bar, so bars roll every
 * ~5s instead of once per real timeframe — the conveyor is the point. The
 * interval only runs while something is subscribed, which is how charts
 * scrolled out of view stop costing anything.
 */
export class TickStream {
  private readonly listeners = new Set<(tick: LiveTick) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly tfMs: number
  private readonly stepMs: number
  private ts: number
  private barEnd: number
  private price: number
  private open: number

  constructor(
    private readonly base: number,
    timeframe: Timeframe,
    seedBar: ChartBar,
  ) {
    this.tfMs = TF_MS[timeframe]
    this.stepMs = this.tfMs / 6
    this.ts = seedBar.ts
    this.barEnd = seedBar.ts + this.tfMs
    this.price = seedBar.close
    this.open = seedBar.open
  }

  get last(): LiveTick {
    return { ts: this.ts, price: this.price, volume: 0, open: this.open }
  }

  subscribe(listener: (tick: LiveTick) => void) {
    this.listeners.add(listener)
    if (this.timer === null && !prefersReducedMotion()) {
      this.timer = setInterval(() => this.step(), 900)
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  private step() {
    if (document.hidden) return
    this.ts += this.stepMs
    const move = (Math.random() - 0.48) * 90 * (this.base / 63200)
    this.price = Math.max(this.base * 0.2, this.price + move)
    if (this.ts >= this.barEnd) {
      this.barEnd += this.tfMs
      this.open = this.price
    }
    const tick: LiveTick = {
      ts: this.ts,
      price: this.price,
      volume: Math.random() * 0.12,
      open: this.open,
    }
    for (const listener of this.listeners) listener(tick)
  }
}
