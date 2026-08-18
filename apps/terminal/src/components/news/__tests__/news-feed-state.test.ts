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
  NewsUnavailableError,
  fetchNewsPage,
  newsFeedStalled,
  newsFeedView,
} from '../news-feed-state'
import type { NewsFeedResponse } from '@pairlens/shared/instrument-types'

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

  it('keeps the unavailable state even when stale pages are on screen', () => {
    // A background refetch that fails must not be papered over by old data.
    expect(
      newsFeedView({
        isPending: false,
        error: new NewsUnavailableError('upstream_error'),
        articleCount: 12,
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
