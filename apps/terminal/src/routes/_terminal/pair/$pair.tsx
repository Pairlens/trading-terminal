// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
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
  ChartTerminalAutoProvider,
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

function PairTerminalPage() {
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
          <p className="text-sm font-medium">No market connectors available</p>
          <p className="max-w-xs text-center text-xs opacity-70">
            Market connector plugins are required to stream live data. Enable or
            install a connector to get started.
          </p>
          <Link
            to="/plugins"
            search={{ tab: 'markets' }}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
          >
            Manage Market Connectors
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

  return (
    <ActivePairProvider initial={{ pairKey, market: defaultMarket }}>
      <ActiveWalletProvider initial={initialWallet}>
        <ChartTerminalAutoProvider>
          <WorkspaceProvider config={PAIR_WORKSPACE}>
            <LayoutProvider>
              <PairTerminalContent pairKey={pairKey} markets={markets} />
            </LayoutProvider>
          </WorkspaceProvider>
        </ChartTerminalAutoProvider>
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
    const current = marketsSupportStocks(markets, market)
    const wantStocks = assetClass === 'stocks'
    if (wantStocks === current) return
    const target = markets.find(
      (m) => m.assetClasses.includes('stocks') === wantStocks,
    )
    if (target) setMarket(target.value)
  }, [assetClass, market, markets, setMarket])

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
          workspacesOpen={workspacesOpen}
          onWorkspacesOpenChange={setWorkspacesOpen}
        />

        {/* Dynamic layout */}
        <LayoutShell />
      </SidebarInset>
    </>
  )
}
