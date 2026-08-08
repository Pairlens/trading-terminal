// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The reader's arithmetic, with no DOM in it.
 *
 * A snap feed is three small decisions repeated on every frame — which slide
 * the scroll offset means, what the counter should read, and whether the next
 * page is due — and all three are the kind of thing that is wrong by one until
 * a test says otherwise. Keeping them here means the screen file holds layout
 * and gestures only.
 */
import type { NewsArticle } from '@pairlens/shared/instrument-types'

/** How many slides ahead of the current one may trigger a background fetch. */
export const LOAD_AHEAD = 3

/**
 * The reader's search: title, summary, source and any mentioned ticker. Same
 * fields the desktop reader matched on, case-insensitive, trimmed by the
 * caller. An empty query returns the input array itself, so a non-searching
 * feed never re-renders for a new identity.
 */
export function filterNewsArticles(
  articles: Array<NewsArticle>,
  query: string,
): Array<NewsArticle> {
  const needle = query.trim().toLowerCase()
  if (!needle) return articles
  return articles.filter(
    (article) =>
      article.title.toLowerCase().includes(needle) ||
      article.summary.toLowerCase().includes(needle) ||
      article.source.toLowerCase().includes(needle) ||
      article.tickerSentiment.some((ticker) =>
        ticker.ticker.toLowerCase().includes(needle),
      ),
  )
}

/**
 * Which slide a scroll offset is on. Rounding (not flooring) is what makes the
 * counter flip at the half-way point of a drag rather than the moment the
 * previous story leaves — the number then agrees with what the eye reads as
 * "the story I am on" mid-gesture, which is the whole point of the counter.
 */
export function slideIndexFromScroll(
  scrollTop: number,
  slideHeight: number,
): number {
  if (slideHeight <= 0) return 0
  return Math.max(0, Math.round(scrollTop / slideHeight))
}

/**
 * The "9 / 50+" position line. The plus is the honest part: the feed pages, so
 * the total is a floor, not a count. Past the last story (the status slide)
 * the counter holds at the last story rather than reading one-too-many.
 */
export function feedCounter(
  activeIndex: number,
  total: number,
  hasMore: boolean,
): string {
  if (total <= 0) return '0 / 0'
  const current = Math.min(Math.max(activeIndex + 1, 1), total)
  return `${current} / ${total}${hasMore ? '+' : ''}`
}

/**
 * Whether the reader should ask for an older page.
 *
 * While a search is active this is always false: the matches are filtered out
 * of what is already loaded, so a rare query would otherwise walk the whole
 * archive one page per frame. Searching pages manually from the status slide.
 */
export function shouldLoadOlder(input: {
  activeIndex: number
  loaded: number
  hasMore: boolean
  isLoadingMore: boolean
  searching: boolean
}): boolean {
  if (!input.hasMore || input.isLoadingMore || input.searching) return false
  return input.loaded - input.activeIndex <= LOAD_AHEAD
}
