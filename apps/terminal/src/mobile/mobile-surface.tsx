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
import { Suspense, memo, useCallback, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  openPanelFor,
  useMobileActions,
  useMobileFocus,
  useMobileNav,
} from './mobile-focus-context'
import { useMobileRouteSync } from './use-mobile-route-sync'
import { SHEET_BAND } from './lib/mobile-geometry'
import { ContextBar } from './primitives/context-bar'
import { FullScreenOverlay } from './primitives/full-screen-overlay'
import { MobileScrim } from './primitives/mobile-scrim'
import { MobileSheet } from './primitives/mobile-sheet'
import { MobileTabBar } from './primitives/mobile-tab-bar'
import { MobileChartSurface } from './chart/mobile-chart-surface'
import type { MobileOverlay, MobileTab } from './mobile-focus-context'
import type { ComponentType, LazyExoticComponent } from 'react'
import { lazyChunk } from '@/lib/lazy-chunk'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useChartActions, useChartConfig } from '@/lib/chart-terminal-context'
import { track } from '@/lib/analytics-events'

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
        onDismiss={dismissPanel}
        onSwitchVenue={openVenuePicker}
        opacity={chrome?.chartOpacity ?? 1}
        timeframeSlot={<TimeframeChip />}
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
 * The overlay stack's renderer.
 *
 * Every kind wears the same `FullScreenOverlay` frame. The bodies below are
 * PLACEHOLDERS owned by other workstreams — WS-B (pair picker, venue picker,
 * Settings, connect, news) and WS-C (order book). To wire a real screen,
 * swap the one placeholder element for a `lazyChunk` import of the screen;
 * nothing else in this file changes.
 */
const OverlayHost = memo(function OverlayHost({
  overlay,
  onClose,
}: {
  overlay: MobileOverlay
  onClose: () => void
}) {
  const { t } = useTranslation()

  const title = {
    orderbook: t('mobile.shell.overlays.orderbook'),
    pairPicker: t('mobile.shell.overlays.pairPicker'),
    venuePicker: t('mobile.shell.overlays.venuePicker'),
    settings: t('mobile.shell.overlays.settings'),
    connect: t('mobile.shell.overlays.connect'),
    news: t('mobile.shell.overlays.news'),
  }[overlay.kind]

  return (
    <FullScreenOverlay
      // Settings owns the whole display and closes with an X; everything else
      // keeps the context bar and steps back out of a flow.
      anchor={overlay.kind === 'settings' ? 'screen' : 'chart'}
      display={overlay.kind === 'orderbook'}
      dismiss={overlay.kind === 'settings' ? 'close' : 'back'}
      onBack={onClose}
      opaque={overlay.kind !== 'pairPicker'}
      title={title}
    >
      {/* WS-B / WS-C: replace with the screen for this kind. */}
      <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          {t('mobile.shell.comingSoon')}
        </p>
      </div>
    </FullScreenOverlay>
  )
})

/**
 * The timeframe chip, and a deliberately minimal popover behind it.
 *
 * WS-D owns `chart/timeframe-popover.tsx` (pinned/more grids, long-press to
 * pin). This is the shell's fallback so the surface is usable before that
 * lands: same chip, same inversion, same scrim, a flat list instead of two
 * grids. Replace `<TimeframeChip />` above with WS-D's component.
 *
 * The values are re-declared rather than imported because `TIMEFRAME_OPTIONS`
 * in `components/terminal/chart-toolbar.tsx` is module-private and that file
 * belongs to WS-D. It is the source of truth; this list is a stand-in.
 */
const FALLBACK_TIMEFRAMES = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const

function TimeframeChip() {
  const { t } = useTranslation()
  const { timeframe } = useChartConfig()
  const { setTimeframe } = useChartActions()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        aria-label={t('mobile.shell.timeframe')}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-[10px] pl-[11px] pr-[7px] font-mono text-[13.5px] font-semibold',
          open
            ? 'bg-foreground text-background'
            : 'text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]',
        )}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {timeframe}
        <ChevronDown
          className={cn(
            'size-4',
            open ? 'rotate-180 text-background' : 'text-muted-foreground',
          )}
        />
      </button>
      {open ? (
        <>
          <MobileScrim className="z-[45]" onDismiss={() => setOpen(false)} />
          <div
            className="pl-popover fixed right-4 z-[46] grid w-[238px] grid-cols-4 gap-1.5 p-[9px]"
            // Chart top + the readout row's 8px inset + the 36px chip + 8px:
            // the popover hangs off the chip rather than covering it.
            style={{ top: 'calc(var(--pl-chart-top) + 52px)' }}
          >
            {FALLBACK_TIMEFRAMES.map((value) => (
              <button
                className={cn(
                  'flex h-[38px] items-center justify-center rounded-[10px] font-mono text-[12.5px] font-semibold',
                  value === timeframe
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]',
                )}
                key={value}
                onClick={() => {
                  setTimeframe(value)
                  track('timeframe_changed', { timeframe: value })
                  setOpen(false)
                }}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
