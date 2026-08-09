// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The bar that never leaves the screen: what is in focus, and on which venue.
 *
 * Everything it shows it reads itself, and everything it reads changes rarely.
 * It must NOT subscribe to a ticker — the LIVE badge is a connection state,
 * not a price — and it is `memo` so a streaming market leaves it at zero
 * re-renders (see the performance budget in the blueprint).
 */
import { memo } from 'react'
import { ChevronDown, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileFocus } from '../mobile-focus-context'
import { useVenueTradePermission } from '../lib/venue-permission'
import { PRESS } from './press'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useOptimisticSession } from '@/lib/session'

export type ContextBarProps = {
  onOpenPairPicker: () => void
  onOpenVenuePicker: () => void
  onOpenSettings: () => void
}

/**
 * What the venue chip claims about the data behind it.
 *
 * Read from the two facts the chip already has in hand, both of which change
 * on the order of once a session: whether the connectors have come up at all,
 * and whether THIS venue is one this build can reach. A venue that declares
 * `requiresDesktop` is present in the market list and still serves nothing in
 * a browser, so it is `offline` rather than `live` — the old green dot said
 * "connected" for all four of them.
 */
type VenueLiveState = 'live' | 'connecting' | 'offline'

/** Static keys — the i18n audit cannot follow a template literal. */
const LIVE_LABEL_KEY: Record<VenueLiveState, string> = {
  live: 'mobile.shell.live.live',
  connecting: 'mobile.shell.live.connecting',
  offline: 'mobile.shell.live.offline',
}

const LIVE_A11Y_KEY: Record<VenueLiveState, string> = {
  live: 'mobile.shell.live.liveA11y',
  connecting: 'mobile.shell.live.connectingA11y',
  offline: 'mobile.shell.live.offlineA11y',
}

/**
 * The badge itself. Deliberately NOT uppercased in CSS: the label is a
 * translated string and how it is cased belongs to the translator, not to a
 * class name that assumes a bicameral script.
 */
function LiveBadge({ state }: { state: VenueLiveState }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'pl-live-badge flex shrink-0 items-center gap-[3px] rounded border px-[4px] py-[2.5px] text-[8px] font-semibold leading-none tracking-[0.09em]',
        state === 'live'
          ? 'border-up/45 text-up'
          : 'border-border text-muted-foreground',
      )}
      data-state={state}
    >
      <span aria-hidden className="pl-live-mark" />
      {t(LIVE_LABEL_KEY[state])}
    </span>
  )
}

/**
 * "You can watch this venue, you cannot trade on it."
 *
 * A TAG where there used to be a bare lowercase word hanging off the LIVE
 * badge: same 15px height, same radius, filled and muted where that one is
 * outlined and green. Two sibling status marks, one of them clearly the
 * quieter — which is what the second line failed to look like before.
 *
 * It carries no label, and that is arithmetic rather than taste. The venue
 * chip had ~3px of slack at 402px (measured: chip 144 against a row budget of
 * 279 it shares with a pair chip that fits `BTC-USDT` exactly), while the word
 * alone measured 37.9px in English and 51px in French — so any tag drawn
 * around it costs 20-35px the row does not have, and the pair symbol pays in
 * ellipsis. The glyph is 17px, so the chip HANDS BACK ~25px instead: English
 * gains headroom and French and Spanish stop truncating at all.
 *
 * The words survive where they can afford to: the chip's own aria-label says
 * them, and the venue picker one tap away spells out the capability in full.
 */
function ViewOnlyTag() {
  return (
    <span className="pl-view-tag flex h-[15px] shrink-0 items-center justify-center rounded px-[3.5px]">
      <Eye aria-hidden className="size-[10px]" strokeWidth={2.1} />
    </span>
  )
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
  const liveState: VenueLiveState =
    status !== 'connected'
      ? 'connecting'
      : venue && !venue.desktopOnly
        ? 'live'
        : 'offline'
  const userName = session?.user.name ?? session?.user.email ?? ''
  const initials = userName ? initialsFrom(userName) : 'PL'
  const readOnly = permission === 'read' && liveState !== 'offline'
  // The tag is a glyph (see ViewOnlyTag), so the words have to survive
  // somewhere: the chip's accessible name is the only place left that a
  // screen reader reaches without opening the picker.
  const liveA11y = t(LIVE_A11Y_KEY[liveState])

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-[5px] px-[14px]"
      style={{ paddingTop: 'max(var(--pl-safe-top), 8px)' }}
    >
      {/* Pair chip. The only element on the row allowed to truncate: at 402px
          a 13-character symbol, a venue name, a read-only tag and the avatar
          button do not all fit, and of those the symbol is the one the hero
          price and the asset avatar both restate. (This chip IS the way into
          search — it opens the pair picker, whose first row is the search
          field — so the row carries no separate magnifier.)

          `flex-auto`, NOT `flex-1`: basis `auto` is what lets the two chips
          start at their own content widths and split only the LEFTOVER
          between them. With `flex-1`'s basis of 0 the row would hand a short
          pair the same width as a long venue name and both would sit in dead
          air; with basis `auto` a caret pinned right stays a few pixels from
          the text it belongs to, and a deficit still lands here because this
          is the only chip that may shrink (`min-w-0` against the venue's
          `min-w-fit`). */}
      <button
        aria-label={t('mobile.shell.changePair')}
        className="pl-glass pl-press pointer-events-auto flex h-11 min-w-0 flex-auto items-center justify-between gap-1.5 py-0 pl-[5px] pr-1.5"
        onClick={onOpenPairPicker}
        type="button"
        {...PRESS}
      >
        {/* The caret is `justify-between`'d to the chip's right edge, so
            everything it is NOT has to be one group — three loose children
            would spread the avatar away from the symbol instead. */}
        <span className="flex min-w-0 items-center gap-[5px]">
          <PairAvatar
            assetClass={assetClassMap[focusedPair]}
            base={base}
            className="size-[30px] text-[9px]"
            size="sm"
          />
          <span className="min-w-0 truncate font-mono text-[15px] font-semibold text-foreground">
            {focusedPair}
          </span>
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {/* Venue chip. `min-w-fit` is what makes the row degrade correctly:
          it grows into any slack (the design's flex:1) but refuses to shrink
          below its own content, so the deficit lands on the pair chip instead
          of squeezing the venue name to "O…". */}
      <button
        aria-label={t('mobile.shell.changeVenueA11y', {
          venue: venueLabel,
          status: readOnly
            ? t('mobile.shell.readOnlyA11y', { status: liveA11y })
            : liveA11y,
        })}
        className="pl-glass pl-press pointer-events-auto flex h-11 min-w-fit flex-auto items-center justify-between gap-1.5 py-0 pl-[5px] pr-1.5"
        onClick={onOpenVenuePicker}
        type="button"
        {...PRESS}
      >
        <span className="flex items-center gap-1.5">
          <span className="pl-venue-mark shrink-0 text-[10px]">
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
          {/* Name over state. Stacking is what buys the badge its room: side
              by side, `LIVE` plus a mode tag plus a long venue name is wider
              than the chip's share of a 402px row, and this chip is the one
              that refuses to shrink. Both lines stay `whitespace-nowrap` so
              the deficit still lands on the pair chip, exactly as before. */}
          <span className="flex shrink-0 flex-col items-start gap-[3px]">
            <span className="whitespace-nowrap text-left text-[13.5px] font-semibold leading-none text-foreground">
              {venueLabel}
            </span>
            <span className="flex items-center gap-1">
              <LiveBadge state={liveState} />
              {/* A venue that serves nothing is not "read-only", it is
                  nothing — so an offline venue shows the liveness mark alone. */}
              {readOnly ? <ViewOnlyTag /> : null}
            </span>
          </span>
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>

      {/* Avatar → Settings (Settings is not a tab).
          Its fill and ring live in `.pl-ctx-avatar` rather than inline: a
          press state is a `:active` rule, and an inline `style` wins over
          every class it would be written in. */}
      <button
        aria-label={t('mobile.shell.openSettings')}
        className="pl-ctx-avatar pl-press pl-hit-44 pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold text-foreground"
        onClick={onOpenSettings}
        type="button"
        {...PRESS}
      >
        {initials}
      </button>
    </div>
  )
})
