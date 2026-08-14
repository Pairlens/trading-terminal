// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover (design screen 6) — sentiment, top tickers and news over the same
 * chart and price as every other panel.
 *
 * Four data sources, none of them a pane: the discovery panes all want a
 * `@container/pane` ancestor and draw at desk widths. What is reused is the
 * layer underneath them — `fetchFearGreedWithFallback`, the Markets pane's
 * featured selection and quote cell, and the desktop's news paging kit — so
 * the phone is a second layout over the same data rather than a second data
 * path.
 *
 * The featured strip is the Markets pane's, symbol for symbol: the same
 * `featured` instruments out of the discovery catalog, the same
 * `PairAvatar` logo pipeline, the same `MiniPriceChart` and the same
 * `PairQuote`. It used to be the raw top-coins feed, which arrives with a
 * `logoUrl` that is often missing and no trend line at all — rows that read as
 * unfinished next to the rest of the terminal.
 */
import { memo, useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { MobileRow } from '../primitives/mobile-row'
import { PRESS } from '../primitives/press'
import { DiscoverFearGreedCard } from './discover-fear-greed-card'
import { DiscoverPnlCard } from './discover-pnl-card'
import { useMobileNewsFeed } from './use-mobile-news-feed'
import { TrendQuoteCell } from './trend-quote-cell'
import { orderFeatured } from './featured-order'
import type { NewsArticle } from '@pairlens/shared/instrument-types'
import type { PairEntry } from '@/components/pair-picker/pair-picker-data'
import { haptic } from '@/lib/haptics'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { usePreferredMarketResolver } from '@/hooks/use-preferred-market'
import { instrumentToPairEntry } from '@/components/pair-picker/pair-picker-data'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import { quoteForPair } from '@/components/discovery/pair-quote'
import {
  ArticleBanner,
  NewsFeedStatus,
  formatRelativeTime,
} from '@/components/news/news-shared'

/** Design shows five rows; the rest lives behind "All pairs". */
const FEATURED_COUNT = 5
/** Enough to fill the sheet twice over without rendering a 50-row feed. */
const NEWS_ROW_COUNT = 12

export default memo(function MobileDiscoverPanel() {
  const { t } = useTranslation()
  const { dismissPanel, pushOverlay } = useMobileActions()

  const topCoins = useTopCoinsSnapshot()
  const quotes = useBulkTickerQuotes()
  const resolveMarket = usePreferredMarketResolver()
  const news = useMobileNewsFeed()

  // The unfiltered catalog page — the same request the Markets pane makes, so
  // opening Discover after Markets (or the reverse) is a cache read.
  const { items } = useMarketInstruments()

  // The Markets pane's featured pool, in its own order, except that anything
  // this build can actually price comes first (see `orderFeatured`).
  const featured = useMemo(
    () =>
      orderFeatured(
        items.map(instrumentToPairEntry).filter((pair) => pair.featured),
        (pair) => quoteForPair(pair, quotes, topCoins) !== undefined,
        FEATURED_COUNT,
      ),
    [items, quotes, topCoins],
  )

  const openAllMarkets = useCallback(
    () => pushOverlay({ kind: 'markets' }),
    [pushOverlay],
  )

  const openArticle = useCallback(
    (index: number) => pushOverlay({ kind: 'news', index }),
    [pushOverlay],
  )

  // `pb-2` below is air, not clearance. The tab bar is drawn over the sheet
  // (z-50 against z-40) and used to hide the last ~54px of this list — the
  // final news row showed only its timestamp. That reserve now lives in
  // `mobile-sheet.tsx`, which pads its scroll region by `--pl-tabbar-total`,
  // so no panel adds it again: doing so here put 61px of dead space under the
  // feed (measured).
  return (
    <div className="flex flex-col pb-2">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
        <h2 className="font-serif text-[24px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {t('mobile.panels.discoverTitle')}
        </h2>
        <button
          aria-label={t('mobile.shell.dismiss')}
          className="pl-hit-44 pl-press-soft -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          onClick={dismissPanel}
          type="button"
          {...PRESS}
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex gap-2.5 px-4">
        <DiscoverFearGreedCard />
        <DiscoverPnlCard />
      </div>

      <SectionHeader
        action={t('mobile.panels.allMarkets')}
        onAction={openAllMarkets}
        title={t('mobile.discover.featured')}
      />

      {featured.length === 0
        ? [0, 1, 2].map((row) => (
            <div
              className="h-[55px] border-t border-t-[color:var(--pl-hairline)]"
              key={row}
            />
          ))
        : featured.map((pair) => (
            <FeaturedRow
              key={pair.symbol}
              market={resolveMarket(pair.assetClass)}
              pair={pair}
              quote={quoteForPair(pair, quotes, topCoins)}
            />
          ))}

      <SectionHeader title={t('news.title')} />

      {news.articles.length === 0 ? (
        news.isLoading ? (
          <div className="space-y-2 px-4 py-3">
            {[0, 1, 2].map((i) => (
              <div
                className="h-[52px] animate-pulse rounded-lg bg-muted/60"
                key={i}
              />
            ))}
          </div>
        ) : (
          <NewsFeedStatus
            emptyBody={t('news.adjustFilters')}
            error={news.error}
          />
        )
      ) : (
        news.articles
          .slice(0, NEWS_ROW_COUNT)
          .map((article, index) => (
            <NewsRow
              article={article}
              index={index}
              key={article.url}
              onOpen={openArticle}
            />
          ))
      )}
    </div>
  )
})

/**
 * A featured tile from the Markets pane, folded into the phone's list row: the
 * same logo, trend line and quote, laid out for 402px instead of a 288px card.
 * Tapping focuses the pair and closes the panel, because Discover is a place
 * you leave — unlike the watchlist, where the panel stays open so a scan is a
 * sequence of taps.
 */
const FeaturedRow = memo(function FeaturedRow({
  pair,
  market,
  quote,
}: {
  pair: PairEntry
  market: string
  quote: ReturnType<typeof quoteForPair>
}) {
  const { focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, dismissPanel } = useMobileActions()

  const handlePress = useCallback(() => {
    haptic('selection')
    if (market !== focusedVenue) setFocusedVenue(market)
    setFocusedPair(pair.symbol)
    dismissPanel()
  }, [
    market,
    focusedVenue,
    setFocusedVenue,
    setFocusedPair,
    pair.symbol,
    dismissPanel,
  ])

  return (
    <MobileRow
      leading={
        <PairAvatar
          assetClass={pair.assetClass}
          base={pair.base}
          className="size-8"
          size="md"
        />
      }
      onPress={handlePress}
      subtitle={pair.name}
      title={<span className="font-mono">{pair.symbol}</span>}
      trailing={
        <TrendQuoteCell market={market} pair={pair.symbol} quote={quote} />
      }
    />
  )
})

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-1.5 pt-5">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {action && onAction ? (
        <button
          className="pl-hit-44 pl-press-text shrink-0 text-[12px] font-medium text-primary"
          onClick={onAction}
          type="button"
          {...PRESS}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}

const NewsRow = memo(function NewsRow({
  article,
  index,
  onOpen,
}: {
  article: NewsArticle
  index: number
  onOpen: (index: number) => void
}) {
  return (
    <button
      className="pl-press-row flex w-full items-start gap-3 border-t border-t-[color:var(--pl-hairline)] px-4 py-3 text-left"
      onClick={() => onOpen(index)}
      type="button"
      {...PRESS}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-none text-muted-foreground">
          {formatRelativeTime(article.timePublished)} · {article.source}
        </span>
        <span className="mt-1.5 block text-[13.5px] font-medium leading-[1.35] text-foreground">
          {article.title}
        </span>
      </span>
      {article.bannerImage ? (
        <span className="size-[52px] shrink-0 overflow-hidden rounded-lg">
          <ArticleBanner
            fallbackClassName="size-full"
            imgClassName="size-full object-cover"
            src={article.bannerImage}
          />
        </span>
      ) : null}
    </button>
  )
})
