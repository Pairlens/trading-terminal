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
 * The URL still carries meaning, so the canonical `/{class}/{venue}/{id}`
 * stays in step: refresh, share and deep links all work, and every focus
 * change rewrites it with `replace: true` so the back button does not walk
 * through every pair the user glanced at. Routes that only exist on the
 * desktop redirect back to the canonical one with a single toast — silently
 * dropping them would make a shared link look broken.
 *
 * That redirect is for phones only. A desktop browser dragged or zoomed under
 * 768px gets the shell without the URL rewrite: `replace: true` would burn the
 * history entry it was on, and widening the window back has to land on the
 * screen it left. `getInitialViewportMode()` is what tells the two apart.
 *
 * This hook owns the address outright. It used to share the job with
 * `MobileTerminalRoot`, which could see the pair but not the venue (that lives
 * in chart config, below it) — workable when the URL named only a pair, and
 * impossible now that it names the tape as well.
 *
 * `pair_opened` is emitted from here rather than from the chart route, which
 * never mounts at mobile width. The asset-class correction that route used to
 * run is gone entirely, here and there: the class and the venue arrive
 * together in the address, already agreeing.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  marketRefToPath,
  normalizeInstrumentId,
  parseMarketRefPath,
} from '@pairlens/shared/market-ref'

import { useMobileActions, useMobileFocus } from './mobile-focus-context'
import { consumePairAdoptionSuppression } from './lib/mobile-history'
import { getInitialViewportMode } from './use-viewport-mode'
import type { MarketRef } from '@pairlens/shared/market-ref'
import { track } from '@/lib/analytics-events'

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

export function normalizePairKey(value: string): string {
  return normalizeInstrumentId('spot', value)
}

/** The market a path names, or null when it is not the canonical route. */
export function marketRefFromPath(pathname: string): MarketRef | null {
  return parseMarketRefPath(pathname)
}

export function useMobileRouteSync(): void {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { focusedInstrument, focusedClass, focusedVenue } = useMobileFocus()
  const {
    setFocusedPair,
    setFocusedPrediction,
    setFocusedVenue,
    setActiveTab,
    pushOverlay,
  } = useMobileActions()

  const pathname = location.pathname
  const search = location.search as
    | { connect?: unknown; connectChain?: unknown; o?: unknown }
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

  // The INSTRUMENT, never the leg. On a prediction the address is the
  // question: that is what the user opened, what a share link should reopen,
  // and what the watchlist and the recents strip already store. Which answer
  // is loaded in the ticket is shell state, the same way the tab is.
  const canonical: MarketRef = {
    cls: focusedClass,
    market: focusedVenue,
    id: focusedInstrument,
  }
  const canonicalPath = marketRefToPath(canonical)

  useEffect(() => {
    const routed = marketRefFromPath(pathname)
    if (routed) {
      handledRef.current = null
      const differs =
        routed.id !== focusedInstrument ||
        routed.cls !== focusedClass ||
        routed.market !== focusedVenue
      if (!differs) return

      // Back out of an overlay and the entry underneath can still name the
      // market the user was on before they picked one INSIDE that overlay —
      // every focus change rewrites the URL with `replace`, so it lands on
      // the overlay's own entry and never reaches the one below. Adopting
      // it would undo the pick the user just made, so the shell latches the
      // move and the canonical URL is re-asserted instead.
      if (consumePairAdoptionSuppression()) {
        void navigate({ to: canonicalPath, replace: true })
        return
      }

      // Adopt what the address says. Venue first: `setFocusedPair` may drop a
      // redundant update, and both halves have to land for one URL.
      if (routed.market !== focusedVenue) setFocusedVenue(routed.market)
      if (routed.id !== focusedInstrument || routed.cls !== focusedClass) {
        // `?o=` is honoured on the way in and never written back: a link built
        // on a desktop arrives on the answer it meant, and the phone's own
        // address stays the question. An empty leg is the desk's cue to open
        // on the favourite.
        if (routed.cls === 'prediction') {
          setFocusedPrediction(routed.id, outcomeFromSearch(search))
        } else {
          setFocusedPair(routed.id, routed.cls)
        }
      }
      return
    }

    if (handledRef.current === pathname) return
    handledRef.current = pathname

    const goCanonical = () => navigate({ to: canonicalPath, replace: true })

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
      return
    }

    // The legacy `/pair/BTC-USDT` shape, and anything else. That route is its
    // own redirect on the desktop; here the shell already knows what it is
    // focused on, so it just re-asserts the canonical address.
    void goCanonical()
  }, [
    pathname,
    canonicalPath,
    connectChain,
    connectMarket,
    focusedInstrument,
    focusedClass,
    focusedVenue,
    navigate,
    search,
    setFocusedPair,
    setFocusedPrediction,
    setFocusedVenue,
    setActiveTab,
    pushOverlay,
    t,
  ])

  // Product analytics: which markets/venues users actually open. Same event
  // and the same property set the desktop chart route fires.
  useEffect(() => {
    track('pair_opened', {
      venue: focusedVenue,
      asset_class: focusedClass,
      pair: focusedInstrument,
    })
  }, [focusedInstrument, focusedClass, focusedVenue])
}

/**
 * The leg an incoming address names, if it names one.
 *
 * Read, never written. A desktop link carries `?o=` so it can point at one
 * answer; the phone honours that and then keeps its own address on the
 * question, because the question is the instrument and a link shared from a
 * phone should open the market rather than someone else's side of it.
 */
function outcomeFromSearch(search: { o?: unknown } | undefined): string {
  return typeof search?.o === 'string' ? normalizePairKey(search.o) : ''
}
