// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { DiscoverySectionId } from '@/lib/layout/workspaces/discovery-sections'
import { HEADER_GROUP } from '@/components/chrome/header-chrome'
import { MarketPicker } from '@/components/terminal/market-picker'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { venuesForClass } from '@/lib/market-ref/resolve'
import { track } from '@/lib/analytics-events'

/**
 * Discovery sections whose board answers to the shared venue preference.
 *
 * Spot is the one that does, wholesale: the scanner's rows, the movers table,
 * the watchlist and the heatmap all price and link through
 * `usePreferredMarketResolver`, so changing this changes what is on screen.
 *
 * CEX Futures is deliberately not here even though a perp is not venue-bound.
 * That board reads every perp venue at once by design — the funding matrix IS
 * the comparison across them — so a single-venue chip up top would be a
 * control the board never answers. DEX and Predictions carry their venue in
 * the instrument's identity, and equities have one broker.
 *
 * A section opts in by being added here, not by inheriting the control.
 */
const PREFERENCE_DRIVEN_SECTIONS: ReadonlySet<DiscoverySectionId> = new Set([
  'spot',
])

/**
 * Which venue this section's rows price and link against, chosen from the
 * Discovery bar.
 *
 * `terminal.market` is the preference every spot discovery surface already
 * reads, but the only control that could write it lived on a chart page.
 * Changing venue meant opening a pair you did not want to look at, switching
 * it there, and coming back. So the same picker the terminal bar uses sits
 * here, on the board that consumes the answer.
 *
 * The chip shows the venue this section RESOLVES to, not the raw preference:
 * a trader whose last chart was an equity has `alpaca` in that key, and
 * labelling the spot board with a venue that lists no spot pair would name
 * something no row on screen is using. `usePreferredMarketResolver` is the
 * same resolution the rows themselves run.
 *
 * Renders nothing when there is no choice to make — its own header group and
 * all, because an empty group would still spend the bar's 20px group gap.
 */
export function DiscoveryVenuePicker({
  section,
}: {
  section: DiscoverySectionId
}) {
  const { t } = useTranslation()
  const { markets, defaultMarket } = useAvailableMarkets()
  const [, setPreferred] = usePersistedState('terminal.market', defaultMarket)
  const resolvePreferred = usePreferredMarketResolver()
  const market = resolvePreferred(section)

  // Same list `MarketPicker` will build from `assetClass`, computed here to
  // answer whether there is anything to pick between at all.
  const choices = useMemo(
    () => venuesForClass(section, market, markets),
    [section, market, markets],
  )

  if (!PREFERENCE_DRIVEN_SECTIONS.has(section)) return null
  if (choices.length < 2) return null

  return (
    // Its own group: the venue says what the board is looking at, Panes and
    // Workspaces beside it say how it is arranged.
    <div className={HEADER_GROUP}>
      <MarketPicker
        market={market}
        marketOptions={markets}
        assetClass={section}
        onMarketChange={(next) => {
          setPreferred(next)
          track('discovery_venue_changed', { venue: next, section })
        }}
        aria-label={t('terminal.market')}
      />
    </div>
  )
}
