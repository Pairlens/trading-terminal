// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The forward US macro release calendar, from the App Server.
 *
 * Its own file rather than a fifth hook beside the fundamentals ones, because
 * nothing behind it is fundamentals: the server compiles this from the BLS,
 * BEA, Fed and Census publication schedules, with no market-data vendor and no
 * API key in the path. What it shares with them is the transport and the way a
 * refusal travels, so it borrows those two helpers instead of copying them.
 *
 * The window a caller asks for is the only knob. The server holds one compiled
 * snapshot and cuts it, so widening the window costs nothing upstream and
 * every window shares the same compile.
 *
 * Half an hour stale, because an agency schedule is stale the way a printed
 * calendar is: the dates were published a year ago. A refusal is not retried
 * twice, since a standalone build will not grow an App Server between two
 * attempts.
 */
import { useQuery } from '@tanstack/react-query'

import type { EconomicCalendarResponse } from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { reasonOf, retryUnlessRefused } from '@/hooks/use-equity-fundamentals'
import { api } from '@/lib/api'

const STALE = 30 * 60_000
const GC = 2 * 60 * 60_000

export function useEconomicCalendar(options?: {
  /** Days ahead, inclusive of today. The server defaults to 14, caps at 92. */
  days?: number
  enabled?: boolean
}): {
  data: EconomicCalendarResponse | undefined
  isLoading: boolean
  unavailable: FundamentalsUnavailable
} {
  const days = options?.days

  const { data, isLoading, error } = useQuery({
    queryKey: ['economic-calendar', days ?? 'default'],
    queryFn: () => api.getEconomicCalendar(days),
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    gcTime: GC,
    retry: retryUnlessRefused,
  })

  return { data, isLoading, unavailable: reasonOf(error) }
}
