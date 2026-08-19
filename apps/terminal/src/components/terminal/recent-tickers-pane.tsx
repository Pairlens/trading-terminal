// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { History, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import {
  formatInstrumentRef,
  marketRefToPath,
} from '@pairlens/shared/market-ref'
import type { InstrumentRef, MarketRef } from '@pairlens/shared/market-ref'
import type { Instrument } from '@pairlens/shared/instrument-types'
import type { TickDirection } from '@/hooks/use-live-pair-price'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { useMarketRefOrNull } from '@/lib/market-ref/use-market-ref'
import { useRecentPairs } from '@/lib/recent-tickers'
import { formatPrice } from '@/lib/format-price'

/**
 * Workspace pane listing recently viewed markets with live prices — a vertical
 * counterpart to the chart route's marquee for quick switching. Venue
 * resolution is the shared resolver's, so a row that no connected venue can
 * serve is left out rather than priced by one that cannot.
 */
export function RecentTickersPane() {
  const { t } = useTranslation()
  const [recentPairs, , removeRecent] = useRecentPairs()
  const resolveRef = useMarketRefOrNull()
  const navigate = useNavigate()

  const rows = useMemo(
    () =>
      recentPairs
        .map((inst) => ({ inst, ref: resolveRef(inst) }))
        .filter((row): row is { inst: InstrumentRef; ref: MarketRef } =>
          Boolean(row.ref),
        ),
    [recentPairs, resolveRef],
  )

  // Row metadata (name, logo) is presentation only — identity comes from the
  // ref, never from a symbol match against this list.
  const { items } = useInstrumentsBySymbols(
    useMemo(() => rows.map((r) => r.ref.id), [rows]),
  )
  const instrumentsBySymbol = useMemo(
    () => new Map(items.map((i) => [i.symbol, i])),
    [items],
  )

  const handleSelect = useCallback(
    (ref: MarketRef) => {
      void navigate({ to: marketRefToPath(ref) })
    },
    [navigate],
  )

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
        <History className="size-8 opacity-40" />
        <p className="text-sm font-medium">{t('recentTickers.empty')}</p>
        <p className="max-w-52 text-center text-xs opacity-70">
          {t('recentTickers.hint')}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {rows.map(({ inst, ref }) => (
        <RecentTickerRow
          key={formatInstrumentRef(inst)}
          instrument={inst}
          marketRef={ref}
          inst={instrumentsBySymbol.get(ref.id) ?? null}
          onSelect={handleSelect}
          onRemove={removeRecent}
        />
      ))}
    </div>
  )
}

// Memoized: rows receive stable props, so list-level re-renders (sibling
// ticker updates) skip rows whose data didn't change. Each row still
// re-renders on its own ticker tick.
const RecentTickerRow = memo(function RecentTickerRow({
  instrument,
  marketRef,
  inst,
  onSelect,
  onRemove,
}: {
  instrument: InstrumentRef
  marketRef: MarketRef
  inst: Instrument | null
  onSelect: (ref: MarketRef) => void
  onRemove: (inst: InstrumentRef) => void
}) {
  const { t } = useTranslation()
  const symbol = marketRef.id
  const market = marketRef.market
  const { price, direction } = useLivePairPrice(symbol, market)
  const removeLabel = t('recentTickers.remove', { symbol })

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 border-b px-2 py-2 transition-colors hover:bg-accent/40"
      onClick={() => onSelect(marketRef)}
    >
      {inst && (
        <PairLogo
          base={inst.base}
          quote={inst.quote}
          assetClass={inst.assetClass}
          market={market}
          size="sm"
        />
      )}
      <div className="min-w-0 flex-1">
        <PairSymbol
          symbol={symbol}
          assetClass={inst?.assetClass}
          market={market}
          className="text-sm"
        />
        {inst && (
          <p className="truncate text-xs text-muted-foreground">{inst.name}</p>
        )}
      </div>
      <MiniPriceChart
        market={market}
        pair={symbol}
        className="hidden h-5 w-12 @2xs/pane:block @sm/pane:w-16"
      />
      {/* Reserved width for the same reason as the watchlist: a price column
          that shrink-wraps its digits leaves the chart beside it ragged. */}
      <span
        className={cn(
          'min-w-24 text-right font-mono text-sm tabular-nums transition-colors',
          rowDirectionClass(direction),
        )}
      >
        {price != null ? formatPrice(price) : '—'}
      </span>
      {/* Close affordance — like closing a browser tab. Hidden until the row
          is hovered. Removal isn't permanent: viewing the pair re-adds it. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(instrument)
        }}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
})

function rowDirectionClass(direction: TickDirection): string {
  if (direction === 'up') return 'text-green-400'
  if (direction === 'down') return 'text-red-400'
  return 'text-foreground'
}
