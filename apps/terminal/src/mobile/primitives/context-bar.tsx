// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bar that never leaves the screen: what is in focus, and on which venue.
 *
 * Everything it shows it reads itself, and everything it reads changes rarely.
 * It must NOT subscribe to a ticker — the live dot is a connection state, not
 * a price — and it is `memo` so a streaming market leaves it at zero
 * re-renders (see the performance budget in the blueprint).
 */
import { memo } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useOptimisticSession } from '@/lib/session'

export type ContextBarProps = {
  onOpenPairPicker: () => void
  onOpenVenuePicker: () => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}

function initialsFrom(name: string): string {
  const derived = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
  return derived || 'PL'
}

export const ContextBar = memo(function ContextBar({
  onOpenPairPicker,
  onOpenVenuePicker,
  onOpenSearch,
  onOpenSettings,
}: ContextBarProps) {
  const { t } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { markets } = useAvailableMarkets()
  const { status } = useMarketData()
  const permission = useVenueTradePermission(focusedVenue)
  const { session } = useOptimisticSession()
  const [assetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const base = focusedPair.split('-')[0] ?? focusedPair
  const venue = markets.find((m) => m.value === focusedVenue)
  const venueLabel = venue?.label ?? focusedVenue.toUpperCase()
  const live = status === 'connected'
  const userName = session?.user.name ?? session?.user.email ?? ''
  const initials = userName ? initialsFrom(userName) : 'PL'

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-[5px] px-[14px]"
      style={{ paddingTop: 'max(var(--pl-safe-top), 8px)' }}
    >
      {/* Pair chip. The only element on the row allowed to truncate: at 402px
          a 13-character symbol, a venue name, a read-only tag and two 44px
          buttons do not all fit, and of those the symbol is the one the hero
          price and the asset avatar both restate. */}
      <button
        aria-label={t('mobile.shell.changePair')}
        className="pl-glass pointer-events-auto flex h-11 min-w-0 shrink items-center gap-[5px] py-0 pl-[5px] pr-1.5"
        onClick={onOpenPairPicker}
        type="button"
      >
        <PairAvatar
          assetClass={assetClassMap[focusedPair]}
          base={base}
          className="size-[30px] text-[9px]"
          size="sm"
        />
        <span className="min-w-0 truncate font-mono text-[15px] font-semibold text-foreground">
          {focusedPair}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {/* Venue chip. `min-w-fit` is what makes the row degrade correctly:
          it grows into any slack (the design's flex:1) but refuses to shrink
          below its own content, so the deficit lands on the pair chip instead
          of squeezing the venue name to "O…". */}
      <button
        aria-label={t('mobile.shell.changeVenue')}
        className="pl-glass pointer-events-auto flex h-11 min-w-fit flex-1 items-center gap-1.5 py-0 pl-[5px] pr-1.5"
        onClick={onOpenVenuePicker}
        type="button"
      >
        <span className="relative shrink-0">
          <span className="pl-venue-mark text-[10px]">
            {venue?.iconUrl ? (
              <img
                alt=""
                className="size-full object-cover"
                src={venue.iconUrl}
              />
            ) : (
              venueLabel.slice(0, 3).toUpperCase()
            )}
          </span>
          <span
            aria-hidden
            className={cn(
              'absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[rgba(42,39,35,1)]',
              live ? 'pl-live-dot bg-up' : 'bg-muted-foreground',
            )}
          />
        </span>
        <span className="shrink-0 whitespace-nowrap text-left text-[13.5px] font-semibold text-foreground">
          {venueLabel}
        </span>
        {permission === 'read' ? (
          <span className="shrink-0 whitespace-nowrap text-[9.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {t('mobile.shell.readOnly')}
          </span>
        ) : null}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {/* Search */}
      <button
        aria-label={t('mobile.shell.search')}
        className="pl-glass pl-hit-44 pointer-events-auto flex size-10 shrink-0 items-center justify-center"
        onClick={onOpenSearch}
        type="button"
      >
        <Search className="size-[18px] text-foreground" />
      </button>

      {/* Avatar → Settings (Settings is not a tab) */}
      <button
        aria-label={t('mobile.shell.openSettings')}
        className="pl-hit-44 pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold text-foreground"
        onClick={onOpenSettings}
        style={{
          background:
            'linear-gradient(135deg, color-mix(in oklch, var(--primary) 32%, transparent), color-mix(in oklch, var(--primary) 9%, transparent))',
          boxShadow:
            'inset 0 0 0 1px color-mix(in oklch, var(--primary) 24%, transparent)',
        }}
        type="button"
      >
        {initials}
      </button>
    </div>
  )
})
