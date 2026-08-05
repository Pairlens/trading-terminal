// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { History, X } from 'lucide-react'

import { cn } from '@pairlens/ui'

import type { MarketOption } from '@/hooks/use-available-markets'
import type { TickDirection } from '@/hooks/use-live-pair-price'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useRecentPairs } from '@/lib/recent-tickers'
import { formatPrice } from '@/lib/format-price'

// Horizontal scroll speed of the marquee track, px/s.
const SCROLL_SPEED = 30

/** Pick a venue that can actually stream the pair's asset class. */
function resolveVenue(
  preferred: string,
  markets: Array<MarketOption>,
  assetClass: string | undefined,
): string {
  if (!assetClass) return preferred
  const supports = (m: MarketOption) =>
    (m.assetClasses as Array<string>).includes(assetClass)
  const preferredOption = markets.find((m) => m.value === preferred)
  // Unknown markets are assumed compatible (mirrors market-asset-classes).
  if (!preferredOption || supports(preferredOption)) return preferred
  return markets.find(supports)?.value ?? preferred
}

/**
 * Auto-scrolling strip of recently viewed pairs with live prices, rendered
 * above the pair page top bar. Clicking a chip jumps to that pair. When the
 * chips fit the viewport the strip is static; when they overflow, the track
 * is duplicated and scrolled continuously (paused on hover).
 */
export function RecentTickersMarquee({
  currentPairKey,
}: {
  currentPairKey: string
}) {
  const { t } = useTranslation()
  const [recentPairs, , removeRecent] = useRecentPairs()
  const { items } = useInstrumentsBySymbols(recentPairs)
  const { markets, defaultMarket } = useAvailableMarkets()
  const [preferredMarket] = usePersistedState('terminal.market', defaultMarket)
  const navigate = useNavigate()

  const assetClassBySymbol = useMemo(
    () => new Map(items.map((i) => [i.symbol, i.assetClass])),
    [items],
  )

  const handleSelect = useCallback(
    (symbol: string) => {
      void navigate({ to: '/pair/$pair', params: { pair: symbol } })
    },
    [navigate],
  )

  const handleRemove = useCallback(
    (symbol: string) => {
      removeRecent(symbol)
    },
    [removeRecent],
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
  }, [recentPairs.length])

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

  if (recentPairs.length === 0) return null

  const chips = recentPairs.map((symbol) => (
    <MarqueeChip
      key={symbol}
      symbol={symbol}
      market={resolveVenue(
        preferredMarket,
        markets,
        assetClassBySymbol.get(symbol),
      )}
      isActive={symbol === currentPairKey}
      onSelect={handleSelect}
      onRemove={handleRemove}
    />
  ))

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2">
      {/* Leading indicator — pinned, never scrolls, marks the strip as the
          recently viewed pairs. */}
      <div
        className="flex h-full shrink-0 items-center border-r border-border/60 px-2.5 text-muted-foreground"
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
  symbol,
  market,
  isActive,
  onSelect,
  onRemove,
}: {
  symbol: string
  market: string
  isActive: boolean
  onSelect: (symbol: string) => void
  onRemove: (symbol: string) => void
}) {
  const { price, direction } = useLivePairPrice(symbol, market)

  return (
    <div
      className={cn(
        'group/chip relative flex h-8 shrink-0 items-center rounded-lg text-xs transition-colors hover:[background-color:color-mix(in_oklch,var(--primary)_8%,transparent)]',
        isActive &&
          '[background-color:color-mix(in_oklch,var(--primary)_10%,transparent)]',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(symbol)}
        className="flex h-full cursor-pointer items-center gap-1.5 py-0 pl-3 pr-1.5"
      >
        <span
          className={cn(
            'font-medium',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {symbol}
        </span>
        <span
          className={cn(
            'font-mono tabular-nums transition-colors',
            directionClass(direction),
          )}
        >
          {price != null ? formatPrice(price) : '—'}
        </span>
      </button>
      {/* Close affordance — like closing a browser tab. Hidden until the chip
          is hovered (or it's the active pair) to keep the strip uncluttered. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(symbol)
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
