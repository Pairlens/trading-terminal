// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Venue-listing badge for a picker row: one primary reachable venue plus
 * "+N" for the rest — never fourteen icons, and never a negative claim.
 * Absence of listing evidence renders nothing at all: the index only gets
 * to say "listed here", not "not listed there".
 *
 * Reachability partition: a venue counts as primary only if its connector
 * is active and allowed on this platform (desktop-only venues are not
 * "reachable" in a browser). Venues known only from weaker evidence still
 * count toward N — they exist, just not for this user right now.
 *
 * Lives in components/pair-picker/ so both shells share it — mobile imports
 * from the app, never the reverse.
 */
import { useMemo } from 'react'
import { isCorsConstrained } from '@pairlens/market-engine/platform'
import { getSymbolListings } from '@/lib/instruments/local-index'
import { useLocalIndexVersion } from '@/lib/instruments/use-local-index'
import { useMarketData } from '@/lib/market-data-provider'

export function VenueBadge({
  symbol,
  market,
}: {
  symbol: string
  /**
   * Name this venue instead of consulting the listings index. For rows whose
   * identity already carries its venue and whose symbol the index will never
   * hold — a prediction outcome key is per-venue and born the same day.
   */
  market?: string
}) {
  const indexVersion = useLocalIndexVersion()
  const { availableMarkets } = useMarketData()

  const label = useMemo(() => {
    if (market) {
      return (
        availableMarkets.find((m) => m.marketId === market)?.displayName ??
        market.toUpperCase()
      )
    }
    const listings = getSymbolListings(symbol)
    if (!listings) return null
    const known = new Set([...listings.local, ...listings.snapshot])
    if (known.size === 0) return null
    const corsConstrained = isCorsConstrained()
    const primary = availableMarkets.find(
      (m) =>
        known.has(m.marketId) &&
        !(m.requiresDesktop === true && corsConstrained),
    )
    const extra = known.size - (primary ? 1 : 0)
    if (!primary) return `+${extra}`
    return extra > 0 ? `${primary.displayName} +${extra}` : primary.displayName
    // indexVersion re-derives when the index (re)builds
  }, [symbol, market, availableMarkets, indexVersion])

  if (!label) return null
  return (
    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground">
      {label}
    </span>
  )
}
