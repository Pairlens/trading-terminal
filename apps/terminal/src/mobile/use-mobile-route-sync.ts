// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * URL ⇄ focus, and the one-way door for routes the phone does not have.
 *
 * Mobile is a single-surface app: the five destinations are local state, not
 * routes, because router-driven tabs would either unmount the chart or need a
 * keep-alive hack — and local state is what ports to a native app, where there
 * are no URLs at all.
 *
 * The URL still carries meaning, so `/pair/$pair` stays canonical: refresh,
 * share and deep links all work, and every focus change rewrites it with
 * `replace: true` so the back button does not walk through every pair the user
 * glanced at. Routes that only exist on the desktop redirect back to the
 * canonical one with a single toast — silently dropping them would make a
 * shared link look broken.
 *
 * That redirect is for phones only. A desktop browser dragged or zoomed under
 * 768px gets the shell without the URL rewrite: `replace: true` would burn the
 * history entry it was on, and widening the window back has to land on the
 * screen it left. `getInitialViewportMode()` is what tells the two apart.
 *
 * `pair_opened` is emitted from here rather than from `$pair.tsx`, which never
 * mounts at mobile width — and so is that route's asset-class correction, for
 * the same reason.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useMobileActions, useMobileFocus } from './mobile-focus-context'
import { consumePairAdoptionSuppression } from './lib/mobile-history'
import { getInitialViewportMode } from './use-viewport-mode'
import type { MarketOption } from '@/hooks/use-available-markets'
import { track } from '@/lib/analytics-events'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/** Routes the phone deliberately does not carry. */
const DESKTOP_ONLY_PREFIXES = [
  '/notifications',
  '/workflows',
  '/indicators',
  '/bots',
  '/plugins',
  '/workspace-store',
  '/workspace/',
]

const PAIR_PATH = /^\/pair\/(.+)$/

/** Whether a venue serves the stocks asset class — `$pair.tsx`'s own test. */
function servesStocks(markets: Array<MarketOption>, marketId: string): boolean {
  return (
    markets
      .find((m) => m.value === marketId)
      ?.assetClasses.includes('stocks') ?? false
  )
}

export function normalizePairKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\\/_]/g, '-')
}

/** The pair a path names, or null when it is not the canonical route. */
export function pairFromPath(pathname: string): string | null {
  const match = PAIR_PATH.exec(pathname)
  if (!match?.[1]) return null
  try {
    return normalizePairKey(decodeURIComponent(match[1]))
  } catch {
    return normalizePairKey(match[1])
  }
}

export function useMobileRouteSync(): void {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { setFocusedPair, setFocusedVenue, setActiveTab, pushOverlay } =
    useMobileActions()
  const [assetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )
  const { markets } = useAvailableMarkets()

  const pathname = location.pathname
  const search = location.search as
    | { connect?: unknown; connectChain?: unknown }
    | undefined
  const connectMarket =
    typeof search?.connect === 'string' ? search.connect : undefined
  // The desktop connect gate emits `?connectChain=` for DEX venues and
  // `?connect=` for everything else. Reading only the second one turned a
  // shared wallet link into a bare Settings screen.
  const connectChain =
    typeof search?.connectChain === 'string' ? search.connectChain : undefined

  // One redirect per visit to a non-canonical path. Without the guard the
  // effect re-runs on the focus change it just caused and toasts twice.
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    const routed = pairFromPath(pathname)
    if (routed) {
      handledRef.current = null
      if (routed !== focusedPair) {
        // Back out of an overlay and the entry underneath can still name the
        // pair the user was on before they picked one INSIDE that overlay —
        // every focus change rewrites the URL with `replace`, so it lands on
        // the overlay's own entry and never reaches the one below. Adopting
        // it would undo the pick the user just made, so the shell latches the
        // move and the canonical URL is re-asserted instead.
        if (consumePairAdoptionSuppression()) {
          void navigate({
            to: '/pair/$pair',
            params: { pair: focusedPair },
            replace: true,
          })
        } else {
          setFocusedPair(routed)
        }
      }
      return
    }

    if (handledRef.current === pathname) return
    handledRef.current = pathname

    const goCanonical = () =>
      navigate({
        to: '/pair/$pair',
        params: { pair: focusedPair },
        replace: true,
      })

    if (pathname === '/') {
      // The seed claims no history entry (see `setActiveTab`), so the order
      // here is free: the replace consumes `/` and back leaves the app, which
      // is what back from an app's opening screen does.
      setActiveTab('discover')
      void goCanonical()
      return
    }

    if (pathname.startsWith('/accounts')) {
      // Canonicalise FIRST and open the overlays on the entry that replaces
      // it. Opening them first pushes above `/accounts`, the replace then
      // lands on the overlay's own entry, and `/accounts` survives underneath
      // — walking back onto it re-runs this branch, which pushes and
      // canonicalises again, and the back button is dead for the session.
      const connect = connectChain
        ? ({ kind: 'connect', chain: connectChain } as const)
        : connectMarket
          ? ({ kind: 'connect', market: connectMarket } as const)
          : null
      void goCanonical().then(() => {
        pushOverlay({ kind: 'settings', section: 'accounts' })
        // `@tanstack/history` batches every entry queued in one microtask into
        // a single `pushState`, so pushing the wizard here would hand both
        // overlays the same entry and one back press would close the pair.
        // Wait for that flush and the ladder is honest: wizard → Settings →
        // chart → out.
        if (connect) void Promise.resolve().then(() => pushOverlay(connect))
      })
      return
    }

    if (DESKTOP_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      // Only for a session that STARTED on a phone. A desktop browser dragged
      // (or zoomed) under 768px keeps its URL: the mobile shell renders over
      // the route, widening back restores the exact screen, and the history
      // entry the user was on is not replaced out from under them.
      if (getInitialViewportMode() === 'desktop') return
      toast.info(t('mobile.shell.desktopOnlyRoute'))
      void goCanonical()
    }
  }, [
    pathname,
    connectChain,
    connectMarket,
    focusedPair,
    navigate,
    setFocusedPair,
    setActiveTab,
    pushOverlay,
    t,
  ])

  // The desktop route's asset-class correction, which never runs on a phone:
  // `$pair.tsx` owns it and the mobile shell replaces that route entirely. A
  // stock pair cannot stream from a crypto exchange, so a URL, bookmark or
  // reload that lands on one has to take the venue with it.
  //
  // It is that route's rule verbatim — the stocks/not-stocks split over
  // `markets` — and NOT `usePreferredMarketResolver`, for two measured
  // reasons. The resolver reads `terminal.market` through a second
  // `usePersistedState` instance, which learns about a write one microtask
  // late, so given the stale value it re-resolves to the PREVIOUS venue and
  // every manual venue pick snapped back. And it matches asset-class strings
  // exactly, while the catalogue says `crypto` and the connectors declare
  // `crypto-spot`, so it silently never corrects a crypto pair off a stock
  // venue. The binary split is immune to both: it reads the live venue, and it
  // only ever asks whether a venue is an equities venue.
  useEffect(() => {
    const assetClass = assetClassMap[focusedPair]
    if (!assetClass) return
    const wantStocks = assetClass === 'stocks'
    if (servesStocks(markets, focusedVenue) === wantStocks) return
    // A venue this build cannot reach is not a correction, it is a dead end.
    const target = markets.find(
      (m) => !m.desktopOnly && m.assetClasses.includes('stocks') === wantStocks,
    )
    if (target && target.value !== focusedVenue) setFocusedVenue(target.value)
  }, [focusedPair, focusedVenue, assetClassMap, markets, setFocusedVenue])

  // Product analytics: which markets/venues users actually open. Same event
  // and the same property set the desktop route fires.
  useEffect(() => {
    track('pair_opened', {
      venue: focusedVenue,
      asset_class: assetClassMap[focusedPair] ?? 'crypto',
      pair: focusedPair,
    })
  }, [focusedPair, focusedVenue, assetClassMap])
}
