// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  AlertTriangle,
  Loader2,
  Minus,
  Newspaper,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { NewsArticle } from '@pairlens/shared/instrument-types'

import type { NewsFeedFetchStatus } from '@/components/news/news-feed-state'
import {
  NewsUnavailableError,
  anchorNewsFeed,
  newsFeedStalled,
  shouldAutofillNewsFeed,
} from '@/components/news/news-feed-state'
import { formatRelativeTime } from '@/lib/format-time'
import i18n from '@/lib/i18n'

export { formatRelativeTime }

// The query layer (paging, error typing, the state-to-view mapping) lives in
// news-feed-state.ts, a leaf module with no React and no i18n so it is
// testable in bun. Re-exported here so surfaces keep one import.
export {
  NEWS_AUTOFILL_MAX_PAGES,
  NEWS_MIN_FILLED_ROWS,
  NEWS_PAGE_SIZE,
  NEWS_PAGE_TIME_FROM,
  NEWS_POLL_INTERVAL_MS,
  NEWS_POLL_MAX_PAGES,
  NewsUnavailableError,
  anchorNewsFeed,
  fetchNewsPage,
  flattenNewsPages,
  newsFeedStalled,
  newsFeedView,
  newsPollInterval,
  nextNewsPageParam,
  shouldAutofillNewsFeed,
  toNewsTimeParam,
} from '@/components/news/news-feed-state'
export type {
  NewsFeedFetchStatus,
  NewsFeedView,
} from '@/components/news/news-feed-state'

/**
 * Re-kick a feed query that got cancelled mid-fetch and reverted to
 * pending+idle. In that state nothing is in flight and nothing is scheduled,
 * so the skeletons the pane shows for it would otherwise never resolve. A
 * paused retry is deliberately left alone: the retryer resumes itself the
 * moment the tab regains focus. `enabled` mirrors the query's own `enabled`,
 * because refetch() ignores it and would fetch a disabled query.
 */
export function useNewsFeedResume(
  feed: {
    isPending: boolean
    fetchStatus: NewsFeedFetchStatus
    refetch: () => unknown
  },
  enabled = true,
): void {
  const { isPending, fetchStatus, refetch } = feed
  useEffect(() => {
    if (enabled && newsFeedStalled({ isPending, fetchStatus })) void refetch()
  }, [enabled, isPending, fetchStatus, refetch])
}

/**
 * Let a feed fill its own column.
 *
 * A news pane used to load exactly one page and then sit there: with a scope
 * that filters client-side, that was four rows over an empty pane, and the
 * only thing that ever asked for page two was the READER — so the list grew
 * because you opened an article, which is a strange thing for a list to do.
 * This asks for the next page while the column is short, bounded by
 * `shouldAutofillNewsFeed` so it can neither outrun the poll nor spin on a
 * feed that has nothing left to give.
 */
export function useNewsFeedAutofill(feed: {
  hasNextPage: boolean
  isFetching: boolean
  pageCount: number
  rowCount: number
  fetchNextPage: () => unknown
}): void {
  const { hasNextPage, isFetching, pageCount, rowCount, fetchNextPage } = feed
  useEffect(() => {
    if (
      shouldAutofillNewsFeed({ hasNextPage, isFetching, pageCount, rowCount })
    )
      void fetchNextPage()
  }, [hasNextPage, isFetching, pageCount, rowCount, fetchNextPage])
}

/**
 * Page older stories in as the reader reaches the end of the list.
 *
 * The observer is built ONCE per sentinel element and reads its state through
 * a ref, which is the part that matters: rebuilding it on every state change
 * would re-fire against a sentinel that is still on screen, and a filtered
 * feed would chain page after page without anyone scrolling. Built once, it
 * only fires on a real crossing — the reader scrolled the sentinel into view.
 * A column too short to scroll therefore never fires it at all; that case
 * belongs to `useNewsFeedAutofill` above, and to the footer's own button once
 * the fill bound is spent.
 */
export function useNewsFeedEndSentinel(load: {
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}): (el: HTMLElement | null) => void {
  const stateRef = useRef(load)
  stateRef.current = load
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        const state = stateRef.current
        if (state.hasMore && !state.isLoadingMore) state.onLoadMore()
      },
      // Start the request a little before the last row, so the rows land
      // under the scroll rather than after it.
      { rootMargin: '300px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinel])

  return useCallback((el: HTMLElement | null) => setSentinel(el), [])
}

/**
 * What sits under the last row: the sentinel that pages on scroll, and the
 * button that pages when there is nothing left to scroll.
 *
 * The button is not a fallback for a broken observer — it is the only way out
 * of a column that a narrow scope keeps shorter than its own viewport, where
 * no scroll can ever happen. Renders nothing once the wire is exhausted; a
 * "caught up" line under a scanning column would be chrome, not information.
 */
export function NewsFeedEnd({
  hasMore,
  isLoadingMore,
  onLoadMore,
  className,
}: {
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const sentinelRef = useNewsFeedEndSentinel({
    hasMore,
    isLoadingMore,
    onLoadMore,
  })

  if (!hasMore) return null

  return (
    <div
      ref={sentinelRef}
      className={cn('flex items-center justify-center px-3.5 py-3', className)}
    >
      {isLoadingMore ? (
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('news.reader.loadingMore', 'Loading more news...')}
        </span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          {t('news.reader.loadOlder', 'Load older news')}
        </button>
      )}
    </div>
  )
}

/**
 * Hold a live feed steady for a reader that pages by index.
 *
 * The feed polls, so stories arrive at its head while a reader is open, and
 * every one of them would shift the index the reader is sitting on. This pins
 * the array to the story that led it when the reader mounted; see
 * `anchorNewsFeed` for why that is the right cut. Paging still extends it,
 * because paging appends.
 */
export function useNewsFeedAnchor(
  articles: Array<NewsArticle>,
): Array<NewsArticle> {
  // Latched on the first render that has a feed, not on mount: a reader can
  // out-render its own first page, and anchoring to nothing would leave it
  // shifting again the moment stories arrived.
  const anchorRef = useRef<string | undefined>(undefined)
  if (!anchorRef.current) anchorRef.current = articles[0]?.url
  return useMemo(() => anchorNewsFeed(articles, anchorRef.current), [articles])
}

/** Why the feed could not be served, in one localized line. */
function useUnavailableBody(error: unknown): string | null {
  const { t } = useTranslation()
  if (!error) return null
  const reason = error instanceof NewsUnavailableError ? error.reason : 'error'
  return reason === 'not_configured'
    ? t('news.unavailableNotConfigured')
    : reason === 'rate_limited'
      ? t('news.unavailableRateLimited')
      : t('news.unavailableUpstream')
}

/**
 * The marker a feed wears when its last refresh failed but its stories stand.
 *
 * A polling feed cannot blank itself over one bad request (see `newsFeedView`),
 * and it also cannot pass old headlines off as current. So the timestamp beside
 * it keeps saying how old they are, and this says why it stopped moving.
 */
export function NewsRefreshError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const body = useUnavailableBody(error)
  if (!body) return null
  return (
    <span
      className="flex shrink-0 items-center text-muted-foreground"
      title={`${t('news.unavailable')}: ${body}`}
      aria-label={`${t('news.unavailable')}: ${body}`}
      role="status"
    >
      <AlertTriangle className="size-3.5" />
    </span>
  )
}

/**
 * The feed's non-article state: provider down, or simply nothing matched.
 * `emptyBody` is the caller's own "nothing matched" line — the browse pane
 * blames the filters, the symbol pane names the symbol.
 */
export function NewsFeedStatus({
  error,
  emptyBody,
}: {
  error: unknown
  emptyBody: string
}) {
  const { t } = useTranslation()
  const unavailableBody = useUnavailableBody(error)

  const title = unavailableBody ? t('news.unavailable') : t('news.noneFound')
  const body = unavailableBody ?? emptyBody

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <Newspaper className="mb-3 size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

export const TOPIC_OPTIONS = [
  'blockchain',
  'technology',
  'finance',
  'financial_markets',
  'earnings',
  'economy_macro',
] as const

/** The two topics the discovery pane's chips send, named once. */
export const NEWS_TOPIC_MACRO = 'economy_macro'
export const NEWS_TOPIC_EARNINGS = 'earnings'

/** Localized topic label; unknown topics fall back to title-cased slug. */
export function formatTopicLabel(topic: string): string {
  const fallback = topic
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return i18n.t(`news.topic.${topic}`, fallback)
}

export type SentimentDirection = 'bullish' | 'bearish' | 'neutral'

/** Bucket an API sentiment label ("Somewhat-Bullish", ...) into a direction. */
export function sentimentDirection(label: string): SentimentDirection {
  const lower = label.toLowerCase()
  if (lower.includes('bullish')) return 'bullish'
  if (lower.includes('bearish')) return 'bearish'
  return 'neutral'
}

/** Shared bullish/bearish/neutral color classes, keyed to the --up/--down tokens. */
export const SENTIMENT_BADGE_CLASSES: Record<SentimentDirection, string> = {
  bullish: 'border-up/40 bg-up/15 text-up',
  bearish: 'border-down/40 bg-down/15 text-down',
  neutral: 'border-border bg-muted/60 text-muted-foreground',
}

/** Text-only tones — sentiment that colors a line of type rather than a block. */
export const SENTIMENT_TEXT_CLASSES: Record<SentimentDirection, string> = {
  bullish: 'text-up',
  bearish: 'text-down',
  neutral: 'text-muted-foreground',
}

const SENTIMENT_ICONS: Record<
  SentimentDirection,
  typeof TrendingUp | typeof TrendingDown | typeof Minus
> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
}

const SENTIMENT_FALLBACK_WORDS: Record<SentimentDirection, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
}

/** Localized direction word — the feed's own label ("Somewhat-Bullish") is English-only. */
export function sentimentWord(direction: SentimentDirection): string {
  return i18n.t(
    `news.sentiment.${direction}`,
    SENTIMENT_FALLBACK_WORDS[direction],
  )
}

/** Signed score, P&L-style: +0.24 / -0.31 — the sign repeats the direction. */
function formatSentimentScore(score: number): string {
  return `${score > 0 ? '+' : ''}${score.toFixed(2)}`
}

/**
 * The bearish→bullish scale, shrunk to a glyph that fits inside a line of type.
 * Same reading as a full meter — which side of neutral, and how far — from a
 * hairline track with the neutral center marked and a bar running from that
 * center out to the article's score. Colors come from `currentColor`, so it
 * inherits the direction tone of the tag it sits in.
 */
function SentimentScale({ score }: { score: number }) {
  const pct = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100
  return (
    <span
      className="relative inline-block h-[3px] w-12 shrink-0 rounded-full"
      aria-hidden
    >
      <span className="absolute inset-0 rounded-full bg-current opacity-25" />
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current opacity-50" />
      <span
        className="absolute inset-y-0 rounded-full bg-current"
        style={{
          left: `${Math.min(50, pct)}%`,
          // A floor keeps a near-neutral score visible as a tick, not nothing.
          width: `${Math.max(Math.abs(pct - 50), 4)}%`,
        }}
      />
    </span>
  )
}

/**
 * Sentiment as one item in an article's meta line: direction arrow, word, the
 * scale, and the raw score. Two variants, same reading:
 *
 * - `inline` — no chrome at all, so it joins source/timestamp as a peer and
 *   the headline keeps the eye.
 * - `overlay` — the minimum backing needed to stay legible over a banner.
 *
 * The feed's own gradation ("Somewhat-Bullish") rides along as a tooltip; the
 * scale and score carry that nuance in a form a trader reads faster.
 */
export function SentimentTag({
  label,
  score,
  scale = false,
  variant = 'inline',
  className,
}: {
  label: string
  score?: number
  /** Show the bearish→bullish scale between the word and the score. */
  scale?: boolean
  variant?: 'inline' | 'overlay'
  className?: string
}) {
  const direction = sentimentDirection(label)
  const Icon = SENTIMENT_ICONS[direction]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap font-medium',
        SENTIMENT_TEXT_CLASSES[direction],
        variant === 'overlay' &&
          'rounded-full bg-background/75 px-1.5 py-0.5 text-[10px] backdrop-blur-sm',
        className,
      )}
      title={label.replace(/[-_]/g, ' ')}
    >
      <Icon className="size-3 shrink-0" />
      {sentimentWord(direction)}
      {score !== undefined && (
        <>
          {scale && <SentimentScale score={score} />}
          <span className="tabular-nums opacity-70">
            {formatSentimentScore(score)}
          </span>
        </>
      )}
    </span>
  )
}

/**
 * News banner image with a graceful fallback. Many feed images are hotlinked
 * from publishers and 404 over time — rather than surfacing the browser's
 * broken-image glyph, we swap in an on-brand gradient placeholder.
 */
export function ArticleBanner({
  src,
  imgClassName,
  fallbackClassName,
  eager,
}: {
  src: string
  imgClassName: string
  fallbackClassName: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-muted via-muted/50 to-muted/20',
          fallbackClassName,
        )}
        aria-hidden
      >
        <Newspaper
          className="size-7 text-muted-foreground/30"
          strokeWidth={1.5}
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      className={imgClassName}
      loading={eager ? undefined : 'lazy'}
      alt=""
      onError={() => setFailed(true)}
    />
  )
}

// ── Compact row (the discovery boards' feed) ────────────────────────
//
// A sibling of `ArticleCard`, not a replacement: the reader still wants the
// banner, the summary and the topic badges, because reading is what it is for.
// A 26%-wide column beside a movers table is for scanning, and the two things
// a scanner needs from a story are which of the reader's assets it is about
// and how that asset moved. So the row drops the image and the summary and
// spends the space it saves on a live price tag.

/**
 * The plain ticker inside a feed symbol.
 *
 * The provider namespaces non-equity symbols ("CRYPTO:BTC", "FOREX:USD"), so
 * a raw compare against a watchlist of bases misses every crypto mention —
 * which on the spot board is all of them.
 */
export function newsTickerBase(ticker: string): string {
  const colon = ticker.lastIndexOf(':')
  return (colon === -1 ? ticker : ticker.slice(colon + 1)).trim().toUpperCase()
}

/**
 * A feed symbol with its namespace still attached.
 *
 * `base` is what a reader sees and what a price map is keyed by; `raw` is what
 * says which KIND of asset it is. Both are needed, because tickers collide
 * across asset classes: CFG is Citizens Financial Group on the wire and
 * Centrifuge in a crypto snapshot, and joining one to the other puts a token's
 * percentage next to a bank's earnings headline.
 */
export type NewsTickerRef = { raw: string; base: string }

/** True when the provider namespaced this symbol as crypto ("CRYPTO:BTC"). */
export function isCryptoNewsTicker(raw: string): boolean {
  return raw.trim().toUpperCase().startsWith('CRYPTO:')
}

/** True for a bare symbol, which is how the provider spells a listed equity. */
export function isEquityNewsTicker(raw: string): boolean {
  return !raw.includes(':')
}

/** The symbol an article is most about, by the provider's own relevance. */
export function topNewsTicker(article: NewsArticle): NewsTickerRef | null {
  let best: NewsArticle['tickerSentiment'][number] | null = null
  for (const entry of article.tickerSentiment) {
    // Strictly greater, so a tie keeps the provider's own ordering.
    if (!best || entry.relevanceScore > best.relevanceScore) best = entry
  }
  return best ? { raw: best.ticker, base: newsTickerBase(best.ticker) } : null
}

/** The row's mono lead: a symbol with its live move, or the best label left. */
export type ArticleRowTag = {
  label: string
  /** 24h move of `label`, when the board is streaming one. */
  changePct: number | null
}

/**
 * What the row leads with.
 *
 * A symbol with a live percentage is the whole point, so it wins whenever one
 * can be joined. Failing that the row still has to say what kind of story it
 * is: a macro print is labelled MACRO (it moves everything, so no one ticker
 * would be honest), an unpriced symbol still names itself, and a story about
 * nothing tradeable falls back to who published it. Never an empty tag.
 */
export function newsRowTag(
  article: NewsArticle,
  changeFor: (ticker: NewsTickerRef) => number | null | undefined,
): ArticleRowTag {
  const ticker = topNewsTicker(article)
  if (ticker) {
    const change = changeFor(ticker)
    if (typeof change === 'number' && Number.isFinite(change)) {
      return { label: ticker.base, changePct: change }
    }
  }
  if (article.topics.some((topic) => topic.topic === NEWS_TOPIC_MACRO)) {
    return { label: 'MACRO', changePct: null }
  }
  return { label: ticker?.base ?? article.source, changePct: null }
}

/**
 * How many of the reader's own symbols this story names.
 *
 * Deduped by base, because "CRYPTO:BTC" and "BTC" are one mention of one
 * asset. The count is what makes a macro headline actionable: "moves 41 of
 * your pairs" is a reason to stop scrolling, "US CPI prints 0.2%" is not.
 */
export function countWatchedMentions(
  article: NewsArticle,
  watchedBases: ReadonlySet<string>,
): number {
  if (watchedBases.size === 0) return 0
  const seen = new Set<string>()
  for (const entry of article.tickerSentiment) {
    const base = newsTickerBase(entry.ticker)
    if (watchedBases.has(base)) seen.add(base)
  }
  return seen.size
}

/** Below this a "mentions N of your pairs" line is noise, not a signal. */
export const MENTIONS_THRESHOLD = 2

const RAIL_CLASSES: Record<SentimentDirection, string> = {
  bullish: 'bg-up',
  bearish: 'bg-down',
  neutral: 'bg-muted-foreground/40',
}

export function ArticleRowSkeleton() {
  return (
    <div className="flex gap-2.5 border-b border-border/50 px-3.5 py-2.5">
      <span className="w-[3px] shrink-0 rounded-sm bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

/**
 * One story, two lines of type and a colored edge.
 *
 * The rail is the article's SENTIMENT and the tag is the asset's MOVE, which
 * are deliberately allowed to disagree: bearish news on a name that is up is
 * exactly the row worth stopping on, and collapsing both into one color would
 * hide it.
 */
export function ArticleRow({
  article,
  tag,
  mentions = 0,
  onClick,
}: {
  article: NewsArticle
  tag: ArticleRowTag
  /** Watchlist symbols this story names; rendered past MENTIONS_THRESHOLD. */
  mentions?: number
  onClick: () => void
}) {
  const { t } = useTranslation()
  const direction = sentimentDirection(article.overallSentimentLabel)
  const change = tag.changePct

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-2.5 border-b border-border/50 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40"
    >
      <span
        className={cn('w-[3px] shrink-0 rounded-sm', RAIL_CLASSES[direction])}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'truncate font-mono text-[11px] font-semibold tabular-nums',
              change == null
                ? 'text-muted-foreground'
                : change >= 0
                  ? 'text-up'
                  : 'text-down',
            )}
          >
            {tag.label}
            {change != null &&
              ` ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            &middot; {formatRelativeTime(article.timePublished)}
          </span>
        </span>
        <span className="block text-pretty text-[13px] font-medium leading-snug">
          {article.title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {article.source}
          {mentions >= MENTIONS_THRESHOLD &&
            ` · ${t('news.mentionsPairs', { count: mentions })}`}
        </span>
      </span>
    </button>
  )
}

export function ArticleCardSkeleton() {
  return (
    <div className="mb-3 break-inside-avoid space-y-2 rounded-lg border p-3">
      <div className="h-28 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="space-y-1">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

export function ArticleCard({
  article,
  onClick,
}: {
  article: NewsArticle
  onClick: () => void
}) {
  return (
    <div
      className="mb-3 break-inside-avoid cursor-pointer overflow-hidden rounded-lg border transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      {article.bannerImage && (
        <div className="relative">
          <ArticleBanner
            src={article.bannerImage}
            imgClassName="max-h-40 w-full object-cover"
            fallbackClassName="h-28 w-full"
          />
          <SentimentTag
            label={article.overallSentimentLabel}
            score={article.overallSentimentScore}
            variant="overlay"
            className="absolute right-2 top-2"
          />
        </div>
      )}
      <div className="space-y-2 p-3">
        <span className="text-sm font-bold">{article.title}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{article.source}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(article.timePublished)}</span>
          {!article.bannerImage && (
            <>
              <span>&middot;</span>
              <SentimentTag
                label={article.overallSentimentLabel}
                score={article.overallSentimentScore}
              />
            </>
          )}
        </div>
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {article.summary}
        </p>
        {article.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.topics.map((t) => (
              <Badge key={t.topic} variant="secondary" className="text-[10px]">
                {formatTopicLabel(t.topic)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
