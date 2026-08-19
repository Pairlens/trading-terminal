// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Funding Belt — the carry clock for the contract on screen.
 *
 * A cell of the layout rather than chart chrome, which is the point: a trader
 * who does not care about carry removes the pane and the chart takes the height
 * back. It is 96px tall on the reference board and scrolls sideways below that,
 * so nothing here may wrap into a second row.
 *
 * What it costs to hold is stated two ways, and never both at once. With a
 * position open it prices THAT size, which is the number that matters. With no
 * position it prices a stated 1,000 of the settle currency, labelled as such —
 * a cost figure with no size behind it would otherwise read as a real charge
 * against an account that has nothing in the contract.
 *
 * No stream subscriptions. Funding moves once per settlement and the belt reads
 * the same cached snapshot the scanners do; the countdown is the only thing
 * that ticks, and it is its own component so the rest of the belt does not
 * re-render every second.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer } from 'lucide-react'
import { usePanePair } from '@pairlens/plugin-sdk'

import { cn } from '@pairlens/ui/lib/utils'

import { FundingCountdown, ratePercent, signedPercent } from './funding-scanner'
import type { FundingCell } from '@/lib/futures/funding-rows'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  annualizedFunding,
  fundingCost,
  fundingOverWindow,
} from '@/lib/futures/funding-math'
import { buildFundingRows } from '@/lib/futures/funding-rows'
import {
  useFundingHistory,
  useFundingRates,
  useFuturesFundingVenues,
} from '@/hooks/use-funding-rates'
import {
  useFuturesAccounts,
  useFuturesPositions,
} from '@/hooks/use-futures-positions'

/** Notional the cost figures assume when nothing is open. Stated in the copy. */
const REFERENCE_NOTIONAL = 1_000

const HOUR_MS = 3_600_000

export function FundingBeltPane() {
  const { t } = useTranslation()
  const activePair = usePanePair()
  const venues = useFuturesFundingVenues()

  const pairKey = activePair?.pairKey ?? ''
  const market = activePair?.market ?? ''
  const base = pairKey.split('-')[0] ?? ''
  // Three segments is what makes a pair key a perp: BASE-QUOTE-SETTLE. A spot
  // pair on a spot venue has no funding to show, and saying so beats an empty
  // row of dashes.
  const isPerp = pairKey.split('-').filter(Boolean).length === 3
  const venue = venues.find((v) => v.market === market) ?? null

  const { data: results } = useFundingRates(venues, {
    bases: base ? [base] : [],
  })
  const { data: history } = useFundingHistory(venue, isPerp ? pairKey : '')

  const cells = useMemo(() => {
    const rows = buildFundingRows(results ?? [], () => 0)
    const row = rows.find((r) => r.base === base)
    return row ? Object.values(row.cells) : []
  }, [results, base])

  const own = cells.find((c) => c.market === market) ?? null

  const accounts = useFuturesAccounts()
  const { data: positions } = useFuturesPositions(accounts)
  const position = useMemo(() => {
    for (const result of positions) {
      if (result.account.market !== market) continue
      const hit = result.positions.find((p) => p.pair === pairKey)
      if (hit) return hit
    }
    return null
  }, [positions, market, pairKey])

  if (!activePair || !isPerp || !venue) {
    return (
      <PaneEmpty
        body={t('fundingBelt.emptyBody')}
        icon={Timer}
        title={t('fundingBelt.emptyTitle')}
      />
    )
  }

  if (!own) {
    return (
      <PaneEmpty
        body={t('fundingBelt.noRateBody', { venue: venue.label })}
        icon={Timer}
        title={t('fundingBelt.noRateTitle')}
      />
    )
  }

  const notional =
    position?.notionalUsd ??
    (position && own.markPrice
      ? position.contracts * (position.contractSize ?? 1) * own.markPrice
      : null)
  const side = position?.side ?? 'long'
  const sized = notional !== null && notional > 0
  const costBase = sized ? notional : REFERENCE_NOTIONAL
  const nextCost = fundingCost(costBase, own.rate, side)
  const annual = own.annualized

  const points = history?.points ?? []
  const now = Date.now()
  const windows = [
    { key: '8h', ms: 8 * HOUR_MS },
    { key: '24h', ms: 24 * HOUR_MS },
    { key: '7d', ms: 7 * 24 * HOUR_MS },
  ] as const
  const weekAverage = averageAnnualized(points, own.intervalHours, now)

  return (
    <div className="flex h-full min-h-0 items-stretch gap-5 overflow-x-auto">
      <Cell
        label={t('fundingBelt.now', { hours: own.intervalHours })}
        width={148}
      >
        <p
          className={cn(
            'font-mono text-[19px] font-semibold tabular-nums',
            own.rate >= 0 ? 'text-down' : 'text-up',
          )}
        >
          {own.rate > 0 ? '+' : ''}
          {ratePercent(own.rate)}
        </p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {own.rate >= 0
            ? t('fundingBelt.longsPay')
            : t('fundingBelt.shortsPay')}
        </p>
      </Cell>

      <Cell label={t('fundingBelt.nextPayment')} width={132}>
        <p className="font-mono text-[19px] font-semibold tabular-nums">
          <FundingCountdown toMs={own.nextFundingMs ?? null} />
        </p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {nextCost === null
            ? t('funding.na')
            : sized
              ? t('fundingBelt.costYou', { amount: money(nextCost) })
              : t('fundingBelt.costPerReference', {
                  amount: money(nextCost),
                  notional: REFERENCE_NOTIONAL.toLocaleString(),
                })}
        </p>
      </Cell>

      <Cell label={t('fundingBelt.annualised')} width={124}>
        <p className="font-mono text-[19px] font-semibold tabular-nums">
          {annual === null ? t('funding.na') : signedPercent(annual)}
        </p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {weekAverage === null
            ? t('fundingBelt.noHistory')
            : t('fundingBelt.weekAverage', {
                value: signedPercent(weekAverage),
              })}
        </p>
      </Cell>

      <Cell
        label={
          sized
            ? t('fundingBelt.paidLabel')
            : t('fundingBelt.paidLabelReference', {
                notional: REFERENCE_NOTIONAL.toLocaleString(),
              })
        }
        width={168}
      >
        <div className="flex items-baseline gap-3">
          {windows.map((window) => {
            const summed = fundingOverWindow(points, window.ms, now)
            const cost =
              summed === null ? null : fundingCost(costBase, summed, side)
            return (
              <span className="min-w-0" key={window.key}>
                <span className="block text-[10px] text-muted-foreground">
                  {window.key}
                </span>
                <span
                  className={cn(
                    'block font-mono text-[13px] tabular-nums',
                    cost === null
                      ? 'text-muted-foreground'
                      : cost > 0
                        ? 'text-down'
                        : 'text-up',
                  )}
                >
                  {cost === null ? t('funding.na') : money(cost)}
                </span>
              </span>
            )
          })}
        </div>
      </Cell>

      <div className="min-w-[220px] flex-1 py-2">
        <p className="text-[10.5px] text-muted-foreground">
          {t('fundingBelt.otherVenues')}
        </p>
        <div className="mt-1 flex gap-1.5 overflow-x-auto">
          {cells.length === 1 ? (
            <span className="text-[11px] text-muted-foreground">
              {t('fundingBelt.onlyVenue')}
            </span>
          ) : (
            cells.map((cell) => (
              <VenueChip
                cell={cell}
                cheapest={cheapestOf(cells) === cell.market}
                current={cell.market === market}
                key={cell.market}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function Cell({
  label,
  width,
  children,
}: {
  label: string
  width: number
  children: React.ReactNode
}) {
  return (
    <div
      // Separated by air, not by a rule: the vertical hairlines between these
      // columns were the board's old chrome, and the widths were always what
      // kept the belt readable.
      className="flex shrink-0 flex-col justify-center"
      style={{ width }}
    >
      <p className="truncate text-[10.5px] text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function VenueChip({
  cell,
  current,
  cheapest,
}: {
  cell: FundingCell
  current: boolean
  cheapest: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 py-0.5 text-[11px]',
        current
          ? 'bg-muted'
          : cheapest
            ? 'border-[var(--chart-2)] bg-[color-mix(in_oklch,var(--chart-2)_12%,transparent)]'
            : 'bg-muted/40',
      )}
    >
      {cell.venueLabel}
      <span
        className={cn(
          'font-mono tabular-nums',
          cell.rate >= 0 ? 'text-down' : 'text-up',
        )}
      >
        {ratePercent(cell.rate, 3)}
      </span>
      {current && <span className="size-1.5 rounded-full bg-foreground/50" />}
    </span>
  )
}

/** Cheapest carry for a LONG: the lowest annualised rate on offer. */
function cheapestOf(cells: Array<FundingCell>): string | null {
  let best: FundingCell | null = null
  for (const cell of cells) {
    if (cell.annualized === null) continue
    if (!best || cell.annualized < best.annualized!) best = cell
  }
  return best?.market ?? null
}

/**
 * The trailing week's rates as one annualised figure.
 *
 * The average of the stamps, annualised, rather than the sum annualised: the
 * sum already covers a week, and putting it on a yearly footing means scaling
 * the typical stamp, not the total.
 */
function averageAnnualized(
  points: Array<{ ts: number; rate: number }>,
  intervalHours: number,
  now: number,
): number | null {
  const window = points.filter((p) => p.ts >= now - 7 * 24 * HOUR_MS)
  if (window.length === 0) return null
  const mean =
    window.reduce((total, point) => total + point.rate, 0) / window.length
  return annualizedFunding(mean, intervalHours)
}

/** A settle-currency amount, signed, at cent precision. */
function money(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toFixed(2)}`
}
