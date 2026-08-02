// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Six more live engines, each a different instrument, timeframe and indicator
// stack. The chips are real: clicking one reconfigures that chart in place,
// which is the whole claim of the section above it.
import { useCallback, useMemo, useRef, useState } from 'react'
import { LiveChart } from './LiveChart'
import { TONE, TickStream, formatPrice, makeBars } from './chart-kit'
import { usePageSkin } from './use-page-skin'
import type { CSSProperties } from 'react'
import type { ChartType, Timeframe } from 'fast-financial-charts/types'
import type { ChartConfig, IndicatorKey, LiveTick } from './chart-kit'

type GalleryEntry = {
  id: string
  pair: string
  timeframe: Timeframe
  /** How the timeframe reads in the card header (`1d` shows as `1D`). */
  tfLabel: string
  base: number
  seed: number
  cfg: ChartConfig
}

const GALLERY: Array<GalleryEntry> = [
  {
    id: 'g1',
    pair: 'ETH-USD',
    timeframe: '1m',
    tfLabel: '1m',
    base: 3120,
    seed: 20,
    cfg: { type: 'line', ema: false, bb: true, rsi: false, vol: false },
  },
  {
    id: 'g2',
    pair: 'SOL-USD',
    timeframe: '5m',
    tfLabel: '5m',
    base: 178,
    seed: 33,
    cfg: { type: 'area', ema: true, bb: false, rsi: false, vol: false },
  },
  {
    id: 'g3',
    pair: 'AAPL',
    timeframe: '1d',
    tfLabel: '1D',
    base: 232,
    seed: 46,
    cfg: { type: 'candles', ema: false, bb: false, rsi: true, vol: false },
  },
  {
    id: 'g4',
    pair: 'BTC-USD',
    timeframe: '5m',
    tfLabel: '5m',
    base: 63200,
    seed: 59,
    cfg: { type: 'candles', ema: true, bb: true, rsi: false, vol: true },
  },
  {
    id: 'g5',
    pair: 'TSLA',
    timeframe: '15m',
    tfLabel: '15m',
    base: 412,
    seed: 72,
    cfg: { type: 'candles', ema: true, bb: false, rsi: false, vol: true },
  },
  {
    id: 'g6',
    pair: 'DOGE-USD',
    timeframe: '1m',
    tfLabel: '1m',
    base: 0.42,
    seed: 85,
    cfg: { type: 'area', ema: false, bb: true, rsi: false, vol: true },
  },
]

const TYPES: Array<{ type: ChartType; short: string; label: string }> = [
  { type: 'candles', short: 'C', label: 'Candles' },
  { type: 'line', short: 'L', label: 'Line' },
  { type: 'area', short: 'A', label: 'Area' },
]

const KEYS: Array<{ key: IndicatorKey; short: string; label: string }> = [
  { key: 'ema', short: 'EMA', label: 'EMA 21' },
  { key: 'bb', short: 'BB', label: 'Bollinger bands' },
  { key: 'rsi', short: 'RSI', label: 'RSI pane' },
  { key: 'vol', short: 'VOL', label: 'Volume pane' },
]

const chipClass =
  'cursor-pointer rounded-md border px-[7px] py-[3px] font-mono text-[10px] transition-colors'

function GalleryCard({ entry }: { entry: GalleryEntry }) {
  // Re-pointing the design tokens on the card is the whole trick: every label,
  // chip and rule inside it reads them, so the chrome re-skins with the canvas.
  const skin = usePageSkin()
  const bars = useMemo(
    () => makeBars(96, entry.seed, entry.base, entry.timeframe),
    [entry],
  )
  const stream = useMemo(
    () => new TickStream(entry.base, entry.timeframe, bars[bars.length - 1]),
    [entry, bars],
  )
  const priceRef = useRef<HTMLSpanElement>(null)
  const [cfg, setCfg] = useState<ChartConfig>(entry.cfg)

  const onTick = useCallback(
    (tick: LiveTick) => {
      const el = priceRef.current
      if (!el) return
      el.textContent = `$${formatPrice(tick.price, entry.base)}`
      el.style.color =
        tick.price >= tick.open ? 'var(--chart-2)' : 'var(--destructive)'
    },
    [entry.base],
  )

  return (
    <div
      data-chart-root
      data-skin-radius
      style={skin.vars as CSSProperties}
      className="overflow-hidden rounded-[18px] border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-[11px]">
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-[14.5px] font-semibold text-foreground">
            {entry.pair}
          </span>
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground/70">
            {entry.tfLabel}
          </span>
          <span
            ref={priceRef}
            className="font-mono text-[12.5px]"
            style={{ color: 'var(--chart-2)' }}
          >
            —
          </span>
        </div>
        <div className="flex items-center gap-[3px]">
          {TYPES.map(({ type, short, label }) => {
            const on = cfg.type === type
            return (
              <button
                key={type}
                type="button"
                aria-label={label}
                aria-pressed={on}
                onClick={() => setCfg((prev) => ({ ...prev, type }))}
                className={chipClass}
                style={{
                  borderColor: on ? 'var(--border)' : 'transparent',
                  background: on ? 'var(--muted)' : 'none',
                  color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                {short}
              </button>
            )
          })}
          <span
            aria-hidden="true"
            className="mx-[5px] h-4 w-px self-center bg-border"
          />
          {KEYS.map(({ key, short, label }) => {
            const on = cfg[key]
            const tone = TONE[key]
            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={on}
                onClick={() =>
                  setCfg((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                className={chipClass}
                style={{
                  borderColor: on ? 'var(--border)' : 'transparent',
                  background: on
                    ? `color-mix(in oklch, ${tone} 16%, transparent)`
                    : 'none',
                  color: on ? tone : 'var(--muted-foreground)',
                }}
              >
                {short}
              </button>
            )
          })}
        </div>
      </div>
      <LiveChart
        seriesId={entry.pair}
        bars={bars}
        timeframe={entry.timeframe}
        base={entry.base}
        cfg={cfg}
        skin={skin.chart}
        showGrid={skin.showGrid}
        fontFamily={skin.fontFamily}
        stream={stream}
        height={262}
        onTick={onTick}
      />
    </div>
  )
}

export function ChartGallery() {
  return (
    <div className="grid gap-5 min-[721px]:grid-cols-2">
      {GALLERY.map((entry) => (
        <GalleryCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
