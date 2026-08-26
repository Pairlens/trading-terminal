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
 * Venues from another ASSET CLASS are a different matter and are filtered out
 * entirely. "Desktop only" is a venue you could reach elsewhere; a spot
 * exchange under an event contract is not a venue at all for this market, and
 * offering it only bought a dark screen.
 *
 * With one exception, which earns its own section: a spot pair and its linear
 * perpetual are one asset under two ids (`crossClassVenuesFor`). Tapping a
 * perp venue under BTC-USDT is not a dead choice, it is BTC-USDT-USDT, so the
 * section header says so and the tap moves the pair, the class and the venue
 * in one commit. Two commits would paint a frame of the perps ticket with the
 * spot key still in it.
 *
 * Hover pre-connect is meaningless on touch, so the warmup fires on
 * `pointerdown` instead — which is roughly a tap's worth of head start on the
 * socket handshake, and the whole of what hovering bought on the desktop.
 *
 * Every reachable row is ASKED whether it carries the pair on screen, the
 * moment the sheet opens (`useVenueListings`, shared with the desktop empty
 * state). A venue that answers "no such market" is crossed and disabled, the
 * same treatment a desktop-only venue gets and for the same reason: the list is
 * the recovery from a pair that would not load, and a picker that answers that
 * with fourteen equally plausible rows just charges another socket handshake
 * for the same wall. A venue that could not be asked keeps no mark and stays
 * tappable — a cross means the venue said no, never that nobody answered.
 */
import { memo, useCallback } from 'react'
import { ArrowLeftRight, Check, Eye, Loader2, Lock, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { VENUE_KIND_KEY, venueKindOf } from '../lib/venue-kind'
import { MobileRow } from '../primitives/mobile-row'
import { MobileSheet, useSheetExit } from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { LucideIcon } from 'lucide-react'
import type { MarketOption } from '@/hooks/use-available-markets'
import type { VenueListingStatus } from '@/hooks/use-venue-listings'
import type { MobileOverlay } from '../mobile-focus-context'
import { haptic } from '@/lib/haptics'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useVenueListings } from '@/hooks/use-venue-listings'
import { useMarketData } from '@/lib/market-data-provider'
import { useChartConfig } from '@/lib/chart-terminal-context'
import { crossClassVenuesFor, venuesForClass } from '@/lib/market-ref/resolve'
import { assetClassVisual } from '@/lib/asset-class/visuals'
import { track } from '@/lib/analytics-events'

/** Stable identity for the no-section case, so the probe effect stays quiet. */
const EMPTY_VENUES: Array<MarketOption> = []

type VenuePickerScreenProps = {
  overlay: Extract<MobileOverlay, { kind: 'venuePicker' }>
  onClose: () => void
}

export default memo(function VenuePickerScreen({
  overlay,
  onClose,
}: VenuePickerScreenProps) {
  const { t } = useTranslation()
  const { focusedPair, focusedInstrument, focusedClass, focusedVenue } =
    useMobileFocus()
  const { setFocusedPair, setFocusedVenue } = useMobileActions()
  const { markets } = useAvailableMarkets()
  // `availableMarkets` is the adapter list the kind tag is derived from; the
  // desktop-only rows below are plain `MobileRow`s with no hook of their own.
  const { warmupMarket, availableMarkets } = useMarketData()
  const { timeframe } = useChartConfig()
  // Every dismiss routes through `requestClose` so the sheet gets to play its
  // exit before the overlay stack unmounts this screen. `overlay` is the
  // reopen key: a second tap on the venue chip during that exit pushes a new
  // one, and the sheet has to come back rather than stay shut behind it.
  const { open, isClosing, requestClose } = useSheetExit(onClose, overlay)

  // Only the venues that can serve what is on the chart, by the same rule the
  // desktop picker uses. A venue from another asset class is not a narrower
  // choice, it is a dead one: the pair id means nothing to it, and tapping it
  // left every pane on the surface with no data and no explanation.
  const compatible = venuesForClass(focusedClass, focusedVenue, markets)
  const available = compatible.filter((m) => !m.desktopOnly)
  const desktopOnly = compatible.filter((m) => m.desktopOnly)

  // Only the rows a tap can actually reach are asked: a desktop-only venue
  // would answer about the browser wall, which its own section already says.
  const listings = useVenueListings(focusedPair, available)

  // The same asset under another class, when there is one. Desktop-only rows
  // are dropped here rather than listed: the section is already the answer to
  // a question nobody asked, and a row it cannot open does not earn the space.
  const otherClassAll = crossClassVenuesFor(
    { cls: focusedClass, id: focusedInstrument },
    markets,
  )
  const otherClassOptions = (otherClassAll?.options ?? []).filter(
    (m) => !m.desktopOnly,
  )
  const otherClass =
    otherClassAll && otherClassOptions.length > 0
      ? { ...otherClassAll, options: otherClassOptions }
      : null

  // Asked under the OTHER class's key, which is the pair those venues would
  // actually be handed. One call rather than one per section, which is what
  // `crossClassVenuesFor` returning at most one section buys: a hook cannot
  // be called from inside a map.
  const otherListings = useVenueListings(
    otherClass?.id ?? '',
    otherClass?.options ?? EMPTY_VENUES,
  )

  const handleSelect = useCallback(
    (market: string) => {
      // A row tapped while the sheet is already leaving is not a choice — see
      // `isClosing`.
      if (isClosing()) return
      // Before the switch, not after: the tick answers the finger, and the
      // venue change behind it costs a socket handshake.
      haptic('selection')
      if (market !== focusedVenue) setFocusedVenue(market)
      // The venue switches NOW and only the hand-off waits: the chart behind
      // the sheet is already reconnecting by the time it has slid away.
      requestClose()
    },
    [isClosing, focusedVenue, setFocusedVenue, requestClose],
  )

  /**
   * The same tap, for a venue that trades this as another class. The pair and
   * the venue move together so the surface never renders one against the
   * other; React batches both into the commit this handler ends with.
   */
  const handleSelectCrossClass = useCallback(
    (market: string, cls: InstrumentClass, id: string) => {
      if (isClosing()) return
      haptic('selection')
      track('venue_class_switched', {
        venue: market,
        asset_class: cls,
        outcome: 'moved',
        source: 'mobile-picker',
      })
      setFocusedPair(id, cls)
      setFocusedVenue(market)
      requestClose()
    },
    [isClosing, setFocusedPair, setFocusedVenue, requestClose],
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
            className="pl-hit-44 pl-press-text shrink-0 text-[13.5px] font-medium text-foreground"
            onClick={requestClose}
            type="button"
            {...PRESS}
          >
            {t('common.cancel')}
          </button>
        </div>
      }
      label={t('mobile.shell.overlays.venuePicker')}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      open={open}
    >
      {/* The tab bar floats above the sheet, so the list ends where it starts. */}
      <div className="pb-[var(--pl-tabbar-total)]">
        <section>
          <SectionLabel>{t('mobile.pickers.availableVenues')}</SectionLabel>
          {available.map((venue) => (
            <VenueRow
              key={venue.value}
              listing={listings[venue.value] ?? 'checking'}
              onSelect={handleSelect}
              onWarmup={handleWarmup}
              selected={venue.value === focusedVenue}
              venue={venue}
            />
          ))}
        </section>

        {otherClass ? (
          <section>
            <SectionLabel>
              {t('mobile.pickers.otherClassVenues', {
                cls: t(assetClassVisual(otherClass.cls).labelKey),
                pair: otherClass.id,
              })}
            </SectionLabel>
            {otherClass.options.map((venue) => (
              <VenueRow
                key={venue.value}
                listing={otherListings[venue.value] ?? 'checking'}
                onSelect={(market) =>
                  handleSelectCrossClass(market, otherClass.cls, otherClass.id)
                }
                // The other class's key, not the one on screen: warming
                // BTC-USDT against a futures venue seeds nothing.
                onWarmup={(market) =>
                  warmupMarket(market, otherClass.id, timeframe)
                }
                selected={false}
                venue={venue}
              />
            ))}
          </section>
        ) : null}

        {desktopOnly.length > 0 ? (
          <section>
            <SectionLabel>{t('mobile.pickers.desktopOnlyVenues')}</SectionLabel>
            {desktopOnly.map((venue) => (
              // No trailing lock any more: the padlock moved into the
              // capability tag, where it sits beside the words it stands for.
              // Two of the same glyph in one 44px row taught nothing twice.
              <MobileRow
                disabled
                key={venue.value}
                leading={<VenueMark venue={venue} />}
                subtitle={
                  <VenueTags
                    capability="desktop"
                    kindKey={
                      VENUE_KIND_KEY[venueKindOf(venue.value, availableMarkets)]
                    }
                  />
                }
                title={venue.label}
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

/**
 * What the row's second line says, as one of three states.
 *
 * `read` and `desktop` are both "you cannot trade here", but they fail for
 * different reasons and the picker is the one place with room to say which.
 */
type VenueCapability = 'trade' | 'read' | 'desktop'

/**
 * Static entries, not a template: the glyph and the word travel together, and
 * the i18n audit has to be able to see the key as a literal.
 */
const CAPABILITY_TAG: Record<
  VenueCapability,
  { icon: LucideIcon; labelKey: string; tone: string }
> = {
  trade: {
    icon: ArrowLeftRight,
    labelKey: 'mobile.panels.trading',
    tone: 'pl-row-tag-trade',
  },
  read: {
    icon: Eye,
    labelKey: 'mobile.shell.readOnly',
    tone: 'pl-row-tag-muted',
  },
  desktop: {
    icon: Lock,
    labelKey: 'mobile.pickers.desktopOnlyVenue',
    tone: 'pl-row-tag-muted',
  },
}

/**
 * The venue row's second line: what the venue trades, then what you may do.
 *
 * It replaced `spot · read-only`, a plain string doing the work of a status.
 * The capability half carries the SAME eye the context bar's chip shows bare
 * (`.pl-view-tag` paints both), because a glyph only becomes shorthand once
 * the user has met it next to its word — and the picker, one tap from the
 * chip, is where that meeting can afford the width.
 *
 * The glyphs are `aria-hidden` and the labels are real text, so the row
 * button's accessible name still comes out as "OKX spot read-only" with no
 * aria-label to keep in sync with what is drawn.
 */
function VenueTags({
  capability,
  kindKey,
}: {
  capability: VenueCapability
  kindKey: string
}) {
  const { t } = useTranslation()
  const tag = CAPABILITY_TAG[capability]
  const Icon = tag.icon

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="pl-row-tag pl-row-tag-kind rounded">{t(kindKey)}</span>
      <span className={cn('pl-row-tag rounded', tag.tone)}>
        <Icon aria-hidden className="size-[10px]" strokeWidth={2.1} />
        {t(tag.labelKey)}
      </span>
    </span>
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
  listing,
  onSelect,
  onWarmup,
}: {
  venue: MarketOption
  selected: boolean
  /** Live answer to "do you carry the pair on screen?" — see the header. */
  listing: VenueListingStatus
  onSelect: (market: string) => void
  onWarmup: (market: string) => void
}) {
  const { availableMarkets } = useMarketData()
  const permission = useVenueTradePermission(venue.value)
  const refused = listing === 'unlisted' || listing === 'blocked'

  return (
    // The warmup rides a wrapper because the row itself is a shared primitive
    // with no pointer props — and the event bubbles out of its button anyway.
    // A refused row takes no warmup either: there is nothing to connect to.
    <div onPointerDown={refused ? undefined : () => onWarmup(venue.value)}>
      <MobileRow
        disabled={refused}
        leading={<VenueMark venue={venue} />}
        onPress={() => onSelect(venue.value)}
        selected={selected}
        subtitle={
          <VenueTags
            capability={permission === 'trade' ? 'trade' : 'read'}
            kindKey={VENUE_KIND_KEY[venueKindOf(venue.value, availableMarkets)]}
          />
        }
        title={venue.label}
        trailing={
          // The current venue keeps its own tick: "you are here" outranks
          // "it has the pair", and the row you are standing on demonstrably
          // does not (that is why the picker is open).
          selected ? (
            <Check className="size-4 text-primary" />
          ) : (
            <VenueListingMark status={listing} venue={venue.label} />
          )
        }
      />
    </div>
  )
})

/**
 * The trailing listing mark, with its meaning in text for a screen reader:
 * a bare glyph in a 44px row is shorthand nobody was taught.
 */
function VenueListingMark({
  status,
  venue,
}: {
  status: VenueListingStatus
  venue: string
}) {
  const { t } = useTranslation()
  const { focusedPair } = useMobileFocus()

  if (status === 'unknown') return null

  const label =
    status === 'checking'
      ? t('layout.venueCheck.checking', { pair: focusedPair, venue })
      : status === 'listed'
        ? t('layout.venueCheck.listed', { pair: focusedPair, venue })
        : status === 'blocked'
          ? t('layout.venueCheck.blocked', { venue })
          : t('layout.venueCheck.unlisted', { pair: focusedPair, venue })

  return (
    <span className="flex items-center">
      <span className="sr-only">{label}</span>
      {status === 'checking' ? (
        <Loader2
          aria-hidden
          className="size-3.5 animate-spin text-muted-foreground/70"
        />
      ) : status === 'listed' ? (
        <Check aria-hidden className="size-3.5 text-up" />
      ) : (
        <X aria-hidden className="size-3.5 text-muted-foreground" />
      )}
    </span>
  )
}
