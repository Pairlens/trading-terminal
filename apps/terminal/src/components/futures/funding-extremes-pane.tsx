// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Funding Extremes — where the crowd is paying the most to stay on, and where
 * it is being paid.
 *
 * Two lists off the same snapshot the matrix renders: the dearest rates and the
 * cheapest, annualised so venues on different settlement clocks rank against
 * each other honestly.
 *
 * One entry per CONTRACT PER VENUE rather than per asset. "TAO on Binance" and
 * "TAO on KuCoin" are two different trades, and the gap between them is the
 * trade — collapsing them would hide the leg that pays for the other.
 *
 * The prototype's "99th percentile of its own 30-day range" is deliberately not
 * claimed here: a percentile needs a 30-day series per contract, which is one
 * REST call per contract per venue, and a label that says "99th pct" over a
 * number computed from the current snapshot alone would be a confident
 * fabrication. The rate and its venue are what this pane can stand behind.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Flame, TrendingDown } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'

import {
  ratePercent,
  signedPercent,
  useFundingScanner,
  useOpenContract,
} from './funding-scanner'
import type { FundingExtreme } from '@/lib/futures/funding-rows'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { fundingExtremes } from '@/lib/futures/funding-rows'

/** Entries per side. The rail is short; the matrix is where a scan happens. */
const SIDE_LIMIT = 4

export function FundingExtremesPane() {
  const { t } = useTranslation()
  const { rows, isPending } = useFundingScanner()
  const openContract = useOpenContract()

  const { positive, negative } = useMemo(
    () => fundingExtremes(rows, SIDE_LIMIT),
    [rows],
  )

  if (positive.length === 0 && negative.length === 0) {
    return (
      <PaneEmpty
        body={isPending ? t('funding.loading') : t('fundingExtremes.emptyBody')}
        icon={ArrowDownUp}
        title={t('fundingExtremes.emptyTitle')}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-2">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('fundingExtremes.subtitle')}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {positive.length > 0 && (
          <Section
            entries={positive}
            label={t('fundingExtremes.longsPay')}
            onOpen={openContract}
            tone="positive"
          />
        )}
        {negative.length > 0 && (
          <Section
            entries={negative}
            label={t('fundingExtremes.shortsPay')}
            onOpen={openContract}
            tone="negative"
          />
        )}
      </div>
    </div>
  )
}

function Section({
  label,
  entries,
  tone,
  onOpen,
}: {
  label: string
  entries: Array<FundingExtreme>
  tone: 'positive' | 'negative'
  onOpen: (market: string, pair: string) => void
}) {
  const { t } = useTranslation()
  const Icon = tone === 'positive' ? Flame : TrendingDown

  return (
    <section>
      <h3 className="px-3.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </h3>
      {entries.map(({ base, cell, annualized }) => (
        <button
          className="flex w-full items-center gap-2.5 border-b border-border/50 px-3.5 py-2 text-left last:border-0 hover:bg-muted/40"
          key={`${cell.market}:${cell.pair}`}
          onClick={() => onOpen(cell.market, cell.pair)}
          type="button"
        >
          <Icon
            className={cn(
              'size-3.5 shrink-0',
              tone === 'positive' ? 'text-up' : 'text-down',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs font-semibold">
              {base} · {cell.venueLabel}
            </span>
            <span className="block truncate text-[10.5px] text-muted-foreground">
              {t('fundingExtremes.perInterval', {
                rate: ratePercent(cell.rate),
                hours: cell.intervalHours,
              })}
            </span>
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-xs tabular-nums',
              tone === 'positive' ? 'text-up' : 'text-down',
            )}
          >
            {signedPercent(annualized)}
          </span>
        </button>
      ))}
    </section>
  )
}
