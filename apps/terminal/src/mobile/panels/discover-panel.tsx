// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discover (design screen 6) — sentiment, top tickers and news over the same
 * chart and price as every other panel.
 *
 * Four data sources, none of them a pane: the discovery panes all want a
 * `@container/pane` ancestor and draw at desk widths. What is reused is the
 * layer underneath them — `fetchFearGreedWithFallback`, `useTopCoinsSnapshot`,
 * and the desktop's news paging kit — so the phone is a second layout over the
 * same data rather than a second data path.
 */
import { memo, useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { useMobileActions } from '../mobile-focus-context'
import { DiscoverFearGreedCard } from './discover-fear-greed-card'
import { DiscoverPnlCard } from './discover-pnl-card'
import { useMobileNewsFeed } from './use-mobile-news-feed'
import type { NewsArticle } from '@pairlens/shared/instrument-types'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { PairAvatar } from '@/components/pair-picker/pair-avatar'
import {
  ArticleBanner,
  NewsFeedStatus,
  formatRelativeTime,
} from '@/components/news/news-shared'
import { formatPrice } from '@/lib/format-price'

/** Design shows five ranked rows; the rest lives behind "All markets". */
const TOP_TICKER_COUNT = 5
/** Enough to fill the sheet twice over without rendering a 50-row feed. */
const NEWS_ROW_COUNT = 12

export default memo(function MobileDiscoverPanel() {
  const { t } = useTranslation()
  const { dismissPanel, setFocusedPair, pushOverlay } = useMobileActions()

  const topCoins = useTopCoinsSnapshot()
  const news = useMobileNewsFeed()

  const coins = useMemo(
    () =>
      [...topCoins.values()]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, TOP_TICKER_COUNT),
    [topCoins],
  )

  const openAllMarkets = useCallback(
    () => pushOverlay({ kind: 'pairPicker', autoFocus: true }),
    [pushOverlay],
  )

  const openArticle = useCallback(
    (index: number) => pushOverlay({ kind: 'news', index }),
    [pushOverlay],
  )

  return (
    <div className="flex flex-col pb-2">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
        <h2 className="font-serif text-[24px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {t('mobile.panels.discoverTitle')}
        </h2>
        <button
          aria-label={t('mobile.shell.dismiss')}
          className="pl-hit-44 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          onClick={dismissPanel}
          type="button"
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
        title={t('mobile.panels.topTickers')}
      />

      {coins.map((coin, index) => (
        <button
          className="flex w-full items-center gap-3 border-t border-t-[rgba(255,255,255,0.055)] px-4 py-2.5 text-left active:bg-white/[0.06]"
          key={coin.symbol}
          onClick={() => setFocusedPair(`${coin.symbol}-USDT`)}
          type="button"
        >
          <span className="w-3 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <PairAvatar
            base={coin.symbol}
            className="size-7"
            logoUrl={coin.logoUrl}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-foreground">
            {coin.symbol}
          </span>
          <span className="shrink-0 font-mono text-[14px] font-medium tabular-nums text-foreground">
            {formatPrice(coin.price)}
          </span>
          <span
            className={cn(
              'w-[58px] shrink-0 text-right font-mono text-[11.5px] tabular-nums',
              coin.percentChange24h >= 0 ? 'text-up' : 'text-down',
            )}
          >
            {coin.percentChange24h >= 0 ? '+' : ''}
            {coin.percentChange24h.toFixed(2)}%
          </span>
        </button>
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
          className="pl-hit-44 shrink-0 text-[12px] font-medium text-primary"
          onClick={onAction}
          type="button"
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
      className="flex w-full items-start gap-3 border-t border-t-[rgba(255,255,255,0.055)] px-4 py-3 text-left active:bg-white/[0.06]"
      onClick={() => onOpen(index)}
      type="button"
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
