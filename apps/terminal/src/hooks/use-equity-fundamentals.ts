// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fundamentals and the reporting schedule, from the App Server.
 *
 * Two reads, one plumbing: both routes answer a typed reason when the provider
 * is the problem, and both panes have to say something different for each of
 * them. So the hooks hand back `unavailable` alongside the data rather than a
 * bare error, and a pane never has to guess whether an empty answer means "no
 * provider on this deployment" or "nobody reports next week".
 *
 * Long stale times on purpose. Fundamentals restate quarterly and the server
 * caches them for a day, so a pane that refetched on every mount would only
 * spend a round trip to be told the same numbers. Neither hook retries a
 * refusal: a build with no provider will not grow one between two attempts.
 */
import { useQuery } from '@tanstack/react-query'

import type {
  CompanyOverviewResponse,
  EarningsCalendarResponse,
  EquityFundamentalsUnavailableReason,
} from '@pairlens/shared/instrument-types'

import { EquityFundamentalsUnavailableError, api } from '@/lib/api'

/** Why a pane has nothing, when the reason is the provider and not the data. */
export type FundamentalsUnavailable = EquityFundamentalsUnavailableReason | null

function reasonOf(error: unknown): FundamentalsUnavailable {
  if (error instanceof EquityFundamentalsUnavailableError) return error.reason
  return error ? 'upstream_error' : null
}

/** One transient failure is worth a second try; a stated refusal is not. */
function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  const reason = reasonOf(error)
  if (reason === 'not_configured' || reason === 'rate_limited') return false
  return failureCount < 1
}

const STALE = 30 * 60_000
const GC = 2 * 60 * 60_000

export function useCompanyOverview(symbol: string): {
  data: CompanyOverviewResponse | undefined
  isLoading: boolean
  unavailable: FundamentalsUnavailable
} {
  const ticker = symbol.trim().toUpperCase()
  const { data, isLoading, error } = useQuery({
    queryKey: ['company-overview', ticker],
    queryFn: () => api.getCompanyOverview(ticker),
    enabled: ticker.length > 0,
    staleTime: STALE,
    gcTime: GC,
    retry: retryUnlessRefused,
  })

  return { data, isLoading, unavailable: reasonOf(error) }
}

export function useEarningsCalendar(options?: {
  days?: number
  symbols?: Array<string>
  enabled?: boolean
}): {
  data: EarningsCalendarResponse | undefined
  isLoading: boolean
  unavailable: FundamentalsUnavailable
} {
  const days = options?.days
  // Sorted, so two callers asking for the same set share one cache entry
  // whatever order their rows happened to be in.
  const symbols = options?.symbols?.length
    ? [...new Set(options.symbols.map((s) => s.toUpperCase()))].sort()
    : undefined

  const { data, isLoading, error } = useQuery({
    queryKey: ['earnings-calendar', days ?? 'default', symbols ?? 'all'],
    queryFn: () => api.getEarningsCalendar({ days, symbols }),
    enabled: options?.enabled ?? true,
    staleTime: STALE,
    gcTime: GC,
    retry: retryUnlessRefused,
  })

  return { data, isLoading, unavailable: reasonOf(error) }
}
