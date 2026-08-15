// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import type { MarketOption } from '@/hooks/use-available-markets'
import { track } from '@/lib/analytics-events'
import { TerminalTopBar } from '@/components/terminal/terminal-top-bar'
import { RecentTickersMarquee } from '@/components/terminal/recent-tickers-marquee'
import { LayoutShell } from '@/components/layout/layout-shell'
import {
  useRecentPairs,
  useRecentTickersMarqueeEnabled,
} from '@/lib/recent-tickers'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import {
  ChartTerminalProvider,
  useChartActions,
  useChartConfig,
} from '@/lib/chart-terminal-context'
import { ActivePairProvider, useActivePair } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { useCredentialsStore } from '@/stores/credentials-store'
import { LayoutProvider } from '@/lib/layout/context'
import { WorkspaceProvider } from '@/lib/layout/workspace-context'
import { PAIR_WORKSPACE } from '@/lib/layout/workspaces/pair-workspace'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { lookupPredictionOutcome } from '@/stores/prediction-directory-store'

export const Route = createFileRoute('/_terminal/pair/$pair')({
  component: PairTerminalPage,
})

const normalizePairKey = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[\\/_]/g, '-')

/** Whether the given market id serves the stocks asset class. */
const marketsSupportStocks = (markets: Array<MarketOption>, marketId: string) =>
  markets.find((m) => m.value === marketId)?.assetClasses.includes('stocks') ??
  false

/** Whether the given market id serves the prediction asset class. */
const marketsSupportPredictions = (
  markets: Array<MarketOption>,
  marketId: string,
) =>
  markets
    .find((m) => m.value === marketId)
    ?.assetClasses.includes('prediction') ?? false

function PairTerminalPage() {
  const { t } = useTranslation()
  const { pair } = Route.useParams()
  const pairKey = normalizePairKey(pair)
  const { markets, defaultMarket } = useAvailableMarkets()
  const { status: mdStatus, pluginsReady } = useMarketData()

  // Must be called before early returns to satisfy Rules of Hooks
  const credentials = useCredentialsStore((s) => s.credentials)

  if (mdStatus !== 'connected' || markets.length === 0) {
    // Plugins still loading — show spinner
    if (!pluginsReady) {
      return (
        <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
          </div>
        </SidebarInset>
      )
    }

    // Plugins loaded but no market connectors available
    return (
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Unplug className="size-10 opacity-40" />
          <p className="text-sm font-medium">
            {t('routes.noConnectors.title')}
          </p>
          <p className="max-w-xs text-center text-xs opacity-70">
            {t('routes.noConnectors.description')}
          </p>
          <Link
            to="/plugins"
            search={{ tab: 'markets' }}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
          >
            {t('routes.noConnectors.manage')}
          </Link>
        </div>
      </SidebarInset>
    )
  }

  // Derive initial wallet: first credential for the default market (if exactly one)
  const marketCreds = credentials.filter((c) => c.market === defaultMarket)
  const initialWallet =
    marketCreds.length === 1
      ? { walletId: marketCreds[0]!.id, market: defaultMarket }
      : null

  // Mounted directly, not through ChartTerminalAutoProvider: this page IS the
  // chart terminal, and the two facts the provider needs are already proven
  // above (a route param for the pair, a non-empty venue list). The auto
  // provider decides from the GLOBAL active pair, which the page's own content
  // is what sets — so a moment where that global read comes back empty left
  // the page rendering chart consumers with no provider above them, and the
  // whole terminal died on `useChartConfig must be used within a
  // ChartTerminalProvider`. Here the provider is unconditional.
  return (
    <ActivePairProvider initial={{ pairKey, market: defaultMarket }}>
      <ActiveWalletProvider initial={initialWallet}>
        <ChartTerminalProvider
          pairKey={pairKey}
          markets={markets}
          defaultMarket={defaultMarket}
        >
          <WorkspaceProvider config={PAIR_WORKSPACE}>
            <LayoutProvider>
              <PairTerminalContent pairKey={pairKey} markets={markets} />
            </LayoutProvider>
          </WorkspaceProvider>
        </ChartTerminalProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}

function PairTerminalContent({
  pairKey,
  markets,
}: {
  pairKey: string
  markets: Array<MarketOption>
}) {
  const isWatched = useWatchlistsStore((s) => s.allSymbolsSet.has(pairKey))
  const openAddDialog = useWatchlistsStore((s) => s.openAddDialog)
  const [assetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const { market, timeframe } = useChartConfig()
  const { setMarket } = useChartActions()
  const { setActivePair } = useActivePair()
  const { warmupMarket } = useMarketData()
  const [workspacesOpen, setWorkspacesOpen] = useState(false)
  const [marqueeEnabled] = useRecentTickersMarqueeEnabled()
  const [, trackRecentPair] = useRecentPairs()

  // Record every visited pair — pickers only track their own navigations, so
  // direct links and marquee jumps must feed the recents history too.
  useEffect(() => {
    trackRecentPair(pairKey)
  }, [pairKey, trackRecentPair])

  // Keep the GLOBAL active pair in sync with the venue picked in the top
  // bar. Panes that resolve the global pair (trade entry, positions, …)
  // must trade on the venue being charted — not the route's default market.
  useEffect(() => {
    setActivePair({ pairKey, market })
  }, [pairKey, market, setActivePair])

  // Route the pair to a venue of the matching asset class. A stock pair
  // (AAPL-USD) can't stream from a crypto exchange and vice versa, so when
  // the sticky market doesn't serve the selected pair's class, switch to the
  // first venue that does. Pairs with an unknown class are left alone.
  const assetClass = assetClassMap[pairKey]

  // Product analytics: which markets/venues users actually open.
  useEffect(() => {
    track('pair_opened', {
      venue: market,
      asset_class: assetClass ?? 'crypto',
      pair: pairKey,
    })
  }, [pairKey, market, assetClass])
  useEffect(() => {
    if (!assetClass) return
    // Predictions are their own venue set, not the other half of a binary: an
    // outcome key streams from Kalshi or Polymarket and from nowhere else, and
    // the stocks/not-stocks split would happily leave it on Binance (a crypto
    // venue is correctly "not stocks"). So route it explicitly first, and only
    // then fall through to the binary the other classes share.
    if (assetClass === 'prediction') {
      // An event contract exists on exactly one venue, and the directory pin
      // names it. Class-level routing ("any prediction venue") is wrong here:
      // it left a Polymarket key charting against Kalshi, which then queried a
      // market that does not exist there. The pin wins even over a
      // desktop-only venue — the connector's own "needs the desktop app" is
      // the truthful state, not a reason to hop venues.
      const owner = lookupPredictionOutcome(pairKey)?.market
      const ownerOption = owner
        ? markets.find((m) => m.value === owner)
        : undefined
      if (ownerOption) {
        if (ownerOption.value !== market) setMarket(ownerOption.value)
        return
      }
      // Cold link the directory never saw: fall back to reachability, not
      // just class. Kalshi registers before Polymarket and its REST hosts
      // answer 403 to any foreign Origin, so "the first venue that serves
      // predictions" put every shared outcome link on a venue a browser
      // cannot load — a dead end rather than a correction. Verified in the
      // browser preview. On desktop nothing is desktop-only and this reads
      // as the plain first match.
      const current = markets.find((m) => m.value === market)
      const onPredictionVenue =
        current?.assetClasses.includes('prediction') ?? false
      if (onPredictionVenue && !current?.desktopOnly) return
      const reachable = markets.find(
        (m) => m.assetClasses.includes('prediction') && !m.desktopOnly,
      )
      // With no reachable one, a venue already serving predictions is left
      // alone: the connector refuses with its own "needs the desktop app",
      // which says more than silently hopping to another unreachable venue.
      const target =
        reachable ??
        (onPredictionVenue
          ? undefined
          : markets.find((m) => m.assetClasses.includes('prediction')))
      if (target && target.value !== market) setMarket(target.value)
      return
    }
    const current = marketsSupportStocks(markets, market)
    const wantStocks = assetClass === 'stocks'
    // A prediction venue reads as "not stocks", so the binary alone would
    // leave a crypto pair sitting on Kalshi. Leaving one is always wrong for
    // a non-prediction pair, whichever side of the binary it wants.
    if (!marketsSupportPredictions(markets, market) && wantStocks === current)
      return
    const target = markets.find(
      (m) =>
        !m.assetClasses.includes('prediction') &&
        m.assetClasses.includes('stocks') === wantStocks,
    )
    if (target) setMarket(target.value)
  }, [assetClass, pairKey, market, markets, setMarket])

  return (
    <>
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Recently viewed pairs with live prices */}
        {marqueeEnabled && <RecentTickersMarquee currentPairKey={pairKey} />}

        {/* Top bar */}
        <TerminalTopBar
          marketOptions={markets}
          pairKey={pairKey}
          assetClass={assetClassMap[pairKey]}
          isWatched={isWatched}
          onStarClick={() => openAddDialog(pairKey)}
          market={market}
          onMarketChange={setMarket}
          onMarketHover={(m) => warmupMarket(m, pairKey, timeframe)}
          onPairHover={(p) => warmupMarket(market, p, timeframe)}
          workspacesOpen={workspacesOpen}
          onWorkspacesOpenChange={setWorkspacesOpen}
        />

        {/* Dynamic layout */}
        <LayoutShell />
      </SidebarInset>
    </>
  )
}
