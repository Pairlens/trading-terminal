// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The news reader (design flow B) — one story per screen, edge to edge.
 *
 * This used to mount the desktop's `NewsReaderDialog`, on the reasoning that a
 * vertical snap feed is already a phone pattern. The mechanic was right; the
 * frame was not. A dialog is a window onto a page, and it brought its window
 * with it: a centered card inset from every edge, a bordered header strip, a
 * chevron rail down the right margin. On a 402px display that is roughly a
 * fifth of the surface spent drawing the edges of a box, around a photograph
 * that wanted the whole width.
 *
 * So the reader owns the display here. `fixed inset-0` over everything (the
 * tab bar included — the close control is the way out, and covering the bar is
 * what buys the last 84px), the banner running the full width, and the story's
 * own controls floating over the image instead of standing on a strip of their
 * own. What is unchanged is the reading order the design drew: banner and
 * headline composited, then summary, topics and per-ticker sentiment, then out
 * to the source.
 *
 * Four things the shape has to keep paying for:
 *
 *   - **Paging is the gesture.** `snap-y snap-mandatory` with every slide
 *     exactly one viewport tall, and nothing inside a slide scrolls on its own
 *     — an inner scroller would swallow the swipe and turn a mandatory page
 *     into an optional one. Overflow is clipped under a fade instead.
 *   - **Safe areas.** Full-bleed means the status bar is ours to avoid: the
 *     control strip pads by `--pl-safe-top`, the footer by `--pl-safe-bottom`.
 *   - **The initial alignment.** Opening on story 9 must not fly through
 *     stories 1-8. The feed element is reached through a callback ref with a
 *     `ResizeObserver` fallback because it can be measured at zero height on
 *     the frame it mounts — see `setFeedRef`.
 *   - **The caret.** An open panel sheet traps focus (vaul, via Radix); the
 *     search field would be handed a tap and lose it in the same frame. See
 *     the focus island below.
 *
 * The feed itself is `useMobileNewsFeed`, the same query entry the Discover
 * list read, so `overlay.index` still points at the story the user tapped and
 * paging here extends the list behind it.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Newspaper,
  Search,
  User,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { useMobileNewsFeed } from '../panels/use-mobile-news-feed'
import { PRESS } from '../primitives/press'
import {
  feedCounter,
  filterNewsArticles,
  shouldLoadOlder,
  slideIndexFromScroll,
} from '../lib/news-reader-feed'
import type { ReactNode } from 'react'
import type { MobileOverlay } from '../mobile-focus-context'
import type { NewsArticle } from '@pairlens/shared/instrument-types'
import {
  ArticleBanner,
  SENTIMENT_BADGE_CLASSES,
  SentimentTag,
  formatRelativeTime,
  formatTopicLabel,
  sentimentDirection,
  useNewsFeedAnchor,
} from '@/components/news/news-shared'

type NewsReaderSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'news' }>
  onClose: () => void
}

export default memo(function NewsReaderSheet({
  overlay,
  onClose,
}: NewsReaderSheetProps) {
  const { t } = useTranslation()
  const { articles, hasMore, isPending, isLoadingMore, loadMore } =
    useMobileNewsFeed()

  const feedRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(overlay.index)

  // The feed polls, so stories land at its head while this is open, and every
  // one of them would shift `overlay.index` by a slide. The reader holds the
  // feed it opened with and takes only what paging appends. See
  // `anchorNewsFeed`.
  const anchored = useNewsFeedAnchor(articles)

  const trimmed = query.trim()
  const searching = trimmed.length > 0
  const visible = useMemo(
    () => filterNewsArticles(anchored, trimmed),
    [anchored, trimmed],
  )

  // Keyboard paging only — a swipe is the browser's own scroll and never
  // comes through here. Someone who asked for less movement gets the jump cut
  // rather than a slower version of the same travel.
  const scrollToIndex = useCallback((index: number) => {
    const el = feedRef.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    el.scrollTo({
      top: Math.max(0, index) * el.clientHeight,
      behavior: reduced.matches ? 'auto' : 'smooth',
    })
  }, [])

  // Open ON the tapped story rather than flying to it. base-ui taught this
  // lesson in the dialog version and it survives the port: the element may
  // exist before it has a height, so alignment hangs off the callback ref and
  // falls back to a ResizeObserver for the frame where `clientHeight` is 0.
  const alignedRef = useRef(false)
  const initialIndex = overlay.index
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
      const observer = new ResizeObserver(() => {
        if (el.clientHeight === 0) return
        el.scrollTop = initialIndex * el.clientHeight
        alignedRef.current = true
        observer.disconnect()
      })
      observer.observe(el)
    },
    [initialIndex],
  )

  const handleScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const el = feedRef.current
      if (!el || el.clientHeight === 0) return
      const index = slideIndexFromScroll(el.scrollTop, el.clientHeight)
      setActiveIndex((prev) => (prev === index ? prev : index))
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // A new search restarts the feed at its first match.
  const prevQueryRef = useRef(trimmed)
  useEffect(() => {
    if (prevQueryRef.current === trimmed) return
    prevQueryRef.current = trimmed
    feedRef.current?.scrollTo({ top: 0 })
    setActiveIndex(0)
  }, [trimmed])

  // Older news arrives before the reader runs out of stories to show.
  useEffect(() => {
    if (
      !shouldLoadOlder({
        activeIndex,
        loaded: visible.length,
        hasMore,
        isLoadingMore,
        searching,
      })
    )
      return
    loadMore()
  }, [activeIndex, visible.length, hasMore, isLoadingMore, searching, loadMore])

  // Arrow-key paging, for the narrow desktop window that also lands on this
  // shell. It listens on the window because the feed is a scroller, not a
  // focused control — and it stands down inside the search field, where an
  // arrow key means the caret.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return
      event.preventDefault()
      const el = feedRef.current
      if (!el || el.clientHeight === 0) return
      scrollToIndex(
        slideIndexFromScroll(el.scrollTop, el.clientHeight) +
          (event.key === 'ArrowDown' ? 1 : -1),
      )
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scrollToIndex])

  const closeSearch = useCallback(() => {
    setQuery('')
    setSearchOpen(false)
  }, [])

  // ── The focus island ────────────────────────────────────────────────
  //
  // `MobileSheet` runs vaul, and vaul mounts its Radix dialog WITHOUT passing
  // `modal` down (vaul 1.1 emulates non-modality itself and leaves Radix at
  // its default). Radix therefore renders the modal content path, which traps
  // focus: a document-level `focusin` listener pulls focus straight back to
  // the sheet the moment anything outside it is focused, and a `focusout`
  // listener does the same when focus leaves. Every overlay above an open
  // panel inherits that — the markets filter cannot take a caret either — and
  // it is a shell-level bug, reported separately.
  //
  // What is fixed here is this reader's own field, and only while it is open:
  // both events are caught at the document in the CAPTURE phase (Radix listens
  // on the bubble phase, so capture runs first) and stopped when they involve
  // this reader. Nothing else on the page changes hands.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!searchOpen) return
    const involvesReader = (event: FocusEvent) => {
      const root = rootRef.current
      if (!root) return false
      return (
        root.contains(event.target as Node | null) ||
        root.contains(event.relatedTarget as Node | null)
      )
    }
    const shield = (event: FocusEvent) => {
      if (involvesReader(event)) event.stopPropagation()
    }
    document.addEventListener('focusin', shield, true)
    document.addEventListener('focusout', shield, true)
    return () => {
      document.removeEventListener('focusin', shield, true)
      document.removeEventListener('focusout', shield, true)
    }
  }, [searchOpen])

  // Escape closes. The phone has the X; this is the narrow desktop window that
  // also lands on this shell, where the key is the reflex.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const counter = feedCounter(activeIndex, visible.length, hasMore)

  return (
    <div
      aria-label={t('news.reader.title')}
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-background"
      ref={rootRef}
      role="dialog"
    >
      <div
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        data-news-feed
        onScroll={handleScroll}
        ref={setFeedRef}
      >
        {visible.map((article, index) => (
          <ReaderStory
            article={article}
            eager={Math.abs(index - activeIndex) <= 2}
            key={article.url}
          />
        ))}

        {visible.length === 0 && searching ? (
          <StatusSlide
            body={t('news.reader.clearSearch')}
            icon={<Search className="size-8 text-muted-foreground/40" />}
            onAction={closeSearch}
            title={t('news.reader.noMatches')}
          />
        ) : visible.length === 0 && isPending ? (
          <StatusSlide
            icon={
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            }
            title={t('common.loading')}
          />
        ) : hasMore ? (
          searching ? (
            // Titleless on purpose: the feed is neither exhausted nor loading,
            // it is simply out of MATCHES in what has been fetched — and the
            // one honest thing to say about that is the button.
            <StatusSlide
              body={t('news.reader.loadOlder')}
              busy={isLoadingMore}
              icon={<Newspaper className="size-8 text-muted-foreground/40" />}
              onAction={loadMore}
            />
          ) : (
            <StatusSlide
              icon={
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              }
              title={t('news.reader.loadingMore')}
            />
          )
        ) : (
          <StatusSlide
            icon={<Newspaper className="size-8 text-muted-foreground/40" />}
            title={t('news.reader.caughtUp')}
          />
        )}
      </div>

      {/* The controls float over the story: search, position, close. Nothing
          here occupies a strip of its own — the image runs underneath. */}
      <header
        className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3 pb-2"
        style={{ paddingTop: 'max(var(--pl-safe-top), 10px)' }}
      >
        {searchOpen ? (
          <div className="pl-glass flex h-9 min-w-0 flex-1 items-center gap-2 px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              aria-label={t('mobile.news.searchLabel')}
              autoComplete="off"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('news.reader.searchPlaceholder')}
              spellCheck={false}
              value={query}
            />
            <button
              aria-label={t('common.clear')}
              className="pl-hit-44 pl-press-soft flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--pl-wash-heavy)] text-muted-foreground"
              onClick={closeSearch}
              type="button"
              {...PRESS}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <>
            <button
              aria-label={t('mobile.news.searchLabel')}
              className="pl-glass pl-hit-44 pl-press flex size-9 shrink-0 items-center justify-center text-foreground"
              onClick={() => setSearchOpen(true)}
              type="button"
              {...PRESS}
            >
              <Search className="size-4" />
            </button>
            <div className="min-w-0 flex-1" />
          </>
        )}

        <span
          aria-label={t('mobile.news.positionLabel', {
            current: Math.min(activeIndex + 1, Math.max(visible.length, 1)),
            total: visible.length,
          })}
          className="pl-glass flex h-9 shrink-0 items-center px-2.5 text-[12px] tabular-nums text-muted-foreground"
          data-news-counter
        >
          {counter}
        </span>

        <button
          aria-label={t('mobile.news.close')}
          className="pl-glass pl-hit-44 pl-press flex size-9 shrink-0 items-center justify-center text-foreground"
          onClick={onClose}
          type="button"
          {...PRESS}
        >
          <X className="size-4" />
        </button>
      </header>
    </div>
  )
})

/**
 * One story, one viewport.
 *
 * The slide is a fixed three-band column — hero, body, footer — because the
 * page must land in the same place every time: a story whose summary runs long
 * may not push "Visit article" off the screen, and one whose summary is two
 * lines may not float the footer up into the middle. The body therefore clips
 * under a fade rather than scrolling; the source article is one tap away and
 * it is the thing that has the rest of the words.
 */
const ReaderStory = memo(function ReaderStory({
  article,
  eager,
}: {
  article: NewsArticle
  eager: boolean
}) {
  const { t } = useTranslation()

  return (
    <article className="relative flex h-full snap-start snap-always flex-col overflow-hidden">
      <div className="relative h-[40%] shrink-0 overflow-hidden">
        {article.bannerImage ? (
          <ArticleBanner
            eager={eager}
            fallbackClassName="h-full w-full"
            imgClassName="h-full w-full object-cover"
            src={article.bannerImage}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-muted/50 to-muted/20"
          >
            <Newspaper
              className="size-10 text-muted-foreground/30"
              strokeWidth={1.5}
            />
          </div>
        )}
        {/* The photograph fades into the page rather than ending at a line. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
        <div className="absolute inset-x-5 bottom-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {article.source}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {formatRelativeTime(article.timePublished)}
            </span>
            <SentimentTag
              label={article.overallSentimentLabel}
              score={article.overallSentimentScore}
            />
          </div>
          <h2 className="text-balance font-serif text-[22px] font-semibold leading-[1.24] tracking-[-0.018em] text-foreground">
            {article.title}
          </h2>
        </div>
      </div>

      {/* The band the story's words get, and the order they lose it in. Only
          the summary is allowed to shrink (everything else is `shrink-0`), so
          a long one is clipped under its own fade rather than pushing the
          per-ticker sentiment — the part a trader is here for — off the
          screen. The 20px of bottom padding is what the fade eats first: on a
          summary that fits, the gradient covers empty padding and not one line
          is dimmed, and on one that does not, the tail dissolves into the page
          instead of ending mid-stroke against the byline. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pt-4">
        <p className="min-h-0 overflow-hidden pb-5 text-[14.5px] leading-[1.68] text-muted-foreground [mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent)]">
          {article.summary}
        </p>
        {article.authors.length > 0 && (
          <p className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <User className="size-3 shrink-0" />
            {article.authors.join(', ')}
          </p>
        )}
        {article.topics.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {article.topics.map((articleTopic) => (
              <Badge
                className="rounded-full px-2.5 py-1 text-[11.5px]"
                key={articleTopic.topic}
                variant="secondary"
              >
                {formatTopicLabel(articleTopic.topic)}
              </Badge>
            ))}
          </div>
        )}
        {article.tickerSentiment.length > 0 && (
          <div className="shrink-0 space-y-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              {t('news.tickerSentiment')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {article.tickerSentiment.map((ticker) => (
                <Badge
                  className={cn(
                    'rounded-full px-2.5 py-1 font-mono text-[11.5px]',
                    SENTIMENT_BADGE_CLASSES[
                      sentimentDirection(ticker.sentimentLabel)
                    ],
                  )}
                  key={ticker.ticker}
                  variant="outline"
                >
                  {ticker.ticker} · {ticker.sentimentLabel.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-3">
        <a
          className="inline-flex h-[42px] shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
          href={article.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink className="size-4" />
          {t('news.visitArticle')}
        </a>
        <span className="min-w-0 truncate text-[12px] text-muted-foreground">
          {article.sourceDomain}
        </span>
      </div>

      <div
        className="flex shrink-0 items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground"
        style={{ paddingBottom: 'max(var(--pl-safe-bottom), 14px)' }}
      >
        <ChevronUp className="size-3.5" />
        {t('mobile.news.swipeHint')}
      </div>
    </article>
  )
})

/**
 * The slide past the last story: loading, caught up, or nothing matched. It is
 * a snap target like any other, so the feed still comes to rest on it instead
 * of leaving the last story half off screen.
 */
function StatusSlide({
  icon,
  title,
  body,
  busy,
  onAction,
}: {
  icon: ReactNode
  title?: string
  body?: string
  busy?: boolean
  onAction?: () => void
}) {
  return (
    <div className="flex h-full snap-start snap-always flex-col items-center justify-center gap-3 px-8 text-center">
      {icon}
      {title ? (
        <p className="text-[14px] font-medium text-foreground">{title}</p>
      ) : null}
      {body && onAction ? (
        <Button disabled={busy} onClick={onAction} size="sm" variant="outline">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {body}
        </Button>
      ) : null}
    </div>
  )
}
