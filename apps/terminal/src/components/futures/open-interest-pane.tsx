// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Open Interest — how much money is actually in each contract, and which way it
 * moved today.
 *
 * Deliberately NOT a cross-venue sum. Pairlens sees the venues the user
 * connected, so adding them up would publish a total that is one exchange's
 * worth on a fresh install and three on a full one, under the same label. Each
 * row names the venue it measured, which is a number the reader can check.
 *
 * The list is bounded because open interest is bounded: Binance answers ONE
 * symbol per REST call, and the 24h change is a second call on top. Six rows is
 * the board's own visible depth.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'

import {
  NullGlyph,
  answeringVenues,
  signedPercent,
  useFundingScanner,
  useOpenContract,
} from './funding-scanner'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { formatCompactUsd } from '@/lib/format-price'
import { openInterestValue } from '@/lib/futures/funding-math'
import { primaryCell } from '@/lib/futures/funding-rows'
import { useOpenInterest } from '@/hooks/use-funding-rates'

/** Assets asked about. Every extra one is a REST call per venue, twice. */
const ROW_LIMIT = 6

type OiRow = {
  base: string
  market: string
  venueLabel: string
  pair: string
  value: number
  change24h: number | null
}

export function OpenInterestPane() {
  const { t } = useTranslation()
  const { venues, results, rows, isPending } = useFundingScanner()
  const openContract = useOpenContract()

  const order = useMemo(
    () => answeringVenues(results).map((r) => r.market),
    [results],
  )

  // One venue per asset: the OI question is asked of whichever venue is already
  // quoting the contract on this board, so the call count stays at one per row
  // instead of one per row per venue.
  const targets = useMemo(() => {
    const out: Array<{
      base: string
      market: string
      pair: string
      mark?: number
    }> = []
    for (const row of rows) {
      const cell = primaryCell(row, order)
      if (!cell) continue
      out.push({
        base: row.base,
        market: cell.market,
        pair: cell.pair,
        ...(cell.markPrice !== undefined ? { mark: cell.markPrice } : {}),
      })
      if (out.length >= ROW_LIMIT) break
    }
    return out
  }, [rows, order])

  const pairsByMarket = useMemo(() => {
    const map: Record<string, Array<string>> = {}
    for (const target of targets) {
      ;(map[target.market] ??= []).push(target.pair)
    }
    return map
  }, [targets])

  const { data: oiResults } = useOpenInterest(venues, pairsByMarket)

  const oiRows = useMemo((): Array<OiRow> => {
    const byPair = new Map<
      string,
      { value: number | null; change24h?: number; label: string }
    >()
    for (const result of oiResults ?? []) {
      for (const entry of result.entries) {
        // Scoped by VENUE as well as pair: two venues both list BTC-USDT-USDT
        // and their marks differ, so a pair-only lookup prices one venue's
        // contract count at another venue's mark.
        const mark = targets.find(
          (tg) => tg.market === result.market && tg.pair === entry.pair,
        )?.mark
        byPair.set(`${result.market}:${entry.pair}`, {
          value: openInterestValue({
            ...(entry.value !== undefined ? { value: entry.value } : {}),
            ...(entry.amount !== undefined ? { amount: entry.amount } : {}),
            ...(entry.contractSize !== undefined
              ? { contractSize: entry.contractSize }
              : {}),
            ...(mark !== undefined ? { markPrice: mark } : {}),
          }),
          ...(entry.change24h !== undefined
            ? { change24h: entry.change24h }
            : {}),
          label: result.label,
        })
      }
    }
    const out: Array<OiRow> = []
    for (const target of targets) {
      const hit = byPair.get(`${target.market}:${target.pair}`)
      if (!hit || hit.value === null) continue
      out.push({
        base: target.base,
        market: target.market,
        venueLabel: hit.label,
        pair: target.pair,
        value: hit.value,
        change24h: hit.change24h ?? null,
      })
    }
    return out.sort((a, b) => b.value - a.value)
  }, [oiResults, targets])

  // A venue that publishes no open interest at all is a different fact from a
  // venue with nothing open, and only the first one is worth a line.
  const unsupported = (oiResults ?? []).filter(
    (r) => !r.supported && (pairsByMarket[r.market]?.length ?? 0) > 0,
  )

  if (oiRows.length === 0 && unsupported.length === 0) {
    return (
      <PaneEmpty
        body={isPending ? t('funding.loading') : t('openInterest.emptyBody')}
        icon={BarChart3}
        title={t('openInterest.emptyTitle')}
      />
    )
  }

  const max = Math.max(...oiRows.map((r) => r.value), 1)
  // With one venue answering, the suffix is the same six words down the list
  // and carries no information. It earns its place the moment the rows mix.
  const showVenue = new Set(oiRows.map((row) => row.market)).size > 1

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <h2 className="text-[13px] font-semibold">{t('openInterest.title')}</h2>
        <span className="text-[11px] text-muted-foreground">
          {t('openInterest.changeLabel')}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {unsupported.map((result) => (
          <div className="px-3.5 pt-2" key={`unsupported:${result.market}`}>
            <PaneErrorBanner
              message={t('openInterest.notPublished')}
              venue={result.label}
            />
          </div>
        ))}

        {oiRows.map((row) => (
          <button
            className="w-full border-b border-border/50 px-3.5 py-2 text-left last:border-0 hover:bg-muted/40"
            key={`${row.market}:${row.pair}`}
            onClick={() => openContract(row.market, row.pair)}
            type="button"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs font-semibold">
                {row.base}
                {showVenue && (
                  <span className="ml-1.5 font-sans text-[10px] font-normal text-muted-foreground">
                    {row.venueLabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums">
                {formatCompactUsd(row.value)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </span>
              <span
                className={cn(
                  'w-14 shrink-0 text-right font-mono text-[11px] tabular-nums',
                  row.change24h === null
                    ? 'text-muted-foreground'
                    : row.change24h >= 0
                      ? 'text-up'
                      : 'text-down',
                )}
              >
                {row.change24h === null ? (
                  <NullGlyph />
                ) : (
                  signedPercent(row.change24h)
                )}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
