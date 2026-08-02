// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  WebSearchResponse,
  WebSearchResult,
} from '@pairlens/shared/plugin-types'

// Shared helpers for ai:web-search provider plugins backed by single-query
// search APIs (Tavily, Exa, …). The host sends a WebSearchRequest with an
// objective plus focused queries; these providers fan the queries out in
// parallel and merge the results.

const DEFAULT_MAX_RESULTS = 10
const MAX_RESULTS_CAP = 20
const MAX_QUERIES = 4

/** Extract queries + result budget from a WebSearchRequest's raw params. */
export function readSearchRequest(p: Record<string, unknown>): {
  queries: Array<string>
  maxResults: number
} {
  const rawQueries = Array.isArray(p['search_queries'])
    ? p['search_queries'].filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0,
      )
    : []
  const objective =
    typeof p['objective'] === 'string' ? p['objective'].trim() : ''
  // Single-query APIs work best with the focused queries; the objective is
  // the fallback when the host sends none
  const queries =
    rawQueries.length > 0
      ? rawQueries.slice(0, MAX_QUERIES)
      : objective
        ? [objective.slice(0, 300)]
        : []
  const rawMax = p['max_results']
  const maxResults =
    typeof rawMax === 'number' && rawMax >= 1
      ? Math.min(MAX_RESULTS_CAP, Math.floor(rawMax))
      : DEFAULT_MAX_RESULTS
  return { queries, maxResults }
}

/**
 * Run one search per query in parallel and merge into a WebSearchResponse
 * (deduped by URL, capped at maxResults). Partial query failures are
 * tolerated; if EVERY query fails the first error is thrown so the host
 * can surface it (e.g. an invalid API key).
 */
export async function fanOutWebSearch(
  queries: Array<string>,
  maxResults: number,
  searchOne: (
    query: string,
    perQueryLimit: number,
  ) => Promise<Array<WebSearchResult>>,
): Promise<WebSearchResponse> {
  if (queries.length === 0) return { results: [] }

  const perQuery = Math.max(1, Math.ceil(maxResults / queries.length))
  const settled = await Promise.allSettled(
    queries.map((q) => searchOne(q, perQuery)),
  )

  const seen = new Set<string>()
  const results: Array<WebSearchResult> = []
  const errors: Array<unknown> = []
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      errors.push(outcome.reason)
      continue
    }
    for (const r of outcome.value) {
      if (!r.url || seen.has(r.url)) continue
      seen.add(r.url)
      results.push(r)
    }
  }

  if (results.length === 0 && errors.length === settled.length) {
    const first = errors[0]
    throw first instanceof Error ? first : new Error(String(first))
  }

  return { results: results.slice(0, maxResults) }
}
