// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the position will start paying, on the ticket that opens it.
 *
 * Funding is the cost of a perp that nobody sees until it has already been
 * charged: the notional and the liquidation estimate above this row describe
 * the position, and this is the only line that describes holding it. Entering
 * a long into a +0.09% stamp that settles in four minutes is a different trade
 * from entering the same long an hour after it settled, and the difference is
 * invisible on a chart.
 *
 * Three facts, one row: the rate, who pays it, and when. The countdown is the
 * scanners' own component, so it ticks inside itself rather than re-rendering
 * the form the user is typing into.
 *
 * Public data, no credentials, and a cache the funding panes already share, so
 * a ticket on a board that also shows the belt costs nothing extra. Renders
 * nothing when the venue publishes no rate for this contract: an empty row
 * where a cost should be reads as "free".
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import {
  FundingCountdown,
  ratePercent,
} from '@/components/futures/funding-scanner'
import {
  useFundingRates,
  useFuturesFundingVenues,
} from '@/hooks/use-funding-rates'
import { normalizePairKey } from '@/lib/pairs'

export function FundingEntryRow({
  market,
  pairKey,
}: {
  market: string
  pairKey: string
}) {
  const { t } = useTranslation()
  const allVenues = useFuturesFundingVenues()
  // Scoped to the ticket's own venue: the same contract funds differently on
  // every exchange, and the one that matters is the one this order routes to.
  const venues = useMemo(
    () => allVenues.filter((v) => v.market === market),
    [allVenues, market],
  )
  const pairs = useMemo(() => [pairKey], [pairKey])
  const { data } = useFundingRates(venues, { pairs })

  const entry = useMemo(() => {
    const key = normalizePairKey(pairKey)
    for (const result of data ?? []) {
      const hit = result.entries.find((e) => normalizePairKey(e.pair) === key)
      if (hit) return hit
    }
    return null
  }, [data, pairKey])

  if (!entry) return null

  // Positive funding is longs paying shorts — the belt paints it the same way,
  // as a cost against the side most tickets are opening.
  const longsPay = entry.fundingRate >= 0

  return (
    <div className="flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="uppercase tracking-[.16em]">
          {t('terminal.trade.fundingAtEntry')}
        </span>
        <span className={cn(longsPay ? 'text-down' : 'text-up')}>
          {ratePercent(entry.fundingRate)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[9.5px]">
        <span>
          {longsPay
            ? t('terminal.trade.fundingLongsPay')
            : t('terminal.trade.fundingShortsPay')}
        </span>
        <FundingCountdown toMs={entry.nextFundingMs ?? null} />
      </div>
    </div>
  )
}
