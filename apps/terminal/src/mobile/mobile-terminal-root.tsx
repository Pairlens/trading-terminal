// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Everything the mobile shell owns, and nothing the app already provides.
 *
 * `_terminal.tsx` branches here from inside `OmniSearchProvider`, so every
 * global provider — plugins, market data, themes, watchlists, the toaster —
 * is ALREADY above this component and survives a resize across the breakpoint
 * in both directions. What this file adds is the per-pair stack:
 *
 *   ActivePairProvider → ActiveWalletProvider → ChartTerminalProvider
 *
 * `ChartTerminalProvider` is mounted unconditionally, never through
 * `ChartTerminalAutoProvider`. The auto provider decides from the GLOBAL
 * active pair, which one empty read is enough to crash every chart consumer
 * below it (see the note at `pair/$pair.tsx`). Here the two preconditions —
 * a resolved pair and a non-empty venue list — are proven above the mount,
 * and the guards below are the same two `$pair.tsx` renders.
 *
 * No `stateScope`: the phone shares the desktop's timeframe and drawings for
 * the same user on the same device. A level drawn on the phone is there on the
 * laptop, and dragging the window across 768px does not silently revert the
 * timeframe to 15m.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MobileFocusProvider } from './mobile-focus-context'
import { MobileSurface } from './mobile-surface'
import { marketRefFromPath, normalizePairKey } from './use-mobile-route-sync'
import { getInitialViewportMode } from './use-viewport-mode'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import { useRecentPairs } from '@/lib/recent-tickers'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalProvider } from '@/lib/chart-terminal-context'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { useCredentialsStore } from '@/stores/credentials-store'
import { track } from '@/lib/analytics-events'

/** Last resort when there is no route pair and no history. */
const FALLBACK_PAIR = 'BTC-USDT'

export function MobileTerminalRoot() {
  const { t } = useTranslation()
  const location = useLocation()
  const { markets, defaultMarket } = useAvailableMarkets()
  const { status, pluginsReady } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)
  const [recentPairs] = useRecentPairs()

  // Resolved once, synchronously, from the URL the app opened on — an effect
  // here would paint one frame of the wrong pair on every cold load. The class
  // travels with the pair: it is half of what decides which venue may serve
  // it, and deriving it later from a side table is what let a crypto pair sit
  // on a stock venue long enough to render.
  const [focus, setFocus] = useState<{ pair: string; cls: InstrumentClass }>(
    () => {
      const routed = marketRefFromPath(location.pathname)
      if (routed) return { pair: routed.id, cls: routed.cls }
      const recent = recentPairs[0]
      if (recent) return { pair: recent.id, cls: recent.cls }
      return { pair: FALLBACK_PAIR, cls: 'spot' }
    },
  )
  const focusedPair = focus.pair
  const focusedClass = focus.cls

  // State only. The URL is written by `useMobileRouteSync`, which is the one
  // place that can see all three parts of the address: the venue lives in
  // chart config, BELOW this component, so a rewrite from here could only ever
  // guess at it.
  const setFocusedPair = useCallback(
    (pairKey: string, cls?: InstrumentClass) => {
      setFocus((prev) => {
        const pair = normalizePairKey(pairKey)
        const next = cls ?? prev.cls
        if (prev.pair === pair && prev.cls === next) return prev
        return { pair, cls: next }
      })
    },
    [],
  )

  useEffect(() => {
    track('mobile_terminal_opened', {
      entry: getInitialViewportMode() === 'mobile' ? 'direct' : 'resize',
    })
  }, [])

  if (status !== 'connected' || markets.length === 0) {
    if (!pluginsReady) {
      return (
        <div className="flex h-svh items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
        </div>
      )
    }

    // No link to /plugins: `_terminal.tsx` renders this shell INSTEAD of the
    // <Outlet/> at mobile width, so that route can never mount here — the
    // desktop twin's button would change the URL and repaint this same screen,
    // on a page with nothing else on it. What the phone can offer is a retry
    // and an honest sentence about where connectors are managed.
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-muted-foreground">
        <Unplug className="size-10 opacity-40" />
        <p className="text-sm font-medium">{t('routes.noConnectors.title')}</p>
        <p className="max-w-xs text-xs opacity-70">
          {t('routes.noConnectors.description')}
        </p>
        <p className="max-w-xs text-xs opacity-70">
          {t('mobile.shell.connectorsManagedOnDesktop')}
        </p>
        <button
          className="mt-2 rounded-md bg-accent px-3 py-2 text-xs font-medium text-foreground"
          onClick={() => window.location.reload()}
          type="button"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  // Same derivation the desktop route makes: one credential for the default
  // venue means there is nothing to pick, so pick it.
  const marketCreds = credentials.filter((c) => c.market === defaultMarket)
  const initialWallet =
    marketCreds.length === 1
      ? { walletId: marketCreds[0]!.id, market: defaultMarket }
      : null

  return (
    <ActivePairProvider
      initial={{ pairKey: focusedPair, market: defaultMarket }}
    >
      <ActiveWalletProvider initial={initialWallet}>
        <ChartTerminalProvider
          defaultMarket={defaultMarket}
          markets={markets}
          pairKey={focusedPair}
        >
          <MobileFocusProvider
            focusedPair={focusedPair}
            focusedClass={focusedClass}
            onFocusPair={setFocusedPair}
          >
            <MobileSurface />
          </MobileFocusProvider>
        </ChartTerminalProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}
