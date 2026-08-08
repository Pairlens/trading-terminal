// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Venue picker (blueprint §D.20 — the design's one acknowledged gap, built
 * consistently with the pair picker).
 *
 * It wears the pair picker's frame, not a full-screen overlay's. Picking a
 * pair and picking a venue are the same act on this surface — "what am I
 * looking at?" — and shipping one as a sheet that slides over the chart and
 * the other as a screen that replaces it made the second feel like leaving
 * the app. Same full-height `MobileSheet`, same header row with a Cancel
 * beside the title, same `MobileRow` list, same tab-bar clearance at the
 * bottom.
 *
 * Venues this build cannot reach are SHOWN, disabled and explained, rather
 * than filtered out. Hiding four of fifteen connectors makes the product look
 * smaller than it is, and the design already establishes that venue capability
 * is surfaced rather than concealed (the context bar's `read-only` tag says
 * the same kind of thing about a venue the user *can* reach).
 *
 * Hover pre-connect is meaningless on touch, so the warmup fires on
 * `pointerdown` instead — which is roughly a tap's worth of head start on the
 * socket handshake, and the whole of what hovering bought on the desktop.
 */
import { memo, useCallback } from 'react'
import { Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import { MobileSheet } from '../primitives/mobile-sheet'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { MobileOverlay } from '../mobile-focus-context'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { useChartConfig } from '@/lib/chart-terminal-context'

type VenuePickerScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'venuePicker' }>
  onClose: () => void
}

export default memo(function VenuePickerScreen({
  onClose,
}: VenuePickerScreenProps) {
  const { t } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { setFocusedVenue } = useMobileActions()
  const { markets } = useAvailableMarkets()
  const { warmupMarket } = useMarketData()
  const { timeframe } = useChartConfig()

  const available = markets.filter((m) => !m.desktopOnly)
  const desktopOnly = markets.filter((m) => m.desktopOnly)

  const handleSelect = useCallback(
    (market: string) => {
      if (market !== focusedVenue) setFocusedVenue(market)
      onClose()
    },
    [focusedVenue, setFocusedVenue, onClose],
  )

  const handleWarmup = useCallback(
    (market: string) => warmupMarket(market, focusedPair, timeframe),
    [warmupMarket, focusedPair, timeframe],
  )

  return (
    <MobileSheet
      band="full"
      header={
        <div className="flex items-center gap-3 px-4 pb-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground">
            {t('mobile.shell.overlays.venuePicker')}
          </h2>
          <button
            className="pl-hit-44 shrink-0 text-[13.5px] font-medium text-foreground"
            onClick={onClose}
            type="button"
          >
            {t('common.cancel')}
          </button>
        </div>
      }
      label={t('mobile.shell.overlays.venuePicker')}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      open
    >
      {/* The tab bar floats above the sheet, so the list ends where it starts. */}
      <div className="pb-[var(--pl-tabbar-total)]">
        <section>
          <SectionLabel>{t('mobile.pickers.availableVenues')}</SectionLabel>
          {available.map((venue) => (
            <VenueRow
              key={venue.value}
              onSelect={handleSelect}
              onWarmup={handleWarmup}
              selected={venue.value === focusedVenue}
              venue={venue}
            />
          ))}
        </section>

        {desktopOnly.length > 0 ? (
          <section>
            <SectionLabel>{t('mobile.pickers.desktopOnlyVenues')}</SectionLabel>
            {desktopOnly.map((venue) => (
              <MobileRow
                disabled
                key={venue.value}
                leading={<VenueMark venue={venue} />}
                subtitle={t('mobile.pickers.desktopOnlyVenue')}
                title={venue.label}
                trailing={<Lock className="size-4 text-muted-foreground" />}
              />
            ))}
          </section>
        ) : null}
      </div>
    </MobileSheet>
  )
})

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-4 pb-1 pt-3.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
      {children}
    </h3>
  )
}

function VenueMark({ venue }: { venue: MarketOption }) {
  return (
    <span className="pl-venue-mark text-[10px]">
      {venue.iconUrl ? (
        <img alt="" className="size-full object-cover" src={venue.iconUrl} />
      ) : (
        venue.label.slice(0, 3).toUpperCase()
      )}
    </span>
  )
}

const VenueRow = memo(function VenueRow({
  venue,
  selected,
  onSelect,
  onWarmup,
}: {
  venue: MarketOption
  selected: boolean
  onSelect: (market: string) => void
  onWarmup: (market: string) => void
}) {
  const { t } = useTranslation()
  const { availableMarkets } = useMarketData()
  const permission = useVenueTradePermission(venue.value)
  const kind = t(VENUE_KIND_KEY[venueKindOf(venue.value, availableMarkets)])

  return (
    // The warmup rides a wrapper because the row itself is a shared primitive
    // with no pointer props — and the event bubbles out of its button anyway.
    <div onPointerDown={() => onWarmup(venue.value)}>
      <MobileRow
        leading={<VenueMark venue={venue} />}
        onPress={() => onSelect(venue.value)}
        selected={selected}
        subtitle={`${kind} · ${
          permission === 'trade'
            ? t('mobile.panels.trading')
            : t('mobile.shell.readOnly')
        }`}
        title={venue.label}
        trailing={
          selected ? <Check className="size-4 text-primary" /> : undefined
        }
      />
    </div>
  )
})
