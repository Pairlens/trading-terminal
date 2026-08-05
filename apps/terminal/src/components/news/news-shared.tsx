// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Minus, Newspaper, TrendingDown, TrendingUp } from 'lucide-react'
import type {
  NewsArticle,
  NewsFeedResponse,
  NewsUnavailableReason,
  NewsUnavailableResponse,
} from '@pairlens/shared/instrument-types'

import { formatRelativeTime } from '@/lib/format-time'
import i18n from '@/lib/i18n'

export { formatRelativeTime }

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

  const reason =
    error instanceof NewsUnavailableError
      ? error.reason
      : error
        ? 'error'
        : null

  const title = reason ? t('news.unavailable') : t('news.noneFound')
  const body = !reason
    ? emptyBody
    : reason === 'not_configured'
      ? t('news.unavailableNotConfigured')
      : reason === 'rate_limited'
        ? t('news.unavailableRateLimited')
        : t('news.unavailableUpstream')

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
  'economy_macro',
] as const

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
