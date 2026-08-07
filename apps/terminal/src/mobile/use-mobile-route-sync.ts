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
 * `pair_opened` is emitted from here rather than from `$pair.tsx`, which never
 * mounts at mobile width.
 */
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useMobileActions, useMobileFocus } from './mobile-focus-context'
import { track } from '@/lib/analytics-events'
import { usePersistedState } from '@/hooks/use-persisted-state'

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
  const { setFocusedPair, setActiveTab, pushOverlay } = useMobileActions()
  const [assetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const pathname = location.pathname
  const search = location.search as { connect?: unknown } | undefined
  const connectMarket =
    typeof search?.connect === 'string' ? search.connect : undefined

  // One redirect per visit to a non-canonical path. Without the guard the
  // effect re-runs on the focus change it just caused and toasts twice.
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    const routed = pairFromPath(pathname)
    if (routed) {
      handledRef.current = null
      if (routed !== focusedPair) setFocusedPair(routed)
      return
    }

    if (handledRef.current === pathname) return
    handledRef.current = pathname

    const goCanonical = () =>
      void navigate({
        to: '/pair/$pair',
        params: { pair: focusedPair },
        replace: true,
      })

    if (pathname === '/') {
      setActiveTab('discover')
      goCanonical()
      return
    }

    if (pathname.startsWith('/accounts')) {
      pushOverlay({ kind: 'settings', section: 'accounts' })
      if (connectMarket) pushOverlay({ kind: 'connect', market: connectMarket })
      goCanonical()
      return
    }

    if (DESKTOP_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      toast.info(t('mobile.shell.desktopOnlyRoute'))
      goCanonical()
    }
  }, [
    pathname,
    connectMarket,
    focusedPair,
    navigate,
    setFocusedPair,
    setActiveTab,
    pushOverlay,
    t,
  ])

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
