// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { History, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { Instrument } from '@pairlens/shared/instrument-types'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { TickDirection } from '@/hooks/use-live-pair-price'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useInstrumentsBySymbols } from '@/hooks/use-market-instruments'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useRecentPairs } from '@/lib/recent-tickers'
import { formatPrice } from '@/lib/format-price'
import { useMarketData } from '@/lib/market-data-provider'
import { resolveMarketForAssetClass } from '@/lib/market-asset-classes'

/**
 * Workspace pane listing recently viewed pairs with live prices —
 * a vertical counterpart to the pair page marquee for quick pair switching.
 */
export function RecentTickersPane() {
  const { t } = useTranslation()
  const [recentPairs, , removeRecent] = useRecentPairs()
  const { items } = useInstrumentsBySymbols(recentPairs)
  const { markets, defaultMarket } = useAvailableMarkets()
  const [preferredMarket] = usePersistedState('terminal.market', defaultMarket)
  // The adapters' declared asset classes — without them every venue looks
  // compatible and a stocks row never leaves the sticky crypto venue.
  const { availableMarkets: adapterInfos } = useMarketData()
  const navigate = useNavigate()

  const instrumentsBySymbol = useMemo(
    () => new Map(items.map((i) => [i.symbol, i])),
    [items],
  )
  const availableMarketValues = useMemo(
    () => markets.map((m: MarketOption) => m.value),
    [markets],
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

  if (recentPairs.length === 0) {
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
      {recentPairs.map((symbol) => {
        const inst = instrumentsBySymbol.get(symbol)
        return (
          <RecentTickerRow
            key={symbol}
            symbol={symbol}
            inst={inst ?? null}
            market={resolveMarketForAssetClass(
              preferredMarket,
              availableMarketValues,
              inst?.assetClass,
              adapterInfos,
            )}
            onSelect={handleSelect}
            onRemove={handleRemove}
          />
        )
      })}
    </div>
  )
}

// Memoized: rows receive stable props, so list-level re-renders (sibling
// ticker updates) skip rows whose data didn't change. Each row still
// re-renders on its own ticker tick.
const RecentTickerRow = memo(function RecentTickerRow({
  symbol,
  inst,
  market,
  onSelect,
  onRemove,
}: {
  symbol: string
  inst: Instrument | null
  market: string
  onSelect: (symbol: string) => void
  onRemove: (symbol: string) => void
}) {
  const { t } = useTranslation()
  const { price, direction } = useLivePairPrice(symbol, market)
  const removeLabel = t('recentTickers.remove', { symbol })

  return (
    <div
      className="group flex cursor-pointer items-center gap-2 border-b px-2 py-2 transition-colors hover:bg-accent/40"
      onClick={() => onSelect(symbol)}
    >
      {inst && (
        <PairLogo
          base={inst.base}
          quote={inst.quote}
          assetClass={inst.assetClass}
          size="sm"
        />
      )}
      <div className="min-w-0 flex-1">
        <PairSymbol symbol={symbol} className="text-sm" />
        {inst && (
          <p className="truncate text-xs text-muted-foreground">{inst.name}</p>
        )}
      </div>
      <MiniPriceChart
        market={market}
        pair={symbol}
        className="hidden h-5 w-12 @2xs/pane:block @sm/pane:w-16"
      />
      <span
        className={cn(
          'font-mono text-sm tabular-nums transition-colors',
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
          onRemove(symbol)
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
