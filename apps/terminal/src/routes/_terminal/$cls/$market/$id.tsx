// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chart route: `/{class}/{venue}/{id}`.
 *
 * Three segments because each one answers a question the old `/pair/$pair`
 * could not:
 *
 * - **class** is the only thing separating spot from a perp with the same
 *   ticker on the same venue, and it lets this route branch on the page shape
 *   a prediction market will need.
 * - **venue** is the tape. Without it a shared link showed the recipient
 *   whichever venue they happened to prefer, and switching venue swapped the
 *   drawing set (keyed `market:pair`) with no history entry to undo.
 * - **id** carries its arm's own grammar: `BTC-USDT`, a contract address, a
 *   ticker, `marketId~outcome`. Symbol parsing decides nothing here.
 *
 * One dynamic route rather than five static ones. TanStack ranks static
 * segments above dynamic, so no existing route is shadowed, and an unknown
 * class is refused below rather than being allowed to render a chart of
 * nothing.
 */
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'
import { SidebarInset } from '@pairlens/ui/components/ui/sidebar'

import {
  formatInstrumentRef,
  normalizeInstrumentClass,
  normalizeInstrumentId,
  toWatchlistRef,
} from '@pairlens/shared/market-ref'
import type { MarketRef } from '@pairlens/shared/market-ref'

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
import { useWatchlistsStore } from '@/stores/watchlists-store'

export const Route = createFileRoute('/_terminal/$cls/$market/$id')({
  component: ChartTerminalPage,
})

/** A full-page version of the pane empty states: say what is wrong, and where to go. */
function RouteMessage({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Unplug className="size-10 opacity-40" />
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-center text-xs opacity-70">{description}</p>
        {action}
      </div>
    </SidebarInset>
  )
}

function ChartTerminalPage() {
  const { t } = useTranslation()
  const params = Route.useParams()
  const { markets, defaultMarket } = useAvailableMarkets()
  const { status: mdStatus, pluginsReady } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)

  const cls = normalizeInstrumentClass(params.cls)
  const marketId = params.market.toLowerCase()

  if (mdStatus !== 'connected' || markets.length === 0) {
    if (!pluginsReady) {
      return (
        <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
          </div>
        </SidebarInset>
      )
    }

    return (
      <RouteMessage
        title={t('routes.noConnectors.title')}
        description={t('routes.noConnectors.description')}
        action={
          <Link
            to="/plugins"
            search={{ tab: 'markets' }}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
          >
            {t('routes.noConnectors.manage')}
          </Link>
        }
      />
    )
  }

  // An address that names no class is a typo or a stale link, not a chart.
  if (!cls) {
    return (
      <RouteMessage
        title={t('routes.unknownClass.title')}
        description={t('routes.unknownClass.description', { cls: params.cls })}
      />
    )
  }

  // The URL is explicit about the venue, so this stays strict where the
  // resolver is lenient: a link naming a venue the user has not installed
  // says so and offers the store, rather than quietly charting a different
  // venue's tape under the same address.
  if (!markets.some((m) => m.value === marketId)) {
    return (
      <RouteMessage
        title={t('routes.unknownVenue.title')}
        description={t('routes.unknownVenue.description', {
          venue: params.market,
        })}
        action={
          <Link
            to="/plugins"
            search={{ tab: 'markets' }}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/80"
          >
            {t('routes.noConnectors.manage')}
          </Link>
        }
      />
    )
  }

  const ref: MarketRef = {
    cls,
    market: marketId,
    id: normalizeInstrumentId(cls, params.id),
  }

  const marketCreds = credentials.filter((c) => c.market === ref.market)
  const initialWallet =
    marketCreds.length === 1
      ? { walletId: marketCreds[0]!.id, market: ref.market }
      : null

  // Mounted directly, not through ChartTerminalAutoProvider: this page IS the
  // chart terminal, and the two facts the provider needs are already proven
  // above (a parsed ref, a non-empty venue list). The auto provider decides
  // from the GLOBAL active pair, which the page's own content is what sets —
  // so a moment where that global read comes back empty left the page
  // rendering chart consumers with no provider above them.
  return (
    <ActivePairProvider initial={{ pairKey: ref.id, market: ref.market }}>
      <ActiveWalletProvider initial={initialWallet}>
        <ChartTerminalContent
          marketRef={ref}
          markets={markets}
          defaultMarket={defaultMarket}
        />
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}

/**
 * Split from the page so the venue-change navigation can be built once, above
 * the provider that consumes it.
 */
function ChartTerminalContent({
  marketRef,
  markets,
  defaultMarket,
}: {
  marketRef: MarketRef
  markets: Array<MarketOption>
  defaultMarket: string
}) {
  const navigate = useNavigate()

  // Changing venue is a navigation, not a setting. That is what puts the tape
  // in shared links and makes back restore the venue AND its drawings, which
  // are keyed `market:pair` and used to swap with no history entry behind
  // them. `replace` is deliberate: flicking through venues on one pair should
  // not build a back stack the user has to walk out of.
  const handleMarketChange = useCallback(
    (next: string) => {
      if (next === marketRef.market) return
      void navigate({
        to: '/$cls/$market/$id',
        params: { cls: marketRef.cls, market: next, id: marketRef.id },
        replace: true,
      })
    },
    [navigate, marketRef.cls, marketRef.id, marketRef.market],
  )

  return (
    <ChartTerminalProvider
      pairKey={marketRef.id}
      markets={markets}
      defaultMarket={defaultMarket}
      marketOverride={marketRef.market}
      onMarketChange={handleMarketChange}
    >
      <WorkspaceProvider config={PAIR_WORKSPACE}>
        <LayoutProvider>
          <ChartTerminalBody marketRef={marketRef} markets={markets} />
        </LayoutProvider>
      </WorkspaceProvider>
    </ChartTerminalProvider>
  )
}

function ChartTerminalBody({
  marketRef,
  markets,
}: {
  marketRef: MarketRef
  markets: Array<MarketOption>
}) {
  const pairKey = marketRef.id
  // By ref, not by ticker: this page may be charting a token, whose stored
  // identity is its address while the header still shows a symbol. The VENUE
  // comes off first for the symbol-shaped arms, because a watchlist entry is
  // an instrument, not a tape: BTC-USDT starred on Binance is starred on OKX.
  const watchKey = formatInstrumentRef(toWatchlistRef(marketRef))
  const isWatched = useWatchlistsStore((s) => s.watchedRefs.has(watchKey))
  const openAddDialog = useWatchlistsStore((s) => s.openAddDialog)

  const { market, timeframe } = useChartConfig()
  const { setMarket } = useChartActions()
  const { setActivePair } = useActivePair()
  const { warmupMarket } = useMarketData()
  const [workspacesOpen, setWorkspacesOpen] = useState(false)
  const [marqueeEnabled] = useRecentTickersMarqueeEnabled()
  const [, trackRecentPair] = useRecentPairs()

  // Record every visited market — pickers only track their own navigations, so
  // direct links and marquee jumps must feed the recents history too.
  useEffect(() => {
    trackRecentPair(marketRef)
  }, [marketRef, trackRecentPair])

  // Keep the GLOBAL active pair in sync. Panes that resolve the global pair
  // (trade entry, positions, …) must trade on the venue being charted.
  useEffect(() => {
    setActivePair({ pairKey, market })
  }, [pairKey, market, setActivePair])

  // No asset-class correction effect here, and that is the point of the route
  // shape. The old page watched a persisted symbol → class side table and
  // pushed the venue around after the fact, which is what let a crypto pair
  // sit on a stock venue long enough to render a price. The class and the
  // venue now arrive together in the address, already agreeing.
  useEffect(() => {
    track('pair_opened', {
      venue: marketRef.market,
      asset_class: marketRef.cls,
      pair: pairKey,
    })
  }, [pairKey, marketRef.market, marketRef.cls])

  return (
    <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {marqueeEnabled && <RecentTickersMarquee current={marketRef} />}

      <TerminalTopBar
        marketOptions={markets}
        pairKey={pairKey}
        assetClass={marketRef.cls}
        isWatched={isWatched}
        onStarClick={() => openAddDialog(toWatchlistRef(marketRef))}
        market={market}
        onMarketChange={setMarket}
        onMarketHover={(m) => warmupMarket(m, pairKey, timeframe)}
        onPairHover={(p) => warmupMarket(market, p, timeframe)}
        workspacesOpen={workspacesOpen}
        onWorkspacesOpenChange={setWorkspacesOpen}
      />

      <LayoutShell />
    </SidebarInset>
  )
}
