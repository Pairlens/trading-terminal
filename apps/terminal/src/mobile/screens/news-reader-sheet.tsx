// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The news reader (design flow B) — a host, not a screen.
 *
 * `NewsReaderDialog` is already a vertical snap feed, one article per `svh`,
 * with its own search, its own load-ahead paging and its own keyboard nav: a
 * phone pattern that happened to be built for a desk. Re-drawing it for mobile
 * would be re-drawing the thing that already fits.
 *
 * The feed comes from `useMobileNewsFeed`, the same query entry the Discover
 * list read — so `overlay.index` still points at the article the user tapped,
 * and paging inside the reader extends the list behind it.
 */
import { memo } from 'react'

import { useMobileNewsFeed } from '../panels/use-mobile-news-feed'
import type { MobileOverlay } from '../mobile-focus-context'
import { NewsReaderDialog } from '@/components/news/news-reader'

type NewsReaderSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'news' }>
  onClose: () => void
}

export default memo(function NewsReaderSheet({
  overlay,
  onClose,
}: NewsReaderSheetProps) {
  const { articles, hasMore, isLoadingMore, loadMore } = useMobileNewsFeed()

  return (
    <NewsReaderDialog
      articles={articles}
      hasMore={hasMore}
      initialIndex={overlay.index}
      isLoadingMore={isLoadingMore}
      onClose={onClose}
      onEndReached={loadMore}
    />
  )
})
