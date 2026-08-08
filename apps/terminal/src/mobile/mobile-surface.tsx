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
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
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
import { litTab } from './lib/overlay-tabs'
import { planPanelSwap } from './lib/panel-swap'
import { ContextBar } from './primitives/context-bar'
import { MobileSheet } from './primitives/mobile-sheet'
import { MobileTabBar } from './primitives/mobile-tab-bar'
import { MobileChartSurface } from './chart/mobile-chart-surface'
import type { MobileOverlay, MobileTab } from './mobile-focus-context'
import type { ComponentType, LazyExoticComponent } from 'react'
import { importChunk, lazyChunk } from '@/lib/lazy-chunk'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

type PanelTab = Exclude<MobileTab, 'chart'>

/**
 * The panel modules, as bare factories.
 *
 * They are named rather than inlined into `lazyChunk` so the SAME specifier
 * can be warmed ahead of time (see `usePanelPrefetch`): `lazyChunk` wraps an
 * import, it does not expose it, and re-importing the identical specifier hits
 * the module cache instead of fetching twice. A cache-busted variant would
 * fork the module graph — the repo has paid for that lesson once already.
 */
const importWatchlistPanel = () => import('./panels/watchlist-panel')
const importTradePanel = () => import('./panels/trade-panel')
const importCopilotPanel = () => import('./panels/copilot-panel')
const importDiscoverPanel = () => import('./panels/discover-panel')

/**
 * The panel slot. Each module's DEFAULT export is the contract, and each file
 * is owned by another workstream — replacing a file's contents is the whole
 * integration, no edit here required.
 */
const PANELS: Record<PanelTab, LazyExoticComponent<ComponentType>> = {
  watchlist: lazyChunk(importWatchlistPanel),
  trade: lazyChunk(importTradePanel),
  copilot: lazyChunk(importCopilotPanel),
  discover: lazyChunk(importDiscoverPanel),
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
const MarketsScreen = lazyChunk(() => import('./screens/markets-screen'))
const AccountDetailScreen = lazyChunk(
  () => import('./screens/account-detail-screen'),
)

/** Chart-band extras, owned by WS-D (toolbar, timeframe) and WS-C (limit line). */
const importTimeframePopover = () => import('./chart/timeframe-popover')
const importDrawingToolbar = () => import('./chart/drawing-toolbar')
const importLimitLine = () => import('./chart/limit-line-overlay')

const TimeframePopoverChip = lazyChunk(importTimeframePopover)
const MobileDrawingToolbar = lazyChunk(importDrawingToolbar)
const LimitLineOverlay = lazyChunk(importLimitLine)

/**
 * Everything a tap can reach without a network round trip, warmed once the
 * first screen is idle.
 *
 * A tab switch that stops on a Suspense spinner is the single loudest "this
 * is a page navigation" signal the shell can send, and it is entirely
 * avoidable: the four panel chunks together are small next to the chart engine
 * that has already loaded by the time this runs. Order is by likelihood of
 * being tapped, and they are awaited one at a time so the warm-up never
 * competes with the market sockets for the connection.
 */
const PREFETCH: Array<() => Promise<unknown>> = [
  importWatchlistPanel,
  importTradePanel,
  importDiscoverPanel,
  importCopilotPanel,
  importTimeframePopover,
  importDrawingToolbar,
  importLimitLine,
]

/** `requestIdleCallback`, with the timeout every Safari release still needs. */
function onIdle(run: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const idle = (
    window as typeof window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
  ).requestIdleCallback
  if (typeof idle === 'function') {
    const handle = idle(run, { timeout: 3000 })
    return () => {
      ;(
        window as typeof window & { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback?.(handle)
    }
  }
  const timer = window.setTimeout(run, 1500)
  return () => window.clearTimeout(timer)
}

function usePanelPrefetch(): void {
  useEffect(() => {
    let cancelled = false
    const cancelIdle = onIdle(() => {
      void (async () => {
        for (const load of PREFETCH) {
          if (cancelled) return
          // A warm-up that fails is not an error the user should ever see;
          // the real import will retry (and recover) when the tab is tapped.
          await importChunk(load).catch(() => undefined)
        }
      })()
    })
    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [])
}

/**
 * Which panel the sheet is SHOWING, which is not always the one the tab bar
 * points at: the outgoing panel is held while it fades, and held again while
 * the sheet slides off screen. See lib/panel-swap.ts for the rule.
 *
 * Every adoption goes through `startTransition`, and that is what actually
 * removes the spinner. Warming the module is only half the job: a
 * `React.lazy` payload is still "uninitialized" until its component is
 * rendered for the first time, so the first render of a warm chunk suspends
 * anyway — and React then holds the fallback on screen for its
 * just-noticeable-difference window, measured here at ~300ms. Inside a
 * transition React keeps the CURRENT children instead of showing a fallback,
 * so the panel simply arrives (next frame, because the module is already
 * warm). `isPending` keeps the content faded for however long that takes, so
 * a cold tap on a slow connection reads as a beat rather than a spinner.
 */
function usePanelSwap(requested: PanelTab | null): {
  shown: PanelTab | null
  leaving: boolean
} {
  const [shown, setShown] = useState<PanelTab | null>(requested)
  const [fadingOut, setFadingOut] = useState(false)
  const [isPending, startTransition] = useTransition()
  // The INTENDED panel, which leads `shown` while a transition is in flight.
  // Planning against the rendered value would re-plan a swap already underway.
  const shownRef = useRef<PanelTab | null>(requested)

  const adopt = useCallback(
    (panel: PanelTab | null) => {
      shownRef.current = panel
      startTransition(() => setShown(panel))
    },
    [startTransition],
  )

  useEffect(() => {
    const command = planPanelSwap(shownRef.current, requested)
    if (command.kind === 'none') {
      setFadingOut(false)
      return
    }
    if (command.kind === 'show') {
      setFadingOut(false)
      adopt(command.panel)
      return
    }
    if (command.kind === 'fadeThenShow') {
      setFadingOut(true)
      const timer = window.setTimeout(() => {
        setFadingOut(false)
        adopt(command.panel)
      }, command.delay)
      return () => window.clearTimeout(timer)
    }
    // clearAfter: the sheet is on its way out; keep the content until it is.
    const timer = window.setTimeout(() => adopt(null), command.delay)
    return () => window.clearTimeout(timer)
  }, [requested, adopt])

  return { shown, leaving: fadingOut || isPending }
}

export function MobileSurface() {
  const { t } = useTranslation()
  useMobileRouteSync()
  usePanelPrefetch()

  const { activeTab, overlays } = useMobileNav()
  const { focusedVenue } = useMobileFocus()
  const { selectTab, dismissPanel, pushOverlay, popOverlay } =
    useMobileActions()
  const { markets } = useAvailableMarkets()

  const openPanel = openPanelFor(activeTab)
  // The sheet's own idea of what it holds — it lags `openPanel` through the
  // fade and through vaul's exit, which is what keeps the chrome still.
  const { shown, leaving } = usePanelSwap(openPanel)
  const Panel = shown ? PANELS[shown] : null
  // Geometry follows the REQUEST (the sheet starts travelling the instant the
  // tab changes) and falls back to the outgoing panel while it slides away, so
  // a closing sheet never re-aims at a height nobody asked for.
  const chrome = openPanel
    ? PANEL_CHROME[openPanel]
    : shown
      ? PANEL_CHROME[shown]
      : null
  const venueLabel =
    markets.find((m) => m.value === focusedVenue)?.label ??
    focusedVenue.toUpperCase()
  // Which tab the bar lights up: none while an overlay that belongs to no tab
  // covers the app, Trade while the order book is open.
  const lit = litTab(activeTab, overlays)

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
        bandHeight={chrome?.band}
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
          // The draggable price level exists to place stop/limit levels, and
          // those live on the Trade ticket — a persisted draft must not leave
          // a grab handle floating over the bare chart or any other panel.
          openPanel === 'trade' ? (
            <Suspense fallback={null}>
              <LimitLineOverlay />
            </Suspense>
          ) : null
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
        swapping={leaving}
        variant={chrome?.variant ?? 'default'}
      >
        {/* The boundary is mounted even with nothing in it. A boundary that
            appears WITH its suspending child has no current children to keep,
            so React must paint the fallback; one that is already there simply
            holds what it has until the transition above resolves. */}
        <Suspense fallback={<PanelFallback />}>
          {Panel ? <Panel /> : null}
        </Suspense>
      </MobileSheet>

      <MobileTabBar
        active={lit}
        onChange={selectTab}
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
      case 'markets':
        return <MarketsScreen onClose={onClose} overlay={overlay} />
      case 'accountDetail':
        return <AccountDetailScreen onClose={onClose} overlay={overlay} />
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
