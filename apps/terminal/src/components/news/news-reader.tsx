// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Newspaper,
  Search,
  User,
} from 'lucide-react'
import type { NewsArticle } from '@pairlens/shared/instrument-types'

import {
  ArticleBanner,
  SENTIMENT_BADGE_CLASSES,
  SentimentBadge,
  formatRelativeTime,
  formatTopicLabel,
  sentimentDirection,
} from '@/components/news/news-shared'

/** How many slides ahead of the current one may trigger a background page fetch. */
const LOAD_AHEAD = 3

/**
 * Where this article sits on the bearish→bullish scale. The sentiment score
 * from the feed lives in roughly [-1, 1] with ±0.15 as the neutral band.
 */
function SentimentMeter({ score, label }: { score: number; label: string }) {
  const { t } = useTranslation()
  const direction = sentimentDirection(label)
  const pct = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t('news.reader.sentiment', 'Sentiment')}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            direction === 'bullish' && 'text-up',
            direction === 'bearish' && 'text-down',
            direction === 'neutral' && 'text-muted-foreground',
          )}
        >
          {score.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-muted to-up/50">
        <div
          className={cn(
            'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm',
            direction === 'bullish' && 'bg-up',
            direction === 'bearish' && 'bg-down',
            direction === 'neutral' && 'bg-muted-foreground',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
        <span>{t('news.reader.bearish', 'Bearish')}</span>
        <span>{t('news.reader.bullish', 'Bullish')}</span>
      </div>
    </div>
  )
}

const ReaderSlide = memo(function ReaderSlide({
  article,
  eager,
}: {
  article: NewsArticle
  eager: boolean
}) {
  const { t } = useTranslation()
  return (
    <article className="relative flex h-full snap-start snap-always flex-col">
      {/* Hero: banner with the title composited over a fade into the body */}
      <div className="relative h-2/5 shrink-0 overflow-hidden">
        {article.bannerImage ? (
          <ArticleBanner
            src={article.bannerImage}
            imgClassName="h-full w-full object-cover"
            fallbackClassName="h-full w-full"
            eager={eager}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-muted/50 to-muted/20"
            aria-hidden
          >
            <Newspaper
              className="size-10 text-muted-foreground/30"
              strokeWidth={1.5}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 px-6 pb-2 pr-14">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {article.source}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatRelativeTime(article.timePublished)}
            </span>
            <SentimentBadge label={article.overallSentimentLabel} size="lg" />
          </div>
          <h2 className="text-balance text-xl font-semibold leading-tight">
            {article.title}
          </h2>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pr-14">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {article.summary}
        </p>
        <SentimentMeter
          score={article.overallSentimentScore}
          label={article.overallSentimentLabel}
        />
        {article.authors.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3" />
            {article.authors.join(', ')}
          </p>
        )}
        {article.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
        {article.tickerSentiment.length > 0 && (
          <div className="space-y-1.5">
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
                    SENTIMENT_BADGE_CLASSES[
                      sentimentDirection(ts.sentimentLabel)
                    ],
                  )}
                >
                  {ts.ticker} · {ts.sentimentLabel.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t px-6 py-3">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <ExternalLink className="size-4" />
          {t('news.visitArticle')}
        </a>
        <span className="truncate text-xs text-muted-foreground">
          {article.sourceDomain}
        </span>
      </div>
    </article>
  )
})

/**
 * Full-screen-feel news reader: a centered dialog with a vertical
 * snap-scrolling feed, one article per viewport. Scrolling (or ↑/↓) snaps
 * between articles; nearing the end of the loaded feed pages in older news.
 */
export function NewsReaderDialog({
  articles,
  initialIndex,
  onClose,
  onEndReached,
  hasMore = false,
  isLoadingMore = false,
}: {
  articles: Array<NewsArticle>
  initialIndex: number
  onClose: () => void
  onEndReached?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
}) {
  const { t } = useTranslation()
  const feedRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(initialIndex)

  const trimmed = query.trim().toLowerCase()
  const searching = trimmed.length > 0

  const visible = useMemo(() => {
    if (!searching) return articles
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(trimmed) ||
        a.summary.toLowerCase().includes(trimmed) ||
        a.source.toLowerCase().includes(trimmed) ||
        a.tickerSentiment.some((ts) =>
          ts.ticker.toLowerCase().includes(trimmed),
        ),
    )
  }, [articles, searching, trimmed])

  // Slides = articles plus one status sentinel (loading / caught up).
  const lastSlideIndex = visible.length > 0 ? visible.length : 0

  const scrollToIndex = useCallback((idx: number) => {
    const el = feedRef.current
    if (!el) return
    const clamped = Math.max(0, idx)
    el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' })
  }, [])

  // Open on the clicked article without an animated fly-through. base-ui
  // mounts the portal content after the dialog component itself (and the feed
  // may not be measurable yet even then), so alignment hooks into the feed's
  // callback ref: align as soon as the element exists and has a height.
  const alignedRef = useRef(false)
  const setFeedRef = useCallback(
    (el: HTMLDivElement | null) => {
      feedRef.current = el
      if (!el || alignedRef.current) return
      if (initialIndex <= 0) {
        alignedRef.current = true
        return
      }
      if (el.clientHeight > 0) {
        el.scrollTop = initialIndex * el.clientHeight
        alignedRef.current = true
        return
      }
      const ro = new ResizeObserver(() => {
        if (el.clientHeight === 0) return
        el.scrollTop = initialIndex * el.clientHeight
        alignedRef.current = true
        ro.disconnect()
      })
      ro.observe(el)
      return () => ro.disconnect()
    },
    [initialIndex],
  )

  // A new search resets the feed to its first match.
  const prevQueryRef = useRef(trimmed)
  useEffect(() => {
    if (prevQueryRef.current === trimmed) return
    prevQueryRef.current = trimmed
    feedRef.current?.scrollTo({ top: 0 })
    setActiveIndex(0)
  }, [trimmed])

  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = feedRef.current
      if (!el || el.clientHeight === 0) return
      const idx = Math.round(el.scrollTop / el.clientHeight)
      setActiveIndex((prev) => (prev === idx ? prev : idx))
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Auto-page older news as the reader nears the end of the loaded feed.
  // While a search is active, paging is manual (the sentinel offers a button)
  // so a rare query can't hammer the API fetching page after page.
  useEffect(() => {
    if (!hasMore || isLoadingMore || !onEndReached || searching) return
    if (visible.length - activeIndex <= LOAD_AHEAD) onEndReached()
  }, [
    activeIndex,
    visible.length,
    hasMore,
    isLoadingMore,
    onEndReached,
    searching,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      scrollToIndex(activeIndex + (e.key === 'ArrowDown' ? 1 : -1))
    },
    [activeIndex, scrollToIndex],
  )

  const counterCurrent = Math.min(activeIndex + 1, Math.max(visible.length, 1))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[min(90svh,56rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          {t('news.reader.title', 'News reader')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t('news.articleDetails')}
        </DialogDescription>

        {/* Header: search + position counter (close lives top-right) */}
        <header className="flex shrink-0 items-center gap-3 border-b py-2.5 pl-4 pr-14">
          <div className="relative w-full max-w-56">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('news.reader.searchPlaceholder', 'Search news...')}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {visible.length > 0
              ? `${counterCurrent} / ${visible.length}${hasMore ? '+' : ''}`
              : '0 / 0'}
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          <div
            ref={setFeedRef}
            onScroll={handleScroll}
            className="h-full snap-y snap-mandatory overflow-y-auto"
          >
            {visible.map((article, i) => (
              <ReaderSlide
                key={article.url}
                article={article}
                eager={Math.abs(i - activeIndex) <= 2}
              />
            ))}

            {visible.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <Search className="size-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">
                  {t('news.reader.noMatches', 'Nothing matches your search')}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQuery('')}
                  >
                    {t('news.reader.clearSearch', 'Clear search')}
                  </Button>
                  {hasMore && onEndReached && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEndReached()}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      {t('news.reader.loadOlder', 'Load older news')}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 p-6 text-center">
                {hasMore ? (
                  searching && onEndReached ? (
                    <Button
                      variant="outline"
                      onClick={() => onEndReached()}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      {t('news.reader.loadOlder', 'Load older news')}
                    </Button>
                  ) : (
                    <>
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {t('news.reader.loadingMore', 'Loading more news...')}
                      </p>
                    </>
                  )
                ) : (
                  <>
                    <Newspaper className="size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                      {t('news.reader.caughtUp', "You're all caught up")}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Prev/next rail */}
          {visible.length > 0 && (
            <div className="pointer-events-none absolute inset-y-0 right-3 z-10 flex flex-col items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="icon-sm"
                className="pointer-events-auto rounded-full shadow-md"
                disabled={activeIndex <= 0}
                onClick={() => scrollToIndex(activeIndex - 1)}
                aria-label={t(
                  'news.reader.previousArticle',
                  'Previous article',
                )}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="secondary"
                size="icon-sm"
                className="pointer-events-auto rounded-full shadow-md"
                disabled={activeIndex >= lastSlideIndex}
                onClick={() => scrollToIndex(activeIndex + 1)}
                aria-label={t('news.reader.nextArticle', 'Next article')}
              >
                <ChevronDown />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
