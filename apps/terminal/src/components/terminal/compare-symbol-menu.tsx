// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { GitCompareArrows, Loader2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarTrigger,
} from '@pairlens/ui/components/ui/menubar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type { CompareMode } from '@pairlens/fast-financial-charts/types'
import type { Instrument } from '@pairlens/shared/instrument-types'
import { compareSeriesId } from '@/hooks/use-chart-terminal-state'
import { useMarketData } from '@/lib/market-data-provider'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { resolveMarketForAssetClass } from '@/lib/market-asset-classes'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'

const SCALE_MODE_OPTIONS: Array<{ value: CompareMode; labelKey: string }> = [
  { value: 'indexed', labelKey: 'chart.compare.scaleIndexed' },
  { value: 'price', labelKey: 'chart.compare.scalePrice' },
  { value: 'dual-axis', labelKey: 'chart.compare.scaleDualAxis' },
]

/**
 * TradingView-style "Compare" — overlays additional symbols on the chart.
 * Rendered inside the chart toolbar's Menubar.
 */
export function CompareMenu() {
  const { t } = useTranslation()
  const { compareSymbols, compareScaleMode } = useChartConfig()
  const { removeCompareSymbol, setCompareScaleMode } = useChartActions()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <MenubarMenu>
        <Tooltip>
          <TooltipTrigger render={<MenubarTrigger className="gap-1 text-xs" />}>
            <GitCompareArrows className="size-3.5" />
            {compareSymbols.length > 0 ? compareSymbols.length : null}
          </TooltipTrigger>
          <TooltipContent>{t('chart.compare.tooltip')}</TooltipContent>
        </Tooltip>
        <MenubarContent className="w-60">
          <MenubarGroup>
            <MenubarLabel>{t('chart.compare.title')}</MenubarLabel>
          </MenubarGroup>
          <MenubarSeparator />
          <MenubarItem onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            {t('chart.compare.addSymbol')}
          </MenubarItem>
          {compareSymbols.length > 0 && (
            <>
              <MenubarSeparator />
              {compareSymbols.map((entry) => (
                <MenubarItem
                  key={compareSeriesId(entry)}
                  onClick={() => removeCompareSymbol(compareSeriesId(entry))}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="flex-1 font-mono text-xs">
                    {entry.pairKey}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {entry.market}
                  </span>
                  <X className="size-3.5 text-muted-foreground" />
                </MenubarItem>
              ))}
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarLabel>{t('chart.compare.scaleMode')}</MenubarLabel>
              </MenubarGroup>
              <MenubarRadioGroup
                value={compareScaleMode}
                onValueChange={(v) => setCompareScaleMode(v as CompareMode)}
              >
                {SCALE_MODE_OPTIONS.map((option) => (
                  <MenubarRadioItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <CompareSymbolDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}

function CompareSymbolDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const { items, isLoading } = useMarketInstruments({
    q: query.trim() || undefined,
  })
  const { availableMarkets } = useMarketData()
  const { market, compareSymbols, chartSeries } = useChartConfig()
  const { addCompareSymbol } = useChartActions()

  const mainPairKey = chartSeries[0]?.id

  const handleSelect = (inst: Instrument) => {
    // Route the instrument to a venue serving its asset class (stocks pairs
    // can't stream from a crypto exchange and vice versa).
    const target = resolveMarketForAssetClass(
      market,
      availableMarkets.map((m) => m.marketId),
      inst.assetClass,
      availableMarkets,
    )
    addCompareSymbol({ pairKey: inst.symbol, market: target })
    setQuery('')
    onOpenChange(false)
  }

  const activeKeys = new Set(compareSymbols.map((s) => s.pairKey))
  const results = items
    .filter((inst) => inst.symbol !== mainPairKey)
    .slice(0, 30)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="sr-only">
          {t('chart.compare.addSymbol')}
        </DialogTitle>
        <div className="border-b border-border/60 p-3">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('chart.compare.searchPlaceholder')}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && results.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('chart.compare.noResults')}
            </p>
          )}
          {results.map((inst) => {
            const added = activeKeys.has(inst.symbol)
            return (
              <button
                key={inst.symbol}
                type="button"
                disabled={added}
                onClick={() => handleSelect(inst)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-40"
              >
                <span className="w-28 shrink-0 font-mono text-xs font-medium">
                  {inst.symbol}
                </span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {inst.name}
                </span>
                {added && (
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {t('chart.compare.added')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
