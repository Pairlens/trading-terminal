// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Minus, Newspaper, TrendingDown, TrendingUp } from 'lucide-react'
import type {
  NewsArticle,
  NewsFeedResponse,
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

const SENTIMENT_ICONS: Record<
  SentimentDirection,
  typeof TrendingUp | typeof TrendingDown | typeof Minus
> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
}

export function SentimentBadge({
  label,
  size = 'sm',
  className,
}: {
  label: string
  size?: 'sm' | 'lg'
  className?: string
}) {
  const direction = sentimentDirection(label)
  const Icon = SENTIMENT_ICONS[direction]

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-semibold',
        size === 'sm' ? 'text-[10px]' : 'h-6 px-2.5 text-xs',
        SENTIMENT_BADGE_CLASSES[direction],
        className,
      )}
    >
      <Icon className={cn(size === 'lg' && 'size-3.5!')} />
      {label.replace(/_/g, ' ')}
    </Badge>
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
  const direction = sentimentDirection(article.overallSentimentLabel)
  return (
    <div
      className={cn(
        'mb-3 break-inside-avoid cursor-pointer overflow-hidden rounded-lg border border-l-2 transition-colors hover:bg-accent/50',
        direction === 'bullish' && 'border-l-up',
        direction === 'bearish' && 'border-l-down',
        direction === 'neutral' && 'border-l-muted-foreground/30',
      )}
      onClick={onClick}
    >
      {article.bannerImage && (
        <div className="relative">
          <ArticleBanner
            src={article.bannerImage}
            imgClassName="max-h-40 w-full object-cover"
            fallbackClassName="h-28 w-full"
          />
          <SentimentBadge
            label={article.overallSentimentLabel}
            className="absolute right-2 top-2 shadow-md backdrop-blur-sm"
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
            <SentimentBadge label={article.overallSentimentLabel} />
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
