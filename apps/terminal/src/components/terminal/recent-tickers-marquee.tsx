// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { History, X } from 'lucide-react'

import { cn } from '@pairlens/ui'

import {
  formatInstrumentRef,
  formatMarketRef,
  marketRefToPath,
} from '@pairlens/shared/market-ref'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'

import type { TickDirection } from '@/hooks/use-live-pair-price'
import { PairSymbol } from '@/components/pair-picker/pair-avatar'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { useMarketRefOrNull } from '@/lib/market-ref/use-market-ref'
import { useRecentPairs } from '@/lib/recent-tickers'
import { formatPredictionPrice, formatPrice } from '@/lib/format-price'

// Horizontal scroll speed of the marquee track, px/s.
const SCROLL_SPEED = 30

/**
 * Auto-scrolling strip of recently viewed markets with live prices, rendered
 * above the chart route's top bar. Clicking a chip jumps to that market. When
 * the chips fit the viewport the strip is static; when they overflow, the
 * track is duplicated and scrolled continuously (paused on hover).
 *
 * Every chip resolves its own venue through the shared resolver, and a row
 * that resolves to nothing is not rendered. The strip used to guess a venue
 * per chip and fall back to the preferred one, which is how a crypto pair got
 * priced by a stocks-only venue: Alpaca answered 'BTC-USDT' with its base leg
 * 'BTC', a real NYSE Arca spot-bitcoin ETF near $28, under the crypto pair's
 * own label.
 */
export function RecentTickersMarquee({ current }: { current: MarketRef }) {
  const { t } = useTranslation()
  const [recentPairs, , removeRecent] = useRecentPairs()
  const resolveRef = useMarketRefOrNull()
  const navigate = useNavigate()

  const currentKey = formatMarketRef(current)

  const rows = useMemo(
    () =>
      recentPairs
        .map((inst) => ({ inst, ref: resolveRef(inst) }))
        .filter((row): row is { inst: InstrumentRef; ref: MarketRef } =>
          Boolean(row.ref),
        ),
    [recentPairs, resolveRef],
  )

  const handleSelect = useCallback(
    (ref: MarketRef) => {
      void navigate({ to: marketRefToPath(ref) })
    },
    [navigate],
  )

  // Auto-scroll only when the chips overflow the container.
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    const measure = () => {
      // A 0-width container isn't laid out yet (or is hidden) — never scroll
      // off an unmeasured viewport.
      setOverflows(
        container.clientWidth > 0 &&
          content.scrollWidth > container.clientWidth,
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(content)
    return () => observer.disconnect()
  }, [rows.length])

  // Honour the user's reduced-motion preference: instead of auto-scrolling we
  // fall back to a manually scrollable strip.
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const autoScroll = overflows && !reducedMotion

  // Continuous marquee via scrollLeft — NOT a CSS transform. Animating a
  // transform over the track forces the whole moving layer to re-rasterise
  // every time a live price ticks, which the compositor presents as torn,
  // "overlapping" frames (worse the more tickers there are). The native scroll
  // offset is a compositor property, so a price update only repaints its own
  // chip and the motion stays clean. Paused while hovered.
  const pausedRef = useRef(false)
  useEffect(() => {
    if (!autoScroll) return
    const scroller = containerRef.current
    if (!scroller) return

    let raf = 0
    let last: number | null = null
    let pos = scroller.scrollLeft
    const step = (time: number) => {
      if (last !== null && !pausedRef.current) {
        // Clamp dt so a background tab (throttled rAF) resumes smoothly
        // instead of jumping.
        const dt = Math.min((time - last) / 1000, 0.1)
        // The track holds two identical copies; wrapping at half its width
        // makes the loop seamless.
        const half = scroller.scrollWidth / 2
        if (half > 0) {
          pos = (pos + SCROLL_SPEED * dt) % half
          scroller.scrollLeft = pos
        }
      }
      last = time
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      scroller.scrollLeft = 0
    }
  }, [autoScroll])

  if (rows.length === 0) return null

  const chips = rows.map(({ inst, ref }) => (
    <MarqueeChip
      key={formatInstrumentRef(inst)}
      instrument={inst}
      marketRef={ref}
      isActive={formatMarketRef(ref) === currentKey}
      onSelect={handleSelect}
      onRemove={removeRecent}
    />
  ))

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 bg-background px-3 pb-1">
      {/* Leading indicator — pinned, never scrolls, marks the strip as the
          recently viewed pairs. Held off the tape by its own padding: the
          rule that used to sit here was the last vertical line in the
          chrome. */}
      <div
        // `pl-2` puts this 14px glyph on the same vertical axis as the 16px
        // pair mark in the bar above (the chip insets its mark by 7px, and
        // the two icons differ by 2px of width), so the leftmost thing on
        // each of the two rows lines up.
        className="flex h-full shrink-0 items-center pl-2 pr-2.5 text-muted-foreground"
        title={t('terminal.recentlyViewed')}
        aria-label={t('terminal.recentlyViewed')}
      >
        <History className="size-3.5" />
      </div>
      {/* Scrolling viewport — measured for overflow independently of the
          pinned indicator above. overflow-hidden while auto-scrolling; under
          reduced motion it becomes a manually scrollable strip. */}
      <div
        ref={containerRef}
        onMouseEnter={() => {
          pausedRef.current = true
        }}
        onMouseLeave={() => {
          pausedRef.current = false
        }}
        className={cn(
          'relative flex h-full min-w-0 flex-1 items-center',
          reducedMotion ? 'no-scrollbar overflow-x-auto' : 'overflow-hidden',
        )}
      >
        {/* shrink-0 on the track AND on both copies is load-bearing: the
            viewport is a flex container, so `w-max` only sets the base size —
            flex-shrink would still squeeze the track back down to the
            viewport once the chips overflow. The chips themselves refuse to
            shrink, so a squeezed copy overflows its own box and the next copy
            gets laid out on top of it: the tail chips render overlapping. */}
        <div className="flex w-max shrink-0 items-center">
          <div ref={contentRef} className="flex shrink-0 items-center">
            {chips}
          </div>
          {/* Second copy makes the scroll loop seamless */}
          {autoScroll && (
            <div aria-hidden className="flex shrink-0 items-center">
              {chips}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Memoized: each chip re-renders on its own ticker tick only, so sibling
// updates and marquee-level re-measures don't cascade across the strip.
const MarqueeChip = memo(function MarqueeChip({
  instrument,
  marketRef,
  isActive,
  onSelect,
  onRemove,
}: {
  instrument: InstrumentRef
  marketRef: MarketRef
  isActive: boolean
  onSelect: (ref: MarketRef) => void
  onRemove: (inst: InstrumentRef) => void
}) {
  const symbol = marketRef.id
  const { price, direction, outcomeLabel } = useLivePairPrice(
    symbol,
    marketRef.market,
  )
  // A prediction chip carries two things where every other chip carries one:
  // the question, and which answer the number belongs to. Without the second
  // half a 63¢ under "Will the Fed cut in March?" reads as the price of Yes
  // even when No is the side that is leading.
  const isPrediction = outcomeLabel !== null

  return (
    <div
      className={cn(
        // The open pair is marked by a surface, not by a colour. A tinted
        // chip put the accent on the one thing the trader is already looking
        // at, next to a bar that spends the accent on exactly one control.
        // What actually says "this one" is the symbol at full strength while
        // its neighbours sit muted; the fill only lifts it off the ground.
        'group/chip relative flex h-8 shrink-0 items-center rounded-[10px] text-xs transition-colors hover:bg-card/60',
        isActive && 'bg-card hover:bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(marketRef)}
        className="flex h-full cursor-pointer items-center gap-1.5 py-0 pl-3 pr-1.5"
      >
        {/* Bounded, because one of these can be an event slug. The chips
            refuse to shrink (the track's seamless loop depends on it), so an
            unbounded chip does not compress — it runs past the viewport and
            the second copy of the track lays out on top of it. */}
        <PairSymbol
          symbol={symbol}
          assetClass={instrument.cls}
          market={marketRef.market}
          className={cn(
            'min-w-0 max-w-56 font-medium',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        />
        {isPrediction && (
          <span className="max-w-24 shrink-0 truncate text-[11px] text-muted-foreground">
            {outcomeLabel}
          </span>
        )}
        <span
          className={cn(
            'font-mono tabular-nums transition-colors',
            directionClass(direction),
          )}
        >
          {price == null
            ? '—'
            : isPrediction
              ? formatPredictionPrice(price)
              : formatPrice(price)}
        </span>
      </button>
      {/* Close affordance — like closing a browser tab. Hidden until the chip
          is hovered (or it's the active pair) to keep the strip uncluttered. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(instrument)
        }}
        aria-label={`Remove ${symbol} from recent`}
        title={`Remove ${symbol}`}
        className={cn(
          'mr-1.5 flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/chip:opacity-100',
          isActive && 'opacity-60',
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
})

function directionClass(direction: TickDirection): string {
  if (direction === 'up') return 'text-up'
  if (direction === 'down') return 'text-down'
  return 'text-foreground/80'
}
