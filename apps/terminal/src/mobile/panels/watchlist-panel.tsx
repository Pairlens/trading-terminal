// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * PLACEHOLDER — owned by WS-B (blueprint §D.5).
 *
 * WS-A ships this file so `mobile-surface.tsx`'s lazyChunk import resolves and
 * the five-tab surface is functional end to end. Replace the contents in
 * place: the default export is the contract, and the panel is rendered inside
 * a `MobileSheet` at `SHEET_BAND.watchlist`, so it owns no sheet chrome.
 */
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

export default memo(function MobileWatchlistPanel() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-12 text-center">
      <p className="text-[15px] font-semibold text-foreground">
        {t('mobile.shell.tabs.watchlist')}
      </p>
      <p className="text-[12.5px] text-muted-foreground">
        {t('mobile.shell.comingSoon')}
      </p>
    </div>
  )
})
