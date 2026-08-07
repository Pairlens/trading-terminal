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
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MobileFocusProvider } from './mobile-focus-context'
import { MobileSurface } from './mobile-surface'
import { normalizePairKey, pairFromPath } from './use-mobile-route-sync'
import { getInitialViewportMode } from './use-viewport-mode'
import { ActivePairProvider } from '@/lib/active-pair-context'
import { ActiveWalletProvider } from '@/lib/active-wallet-context'
import { ChartTerminalProvider } from '@/lib/chart-terminal-context'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useCredentialsStore } from '@/stores/credentials-store'
import { track } from '@/lib/analytics-events'

/** Last resort when there is no route pair and no history. */
const FALLBACK_PAIR = 'BTC-USDT'

export function MobileTerminalRoot() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { markets, defaultMarket } = useAvailableMarkets()
  const { status, pluginsReady } = useMarketData()
  const credentials = useCredentialsStore((s) => s.credentials)
  const [recentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )

  // Resolved once, synchronously, from the URL the app opened on — an effect
  // here would paint one frame of the wrong pair on every cold load.
  const [focusedPair, setPair] = useState<string>(
    () =>
      pairFromPath(location.pathname) ??
      (recentPairs[0] ? normalizePairKey(recentPairs[0]) : null) ??
      FALLBACK_PAIR,
  )

  // Changing the focused pair rewrites the URL, so refresh, share and deep
  // links all keep working — and `pair_opened` keeps firing from route sync.
  const setFocusedPair = useCallback(
    (pairKey: string) => {
      const next = normalizePairKey(pairKey)
      setPair(next)
      void navigate({
        to: '/pair/$pair',
        params: { pair: next },
        replace: true,
      })
    },
    [navigate],
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

    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background px-8 text-center text-muted-foreground">
        <Unplug className="size-10 opacity-40" />
        <p className="text-sm font-medium">{t('routes.noConnectors.title')}</p>
        <p className="max-w-xs text-xs opacity-70">
          {t('routes.noConnectors.description')}
        </p>
        <Link
          className="mt-2 rounded-md bg-accent px-3 py-2 text-xs font-medium text-foreground"
          search={{ tab: 'markets' }}
          to="/plugins"
        >
          {t('routes.noConnectors.manage')}
        </Link>
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
            onFocusPair={setFocusedPair}
          >
            <MobileSurface />
          </MobileFocusProvider>
        </ChartTerminalProvider>
      </ActiveWalletProvider>
    </ActivePairProvider>
  )
}
