// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the four perps-discovery panes share.
 *
 * The funding matrix, the basis monitor, the OI leaders and the extremes rail
 * all answer the same question from the same snapshot, and the board puts them
 * on screen together. One hook, so the venue fan-out is one react-query entry
 * and the row assembly runs once per data change instead of four times per
 * render; the panes differ in what they project out of it.
 *
 * The pieces below are the other half of that: the countdown, the rate
 * formatting and the tint scale are read the same way in three panes, and a
 * second copy of the tint would have drifted the moment one pane changed what
 * "hot" means.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { cn } from '@pairlens/ui/lib/utils'
import { marketRefToPath } from '@pairlens/shared/market-ref'
import type { TopCoin } from '@pairlens/shared/instrument-types'

import type {
  FundingVenueResult,
  FuturesVenue,
} from '@/hooks/use-funding-rates'
import type { FundingRow } from '@/lib/futures/funding-rows'
import {
  useFundingRates,
  useFuturesFundingVenues,
} from '@/hooks/use-funding-rates'
import { useTopCoinsSnapshot } from '@/hooks/use-top-coins-snapshot'
import { buildFundingRows } from '@/lib/futures/funding-rows'

/**
 * Assets named to the venues that cannot sweep.
 *
 * Twenty-five is the whole visible board plus headroom: the matrix shows a
 * dozen rows and the OI list five, and every extra asset is one more REST call
 * on a per-symbol venue.
 */
const BASE_HINT_COUNT = 25

/**
 * The "still loading" answer, as ONE array.
 *
 * `data ?? []` allocates a fresh empty array on every render, which changes the
 * identity every memo below keys on and rebuilds the whole row set on each
 * paint while the first fetch is in flight.
 */
const NO_RESULTS: Array<FundingVenueResult> = []

export type FundingScanner = {
  venues: Array<FuturesVenue>
  results: Array<FundingVenueResult>
  rows: Array<FundingRow>
  topCoins: Map<string, TopCoin>
  isPending: boolean
  /**
   * Venues this build cannot reach at all, kept apart from the ones that
   * broke.
   *
   * Two thirds of the perp fleet serve REST without CORS headers, so in a
   * browser they are simply absent — a fact about where the terminal is
   * running, not about the venue. Rendering that as an error banner per venue
   * put two amber blocks above a working matrix on every browser session, and
   * amber above data reads as "this is wrong".
   */
  desktopOnly: Array<FundingVenueResult>
  /** Venues that genuinely failed, for the per-venue banners. */
  errors: Array<FundingVenueResult>
}

export function useFundingScanner(): FundingScanner {
  const venues = useFuturesFundingVenues()
  const topCoins = useTopCoinsSnapshot()

  const bases = useMemo(
    () =>
      [...topCoins.values()]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, BASE_HINT_COUNT)
        .map((coin) => coin.symbol.toUpperCase()),
    [topCoins],
  )

  const { data, isPending } = useFundingRates(venues, { bases })
  const results = data ?? NO_RESULTS

  const rows = useMemo(() => {
    const rankOf = (base: string) =>
      topCoins.get(base)?.rank ?? Number.POSITIVE_INFINITY
    return buildFundingRows(results, rankOf)
  }, [results, topCoins])

  const desktopOnly = useMemo(
    () => results.filter((r) => r.desktopOnly),
    [results],
  )
  const errors = useMemo(
    () => results.filter((r) => !r.desktopOnly && r.error !== null),
    [results],
  )

  return { venues, results, rows, topCoins, isPending, desktopOnly, errors }
}

/** Venues that answered with at least one contract, in a stable order. */
export function answeringVenues(
  results: Array<FundingVenueResult>,
): Array<FundingVenueResult> {
  return results.filter((r) => r.entries.length > 0)
}

// ── Pieces ────────────────────────────────────────────────────────────

/**
 * Time to the next settlement, ticking once a second.
 *
 * Its own component on purpose: it is the one thing on these boards that
 * re-renders every second, and inlining it would re-render a table of a hundred
 * cells at the same cadence.
 */
export function FundingCountdown({ toMs }: { toMs: number | null }) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (toMs === null) return
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [toMs])

  if (toMs === null) return <span>{t('funding.stampUnknown')}</span>
  return (
    <span className="font-mono tabular-nums">
      {formatCountdown(Math.max(toMs - now, 0))}
    </span>
  )
}

/** `HH:MM:SS`, floored, never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

/** A fraction as a signed percentage: `0.109` → `+10.9%`. */
export function signedPercent(value: number, digits = 1): string {
  const pct = value * 100
  return `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`
}

/** A fraction as a percentage with no forced sign: `0.000412` → `0.0412%`. */
export function ratePercent(value: number, digits = 4): string {
  return `${(value * 100).toFixed(digits)}%`
}

/**
 * Background tint for a funding cell, scaled by how extreme the rate is.
 *
 * Capped at 40% of the semantic colour: past a certain intensity a tint stops
 * carrying information and starts making the number underneath unreadable.
 * 60% a year is treated as the top of the scale, which is roughly where a
 * crowded perp sits before it unwinds.
 */
export function rateTint(annualized: number): string {
  const intensity = Math.min(Math.abs(annualized) / 0.6, 1)
  const alpha = (6 + intensity * 26).toFixed(0)
  const colour = annualized >= 0 ? 'var(--chart-2)' : 'var(--destructive)'
  return `color-mix(in oklch, ${colour} ${alpha}%, transparent)`
}

/**
 * The placeholder a data cell shows for a figure nobody published.
 *
 * A glyph rather than the words "n/a": a column of prose in a grid of numbers
 * is the loudest thing on the pane, and what it says is "nothing here". The
 * words survive as the accessible name, so a screen reader still gets a
 * sentence instead of a dash.
 */
export function NullGlyph({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      aria-label={t('funding.na')}
      className={cn('text-muted-foreground', className)}
    >
      —
    </span>
  )
}

/**
 * Venue names as one readable list, in the reader's own language.
 *
 * `Intl.ListFormat` is what knows that English wants "A and B" and Japanese
 * wants "A、B"; the comma fallback is for the handful of engines that ship
 * without it, where a slightly stiff list beats a thrown error above a working
 * pane.
 */
export function joinVenueNames(names: Array<string>, language: string): string {
  if (typeof Intl.ListFormat === 'function') {
    try {
      return new Intl.ListFormat(language, {
        style: 'long',
        type: 'conjunction',
      }).format(names)
    } catch {
      // An unsupported tag: fall through rather than lose the line.
    }
  }
  return names.join(', ')
}

/** The token mark a scanner row leads with: real logo, or a lettered disc. */
export function AssetMark({
  base,
  logoUrl,
  className,
}: {
  base: string
  logoUrl?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        alt=""
        className={cn('size-5 shrink-0 rounded-full', className)}
        loading="lazy"
        src={logoUrl}
      />
    )
  }
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {base.slice(0, 1)}
    </span>
  )
}

/** Open the contract behind a scanner cell on its own venue's tape. */
export function useOpenContract(): (market: string, pair: string) => void {
  const navigate = useNavigate()
  const ref = useRef(navigate)
  ref.current = navigate
  return useMemo(
    () => (market: string, pair: string) => {
      void ref.current({
        to: marketRefToPath({ cls: 'perp', market, id: pair }),
      })
    },
    [],
  )
}
