// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one news feed the phone has — read by the Discover panel's list and by
 * the reader sheet that opens from it.
 *
 * Both call this hook, and both therefore hit the SAME TanStack Query entry:
 * opening an article must not refetch the feed it was picked from, and paging
 * inside the reader must extend the list behind it. That shared key is the
 * whole reason this is a module and not two copies of an infinite query.
 *
 * The paging contract (`time_to` cursor, 50-per-page exhaustion, URL dedupe,
 * the non-advancing-cursor stop) is the desktop's, imported from
 * `news-shared` rather than re-derived. What is NOT reused is
 * `usePluginFetch`: it throws outside a pane host, so the transport here is
 * `authFetch` against the App Server — the same URL and the same bearer token
 * the plugin fetch would have used.
 */
import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

import type {
  NewsArticle,
  NewsFeedResponse,
} from '@pairlens/shared/instrument-types'
import {
  NEWS_PAGE_TIME_FROM,
  fetchNewsPage,
  flattenNewsPages,
  nextNewsPageParam,
  useNewsFeedResume,
} from '@/components/news/news-shared'
import { appServerUrl, authFetch } from '@/lib/api'

const newsFetch = (path: string, init?: RequestInit) =>
  authFetch(`${appServerUrl}${path}`, init)

/** Shared between the Discover list and the reader sheet. Do not fork it. */
export const MOBILE_NEWS_QUERY_KEY = ['news-feed', 'mobile'] as const

export type MobileNewsFeed = {
  articles: Array<NewsArticle>
  error: unknown
  /**
   * The feed has never answered — no pages and no error. This is the loading
   * gate, deliberately NOT TanStack's `isLoading`: a pending query can have
   * nothing in flight (retry paused in a hidden tab, or a cancelled fetch),
   * and rendering that as an empty feed was the bug. Pending means loading.
   */
  isPending: boolean
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void
}

export function useMobileNewsFeed(): MobileNewsFeed {
  const {
    data,
    error,
    isPending,
    fetchStatus,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: MOBILE_NEWS_QUERY_KEY,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ sort: 'LATEST' })
      if (pageParam) {
        qs.set('time_from', NEWS_PAGE_TIME_FROM)
        qs.set('time_to', pageParam)
      }
      return fetchNewsPage(newsFetch, qs.toString())
    },
    initialPageParam: null as string | null,
    getNextPageParam: (
      lastPage: NewsFeedResponse,
      _pages: Array<NewsFeedResponse>,
      lastPageParam: string | null,
    ) => {
      const next = nextNewsPageParam(lastPage)
      // A cursor that stops advancing would refetch the same page forever.
      return next && next !== lastPageParam ? next : null
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // A provider outage isn't worth three rounds of backoff before we say so.
    retry: 1,
  })

  // A cancelled fetch reverts to pending+idle with nothing scheduled; kick it
  // so a pending feed always resolves into an answer. Both consumers share
  // one query entry, so the duplicate kicks dedupe inside TanStack Query.
  useNewsFeedResume({ isPending, fetchStatus, refetch })

  const pages = data?.pages
  const articles = useMemo(() => flattenNewsPages(pages ?? []), [pages])

  return useMemo(
    () => ({
      articles,
      error,
      isPending,
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      loadMore: () => void fetchNextPage(),
    }),
    [
      articles,
      error,
      isPending,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
    ],
  )
}
