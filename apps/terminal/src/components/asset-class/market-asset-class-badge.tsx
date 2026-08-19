// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The class badge for one market, with the qualifier filled in.
 *
 * Two classes carry their venue as part of their identity and read wrong
 * without it — a pool is on Solana or on Base, and those are different assets
 * — so the badge names the chain. A stock's class is only half the story
 * outside regular hours, so it names the session phase, which is the same fact
 * the ticket uses to force a limit order. An event says whether it is a
 * two-sided question or a field, because "Yes at 63c" and "one of eleven
 * candidates" are read differently.
 *
 * Spot and perps take no qualifier: the venue already sits two controls away
 * in the header, and repeating it here would be noise on the two classes that
 * need the least explaining.
 *
 * Everything it reads is cheap or already mounted. The session query is the
 * same react-query entry the order ticket holds on a stock route (shared key,
 * so no second request), and it is asked for at all only on a stock route.
 */
import { useTranslation } from 'react-i18next'

import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { SessionPhase } from '@/lib/equities/session'

import { AssetClassBadge } from '@/components/asset-class/asset-class-badge'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useEquitySession } from '@/hooks/use-equity-session'
import { dexChain } from '@/lib/dex/chain-catalog'
import {
  isPredictionEventEntry,
  usePredictionPin,
} from '@/stores/prediction-directory-store'

/**
 * Static keys — the i18n audit cannot follow a template literal, and these are
 * the session panes' own strings rather than new ones, so the badge and the
 * session clock cannot disagree about what the phase is called.
 *
 * Regular hours get no qualifier at all. The badge flags the exception: what a
 * trader needs told is that this ticket is going into pre-market, not that a
 * Tuesday afternoon is a Tuesday afternoon.
 */
const SESSION_DETAIL_KEY: Record<SessionPhase, string | null> = {
  pre: 'session.statePre',
  rth: null,
  post: 'session.statePost',
  closed: 'session.stateClosed',
}

export type MarketAssetClassBadgeProps = {
  cls: InstrumentClass
  /** Venue id: the chain for a pool, the exchange otherwise. */
  market: string
  /** The instrument's own key, which is what the prediction directory knows. */
  pairKey?: string
  size?: 'xs' | 'sm'
  /** See `AssetClassBadge` — collapse to the class icon on a narrow header. */
  collapsible?: boolean
  className?: string
}

export function MarketAssetClassBadge({
  cls,
  market,
  pairKey,
  size = 'sm',
  collapsible = false,
  className,
}: MarketAssetClassBadgeProps) {
  const { t } = useTranslation()
  const { markets } = useAvailableMarkets()
  const pin = usePredictionPin(pairKey ?? '')
  // Only a stock route pays for the calendar. Elsewhere the hook is inert.
  const session = useEquitySession({ enabled: cls === 'stocks' })

  let detail: string | undefined
  if (cls === 'dex') {
    // The CHAIN, not the connector. On every EVM chain the two are the same
    // string, but Solana's connector is Jupiter — an aggregator, not a chain —
    // and "DEX · Jupiter" answers a question nobody asked. The chain catalog
    // is what knows the difference; the venue label is the fallback for a
    // third-party connector the catalog has never heard of.
    detail =
      dexChain(market)?.displayName ??
      markets.find((m) => m.value === market)?.label ??
      market.toUpperCase()
  } else if (cls === 'stocks') {
    const key = session.state ? SESSION_DETAIL_KEY[session.state.phase] : null
    detail = key ? t(key) : undefined
  } else if (cls === 'prediction' && pin && isPredictionEventEntry(pin)) {
    // Two answers is a side to take, twelve is a field to read, and the two
    // are traded differently enough that the badge says which.
    detail =
      pin.outcomeCount > 2
        ? t('assetClass.multiOutcome')
        : t('assetClass.binary')
  }

  return (
    <AssetClassBadge
      cls={cls}
      {...(detail ? { detail } : {})}
      size={size}
      collapsible={collapsible}
      {...(className ? { className } : {})}
    />
  )
}
