// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// One live @pairlens/fast-financial-charts instance, sized by its host. Shared by every card
// on /charts: the hero, the six-up gallery, the three skinned cards and the
// quick-start pane. The engine is only constructed once the card comes near
// the viewport (a WebGL2 context each, and browsers cap those), and the tick
// subscription is dropped again the moment it leaves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FastFinancialChart } from '@pairlens/fast-financial-charts/react'
import {
  buildIndicators,
  decimalsFor,
  formatPrice,
  skinToTheme,
} from './chart-kit'
import type { CSSProperties } from 'react'
import type {
  ChartBar,
  ChartHudPayload,
  FastFinancialChartRef,
  Timeframe,
} from '@pairlens/fast-financial-charts/types'
import type { ChartConfig, ChartSkin, LiveTick, TickStream } from './chart-kit'

type LiveChartProps = {
  seriesId: string
  bars: Array<ChartBar>
  timeframe: Timeframe
  base: number
  cfg: ChartConfig
  skin: ChartSkin
  /** Off hides the gridlines. Driven by the page's skin bar. */
  showGrid?: boolean
  /** Axis type face, also from the skin bar. */
  fontFamily?: string
  stream: TickStream
  /** Box the engine fills. Cards that share a row pass `fill` instead. */
  height?: number
  fill?: boolean
  minHeight?: number
  priceAxisWidth?: number
  maxFps?: number
  /** Off for the small cards: ten indicator workers on one page is absurd. */
  worker?: boolean
  pannable?: boolean
  hud?: boolean
  /** How early the engine is built and the feed attached. Charts that must
   *  stay bar-for-bar identical widen this so they all wake together. */
  rootMargin?: string
  onTick?: (tick: LiveTick) => void
}

export function LiveChart({
  seriesId,
  bars,
  timeframe,
  base,
  cfg,
  skin,
  showGrid = true,
  fontFamily,
  stream,
  height,
  fill = false,
  minHeight,
  priceAxisWidth = 62,
  maxFps = 30,
  worker = false,
  pannable = false,
  hud = false,
  rootMargin = '280px 0px',
  onTick,
}: LiveChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<FastFinancialChartRef>(null)
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  const [mounted, setMounted] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[entries.length - 1]?.isIntersecting ?? false
        setLive(visible)
        if (visible) setMounted(true)
      },
      { rootMargin },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [rootMargin])

  // Seed the card's own readouts before the first tick lands.
  useEffect(() => {
    onTickRef.current?.(stream.last)
  }, [stream])

  useEffect(() => {
    if (!mounted || !live) return
    return stream.subscribe((tick) => {
      chartRef.current?.applyTick({
        seriesId,
        ts: tick.ts,
        price: tick.price,
        volume: tick.volume,
      })
      onTickRef.current?.(tick)
    })
  }, [mounted, live, stream, seriesId])

  // Stable identities: the engine diffs props by reference, and a new `series`
  // array would replace the store's bars — discarding every tick applied so far.
  // That includes a re-skin, so the prop keeps the colour it mounted with…
  const colorRef = useRef(skin.up)
  const series = useMemo(
    () => [
      {
        id: seriesId,
        label: seriesId,
        bars,
        color: colorRef.current,
        pricePrecision: decimalsFor(base),
      },
    ],
    [seriesId, bars, base],
  )

  // …and a palette change is pushed through the ref instead, handing the
  // engine its own live bars back so the tape carries on where it was. Only
  // line and area charts read the series colour; candles take the theme.
  useEffect(() => {
    if (!mounted || skin.up === colorRef.current) return
    colorRef.current = skin.up
    const chart = chartRef.current
    if (!chart) return
    const liveBars = chart.data(seriesId)
    if (liveBars.length === 0) return
    chart.setSeries({
      series: [
        {
          id: seriesId,
          label: seriesId,
          bars: liveBars,
          color: skin.up,
          pricePrecision: decimalsFor(base),
        },
      ],
    })
  }, [mounted, skin.up, seriesId, base])

  const theme = useMemo(
    () => skinToTheme(skin, priceAxisWidth, { showGrid, fontFamily }),
    [skin, priceAxisWidth, showGrid, fontFamily],
  )

  const indicators = useMemo(
    () => buildIndicators(seriesId, cfg, skin),
    [seriesId, cfg, skin],
  )

  const perf = useMemo(
    () => ({ indicatorWorker: worker, maxFps }),
    [worker, maxFps],
  )

  const interaction = useMemo(
    // Wheel zoom would swallow page scroll over a full-width chart, and the
    // engine leaves the event alone when it is off.
    () => ({ wheelZoom: false, dragPan: pannable, keyboardShortcuts: false }),
    [pannable],
  )

  const viewport = useMemo(
    () => ({ type: 'last-bars' as const, bars: bars.length }),
    [bars.length],
  )

  const renderHud = useCallback(
    (payload: ChartHudPayload) => {
      const bar = payload.hoveredBar
      if (!bar) return null
      return (
        <span
          className="rounded-[6px] border px-2 py-1 font-mono text-[10px] whitespace-nowrap"
          style={{
            background: `${skin.bg}f2`,
            borderColor: skin.grid,
            color: skin.fg,
          }}
        >
          {`O ${formatPrice(bar.open, base)}  H ${formatPrice(bar.high, base)}  L ${formatPrice(bar.low, base)}  C ${formatPrice(bar.close, base)}`}
        </span>
      )
    },
    [base, skin.bg, skin.fg, skin.grid],
  )

  const hostStyle: CSSProperties = {
    position: 'relative',
    ...(fill ? { flex: 1 } : null),
    ...(height === undefined ? null : { height }),
    ...(minHeight === undefined ? null : { minHeight }),
  }

  return (
    <div ref={hostRef} style={hostStyle}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {mounted ? (
          <FastFinancialChart
            ref={chartRef}
            style={{ height: '100%' }}
            series={series}
            timeframe={timeframe}
            chartType={cfg.type}
            indicators={indicators}
            controlled={{ indicators: true }}
            theme={theme}
            performance={perf}
            interaction={interaction}
            timeScale={{ rightOffset: 2 }}
            defaultViewport={viewport}
            renderHud={hud ? renderHud : undefined}
          />
        ) : null}
      </div>
    </div>
  )
}
