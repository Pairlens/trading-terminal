// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@pairlens/ui/components/ui/sheet'
import { Clock, ExternalLink, Newspaper, User } from 'lucide-react'
import type { NewsArticle } from '@pairlens/shared/instrument-types'

import { formatRelativeTime } from '@/lib/format-time'
import i18n from '@/lib/i18n'

export { formatRelativeTime }

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

export function SentimentBadge({ label }: { label: string }) {
  const lower = label.toLowerCase()
  const isBullish = lower.includes('bullish')
  const isBearish = lower.includes('bearish')

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px]',
        isBullish && 'border-green-500/30 bg-green-500/10 text-green-500',
        isBearish && 'border-red-500/30 bg-red-500/10 text-red-500',
        !isBullish && !isBearish && 'text-muted-foreground',
      )}
    >
      {label.replace(/_/g, ' ')}
    </Badge>
  )
}

/**
 * News banner image with a graceful fallback. Many feed images are hotlinked
 * from publishers and 404 over time — rather than surfacing the browser's
 * broken-image glyph, we swap in an on-brand gradient placeholder.
 */
function ArticleBanner({
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
        <ArticleBanner
          src={article.bannerImage}
          imgClassName="max-h-40 w-full object-cover"
          fallbackClassName="h-28 w-full"
        />
      )}
      <div className="space-y-2 p-3">
        <span className="text-sm font-bold">{article.title}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{article.source}</span>
          <span>&middot;</span>
          <span>{formatRelativeTime(article.timePublished)}</span>
          <SentimentBadge label={article.overallSentimentLabel} />
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

export function ArticleDetail({
  article,
  onClose,
}: {
  article: NewsArticle
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="gap-3">
          <SheetTitle className="pr-8 text-base leading-snug">
            {article.title}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t('news.articleDetails')}
          </SheetDescription>
        </SheetHeader>

        {/* Banner image */}
        {article.bannerImage && (
          <div className="px-4">
            <ArticleBanner
              src={article.bannerImage}
              imgClassName="max-h-52 w-full rounded-lg object-cover"
              fallbackClassName="h-40 w-full rounded-lg"
              eager
            />
          </div>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{article.source}</span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatRelativeTime(article.timePublished)}
          </span>
          {article.authors.length > 0 && (
            <span className="flex items-center gap-1">
              <User className="size-3" />
              {article.authors.join(', ')}
            </span>
          )}
          <SentimentBadge label={article.overallSentimentLabel} />
        </div>

        {/* Full summary */}
        <p className="px-4 text-sm leading-relaxed text-muted-foreground">
          {article.summary}
        </p>

        {/* Topics */}
        {article.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4">
            {article.topics.map((articleTopic) => (
              <Badge
                key={articleTopic.topic}
                variant="secondary"
                className="text-xs"
              >
                {formatTopicLabel(articleTopic.topic)}
              </Badge>
            ))}
          </div>
        )}

        {/* Ticker sentiments */}
        {article.tickerSentiment.length > 0 && (
          <div className="space-y-1.5 px-4">
            <span className="text-xs font-medium text-muted-foreground">
              {t('news.tickerSentiment')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {article.tickerSentiment.map((ts) => (
                <Badge
                  key={ts.ticker}
                  variant="outline"
                  className={cn(
                    'text-xs',
                    ts.sentimentLabel.toLowerCase().includes('bullish') &&
                      'border-green-500/30 bg-green-500/10 text-green-500',
                    ts.sentimentLabel.toLowerCase().includes('bearish') &&
                      'border-red-500/30 bg-red-500/10 text-red-500',
                  )}
                >
                  {ts.ticker} · {ts.sentimentLabel.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Visit article button */}
        <div className="mt-auto px-4 pb-4 pt-2">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="size-4" />
            {t('news.visitArticle')}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}
