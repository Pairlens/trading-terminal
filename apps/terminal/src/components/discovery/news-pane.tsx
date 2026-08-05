// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { usePluginFetch, usePluginInfiniteQuery } from '@pairlens/plugin-sdk'
import type {
  NewsArticle,
  NewsFeedParams,
  NewsFeedResponse,
} from '@pairlens/shared/instrument-types'

import { NewsReaderDialog } from '@/components/news/news-reader'
import {
  ArticleCard,
  ArticleCardSkeleton,
  NEWS_PAGE_TIME_FROM,
  NewsFeedStatus,
  TOPIC_OPTIONS,
  fetchNewsPage,
  flattenNewsPages,
  formatRelativeTime,
  formatTopicLabel,
  nextNewsPageParam,
} from '@/components/news/news-shared'

export function NewsPane() {
  const { t } = useTranslation()
  const apiFetch = usePluginFetch()

  const [readerIndex, setReaderIndex] = useState<number | null>(null)
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const [tickerInput, setTickerInput] = useState('')
  const [debouncedTicker, setDebouncedTicker] = useState('')
  const [sort, setSort] = useState<'LATEST' | 'RELEVANCE'>('LATEST')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTicker(tickerInput.trim().toUpperCase())
    }, 500)
    return () => clearTimeout(timer)
  }, [tickerInput])

  const toggleTopic = useCallback((topic: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(topic)) next.delete(topic)
      else next.add(topic)
      return next
    })
  }, [])

  const params: NewsFeedParams = useMemo(
    () => ({
      sort,
      ...(selectedTopics.size > 0 && {
        topics: Array.from(selectedTopics).join(','),
      }),
      ...(debouncedTicker && { tickers: debouncedTicker }),
    }),
    [sort, selectedTopics, debouncedTicker],
  )

  const serializedParams = JSON.stringify(params)

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePluginInfiniteQuery<NewsFeedResponse, Error, string | null>({
    queryKey: ['news-feed', serializedParams],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams()
      if (params.tickers) qs.set('tickers', params.tickers)
      if (params.topics) qs.set('topics', params.topics)
      if (params.sort) qs.set('sort', params.sort)
      if (pageParam) {
        qs.set('time_from', NEWS_PAGE_TIME_FROM)
        qs.set('time_to', pageParam)
      }
      return fetchNewsPage(apiFetch, qs.toString())
    },
    initialPageParam: null,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const next = nextNewsPageParam(lastPage)
      // A non-advancing cursor would refetch the same page forever.
      return next && next !== lastPageParam ? next : null
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // A provider outage isn't worth three rounds of backoff before we say so.
    retry: 1,
  })

  const pages = data?.pages
  const articles = useMemo(() => flattenNewsPages(pages ?? []), [pages])
  const fetchedAt = pages?.[0]?.fetchedAt ?? null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t('news.title')}</h2>
        <div className="flex items-center gap-2">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">
              {t('common.updated', { time: formatRelativeTime(fetchedAt) })}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn('size-3.5', isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {TOPIC_OPTIONS.map((topic) => (
          <Badge
            key={topic}
            variant={selectedTopics.has(topic) ? 'default' : 'outline'}
            className="cursor-pointer text-[10px]"
            onClick={() => toggleTopic(topic)}
          >
            {formatTopicLabel(topic)}
          </Badge>
        ))}
        <Input
          placeholder={t('news.tickerPlaceholder')}
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          className="h-6 w-20 text-xs"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={() =>
            setSort((s) => (s === 'LATEST' ? 'RELEVANCE' : 'LATEST'))
          }
        >
          {sort === 'LATEST' ? t('news.sortLatest') : t('news.sortRelevance')}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 grid grid-cols-1 @lg/pane:grid-cols-2 @4xl/pane:grid-cols-3 gap-3 overflow-y-auto p-4 auto-rows-max content-start">
          {Array.from({ length: 6 }, (_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      ) : error || articles.length === 0 ? (
        <NewsFeedStatus error={error} emptyBody={t('news.adjustFilters')} />
      ) : (
        <div className="flex-1 grid grid-cols-1 @lg/pane:grid-cols-2 @4xl/pane:grid-cols-3 gap-3 overflow-y-auto p-4 auto-rows-max content-start">
          {articles.map((article: NewsArticle, i: number) => (
            <ArticleCard
              key={article.url}
              article={article}
              onClick={() => setReaderIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Immersive article reader */}
      {readerIndex !== null && (
        <NewsReaderDialog
          articles={articles}
          initialIndex={readerIndex}
          onClose={() => setReaderIndex(null)}
          onEndReached={fetchNextPage}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
        />
      )}
    </div>
  )
}
