// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Why a stock is on the movers list, in three or four words.
 *
 * A percentage on its own does not tell anyone whether to care. The design puts
 * a reason under every ticker, and its examples are 'Earnings beat' and 'AI ·
 * pre-NVDA bid' — a verdict and a narrative, and we can serve neither. Nobody
 * publishes a free beat/miss feed, and the narrative is a human writing a
 * sentence about a stock this morning.
 *
 * What we do hold is the calendar and the catalog, so the tag says the strongest
 * true thing in that order: this name reports after the close tonight, this one
 * reported before the bell, this one is on the calendar today without a stated
 * slot, and otherwise what the company does for a living. A tag is never a
 * claim about the print itself.
 *
 * It costs nothing on the equities board. The window is one day, which is the
 * same window the earnings pane asks for in its default scope, so the two share
 * a single react-query entry and a single request.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { stockSector } from '@pairlens/plugins/catalog'

import { useEarningsCalendar } from '@/hooks/use-equity-fundamentals'

/** What today's calendar says about a name, strongest first. */
type ReportingToday = 'bmo' | 'amc' | 'scheduled'

/**
 * A lookup from ticker to its tag, or null when we have nothing to say — a
 * symbol from a broker's universe that this catalog never listed gets no label
 * rather than a guessed sector.
 */
export function useEquityReasonTags(): (symbol: string) => string | null {
  const { t } = useTranslation()
  // Today only. A week of calendar would let a row claim it reports tonight
  // three days early, which is exactly the kind of near-miss a trader acts on.
  const { data } = useEarningsCalendar({ days: 1 })

  const reporting = useMemo(() => {
    const map = new Map<string, ReportingToday>()
    for (const entry of data?.entries ?? []) {
      map.set(
        entry.symbol.toUpperCase(),
        entry.reportTime === 'bmo' || entry.reportTime === 'amc'
          ? entry.reportTime
          : 'scheduled',
      )
    }
    return map
  }, [data])

  return useMemo(
    () => (symbol: string) => {
      const ticker = symbol.toUpperCase()
      switch (reporting.get(ticker)) {
        case 'amc':
          return t('movers.reason.reportsTonight')
        case 'bmo':
          return t('movers.reason.reportedThisMorning')
        case 'scheduled':
          return t('movers.reason.reportsToday')
        default:
          break
      }
      const sector = stockSector(ticker)
      return sector ? t(`markets.sector.${sector}`) : null
    },
    [reporting, t],
  )
}
