// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The Trade ticket's first element: a one-line read of the book, and the door
 * to the full one.
 *
 * It is a per-tick subscriber — one of the four the mobile budget allows — and
 * it is a LEAF for that reason. It renders its own row and nothing composed;
 * the ticket above it never re-renders because the spread moved.
 *
 * It also stays SHARP in the not-connected state (design screen 9). Nothing
 * about the market is hidden when the user has no key; only the part that
 * needs one is.
 *
 * DEPTH-INTENSITY DECISION: the full book grades every level by size
 * (`magnitude-intensity.ts`); this strip deliberately does not. It renders no
 * levels — one best bid, one best ask, one spread and one pressure bar — and
 * an intensity ramp needs a column of neighbours to mean anything. The split
 * bar below already encodes which side is heavier, so tinting it by size would
 * paint the same variable twice and make a wide spread look like a deep book.
 * The strip's job is to say "the book is there, tap it"; the grading lives one
 * tap away where there is something to compare against.
 */
import { memo } from 'react'
import { ChevronRight, Rows3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMobileOrderbook } from '../lib/use-mobile-orderbook'
import { PRESS } from '../primitives/press'
import { formatBookPrice } from '@/lib/format-price'

/** Deep enough for an honest pressure split, cheap enough to group per tick. */
const PRESSURE_ROWS = 20

/**
 * Prices at the precision this one row can afford.
 *
 * The design's strip reads `64,317.8 / 64,318.6` — one decimal on a
 * five-figure price — and that is not a rounding of convenience: four numbers,
 * a label and a chevron have to share 402px, and `formatBookPrice`'s two (or
 * four) decimals push the spread into an ellipsis. The full book, which has a
 * column each, keeps every digit.
 */
function formatStripPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }
  return trimZeros(formatBookPrice(value))
}

function formatSpread(value: number): string {
  return value >= 1 ? value.toFixed(2) : trimZeros(formatBookPrice(value))
}

/**
 * `formatBookPrice` pads to a fixed width so a column of prices lines up. In a
 * single row there is no column to line up with, and "spread 0.400000" spends
 * six characters saying nothing.
 */
function trimZeros(formatted: string): string {
  const n = Number(formatted)
  return Number.isFinite(n) ? String(n) : formatted
}

export const TradeOrderbookStrip = memo(function TradeOrderbookStrip({
  onOpen,
}: {
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { bestBid, bestAsk, spread, buyPct, sellPct, ready } =
    useMobileOrderbook(PRESSURE_ROWS)

  return (
    <button
      aria-label={t('mobile.trade.openBook')}
      className="pl-press-row flex w-full flex-col gap-2 rounded-xl bg-[color:var(--pl-wash)] px-3 pb-2.5 pt-[9px] text-left shadow-[inset_0_0_0_1px_var(--pl-edge)]"
      onClick={onOpen}
      type="button"
      // Stateless DOM writes, so this stays off the render path — the strip is
      // on the per-tick allowlist and re-renders on every book update.
      {...PRESS}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Rows3
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="shrink-0 text-[13px] font-semibold text-foreground">
          {t('mobile.shell.overlays.orderbook')}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
          {spread
            ? t('mobile.trade.spread', { value: formatSpread(spread.value) })
            : null}
        </span>
        <span className="shrink-0 font-mono text-[12px] font-medium tabular-nums">
          <span className="text-up">
            {bestBid == null ? '—' : formatStripPrice(bestBid)}
          </span>
          <span className="px-1 text-muted-foreground">/</span>
          <span className="text-down">
            {bestAsk == null ? '—' : formatStripPrice(bestAsk)}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </span>

      {/* Depth split: the same construction as the full book's footer bar, so
          the two never disagree about which side is heavier. */}
      <span aria-hidden className="flex h-1 gap-[3px]">
        <span
          className="rounded-full bg-up transition-[flex-basis] duration-300"
          style={{ flex: `0 0 ${ready ? buyPct : 50}%` }}
        />
        <span
          className="flex-1 rounded-full bg-down transition-opacity duration-300"
          style={{ opacity: ready || sellPct > 0 ? 1 : 0.6 }}
        />
      </span>
    </button>
  )
})
