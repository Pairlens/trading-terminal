// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Basis Monitor — the perp against the spot it tracks.
 *
 * Both legs come out of the funding payload the matrix above already fetched:
 * the mark IS the perp price the venue funds against, and the index IS its
 * reference spot. Reading them from anywhere else would introduce a second
 * source of truth that disagreed with the funding column beside it.
 *
 * One row per asset, quoted by ONE venue: a basis is a property of a contract
 * against its own index, so averaging across venues would produce a number no
 * venue publishes. The venue picked is the first in the connected order that
 * serves both legs, because a venue with no index has no basis to show at all.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'

import {
  answeringVenues,
  signedPercent,
  useFundingScanner,
  useOpenContract,
} from './funding-scanner'
import type { FundingCell } from '@/lib/futures/funding-rows'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { formatChartPrice } from '@/lib/format-price'
import {
  annualizedBasis,
  basisBps,
  basisFraction,
} from '@/lib/futures/funding-math'
import { primaryCell } from '@/lib/futures/funding-rows'

/** Assets on the board. The pane is a glance, not a screener. */
const ROW_LIMIT = 12

/**
 * Basis at which the bar is full width, in bps.
 *
 * Perp basis lives inside ±60 bps almost all the time; scaling to the widest
 * row instead would make a flat board look dramatic.
 */
const BAR_FULL_BPS = 60

type BasisRow = {
  base: string
  cell: FundingCell
  bps: number | null
  annual: number | null
}

export function BasisMonitorPane() {
  const { t } = useTranslation()
  const { results, rows, isPending } = useFundingScanner()
  const openContract = useOpenContract()

  const order = useMemo(
    () => answeringVenues(results).map((r) => r.market),
    [results],
  )

  const basisRows = useMemo((): Array<BasisRow> => {
    const out: Array<BasisRow> = []
    for (const row of rows) {
      const cell = primaryCell(row, order)
      if (!cell) continue
      const fraction = basisFraction(cell.markPrice, cell.indexPrice)
      out.push({
        base: row.base,
        cell,
        bps: basisBps(cell.markPrice, cell.indexPrice),
        annual: annualizedBasis(
          fraction,
          cell.nextFundingMs != null ? cell.nextFundingMs - Date.now() : null,
        ),
      })
      if (out.length >= ROW_LIMIT) break
    }
    return out
  }, [rows, order])

  if (basisRows.length === 0) {
    return (
      <PaneEmpty
        body={isPending ? t('funding.loading') : t('basisMonitor.emptyBody')}
        icon={Scale}
        title={t('basisMonitor.emptyTitle')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="text-[13px] font-semibold">{t('basisMonitor.title')}</h2>
        <span className="hidden text-[11px] text-muted-foreground @sm/pane:inline">
          {t('basisMonitor.subtitle')}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <div className="flex flex-col gap-2">
          {basisRows.map((row) => (
            <BasisRowView key={row.base} onOpen={openContract} row={row} />
          ))}
        </div>
      </div>
    </div>
  )
}

function BasisRowView({
  row,
  onOpen,
}: {
  row: BasisRow
  onOpen: (market: string, pair: string) => void
}) {
  const { t } = useTranslation()
  const { cell, bps } = row
  const positive = (bps ?? 0) >= 0
  const width =
    bps === null ? 0 : Math.min(Math.abs(bps) / BAR_FULL_BPS, 1) * 50

  return (
    <button
      className="flex w-full items-center gap-3 text-left text-xs"
      onClick={() => onOpen(cell.market, cell.pair)}
      type="button"
      title={t('basisMonitor.rowHint', {
        pair: cell.pair,
        venue: cell.venueLabel,
      })}
    >
      <span className="w-12 shrink-0 truncate font-mono font-semibold">
        {row.base}
      </span>
      <span className="w-24 shrink-0 font-mono tabular-nums text-muted-foreground">
        {cell.indexPrice != null
          ? t('basisMonitor.spot', { price: formatChartPrice(cell.indexPrice) })
          : t('basisMonitor.spotMissing')}
      </span>
      <span className="w-24 shrink-0 font-mono tabular-nums">
        {cell.markPrice != null
          ? t('basisMonitor.perp', { price: formatChartPrice(cell.markPrice) })
          : t('funding.na')}
      </span>

      {/* The zero line sits at the middle and the fill grows away from it, so
          a premium and a discount of the same size read as mirror images. */}
      <span className="relative hidden h-1.5 min-w-0 flex-1 rounded-full bg-muted @sm/pane:block">
        <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-border" />
        {bps !== null && (
          <span
            className="absolute h-full rounded-full"
            style={{
              width: `${width}%`,
              background: positive ? 'var(--chart-2)' : 'var(--destructive)',
              ...(positive ? { left: '50%' } : { right: '50%' }),
            }}
          />
        )}
      </span>

      <span
        className={cn(
          'w-20 shrink-0 text-right font-mono tabular-nums',
          bps === null
            ? 'text-muted-foreground'
            : positive
              ? 'text-up'
              : 'text-down',
        )}
      >
        {bps === null
          ? t('funding.na')
          : t('basisMonitor.bps', {
              value: `${bps > 0 ? '+' : ''}${bps.toFixed(0)}`,
            })}
      </span>
      <span className="hidden w-16 shrink-0 text-right font-mono tabular-nums text-[11px] text-muted-foreground @md/pane:block">
        {row.annual === null ? t('funding.na') : signedPercent(row.annual)}
      </span>
    </button>
  )
}
