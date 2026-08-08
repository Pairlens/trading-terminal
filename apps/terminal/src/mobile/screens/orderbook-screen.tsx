// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The book at phone density (design screen 8): ten asks, the spread, ten bids,
 * and the pressure footer pinned where a thumb is.
 *
 * The grouping and cumulative maths is the desktop pane's, imported rather than
 * re-derived (`useMobileOrderbook`). Everything here is the presentation the
 * phone needs and the pane cannot give: 24px rows instead of 18, a row count
 * measured from the real container, thousands separators, a tap-sized grouping
 * chip, and a footer that sits at the bottom of the screen rather than after
 * the last bid.
 *
 * It is one of the four components allowed to subscribe to a per-tick stream.
 * Rows are memoized on their own values so a single changing level repaints one
 * row, not twenty.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { MobileScrim } from '../primitives/mobile-scrim'
import { useMobileOrderbook } from '../lib/use-mobile-orderbook'
import type { MobileBookRow } from '../lib/use-mobile-orderbook'
import type { MobileOverlay } from '../mobile-focus-context'
import { useOptionalTickerData } from '@/lib/chart-terminal-context'

/** The phone's row: the pane's 18px is a mouse density. */
const ROW_HEIGHT = 24
/** Column header + spread row + footer. */
const CHROME_HEIGHT = 26 + 44 + 52
const DEFAULT_ROWS_PER_SIDE = 10

type OrderbookScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'orderbook' }>
  onClose: () => void
}

function formatSize(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`
  if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`
  if (size >= 1) return size.toFixed(4)
  return size.toPrecision(4)
}

function formatTick(tick: number): string {
  if (tick >= 1) return tick.toLocaleString()
  return String(parseFloat(tick.toPrecision(2)))
}

export default function OrderbookScreen({ onClose }: OrderbookScreenProps) {
  const { t, i18n } = useTranslation()
  const [rowsPerSide, setRowsPerSide] = useState(DEFAULT_ROWS_PER_SIDE)
  const [groupingOpen, setGroupingOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // The spread row names the LAST TRADE, not the best bid — it is the price
  // the market actually printed. This screen is one of the four components
  // allowed to read a per-tick context directly.
  const ticker = useOptionalTickerData()

  const book = useMobileOrderbook(rowsPerSide)
  const {
    asks,
    bids,
    bestBid,
    maxCumulative,
    spread,
    buyPct,
    sellPct,
    tickOptions,
    tickIndex,
    tickSize,
    isAuto,
    setTickIndex,
    decimals,
    ready,
  } = book

  // Row count comes from the real container, so a small phone shows fewer rows
  // instead of a book that scrolls past the spread.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const available = entry.contentRect.height - CHROME_HEIGHT
      setRowsPerSide(Math.max(4, Math.floor(available / ROW_HEIGHT / 2)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const lastPrice = ticker?.lastTradePrice ?? ticker?.midPrice ?? bestBid

  const formatPrice = useCallback(
    (price: number) =>
      price.toLocaleString(i18n.language, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [i18n.language, decimals],
  )

  // The chip always names the grouping in force, even when Auto chose it —
  // "Auto" alone tells the user how the tick was picked but not what it is,
  // and the tick is the number that explains every price on screen.
  const groupingLabel =
    tickOptions.length > 0
      ? formatTick(tickOptions[tickIndex] ?? tickSize)
      : t('mobile.trade.auto')

  const actions = useMemo(
    () => (
      <>
        <button
          className="flex h-[30px] items-center gap-1 rounded-[9px] bg-white/[0.06] px-2.5 font-mono text-[11.5px] text-muted-foreground"
          onClick={() => setGroupingOpen((open) => !open)}
          type="button"
        >
          {groupingLabel}
          <ChevronDown aria-hidden className="size-3" />
        </button>
        <button
          className={cn(
            'h-[30px] rounded-[9px] px-2.5 text-[11.5px] font-medium',
            isAuto
              ? 'bg-white/[0.12] text-foreground'
              : 'bg-white/[0.06] text-muted-foreground',
          )}
          onClick={() => setTickIndex(null)}
          type="button"
        >
          {t('mobile.trade.auto')}
        </button>
      </>
    ),
    [groupingLabel, isAuto, setTickIndex, t],
  )

  return (
    <FullScreenOverlay
      actions={actions}
      display
      onBack={onClose}
      title={t('mobile.shell.overlays.orderbook')}
    >
      <div className="flex h-full flex-col" ref={bodyRef}>
        {/* Column header */}
        <div className="grid h-[26px] shrink-0 grid-cols-3 items-center border-b border-border px-4 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
          <span>{t('terminal.columns.price')}</span>
          <span className="text-right">{t('terminal.columns.size')}</span>
          <span className="text-right">{t('terminal.columns.total')}</span>
        </div>

        {!ready ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-[12.5px] text-muted-foreground">
            {t('mobile.trade.bookLoading')}
          </div>
        ) : (
          <>
            {/* Asks — worst price at the top, best ask against the spread */}
            <div className="flex flex-1 flex-col justify-end overflow-hidden">
              {asks.map((row) => (
                <BookRow
                  formatPrice={formatPrice}
                  key={row.price}
                  maxCumulative={maxCumulative}
                  row={row}
                  side="ask"
                />
              ))}
            </div>

            {/* Spread */}
            <div className="flex h-11 shrink-0 items-center justify-between border-y border-border bg-white/[0.03] px-4">
              <span className="font-mono text-[19px] font-semibold tracking-[-0.02em] tabular-nums text-up">
                {lastPrice == null ? '—' : formatPrice(lastPrice)}
              </span>
              <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {spread
                  ? t('mobile.trade.spreadDetail', {
                      value: formatPrice(spread.value),
                      pct: spread.pct.toFixed(3),
                    })
                  : '—'}
              </span>
            </div>

            {/* Bids — best bid against the spread */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {bids.map((row) => (
                <BookRow
                  formatPrice={formatPrice}
                  key={row.price}
                  maxCumulative={maxCumulative}
                  row={row}
                  side="bid"
                />
              ))}
            </div>
          </>
        )}

        {/* Pressure footer, pinned in thumb reach */}
        <div className="shrink-0 border-t border-border px-4 pb-3 pt-2">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11.5px] font-medium tabular-nums">
            <span className="text-up">
              {t('mobile.trade.pressureBuy', { pct: buyPct.toFixed(1) })}
            </span>
            <span className="text-down">
              {t('mobile.trade.pressureSell', { pct: sellPct.toFixed(1) })}
            </span>
          </div>
          <div aria-hidden className="flex h-[5px] gap-[3px]">
            <div
              className="rounded-full bg-up transition-[flex-basis] duration-300"
              style={{ flex: `0 0 ${ready ? buyPct : 50}%` }}
            />
            <div className="flex-1 rounded-full bg-down" />
          </div>
        </div>
      </div>

      {groupingOpen ? (
        <>
          <MobileScrim
            className="z-[61]"
            onDismiss={() => setGroupingOpen(false)}
          />
          <div className="pl-popover fixed right-4 top-[calc(var(--pl-chart-top)+48px)] z-[62] max-h-[50svh] w-[132px] overflow-y-auto py-1.5">
            <GroupingOption
              label={t('mobile.trade.auto')}
              onPress={() => {
                setTickIndex(null)
                setGroupingOpen(false)
              }}
              selected={isAuto}
            />
            {tickOptions.map((tick, index) => (
              <GroupingOption
                key={tick}
                label={formatTick(tick)}
                onPress={() => {
                  setTickIndex(index)
                  setGroupingOpen(false)
                }}
                selected={!isAuto && index === tickIndex}
              />
            ))}
          </div>
        </>
      ) : null}
    </FullScreenOverlay>
  )
}

const BookRow = memo(
  function BookRow({
    row,
    maxCumulative,
    side,
    formatPrice,
  }: {
    row: MobileBookRow
    maxCumulative: number
    side: 'bid' | 'ask'
    formatPrice: (price: number) => string
  }) {
    const depthPct =
      maxCumulative > 0 ? (row.cumulative / maxCumulative) * 100 : 0

    return (
      <div className="relative grid h-6 shrink-0 grid-cols-3 items-center px-4 font-mono text-[12px] tabular-nums">
        {/* Depth is anchored right on both sides, as drawn. */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 transition-[width] duration-300"
          style={{
            width: `${depthPct}%`,
            backgroundColor: `color-mix(in oklch, var(${
              side === 'bid' ? '--up' : '--down'
            }) 15%, transparent)`,
          }}
        />
        <span
          className={cn('relative', side === 'bid' ? 'text-up' : 'text-down')}
        >
          {formatPrice(row.price)}
        </span>
        <span className="relative text-right text-foreground">
          {formatSize(row.size)}
        </span>
        <span className="relative text-right text-muted-foreground">
          {formatSize(row.cumulative)}
        </span>
      </div>
    )
  },
  (prev, next) =>
    prev.row.price === next.row.price &&
    prev.row.size === next.row.size &&
    prev.row.cumulative === next.row.cumulative &&
    prev.maxCumulative === next.maxCumulative &&
    prev.side === next.side &&
    prev.formatPrice === next.formatPrice,
)

function GroupingOption({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-11 w-full items-center justify-between px-3 font-mono text-[12.5px]',
        selected ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={onPress}
      type="button"
    >
      {label}
      {selected ? <Check aria-hidden className="size-3.5" /> : null}
    </button>
  )
}
