// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useQuery } from '@tanstack/react-query'

import { defaultAffiliateLinks } from '@pairlens/shared/affiliates'
import type {
  AffiliateLinksResponse,
  ResolvedAffiliateLink,
} from '@pairlens/shared/affiliates'
import { appServerUrl } from '@/lib/api'
import { getReferralCode } from '@/lib/referral'

// ---------------------------------------------------------------------------
// Venue signup links, resolved at runtime by the App Server so referral URLs
// are never baked into executables — Pairlens can re-route its own affiliate
// links (or an affiliate's) at any time without shipping a new build.
//
// Freshness/fallback chain:
//   1. Live fetch, re-polled hourly while the terminal runs (long sessions
//      pick up server-side re-routes without a restart)
//   2. Last-known-good response persisted in localStorage (offline starts
//      keep the most recently served links instead of regressing)
//   3. Baked-in untagged public signup pages (first run, nothing cached)
// ---------------------------------------------------------------------------

const REFETCH_INTERVAL_MS = 60 * 60 * 1000
const CACHE_KEY = 'pairlens.affiliate-links'

type CachedLinks = {
  /** Referral code the response was resolved for (null = none). */
  ref: string | null
  fetchedAt: number
  response: AffiliateLinksResponse
}

/** Last-known-good links, only honored when fetched for the same ref. */
function readCachedLinks(ref: string | null): AffiliateLinksResponse | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedLinks
    if (cached.ref !== ref) return null
    if (!cached.response || typeof cached.response.links !== 'object')
      return null
    return cached.response
  } catch {
    return null
  }
}

function writeCachedLinks(
  ref: string | null,
  response: AffiliateLinksResponse,
): void {
  try {
    const cached: CachedLinks = { ref, fetchedAt: Date.now(), response }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Cache is best-effort; the baked-in defaults still cover us
  }
}

async function fetchAffiliateLinks(
  ref: string | null,
): Promise<AffiliateLinksResponse> {
  const url = new URL('/api/affiliate-links', appServerUrl)
  if (ref) url.searchParams.set('ref', ref)
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`affiliate-links ${response.status}`)
  const body = (await response.json()) as AffiliateLinksResponse
  writeCachedLinks(ref, body)
  return body
}

export function useAffiliateLinks(): {
  /** Resolved signup URL for a venue (always returns something usable). */
  getSignupUrl: (venue: string) => string | null
  links: Record<string, ResolvedAffiliateLink>
} {
  const ref = getReferralCode()
  const { data } = useQuery({
    queryKey: ['affiliate-links', ref],
    queryFn: () => fetchAffiliateLinks(ref),
    // Show the last-known-good links immediately while (re)fetching
    placeholderData: () => readCachedLinks(ref) ?? undefined,
    staleTime: REFETCH_INTERVAL_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    retry: 1,
  })

  const links =
    data?.links ?? readCachedLinks(ref)?.links ?? defaultAffiliateLinks()
  return {
    links,
    getSignupUrl: (venue: string) => links[venue]?.url ?? null,
  }
}
