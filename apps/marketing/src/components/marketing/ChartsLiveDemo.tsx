// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The hero card on /charts: one real @pairlens/fast-financial-charts instance streaming a
// seeded synthetic BTC-USD, under page-owned chrome. Every chip is plain HTML
// driving plain library props — the engine ships no CSS classes, so the frame,
// the labels and the price readout are all ours.
import { useCallback, useMemo, useRef, useState } from 'react'
import { LiveChart } from './charts/LiveChart'
import { TONE, TickStream, formatPrice, makeBars } from './charts/chart-kit'
import { usePageSkin } from './charts/use-page-skin'
import type { ChartType } from '@pairlens/fast-financial-charts/types'
import type { ChartConfig, IndicatorKey, LiveTick } from './charts/chart-kit'

const SERIES_ID = 'BTC-USD'
const BASE = 63_200

const TYPES: Array<{ type: ChartType; label: string }> = [
  { type: 'candles', label: 'Candles' },
  { type: 'line', label: 'Line' },
  { type: 'area', label: 'Area' },
]

const INDICATORS: Array<{ key: IndicatorKey; label: string }> = [
  { key: 'ema', label: 'EMA 21' },
  { key: 'bb', label: 'Bollinger' },
  { key: 'rsi', label: 'RSI pane' },
  { key: 'vol', label: 'Volume' },
]

export function ChartsLiveDemo() {
  // The card's frame is page-owned chrome, so the skin bar re-points its
  // tokens directly; the island only needs the engine half of the skin.
  const skin = usePageSkin()
  const bars = useMemo(() => makeBars(150, 7, BASE, '1m'), [])
  const stream = useMemo(
    () => new TickStream(BASE, '1m', bars[bars.length - 1]),
    [bars],
  )
  const priceRef = useRef<HTMLSpanElement>(null)

  const [cfg, setCfg] = useState<ChartConfig>({
    type: 'candles',
    ema: true,
    bb: false,
    rsi: false,
    vol: true,
  })

  // Written straight to the DOM: at ~1 tick/second a state update here would
  // re-render the card (and its chart subtree) for a four-character label.
  const onTick = useCallback((tick: LiveTick) => {
    const el = priceRef.current
    if (!el) return
    el.textContent = `$${formatPrice(tick.price, BASE)}`
    el.style.color =
      tick.price >= tick.open ? 'var(--chart-2)' : 'var(--destructive)'
  }, [])

  // The card frame itself is painted by the page, not here: it lands with the
  // first HTML while this island is still loading, so nothing shifts.
  return (
    <div>
      <div
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-border px-[18px] py-3"
        style={{
          background: 'color-mix(in oklch, var(--background) 55%, transparent)',
        }}
      >
        <div className="flex items-center gap-3.5">
          <span className="font-serif text-[15.5px] font-semibold tracking-[-0.01em] text-foreground">
            BTC-USD
          </span>
          <span
            ref={priceRef}
            className="font-mono text-[14px] font-semibold"
            style={{ color: 'var(--chart-2)' }}
          >
            —
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
            <span
              className="size-1.5 rounded-full motion-safe:animate-pulse"
              style={{ background: 'var(--chart-2)' }}
              aria-hidden="true"
            />
            Streaming
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1">
            {TYPES.map(({ type, label }) => {
              const on = cfg.type === type
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCfg((prev) => ({ ...prev, type }))}
                  className="cursor-pointer rounded-lg border px-2.5 py-[5px] font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? 'var(--border)' : 'transparent',
                    background: on ? 'var(--muted)' : 'none',
                    color: on ? 'var(--foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <span
            aria-hidden="true"
            className="hidden h-[18px] w-px bg-border min-[721px]:block"
          />
          <div className="flex gap-1">
            {INDICATORS.map(({ key, label }) => {
              const on = cfg[key]
              const tone = TONE[key]
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setCfg((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  className="cursor-pointer rounded-lg border px-2.5 py-[5px] font-mono text-[11px] transition-colors"
                  style={{
                    borderColor: on ? 'var(--border)' : 'transparent',
                    background: on
                      ? `color-mix(in oklch, ${tone} 16%, transparent)`
                      : 'none',
                    color: on ? tone : 'var(--muted-foreground)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <LiveChart
        seriesId={SERIES_ID}
        bars={bars}
        timeframe="1m"
        base={BASE}
        cfg={cfg}
        skin={skin.chart}
        showGrid={skin.showGrid}
        fontFamily={skin.fontFamily}
        stream={stream}
        height={480}
        priceAxisWidth={68}
        maxFps={60}
        worker
        pannable
        hud
        onTick={onTick}
      />
    </div>
  )
}
