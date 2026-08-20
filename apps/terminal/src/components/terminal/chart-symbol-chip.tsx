// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The symbol this chart is of, and the way to change it — for THIS chart.
 *
 * The top bar's pair switcher moves the whole board: chart, book, ticket and
 * every other pane reading the page's pair. That is right for a one-chart desk
 * and useless on a Dual/Triple/Quad board, where the second and third charts
 * exist precisely to hold something else. Before this chip they could not: a
 * pane's pair override had no way in, so every chart on a multi-chart board
 * drew the same tape.
 *
 * The rule is the plain one, and the chip states it: the bar changes the
 * board, this changes this chart. Picking a pair here writes the pane's own
 * override (or the workspace variable the pane is bound to, which is the same
 * promise one level up), the pane header badges the pinned symbol, and "Follow
 * the board" hands the pane back.
 */
import { useCallback, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Link2, Search } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'
import { PairSearchResults } from '@/components/pair-picker/pair-search-results'
import { entryToMarketRef } from '@/lib/market-ref/entry'
import { PaneContext } from '@/lib/layout/pane-context'
import { track } from '@/lib/analytics-events'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import {
  lookupPredictionEvent,
  lookupPredictionOutcome,
} from '@/stores/prediction-directory-store'

/** Prediction keys carry no base or quote, and the directory is what knows. */
function chipAssetClass(pairKey: string): string | undefined {
  return lookupPredictionEvent(pairKey) || lookupPredictionOutcome(pairKey)
    ? 'prediction'
    : undefined
}

/**
 * Rendered by the chart toolbar. Returns null outside a pane — the phone
 * mounts the chart without one, and there is nothing to pin there.
 */
export function ChartSymbolChip() {
  const { t } = useTranslation()
  const pane = useContext(PaneContext)
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const watchedSymbols = useWatchlistsStore((s) => s.allSymbolsSet)
  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  const { markets, defaultMarket } = useAvailableMarkets()

  const resolved = pane?.resolvedPair ?? null
  const source = pane?.pairSource ?? null
  const pinned = source === 'override' || source === 'variable'

  const [selectedMarket, setSelectedMarket] = useState(
    resolved?.market ?? defaultMarket,
  )

  const handleSelect = useCallback(
    (entry: PairEntry) => {
      if (!pane) return
      // A row's own venue wins where it has one: a token IS its chain and an
      // outcome IS the venue that lists it. Everything else takes the venue
      // picked above the list.
      const ref = entryToMarketRef(entry, selectedMarket)
      if (entry.assetClass) {
        const cls = entry.assetClass
        setAssetClassMap((prev) => ({ ...prev, [entry.symbol]: cls }))
      }
      const value = { pairKey: ref.id, market: ref.market }
      if (pane.boundVariableName) pane.setVariableValue(value)
      else pane.setPaneOverride('active-pair', value)
      track('chart_pane_pair_pinned', {
        scope: pane.boundVariableName ? 'variable' : 'pane',
      })
      setOpen(false)
      setSearchValue('')
    },
    [pane, selectedMarket, setAssetClassMap],
  )

  const handleFollowBoard = useCallback(() => {
    pane?.clearPaneOverride('active-pair')
    setOpen(false)
    setSearchValue('')
  }, [pane])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) {
        setSearchValue('')
        setSelectedMarket(resolved?.market ?? defaultMarket)
      }
    },
    [resolved?.market, defaultMarket],
  )

  if (!pane || !resolved) return null

  const [base = '', quote = ''] = resolved.pairKey.split('-')
  const assetClass = chipAssetClass(resolved.pairKey)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  // `shrink-0`: on a four-chart board the toolbar runs out
                  // of room, and what a chart is OF is the last thing that
                  // may be given up — squeezed with the rest it collapsed
                  // to a bare chevron.
                  className="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium outline-hidden select-none hover:bg-muted aria-expanded:bg-muted"
                  aria-label={t('chart.symbolChip.aria')}
                />
              }
            />
          }
        >
          <PairLogo
            base={base}
            quote={quote}
            assetClass={assetClass}
            market={resolved.market}
            size="xs"
          />
          <PairSymbol
            symbol={resolved.pairKey}
            assetClass={assetClass}
            className="min-w-0 max-w-28 text-xs font-semibold tracking-[-0.01em]"
          />
          {pinned && (
            // The one thing a glance has to answer on a four-chart board:
            // which of these still follows the bar above them.
            <span className="rounded-[3px] bg-muted px-1 text-[9.5px] leading-[14px] text-muted-foreground">
              {t('chart.symbolChip.pinnedBadge')}
            </span>
          )}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/55" />
        </TooltipTrigger>
        <TooltipContent>{t('chart.symbolChip.tooltip')}</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <div className="border-b px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('layout.searchPairs')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
          {markets.length > 1 && (
            <div className="mt-2 flex items-start gap-1.5">
              <span className="py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                {t('layout.panePicker.market')}
              </span>
              <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto">
                {markets.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors',
                      selectedMarket === m.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                    )}
                    onClick={() => setSelectedMarket(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          <PairSearchResults
            searchValue={searchValue}
            watchedSymbols={watchedSymbols}
            onSelect={handleSelect}
            maxResults={16}
          />
        </div>

        <div className="border-t px-3 py-2">
          {source === 'variable' ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Link2 className="size-3" />
              {t('chart.symbolChip.boundTo', {
                variable: pane.boundVariableLabel ?? pane.boundVariableName,
              })}
            </p>
          ) : pinned ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleFollowBoard}
            >
              <Link2 className="size-3" />
              {t('chart.symbolChip.followBoard')}
            </button>
          ) : (
            <p className="text-[11px] leading-tight text-muted-foreground/60">
              {t('chart.symbolChip.followingBoard')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
