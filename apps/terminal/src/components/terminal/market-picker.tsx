// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { isVenueBoundClass } from '@pairlens/shared/market-ref'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { AssetClass } from '@pairlens/market-engine'
import type { MarketOption } from '@/hooks/use-available-markets'
import { DesktopOnlyBadge } from '@/components/venues/desktop-only-badge'
import {
  HEADER_CHIP,
  HEADER_CHIP_MUTED,
} from '@/components/chrome/header-chrome'
import { venuesForClass } from '@/lib/market-ref/resolve'

// ---------------------------------------------------------------------------
// Venue picker — the one place venues are chosen, so every surface gets the
// same venue marks, search box and asset-class grouping (terminal top bar,
// indicator workbench preview target, ...).
//
// Callers that are already charting something pass `assetClass`, and that
// turns the list into the venues which can actually serve it. Without it the
// picker offered all twenty-two: choosing Polymarket while charting BTC-USDT,
// or Bitget while charting an event contract, navigated to an address no
// connector could answer and the whole terminal went dark. A venue that
// cannot serve the instrument is not a choice, so it is not offered.
// ---------------------------------------------------------------------------

const ASSET_CLASS_ORDER: Array<AssetClass> = [
  'crypto-spot',
  'crypto-perp',
  'dex',
  'stocks',
  'prediction',
  'nft',
]

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  'crypto-spot': 'CEX (Spot)',
  'crypto-perp': 'CEX (Perpetuals)',
  dex: 'DEX',
  stocks: 'Stocks',
  prediction: 'Predictions',
  nft: 'NFTs',
}

/** Venue mark, falling back to nothing when the connector ships no icon. */
function MarketIcon({
  option,
  className,
}: {
  option: Pick<MarketOption, 'iconUrl'>
  className?: string
}) {
  if (!option.iconUrl) return null
  return (
    <img
      src={option.iconUrl}
      alt=""
      className={cn('size-4 rounded-full', className)}
    />
  )
}

type MarketPickerProps = {
  market: string
  marketOptions: Array<MarketOption>
  onMarketChange: (market: string) => void
  /**
   * The class being charted. Present, the list is narrowed to the venues that
   * serve it; absent (the workbench, the bot dialog, the alert editors) the
   * venue is picked BEFORE an instrument exists, so every venue is offered.
   */
  assetClass?: InstrumentClass
  /** Speculative pre-connect when a venue in the dropdown is hovered/focused. */
  onMarketHover?: (market: string) => void
  /** Extra classes for the trigger button (sizing lives with the caller). */
  className?: string
  'aria-label'?: string
}

export function MarketPicker({
  market,
  marketOptions,
  onMarketChange,
  assetClass,
  onMarketHover,
  className,
  'aria-label': ariaLabel,
}: MarketPickerProps) {
  const { t } = useTranslation()
  const activeMarket = marketOptions.find((o) => o.value === market) ??
    marketOptions[0] ?? { value: market, label: market.toUpperCase() }

  const compatible = useMemo(
    () =>
      assetClass
        ? venuesForClass(assetClass, market, marketOptions)
        : marketOptions,
    [marketOptions, assetClass, market],
  )

  // Tokens and event contracts carry their venue as part of their identity: a
  // Polymarket outcome id means nothing to Kalshi, and the same address on
  // another chain is another asset. There is no venue to switch to, so the
  // chip says which one this is and stops there.
  if (assetClass && isVenueBoundClass(assetClass)) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={ariaLabel}
              className={cn(
                HEADER_CHIP_MUTED,
                'cursor-default select-none',
                className,
              )}
            />
          }
        >
          <MarketIcon option={activeMarket} />
          {activeMarket.label}
        </TooltipTrigger>
        <TooltipContent>
          {t('terminal.venueBound', { venue: activeMarket.label })}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(HEADER_CHIP, className)}
                  aria-label={ariaLabel}
                />
              }
            />
          }
        >
          <MarketIcon option={activeMarket} />
          {activeMarket.label}
          <ChevronDown className="size-3 text-muted-foreground/55" />
        </TooltipTrigger>
        <TooltipContent>{activeMarket.label}</TooltipContent>
      </Tooltip>
      <MarketDropdownContent
        market={market}
        marketOptions={compatible}
        grouped={!assetClass}
        onMarketChange={onMarketChange}
        onMarketHover={onMarketHover}
      />
    </DropdownMenu>
  )
}

function MarketDropdownContent({
  market,
  marketOptions,
  grouped,
  onMarketChange,
  onMarketHover,
}: {
  market: string
  marketOptions: Array<MarketOption>
  /** Headers earn their room only when more than one class is on offer. */
  grouped: boolean
  onMarketChange: (market: string) => void
  onMarketHover?: (market: string) => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')

  // Filter markets (case-insensitive)
  const filtered = useMemo(() => {
    if (!filter) return marketOptions
    const q = filter.toLowerCase()
    return marketOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    )
  }, [marketOptions, filter])

  // Group by primary asset class
  const groups = useMemo(() => {
    const map = new Map<AssetClass, Array<MarketOption>>()
    for (const opt of filtered) {
      const primaryClass = opt.assetClasses[0] ?? 'crypto-spot'
      const arr = map.get(primaryClass) ?? []
      arr.push(opt)
      map.set(primaryClass, arr)
    }
    return map
  }, [filtered])

  return (
    <DropdownMenuContent
      align="start"
      className="w-auto min-w-56 max-h-80 overflow-y-auto"
    >
      {/* Filter input */}
      <div className="flex items-center gap-2 border-b border-border px-2 pb-1.5 pt-1">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            // Let navigation keys propagate to the dropdown (arrow keys,
            // Enter, Escape, Tab) but block printable characters so the
            // dropdown's typeahead doesn't hijack them.
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
              e.stopPropagation()
            }
          }}
          placeholder={t('terminal.market')}
          className="h-7 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          autoFocus
        />
      </div>

      <DropdownMenuRadioGroup value={market} onValueChange={onMarketChange}>
        {grouped ? (
          ASSET_CLASS_ORDER.map((ac) => {
            const items = groups.get(ac)
            if (!items?.length) return null

            return (
              <DropdownMenuGroup key={ac}>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {ASSET_CLASS_LABELS[ac]}
                </DropdownMenuLabel>
                {items.map((option) => (
                  <MarketRadioItem
                    key={option.value}
                    option={option}
                    onMarketHover={onMarketHover}
                  />
                ))}
                <DropdownMenuSeparator />
              </DropdownMenuGroup>
            )
          })
        ) : (
          <DropdownMenuGroup>
            {filtered.map((option) => (
              <MarketRadioItem
                key={option.value}
                option={option}
                onMarketHover={onMarketHover}
              />
            ))}
          </DropdownMenuGroup>
        )}

        {filtered.length === 0 && (
          <DropdownMenuItem disabled>
            <span className="text-xs text-muted-foreground">
              {t('terminal.noMarketsFound')}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  )
}

function MarketRadioItem({
  option,
  onMarketHover,
}: {
  option: MarketOption
  onMarketHover?: (market: string) => void
}) {
  return (
    <DropdownMenuRadioItem
      value={option.value}
      className="whitespace-nowrap"
      // Hovering (or keyboard-focusing) a venue pre-connects its
      // market-data streams so the actual switch renders instantly.
      onPointerEnter={() => onMarketHover?.(option.value)}
      onFocus={() => onMarketHover?.(option.value)}
    >
      {/* w-full + ml-auto below parks every mark on the same right
          edge instead of trailing whatever venue name precedes it,
          so the marks read as one column. The item's pr-8 keeps
          them clear of the absolutely-positioned check. */}
      <span className="flex w-full items-center gap-2 font-medium">
        <MarketIcon option={option} />
        {option.label}
        {/* This venue serves no CORS headers and streams no candle
            history, so a browser build cannot read it at all. Say
            so before the click rather than after. Desktop reaches
            every venue, so the mark never appears there. */}
        {option.desktopOnly && <DesktopOnlyBadge className="ml-auto" />}
      </span>
    </DropdownMenuRadioItem>
  )
}
