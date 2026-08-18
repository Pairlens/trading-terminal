// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The news feed's query layer: paging, error typing, and the state-to-view
 * mapping every news surface shares. Deliberately a leaf module with no React,
 * no i18n and no DOM, so the whole failure ladder is testable in bun.
 */
import type {
  NewsArticle,
  NewsFeedResponse,
  NewsUnavailableReason,
  NewsUnavailableResponse,
} from '@pairlens/shared/instrument-types'

/**
 * The news API returns pages of (at most) this many articles. A page that
 * comes back smaller means the feed is exhausted.
 */
export const NEWS_PAGE_SIZE = 50

/**
 * Far-past lower bound for paged requests — the API only honors `time_to`
 * when `time_from` is also present.
 */
export const NEWS_PAGE_TIME_FROM = '20220101T0000'

/** Compact UTC timestamp (YYYYMMDDTHHMM) used by /api/news time_from/time_to. */
export function toNewsTimeParam(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
}

/**
 * Merge infinite-query pages into one feed. `time_to` has minute granularity,
 * so consecutive pages overlap at the boundary minute — dedupe by URL.
 */
export function flattenNewsPages(
  pages: Array<NewsFeedResponse>,
): Array<NewsArticle> {
  const seen = new Set<string>()
  const out: Array<NewsArticle> = []
  for (const page of pages) {
    for (const article of page.articles) {
      if (seen.has(article.url)) continue
      seen.add(article.url)
      out.push(article)
    }
  }
  return out
}

/**
 * Next `time_to` cursor: the oldest article's minute (inclusive, so nothing
 * published within that minute is skipped — dedupe absorbs the overlap).
 * Returns null when the page was short (feed exhausted); the caller must
 * also stop when the cursor stops advancing (≥50 articles in one minute).
 */
export function nextNewsPageParam(lastPage: NewsFeedResponse): string | null {
  if (lastPage.articles.length < NEWS_PAGE_SIZE) return null
  // Scan for the true minimum — under RELEVANCE sort pages aren't chronological.
  let oldest: string | null = null
  for (const article of lastPage.articles) {
    if (!oldest || article.timePublished < oldest)
      oldest = article.timePublished
  }
  return oldest ? toNewsTimeParam(oldest) : null
}

/**
 * The feed provider failed us — distinct from a feed that came back empty.
 * Carries the App Server's reason so the pane can say which kind of failure
 * it was instead of a flat "try again later".
 */
export class NewsUnavailableError extends Error {
  readonly reason: NewsUnavailableReason

  constructor(reason: NewsUnavailableReason) {
    super(`News unavailable: ${reason}`)
    this.name = 'NewsUnavailableError'
    this.reason = reason
  }
}

/**
 * Fetch one page of the feed.
 *
 * `usePluginFetch` hands back the raw Response without checking status, so a
 * 5xx body would otherwise be stored as a page and then crash the render in
 * flattenNewsPages, where `articles` is undefined. Failures throw instead, so
 * TanStack Query routes them to the pane's error branch.
 */
export async function fetchNewsPage(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  query: string,
): Promise<NewsFeedResponse> {
  const res = await apiFetch(`/api/news${query ? `?${query}` : ''}`)

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as NewsUnavailableResponse | null
    throw new NewsUnavailableError(body?.reason ?? 'upstream_error')
  }

  const page = (await res.json()) as NewsFeedResponse
  // A 200 that isn't a feed is still the provider failing, just more quietly.
  if (!Array.isArray(page.articles)) {
    throw new NewsUnavailableError('upstream_error')
  }
  return page
}

// ── State-to-view mapping ───────────────────────────────────────────

/** Structural subset of TanStack Query's fetchStatus. */
export type NewsFeedFetchStatus = 'fetching' | 'paused' | 'idle'

/** Which of the feed's four bodies a surface should render. */
export type NewsFeedView = 'loading' | 'unavailable' | 'empty' | 'articles'

/**
 * Map query state to what the pane shows. One rule matters and it is the bug
 * this function exists to pin down: a query that has never answered is
 * LOADING, whatever its fetchStatus. `isLoading` alone gets this wrong: it is
 * true only while a fetch is actively in flight, and a pending query can have
 * nothing in flight at all. The retry backoff pauses while the tab is hidden
 * (a 503's second attempt parks on the focus gate), and a cancelled fetch
 * reverts to idle. Both used to fall through to "No news found", claiming an
 * empty feed off a feed that never answered. The empty state is reserved for
 * a real answer with nothing in it.
 */
export function newsFeedView(state: {
  /** TanStack `isPending`: no data yet and no error yet. */
  isPending: boolean
  error: unknown
  /** Length of the article list the surface is about to render. */
  articleCount: number
}): NewsFeedView {
  if (state.isPending) return 'loading'
  if (state.error) return 'unavailable'
  if (state.articleCount === 0) return 'empty'
  return 'articles'
}

/**
 * True when the query sits pending with nothing in flight and nothing
 * scheduled: the cancelled-and-reverted state. Nothing revives it on its own
 * (a paused retry resumes itself on focus; this does not), so the surface
 * showing skeletons for it must also kick a refetch or the skeletons are a
 * forever-spinner. `useNewsFeedResume` in news-shared is that kick.
 */
export function newsFeedStalled(state: {
  isPending: boolean
  fetchStatus: NewsFeedFetchStatus
}): boolean {
  return state.isPending && state.fetchStatus === 'idle'
}
