// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The right half of the quick-start card: the chart the snippet on the left
// actually produces. One engine serves all four tabs — the page's tab buttons
// dispatch `pairlens:charts-example` and this reconfigures, which is exactly
// what the snippets are doing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LiveChart } from './LiveChart'
import { TickStream, formatPrice, makeBars } from './chart-kit'
import { usePageSkin } from './use-page-skin'
import type { CSSProperties } from 'react'
import type { ChartConfig, LiveTick } from './chart-kit'

const SERIES_ID = 'BTC-USD'
const BASE = 63_200

export const EXAMPLE_EVENT = 'pairlens:charts-example'

const EXAMPLES: Record<string, { cfg: ChartConfig; caption: string }> = {
  e1: {
    cfg: { type: 'candles', ema: false, bb: false, rsi: false, vol: false },
    caption: 'Series in, chart out. No indicators, no chrome.',
  },
  e2: {
    cfg: { type: 'candles', ema: true, bb: false, rsi: true, vol: false },
    caption: 'Two indicators, one of them in its own pane.',
  },
  e3: {
    cfg: { type: 'area', ema: true, bb: false, rsi: false, vol: true },
    caption: 'O(1) hot path — React never re-renders.',
  },
  e4: {
    cfg: { type: 'candles', ema: false, bb: true, rsi: false, vol: false },
    caption:
      'The AI assistant drives the chart through the same tools you get.',
  },
}

export function QuickStartChart() {
  const skin = usePageSkin()
  const bars = useMemo(() => makeBars(96, 137, BASE, '1m'), [])
  const stream = useMemo(
    () => new TickStream(BASE, '1m', bars[bars.length - 1]),
    [bars],
  )
  const priceRef = useRef<HTMLSpanElement>(null)
  const [active, setActive] = useState('e1')

  useEffect(() => {
    const onExample = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (id && id in EXAMPLES) setActive(id)
    }
    document.addEventListener(EXAMPLE_EVENT, onExample)
    return () => document.removeEventListener(EXAMPLE_EVENT, onExample)
  }, [])

  const onTick = useCallback((tick: LiveTick) => {
    const el = priceRef.current
    if (!el) return
    el.textContent = `$${formatPrice(tick.price, BASE)}`
    el.style.color =
      tick.price >= tick.open ? 'var(--chart-2)' : 'var(--destructive)'
  }, [])

  const example = EXAMPLES[active]

  // No `data-skin-radius` on the root: this pane is half of the code card, not
  // a card of its own, so it takes the skin's colours and type but keeps its
  // square corners.
  return (
    <div
      data-chart-root
      style={skin.vars as CSSProperties}
      className="flex flex-col border-t border-border bg-card min-[721px]:border-t-0 min-[721px]:border-l"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-[14px] font-semibold text-foreground">
            {SERIES_ID}
          </span>
          <span
            ref={priceRef}
            className="font-mono text-[12px]"
            style={{ color: 'var(--chart-2)' }}
          >
            —
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
          <span
            className="size-[5px] rounded-full motion-safe:animate-pulse"
            style={{ background: 'var(--chart-2)' }}
            aria-hidden="true"
          />
          Running
        </span>
      </div>
      <LiveChart
        seriesId={SERIES_ID}
        bars={bars}
        timeframe="1m"
        base={BASE}
        cfg={example.cfg}
        skin={skin.chart}
        showGrid={skin.showGrid}
        fontFamily={skin.fontFamily}
        stream={stream}
        onTick={onTick}
        fill
        minHeight={268}
      />
      <p
        aria-live="polite"
        className="border-t border-border px-4 py-2.5 text-[12px] leading-[1.5] text-muted-foreground/80"
      >
        {example.caption}
      </p>
    </div>
  )
}
