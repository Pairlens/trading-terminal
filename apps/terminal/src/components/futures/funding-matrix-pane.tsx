// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Funding Matrix — every asset against every connected perp venue.
 *
 * The pane a perp trader scans instead of a price list: what it costs to hold
 * this contract, here versus there. Rates are annualised before they are shown,
 * because the venues settle on different clocks (Kraken hourly, the rest every
 * eight hours) and the printed per-interval numbers are not comparable.
 *
 * Rows are one BASE ASSET, not one contract: Binance settles BTC in USDT and
 * Kraken in USD, and keeping them apart would leave nothing to compare. The
 * cell carries the venue's own pair key, so a click opens exactly the contract
 * that quoted the number.
 *
 * Sorting is by asset ranking by default and only ever by a venue column on an
 * explicit click. Sorting on rate would put whichever illiquid contract printed
 * an outlier at the top of the board on every refresh.
 *
 * **Loading is a state of this pane, not a screen in front of it.** The venue
 * columns are known from the installed connectors and the asset column from
 * the top-coins ranking, both of which are in hand before any exchange
 * answers, so the board draws itself first and fills in per venue as each
 * sweep lands (`useFundingRates` is one query per venue for exactly this
 * reason). What shimmers is only what is genuinely still out: a column whose
 * exchange has not answered, a cell in a row that has. Nothing reflows when
 * the numbers arrive, because the geometry never changed.
 *
 * **The narrow board has to look deliberate.** Two of the five perp venues
 * serve REST without CORS headers, so a browser matrix runs three columns to
 * the desktop's five, and a single connected venue is still a real state (a
 * deployment can disable venues, a region can refuse them). At any width the
 * rules are the same: the missing venues get a single muted line instead of an
 * amber banner each, the grid stops stretching (`gridMaxWidth`), and the
 * Spread column — which needs two quotes to mean anything — is not rendered
 * below two answering venues rather than filled with placeholders.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid3X3, Timer } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui/lib/utils'

import {
  AssetMark,
  FundingCountdown,
  NullGlyph,
  joinVenueNames,
  ratePercent,
  rateTint,
  signedPercent,
  useFundingScanner,
  useOpenContract,
} from './funding-scanner'
import {
  GhostAsset,
  SWEPT_ROWS,
  Shimmer,
  SkeletonStatus,
  useGhostBases,
} from './funding-skeletons'
import type { FundingCell, FundingRow } from '@/lib/futures/funding-rows'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { sortRowsByVenue } from '@/lib/futures/funding-rows'

/**
 * Spread at which the carry is worth a colour, in points of annualised
 * funding.
 *
 * Six rather than five: a five-point gap is inside the noise of two venues
 * stamping their rates seconds apart, and half the board lit up amber says
 * nothing at all.
 */
const SPREAD_ALERT_POINTS = 6

/** Widest a venue cell may grow to before the grid stops stretching, in px. */
const MAX_CELL_PX = 180
/** Fixed track widths the cap has to account for: asset, spread, gap. */
const ASSET_COL_PX = 112
const SPREAD_COL_PX = 74
const GRID_GAP_PX = 4

/**
 * A ceiling on the grid so two answering venues do not become two 400px cells.
 *
 * With `1fr` tracks and one venue connected the matrix stretched a single
 * column across the whole pane, which read as a broken table rather than a
 * short one. Capping the BLOCK rather than each track keeps the cells filling
 * the space they are given, up to the point where a wider cell stops being a
 * denser board and starts being a sparser one. Above four venues the pane is
 * full anyway, so it stretches as before.
 */
function gridMaxWidth(venues: number, showSpread: boolean): string | undefined {
  if (venues >= 4) return undefined
  const tracks = ASSET_COL_PX + venues * MAX_CELL_PX
  const spread = showSpread ? SPREAD_COL_PX : 0
  const gaps = GRID_GAP_PX * (venues + (showSpread ? 1 : 0))
  return `${tracks + spread + gaps}px`
}

export function FundingMatrixPane() {
  const { t, i18n } = useTranslation()
  const {
    results,
    rows,
    topCoins,
    columns,
    isPending,
    isSettling,
    desktopOnly,
    errors,
  } = useFundingScanner()
  const [sort, setSort] = useState<{
    market: string
    direction: 'asc' | 'desc'
  } | null>(null)
  const openContract = useOpenContract()

  // A spread needs two quotes. One venue answering leaves a column of
  // placeholders under a header promising a carry trade, which is worse than
  // no column at all.
  const showSpread = columns.length >= 2
  const ordered = useMemo(
    () => (sort ? sortRowsByVenue(rows, sort.market, sort.direction) : rows),
    [rows, sort],
  )

  // The soonest settlement any visible venue publishes: the countdown is a
  // "when does this cost me something" clock, so the nearest one is the answer.
  const nextStamp = useMemo(() => nextSettlement(ordered), [ordered])

  // Markets whose sweep is still out, as a set the cells can ask about: a
  // whole column shimmers together, and the row it sits in may already be
  // real.
  const pendingMarkets = useMemo(
    () =>
      new Set(columns.filter((col) => col.pending).map((col) => col.market)),
    [columns],
  )
  const ghostBases = useGhostBases(topCoins)
  // No venue has produced a row yet. The board still has its columns and its
  // ranking, so it draws both and shimmers the rates.
  const ghosting = ordered.length === 0

  if (results.length === 0 && !isPending) {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/plugins"
          >
            {t('funding.manageConnectors')} →
          </Link>
        }
        body={t('fundingMatrix.emptyBody')}
        icon={Grid3X3}
        title={t('fundingMatrix.emptyTitle')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">
            {t('fundingMatrix.title')}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('fundingMatrix.subtitle')}
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] @sm/pane:inline-flex">
          <Timer className="size-3 text-muted-foreground" />
          {t('fundingMatrix.nextPayment')}
          {/* The stamp comes out of the rates themselves, so before they land
              the honest answer is not "not published" — it is "not yet". */}
          {ghosting && (isPending || isSettling) ? (
            <Shimmer className="h-3 w-14 rounded-sm" />
          ) : (
            <FundingCountdown toMs={nextStamp} />
          )}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {desktopOnly.length > 0 && (
          <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {t('funding.desktopOnlyLine', {
              count: desktopOnly.length,
              venues: joinVenueNames(
                desktopOnly.map((venue) => venue.label),
                i18n.language,
              ),
            })}
          </p>
        )}

        {errors.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {errors.map((failure) => (
              <PaneErrorBanner
                key={`err:${failure.market}`}
                message={failure.error ?? ''}
                venue={failure.label}
              />
            ))}
          </div>
        )}

        {columns.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('fundingMatrix.noRows')}
          </p>
        ) : (
          <div
            aria-busy={ghosting || undefined}
            className="grid items-center gap-1 text-xs"
            style={{
              gridTemplateColumns: `minmax(88px, 112px) repeat(${columns.length}, minmax(56px, 1fr))${showSpread ? ' 74px' : ''}`,
              maxWidth: gridMaxWidth(columns.length, showSpread),
            }}
          >
            <span />
            {columns.map((column) => (
              <VenueHeader
                key={column.market}
                label={column.label}
                onSort={() =>
                  setSort((prev) =>
                    prev?.market === column.market
                      ? prev.direction === 'desc'
                        ? { market: column.market, direction: 'asc' }
                        : null
                      : { market: column.market, direction: 'desc' },
                  )
                }
                pending={column.pending}
                sorted={sort?.market === column.market}
              />
            ))}
            {showSpread && (
              <span className="pr-1 text-right text-[11px] text-muted-foreground">
                {t('fundingMatrix.colSpread')}
              </span>
            )}

            {ghosting && <SkeletonStatus label={t('funding.loading')} />}
            {ghosting
              ? ghostBases.map((base, index) => (
                  <GhostRow
                    base={base}
                    index={index}
                    key={base ?? `ghost:${index}`}
                    logoUrl={
                      base ? (topCoins.get(base)?.logoUrl ?? null) : null
                    }
                    columns={columns.length}
                    showSpread={showSpread}
                  />
                ))
              : ordered.map((row, index) => (
                  <MatrixRow
                    columns={columns.map((c) => c.market)}
                    key={row.base}
                    logoUrl={topCoins.get(row.base)?.logoUrl ?? null}
                    onOpen={openContract}
                    pendingMarkets={pendingMarkets}
                    row={row}
                    showSpread={showSpread}
                    // A venue that is still out leaves a placeholder in EVERY
                    // row a venue-wide sweep produced, which is hundreds of
                    // them in a scroller a dozen rows tall.
                    still={index >= SWEPT_ROWS}
                  />
                ))}
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t('fundingMatrix.note')}
        </p>
      </div>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

/**
 * A venue column header, which is also that venue's progress indicator.
 *
 * The hairline under a pending column is the only "still working" signal the
 * board needs: it is exactly as wide as the column it speaks for, so the
 * reader can see that Binance is in and KuCoin is not without reading a word.
 * Sorting is disabled while the column has nothing to sort.
 */
function VenueHeader({
  label,
  pending,
  sorted,
  onSort,
}: {
  label: string
  pending: boolean
  sorted: boolean
  onSort: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      className={cn(
        'group flex flex-col items-center gap-1 px-1 py-1 text-[11px] transition-colors',
        pending
          ? 'cursor-default text-muted-foreground/70'
          : 'text-muted-foreground hover:text-foreground',
        sorted && !pending && 'text-foreground',
      )}
      disabled={pending}
      onClick={onSort}
      title={
        pending
          ? t('funding.loading')
          : t('fundingMatrix.sortBy', { venue: label })
      }
      type="button"
    >
      <span className="max-w-full truncate">{label}</span>
      {pending && <Shimmer className="h-0.5 w-full rounded-full" />}
    </button>
  )
}

/**
 * A row of the board before any of it is known.
 *
 * The asset is real and the rates shimmer, at the row height the real row
 * will occupy. Twelve of these ARE the loading state of this pane.
 */
function GhostRow({
  base,
  logoUrl,
  columns,
  showSpread,
  index,
}: {
  base: string | null
  logoUrl: string | null
  columns: number
  showSpread: boolean
  index: number
}) {
  return (
    <>
      <GhostAsset base={base} index={index} logoUrl={logoUrl} />
      {Array.from({ length: columns }, (_, column) => (
        <Shimmer
          className="h-8 w-full rounded-md"
          delayIndex={index + column}
          key={column}
        />
      ))}
      {showSpread && (
        <span className="flex justify-end pr-1">
          <Shimmer className="h-3 w-9" delayIndex={index + columns} />
        </span>
      )}
    </>
  )
}

function MatrixRow({
  row,
  columns,
  logoUrl,
  onOpen,
  pendingMarkets,
  showSpread,
  still,
}: {
  row: FundingRow
  columns: Array<string>
  logoUrl: string | null
  onOpen: (market: string, pair: string) => void
  pendingMarkets: Set<string>
  showSpread: boolean
  /** Below the fold: draw pending cells without the sweep. */
  still: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 py-1.5">
        <AssetMark base={row.base} logoUrl={logoUrl} />
        <span className="truncate font-mono text-xs font-semibold">
          {row.base}
        </span>
      </div>
      {columns.map((market) => (
        <MatrixCell
          cell={row.cells[market] ?? null}
          key={market}
          onOpen={onOpen}
          pending={pendingMarkets.has(market)}
          still={still}
        />
      ))}
      {showSpread && (
        <span
          className={cn(
            'pr-1 text-right font-mono text-xs tabular-nums',
            row.spreadPoints !== null &&
              Math.abs(row.spreadPoints) >= SPREAD_ALERT_POINTS
              ? 'text-[var(--chart-4)]'
              : 'text-muted-foreground',
          )}
          title={t('fundingMatrix.spreadHint')}
        >
          {row.spreadPoints === null ? (
            <NullGlyph />
          ) : (
            t('fundingMatrix.points', { value: row.spreadPoints.toFixed(1) })
          )}
        </span>
      )}
    </>
  )
}

function MatrixCell({
  cell,
  onOpen,
  pending,
  still,
}: {
  cell: FundingCell | null
  onOpen: (market: string, pair: string) => void
  /** This venue is still sweeping — an empty cell is not yet a missing one. */
  pending: boolean
  still: boolean
}) {
  const { t } = useTranslation()

  if (pending && !cell) {
    return <Shimmer className="h-8 w-full rounded-md" still={still} />
  }

  if (!cell || cell.annualized === null) {
    return (
      <span className="rounded-md bg-muted/60 py-2 text-center font-mono text-xs">
        <NullGlyph />
      </span>
    )
  }

  const positive = cell.annualized >= 0
  return (
    <button
      className={cn(
        'rounded-md py-2 text-center font-mono text-xs tabular-nums transition-opacity hover:opacity-80',
        positive ? 'text-up' : 'text-down',
      )}
      onClick={() => onOpen(cell.market, cell.pair)}
      style={{ background: rateTint(cell.annualized) }}
      title={
        cell.intervalKnown
          ? t('funding.cellHint', {
              pair: cell.pair,
              rate: ratePercent(cell.rate),
              hours: cell.intervalHours,
            })
          : t('funding.cellHintAssumed', {
              pair: cell.pair,
              rate: ratePercent(cell.rate),
              hours: cell.intervalHours,
            })
      }
      type="button"
    >
      {signedPercent(cell.annualized)}
    </button>
  )
}

/** The soonest settlement stamp on the board, or null if none is published. */
function nextSettlement(rows: Array<FundingRow>): number | null {
  let soonest: number | null = null
  const now = Date.now()
  for (const row of rows) {
    for (const cell of Object.values(row.cells)) {
      const stamp = cell.nextFundingMs
      if (stamp === undefined || stamp < now) continue
      if (soonest === null || stamp < soonest) soonest = stamp
    }
  }
  return soonest
}
