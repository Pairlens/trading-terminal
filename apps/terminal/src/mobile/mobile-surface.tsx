// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The mobile terminal, assembled: context bar, chart floor, one docked panel,
 * the overlay stack, and the tab bar.
 *
 * Layout is absolute rather than flow because the chart is the floor and
 * everything else is a layer over it — the chart must keep its size while a
 * sheet slides across two thirds of it. Every offset resolves from the four
 * variables in `mobile.css`; no literal 402 × 874 measurement appears here.
 *
 * Panels are code-split through `lazyChunk` (never bare `React.lazy` — see
 * lib/lazy-chunk) and unmount when their tab is not active. The Trade draft
 * survives that because it lives in a store, not in the sheet.
 */
import { Suspense, memo, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  openPanelFor,
  useMobileActions,
  useMobileFocus,
  useMobileNav,
} from './mobile-focus-context'
import { useMobileRouteSync } from './use-mobile-route-sync'
import { SHEET_BAND } from './lib/mobile-geometry'
import { ContextBar } from './primitives/context-bar'
import { MobileSheet } from './primitives/mobile-sheet'
import { MobileTabBar } from './primitives/mobile-tab-bar'
import { MobileChartSurface } from './chart/mobile-chart-surface'
import type { MobileOverlay, MobileTab } from './mobile-focus-context'
import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyChunk } from '@/lib/lazy-chunk'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

type PanelTab = Exclude<MobileTab, 'chart'>

/**
 * The panel slot. Each module's DEFAULT export is the contract, and each file
 * is owned by another workstream — replacing a file's contents is the whole
 * integration, no edit here required.
 */
const PANELS: Record<PanelTab, LazyExoticComponent<ComponentType>> = {
  watchlist: lazyChunk(() => import('./panels/watchlist-panel')),
  trade: lazyChunk(() => import('./panels/trade-panel')),
  copilot: lazyChunk(() => import('./panels/copilot-panel')),
  discover: lazyChunk(() => import('./panels/discover-panel')),
}

/** Sheet geometry and chart treatment per panel — one table, not per-panel CSS. */
const PANEL_CHROME: Record<
  PanelTab,
  { band: number; chartOpacity: number; variant: 'default' | 'copilot' }
> = {
  watchlist: {
    band: SHEET_BAND.watchlist,
    chartOpacity: 0.7,
    variant: 'default',
  },
  trade: { band: SHEET_BAND.trade, chartOpacity: 1, variant: 'default' },
  copilot: { band: SHEET_BAND.copilot, chartOpacity: 1, variant: 'copilot' },
  discover: {
    band: SHEET_BAND.discover,
    chartOpacity: 0.7,
    variant: 'default',
  },
}

/** Static keys — the i18n audit cannot follow a template literal. */
const PANEL_LABEL_KEY: Record<PanelTab, string> = {
  watchlist: 'mobile.shell.tabs.watchlist',
  trade: 'mobile.shell.tabs.trade',
  copilot: 'mobile.shell.tabs.copilot',
  discover: 'mobile.shell.tabs.discover',
}

/**
 * Overlay screens, one module per overlay kind. Each module's DEFAULT export
 * is the contract — `{ overlay, onClose }`, with the screen owning its own
 * frame (FullScreenOverlay or a full-height MobileSheet). Each file is owned
 * by one workstream; replacing a file's contents is the whole integration.
 */
const OrderbookScreen = lazyChunk(() => import('./screens/orderbook-screen'))
const PairPickerScreen = lazyChunk(() => import('./screens/pair-picker-screen'))
const VenuePickerScreen = lazyChunk(
  () => import('./screens/venue-picker-screen'),
)
const SettingsScreen = lazyChunk(() => import('./screens/settings-screen'))
const ConnectAccountSheet = lazyChunk(
  () => import('./screens/connect-account-sheet'),
)
const NewsReaderSheet = lazyChunk(() => import('./screens/news-reader-sheet'))

/** Chart-band extras, owned by WS-D (toolbar, timeframe) and WS-C (limit line). */
const TimeframePopoverChip = lazyChunk(
  () => import('./chart/timeframe-popover'),
)
const MobileDrawingToolbar = lazyChunk(() => import('./chart/drawing-toolbar'))
const LimitLineOverlay = lazyChunk(() => import('./chart/limit-line-overlay'))

export function MobileSurface() {
  const { t } = useTranslation()
  useMobileRouteSync()

  const { activeTab, overlays } = useMobileNav()
  const { focusedVenue } = useMobileFocus()
  const { setActiveTab, dismissPanel, pushOverlay, popOverlay } =
    useMobileActions()
  const { markets } = useAvailableMarkets()

  const openPanel = openPanelFor(activeTab)
  const chrome = openPanel ? PANEL_CHROME[openPanel] : null
  const Panel = openPanel ? PANELS[openPanel] : null
  const venueLabel =
    markets.find((m) => m.value === focusedVenue)?.label ??
    focusedVenue.toUpperCase()

  const openPairPicker = useCallback(
    () => pushOverlay({ kind: 'pairPicker' }),
    [pushOverlay],
  )
  const openSearch = useCallback(
    () => pushOverlay({ kind: 'pairPicker', autoFocus: true }),
    [pushOverlay],
  )
  const openVenuePicker = useCallback(
    () => pushOverlay({ kind: 'venuePicker' }),
    [pushOverlay],
  )
  const openSettings = useCallback(
    () => pushOverlay({ kind: 'settings' }),
    [pushOverlay],
  )

  const handleSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) dismissPanel()
    },
    [dismissPanel],
  )

  // Only the top of the stack is on screen. It IS a stack because
  // Settings → Add account → Connect and Trade → Connect → back both need one.
  const topOverlay = overlays[overlays.length - 1]

  return (
    <div className="pl-mobile-root relative flex h-svh w-full flex-col overflow-hidden bg-background">
      <MobileChartSurface
        band={openPanel ? 'compact' : 'full'}
        dismissible={openPanel !== null}
        footer={
          openPanel === null ? (
            <Suspense fallback={null}>
              <MobileDrawingToolbar />
            </Suspense>
          ) : null
        }
        onDismiss={dismissPanel}
        onSwitchVenue={openVenuePicker}
        opacity={chrome?.chartOpacity ?? 1}
        overlay={
          <Suspense fallback={null}>
            <LimitLineOverlay />
          </Suspense>
        }
        timeframeSlot={
          <Suspense fallback={null}>
            <TimeframePopoverChip />
          </Suspense>
        }
        venueLabel={venueLabel}
      />

      <ContextBar
        onOpenPairPicker={openPairPicker}
        onOpenSearch={openSearch}
        onOpenSettings={openSettings}
        onOpenVenuePicker={openVenuePicker}
      />

      <MobileSheet
        band={chrome?.band ?? SHEET_BAND.watchlist}
        label={t(
          openPanel ? PANEL_LABEL_KEY[openPanel] : 'mobile.shell.tabs.label',
        )}
        onOpenChange={handleSheetOpenChange}
        open={openPanel !== null}
        variant={chrome?.variant ?? 'default'}
      >
        {Panel ? (
          <Suspense fallback={<PanelFallback />}>
            <Panel />
          </Suspense>
        ) : null}
      </MobileSheet>

      <MobileTabBar
        active={activeTab}
        onChange={setActiveTab}
        variant={openPanel ? 'solid' : 'float'}
      />

      {topOverlay ? (
        <OverlayHost onClose={popOverlay} overlay={topOverlay} />
      ) : null}
    </div>
  )
}

function PanelFallback() {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
    </div>
  )
}

/**
 * The overlay stack's renderer. One screen module per kind (see the lazy
 * imports above); each screen owns its own frame and receives the narrowed
 * overlay plus `onClose`. The switch exists for type narrowing — TypeScript
 * cannot index a component map with a discriminated union and keep the
 * narrowing.
 */
const OverlayHost = memo(function OverlayHost({
  overlay,
  onClose,
}: {
  overlay: MobileOverlay
  onClose: () => void
}) {
  const screen = (() => {
    switch (overlay.kind) {
      case 'orderbook':
        return <OrderbookScreen onClose={onClose} overlay={overlay} />
      case 'pairPicker':
        return <PairPickerScreen onClose={onClose} overlay={overlay} />
      case 'venuePicker':
        return <VenuePickerScreen onClose={onClose} overlay={overlay} />
      case 'settings':
        return <SettingsScreen onClose={onClose} overlay={overlay} />
      case 'connect':
        return <ConnectAccountSheet onClose={onClose} overlay={overlay} />
      case 'news':
        return <NewsReaderSheet onClose={onClose} overlay={overlay} />
    }
  })()

  return <Suspense fallback={<OverlayFallback />}>{screen}</Suspense>
})

function OverlayFallback() {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
    </div>
  )
}
