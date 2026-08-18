// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The news feed's failure ladder, pinned by the state that actually shipped
// wrong: a 503 whose retry paused in a hidden tab rendered as "No news
// found". The pane's old gate was `isLoading` (pending AND actively
// fetching), and a pending query can have nothing in flight at all — the
// retry backoff parks on the focus gate while the tab is hidden, and a
// cancelled fetch reverts to pending+idle. Both must read as loading, never
// as an empty feed. The integration tests below run the REAL query-core
// against the real fetchNewsPage to encode the two discovered shapes.
import { afterEach, describe, expect, it } from 'bun:test'
import {
  InfiniteQueryObserver,
  QueryClient,
  focusManager,
} from '@tanstack/react-query'

import {
  NEWS_AUTOFILL_MAX_PAGES,
  NEWS_MIN_FILLED_ROWS,
  NEWS_POLL_INTERVAL_MS,
  NEWS_POLL_MAX_PAGES,
  NewsUnavailableError,
  anchorNewsFeed,
  fetchNewsPage,
  flattenNewsPages,
  newsFeedStalled,
  newsFeedView,
  newsPollInterval,
  shouldAutofillNewsFeed,
} from '../news-feed-state'
import type {
  NewsArticle,
  NewsFeedResponse,
} from '@pairlens/shared/instrument-types'

// ── The state-to-view mapping ───────────────────────────────────────

describe('newsFeedView', () => {
  it('reads every pending shape as loading, never as an empty feed', () => {
    // The regression: pending covers paused retries and reverted fetches,
    // not just an active first fetch. All of them are still "no answer yet".
    expect(
      newsFeedView({ isPending: true, error: null, articleCount: 0 }),
    ).toBe('loading')
  })

  it('puts a failed feed in the unavailable state', () => {
    expect(
      newsFeedView({
        isPending: false,
        error: new NewsUnavailableError('not_configured'),
        articleCount: 0,
      }),
    ).toBe('unavailable')
  })

  it('keeps the stories on screen when a poll fails under them', () => {
    // The feed polls every two minutes, so a transient 5xx is routine. It used
    // to replace a feed someone was reading with a full-pane "News
    // unavailable" that cleared itself two minutes later. The headlines are
    // still true; the header's marker is what says the refresh failed.
    expect(
      newsFeedView({
        isPending: false,
        error: new NewsUnavailableError('upstream_error'),
        articleCount: 12,
      }),
    ).toBe('articles')
  })

  it('falls back to unavailable when a failed feed has nothing to show', () => {
    expect(
      newsFeedView({
        isPending: false,
        error: new NewsUnavailableError('rate_limited'),
        articleCount: 0,
      }),
    ).toBe('unavailable')
  })

  it('reserves the empty state for a real answer with nothing in it', () => {
    expect(
      newsFeedView({ isPending: false, error: null, articleCount: 0 }),
    ).toBe('empty')
  })

  it('renders articles when the feed answered with rows', () => {
    expect(
      newsFeedView({ isPending: false, error: null, articleCount: 3 }),
    ).toBe('articles')
  })
})

describe('newsFeedStalled', () => {
  it('flags only the cancelled-and-reverted shape', () => {
    // pending+idle: nothing in flight, nothing scheduled — needs a kick.
    expect(newsFeedStalled({ isPending: true, fetchStatus: 'idle' })).toBe(true)
    // A paused retry resumes itself on focus; kicking it would double-fetch.
    expect(newsFeedStalled({ isPending: true, fetchStatus: 'paused' })).toBe(
      false,
    )
    expect(newsFeedStalled({ isPending: true, fetchStatus: 'fetching' })).toBe(
      false,
    )
    expect(newsFeedStalled({ isPending: false, fetchStatus: 'idle' })).toBe(
      false,
    )
  })
})

// ── The live poll ───────────────────────────────────────────────────

describe('newsPollInterval', () => {
  it('polls a feed that has not been paged', () => {
    expect(newsPollInterval(1)).toBe(NEWS_POLL_INTERVAL_MS)
  })

  it('keeps polling up to the page cap', () => {
    expect(newsPollInterval(NEWS_POLL_MAX_PAGES)).toBe(NEWS_POLL_INTERVAL_MS)
  })

  it('stands down past it, where one poll is no longer one request', () => {
    // Refetching an infinite query walks every loaded page. Past the cap that
    // is an archive being re-read every two minutes, not a wire.
    expect(newsPollInterval(NEWS_POLL_MAX_PAGES + 1)).toBe(false)
  })
})

// ── Filling a column the scope filtered down ────────────────────────
//
// The shipped bug: the pane loaded one page, the client-side scope kept four
// of its fifty stories, and nothing ever asked for page two — except the
// READER, so the list only grew if you opened an article and closed it again.

describe('shouldAutofillNewsFeed', () => {
  const state = {
    hasNextPage: true,
    isFetching: false,
    pageCount: 1,
    rowCount: 4,
  }

  it('pulls another page while the column is short', () => {
    expect(shouldAutofillNewsFeed(state)).toBe(true)
  })

  it('stops as soon as the column is filled', () => {
    expect(
      shouldAutofillNewsFeed({ ...state, rowCount: NEWS_MIN_FILLED_ROWS }),
    ).toBe(false)
  })

  it('leaves an unfiltered page alone: 50 rows need no help', () => {
    expect(shouldAutofillNewsFeed({ ...state, rowCount: 50 })).toBe(false)
  })

  it('never fills deep enough to stand the poll down', () => {
    // The bound IS the poll's own page cap. A feed that filled past it would
    // trade live updates for backfill nobody asked for.
    expect(NEWS_AUTOFILL_MAX_PAGES).toBe(NEWS_POLL_MAX_PAGES)
    expect(
      shouldAutofillNewsFeed({ ...state, pageCount: NEWS_AUTOFILL_MAX_PAGES }),
    ).toBe(false)
  })

  it('waits for the request in flight instead of stacking pages', () => {
    expect(shouldAutofillNewsFeed({ ...state, isFetching: true })).toBe(false)
  })

  it('asks for nothing once the wire is exhausted', () => {
    expect(shouldAutofillNewsFeed({ ...state, hasNextPage: false })).toBe(false)
  })
})

// ── Reader anchoring against a feed that grows at the head ──────────

const article = (url: string): NewsArticle =>
  ({ url }) as unknown as NewsArticle

describe('anchorNewsFeed', () => {
  it('drops stories the poll prepended, so a slide index still resolves', () => {
    const feed = [article('new'), article('a'), article('b')]
    expect(anchorNewsFeed(feed, 'a')).toEqual([article('a'), article('b')])
  })

  it('keeps what paging appended', () => {
    const feed = [article('new'), article('a'), article('b'), article('older')]
    expect(anchorNewsFeed(feed, 'a')).toEqual([
      article('a'),
      article('b'),
      article('older'),
    ])
  })

  it('returns the same array when the anchor still leads', () => {
    // Identity matters: a new array every poll would re-render every slide.
    const feed = [article('a'), article('b')]
    expect(anchorNewsFeed(feed, 'a')).toBe(feed)
  })

  it('passes the feed through when it has no anchor yet', () => {
    const feed = [article('a')]
    expect(anchorNewsFeed(feed, undefined)).toBe(feed)
  })

  it('passes the feed through when the anchor is gone from it', () => {
    const feed = [article('a'), article('b')]
    expect(anchorNewsFeed(feed, 'retracted')).toBe(feed)
  })
})

// ── fetchNewsPage error typing ──────────────────────────────────────

const jsonResponse = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('fetchNewsPage', () => {
  it('maps a 503 with a reason body to that reason', async () => {
    const apiFetch = jsonResponse(503, {
      error: 'news_unavailable',
      reason: 'not_configured',
      fetchedAt: '2026-08-18T00:00:00.000Z',
    })
    const err = await fetchNewsPage(apiFetch, 'sort=LATEST').catch((e) => e)
    expect(err).toBeInstanceOf(NewsUnavailableError)
    expect((err as NewsUnavailableError).reason).toBe('not_configured')
  })

  it('maps a 5xx with an unreadable body to upstream_error', async () => {
    const apiFetch = async () =>
      new Response('Service Unavailable', { status: 503 })
    const err = await fetchNewsPage(apiFetch, '').catch((e) => e)
    expect(err).toBeInstanceOf(NewsUnavailableError)
    expect((err as NewsUnavailableError).reason).toBe('upstream_error')
  })

  it('maps a 200 that is not a feed to upstream_error', async () => {
    const apiFetch = jsonResponse(200, { hello: 'world' })
    const err = await fetchNewsPage(apiFetch, '').catch((e) => e)
    expect(err).toBeInstanceOf(NewsUnavailableError)
    expect((err as NewsUnavailableError).reason).toBe('upstream_error')
  })

  it('returns a real page untouched', async () => {
    const page: NewsFeedResponse = {
      articles: [],
      fetchedAt: '2026-08-18T00:00:00.000Z',
    }
    const apiFetch = jsonResponse(200, page)
    await expect(fetchNewsPage(apiFetch, '')).resolves.toEqual(page)
  })
})

// ── The two discovered failure shapes, against the real query-core ──

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  })
  client.mount()
  return client
}

function newsObserver(
  client: QueryClient,
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
) {
  return new InfiniteQueryObserver<NewsFeedResponse, Error>(client, {
    queryKey: ['news-feed-test'],
    queryFn: () => fetchNewsPage(apiFetch, 'sort=LATEST'),
    initialPageParam: null,
    getNextPageParam: () => null,
    retry: 1,
    retryDelay: 5,
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out')
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

afterEach(() => {
  // focusManager is a module-global singleton; undefined restores default.
  focusManager.setFocused(undefined)
})

describe('news feed query against a 503', () => {
  it('reads as loading while the retry is paused in a hidden tab, then unavailable on focus', async () => {
    // The shipped bug, end to end: first attempt 503s, the retry backoff
    // checks the focus gate, the hidden document parks it as paused.
    focusManager.setFocused(false)

    const client = makeClient()
    const observer = newsObserver(
      client,
      jsonResponse(503, {
        error: 'news_unavailable',
        reason: 'not_configured',
        fetchedAt: '2026-08-18T00:00:00.000Z',
      }),
    )
    const unsubscribe = observer.subscribe(() => {})

    try {
      await waitFor(() => observer.getCurrentResult().fetchStatus === 'paused')
      const paused = observer.getCurrentResult()
      expect(paused.status).toBe('pending')
      expect(paused.error).toBeNull()

      // The assertion that failed in production: this state is LOADING.
      const view = newsFeedView({
        isPending: paused.isPending,
        error: paused.error,
        articleCount: 0,
      })
      expect(view).toBe('loading')
      expect(view).not.toBe('empty')

      // Tab regains focus: the retry resumes, 503s again, and the pane gets
      // its designed unavailable state with the server's own reason.
      focusManager.setFocused(true)
      await waitFor(() => observer.getCurrentResult().status === 'error')
      const settled = observer.getCurrentResult()
      expect(settled.error).toBeInstanceOf(NewsUnavailableError)
      expect((settled.error as NewsUnavailableError).reason).toBe(
        'not_configured',
      )
      expect(
        newsFeedView({
          isPending: settled.isPending,
          error: settled.error,
          articleCount: 0,
        }),
      ).toBe('unavailable')
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
    }
  })

  it('reads a cancelled-and-reverted fetch as loading and stalled, not empty', async () => {
    // The other discovered shape: a cancel mid-fetch reverts the query to
    // pending+idle with no error — the state the investigation caught.
    const client = makeClient()
    const observer = newsObserver(
      client,
      // Hangs forever, so the cancel lands while the fetch is in flight.
      () => new Promise<Response>(() => {}),
    )
    const unsubscribe = observer.subscribe(() => {})

    try {
      await waitFor(
        () => observer.getCurrentResult().fetchStatus === 'fetching',
      )
      await client.cancelQueries({ queryKey: ['news-feed-test'] })

      const reverted = observer.getCurrentResult()
      expect(reverted.status).toBe('pending')
      expect(reverted.fetchStatus).toBe('idle')
      expect(reverted.error).toBeNull()

      expect(
        newsFeedView({
          isPending: reverted.isPending,
          error: reverted.error,
          articleCount: 0,
        }),
      ).toBe('loading')
      // ...and it is exactly the shape useNewsFeedResume re-kicks.
      expect(
        newsFeedStalled({
          isPending: reverted.isPending,
          fetchStatus: reverted.fetchStatus,
        }),
      ).toBe(true)
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
    }
  })
})

// ── The wire moves on its own ───────────────────────────────────────
//
// What the pane wires up is `refetchInterval`, and the timer behind it cannot
// fire here: query-core computes `isServer` from `typeof window`, which is
// undefined under bun, and never schedules the interval. The interval VALUE is
// pinned by the `newsPollInterval` suite above; these run the refetch that
// value schedules, because the part worth pinning is what a poll does to a
// feed someone is already reading. Live behaviour is verified in a browser.

describe('a poll landing on a loaded feed', () => {
  it('puts the new stories at the top of the feed', async () => {
    let round = 0
    const apiFetch = async () => {
      round += 1
      const articles =
        round === 1
          ? [{ url: 'first', timePublished: '20260818T1000' }]
          : [
              { url: 'second', timePublished: '20260818T1002' },
              { url: 'first', timePublished: '20260818T1000' },
            ]
      return new Response(
        JSON.stringify({ articles, fetchedAt: '2026-08-18T10:02:00.000Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const client = makeClient()
    const observer = new InfiniteQueryObserver<NewsFeedResponse, Error>(
      client,
      {
        queryKey: ['news-poll-test'],
        queryFn: () => fetchNewsPage(apiFetch, 'sort=LATEST'),
        initialPageParam: null,
        getNextPageParam: () => null,
        retry: false,
      },
    )
    const unsubscribe = observer.subscribe(() => {})
    const urls = () =>
      flattenNewsPages(observer.getCurrentResult().data?.pages ?? []).map(
        (item) => item.url,
      )

    try {
      await waitFor(() => urls().length === 1)
      expect(urls()).toEqual(['first'])

      await observer.refetch()
      expect(urls()).toEqual(['second', 'first'])
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
    }
  })

  it('leaves the stories up when it fails under them', async () => {
    // A 5xx two minutes into a good feed used to blank the pane: data stays
    // and error is set, and the old view mapping read the error first.
    let round = 0
    const apiFetch = async () => {
      round += 1
      return round === 1
        ? new Response(
            JSON.stringify({
              articles: [{ url: 'first', timePublished: '20260818T1000' }],
              fetchedAt: '2026-08-18T10:00:00.000Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        : new Response(
            JSON.stringify({
              error: 'news_unavailable',
              reason: 'upstream_error',
              fetchedAt: '2026-08-18T10:02:00.000Z',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          )
    }

    const client = makeClient()
    const observer = new InfiniteQueryObserver<NewsFeedResponse, Error>(
      client,
      {
        queryKey: ['news-poll-failure-test'],
        queryFn: () => fetchNewsPage(apiFetch, 'sort=LATEST'),
        initialPageParam: null,
        getNextPageParam: () => null,
        retry: false,
      },
    )
    const unsubscribe = observer.subscribe(() => {})

    try {
      await waitFor(() => observer.getCurrentResult().data !== undefined)
      await observer.refetch()

      const result = observer.getCurrentResult()
      const articles = flattenNewsPages(result.data?.pages ?? [])
      expect(result.error).toBeInstanceOf(NewsUnavailableError)
      expect(articles.map((item) => item.url)).toEqual(['first'])
      expect(
        newsFeedView({
          isPending: result.isPending,
          error: result.error,
          articleCount: articles.length,
        }),
      ).toBe('articles')
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
    }
  })
})
