// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every answer in a race, ranked by what it costs.
 *
 * The event screen already lists a race market by market, with a Yes and a No
 * chip each. That is the right shape for reading one question and the wrong
 * shape for reading a FIELD: thirty two-line blocks in venue order answer
 * "what is in this event" and never answer "who is winning". So this is the
 * other reading of the same data — one dense line per runner, sorted by
 * probability, with the venue's own colour on each so a runner keeps its
 * identity between here and the chart.
 *
 * Three decisions worth keeping.
 *
 * **The event travels on the overlay**, exactly as it does for the event
 * screen: both surfaces that push this one already hold the event, so an id
 * would resolve against a cache entry that may not hold it, and a second fetch
 * would let the ladder disagree with the strip that opened it.
 *
 * **Yes only.** The desktop row carries both chips; 402px does not, and a row
 * with two tap targets a thumb-width apart is a mis-tap that costs money. The
 * row opens the Yes side, which is what "back this runner" means, and the
 * event screen one step back still offers both sides of any market.
 *
 * **Nothing here ticks.** Prices are the venue's board on a 60s stale window,
 * so the rows hold still while they are read and the sort cannot reshuffle
 * under a finger. The live number is the chart the tap lands on.
 */
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { ListOrdered, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { FullScreenOverlay } from '../primitives/full-screen-overlay'
import { PRESS } from '../primitives/press'
import { useOpenPredictionOutcome } from '../lib/use-open-prediction-outcome'
import { useMobileFocus } from '../mobile-focus-context'
import { filterRunners, isCheapTail, rankRunners } from '../lib/outcome-ladder'
import type { MobileOverlay } from '../mobile-focus-context'
import type { PredictionRunner } from '@/lib/predictions/race'
import { eventOverround, runnerPrice, runnersOf } from '@/lib/predictions/race'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import { formatPredictionPrice } from '@/lib/format-price'
import { normalizePairKey } from '@/lib/pairs'

/** Rows drawn before the footer takes over. */
const PAGE_SIZE = 40

/** Below this many runners a filter field is chrome nobody needs. */
const FILTER_ABOVE = 12

/** Below this the hidden rows are the cheap tail, and the footer says so. */
const TAIL_PRICE = 0.04

export default memo(function OutcomeLadderScreen({
  overlay,
  onClose,
}: {
  overlay: Extract<MobileOverlay, { kind: 'predictionLadder' }>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { event, venue, venueLabel } = overlay
  const { focusedPair } = useMobileFocus()
  const openOutcome = useOpenPredictionOutcome()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const [shown, setShown] = useState(PAGE_SIZE)

  // Venue order, which is what the colours are indexed against — sorting is a
  // view over this and must never renumber it.
  const runners = useMemo(() => runnersOf(event), [event])
  const overround = useMemo(() => eventOverround(runners), [runners])

  const sorted = useMemo(
    () => rankRunners(filterRunners(runners, deferredQuery)),
    [runners, deferredQuery],
  )
  const visible = sorted.slice(0, shown)
  const hidden = sorted.slice(shown)
  const hiddenIsTail = isCheapTail(hidden, TAIL_PRICE)

  const active = normalizePairKey(focusedPair)
  const select = useCallback(
    (runner: PredictionRunner) =>
      openOutcome(venue, event, runner.market, runner.yes),
    [event, openOutcome, venue],
  )

  return (
    <FullScreenOverlay display onBack={onClose} title={event.title}>
      <dl className="flex gap-6 px-4 pb-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            {t('outcomeLadder.columns.outcome')}
          </dt>
          <dd className="font-mono text-[12.5px] tabular-nums text-foreground">
            {runners.length}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            {t('eventHeader.venue')}
          </dt>
          <dd className="truncate text-[12.5px] text-foreground">
            {venueLabel}
          </dd>
        </div>
        {overround ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-[10px] uppercase tracking-[.12em] text-muted-foreground">
              {t('eventHeader.overroundLabel')}
            </dt>
            {/* Over 100% is what buying the whole field costs above what it
                can pay; under is the other way round. Coloured as the reading
                a trader acts on, not as good news. */}
            <dd
              className={cn(
                'font-mono text-[12.5px] tabular-nums',
                overround.edge > 0 ? 'text-down' : 'text-up',
              )}
            >
              {`${(overround.total * 100).toFixed(1)}%`}
            </dd>
          </div>
        ) : null}
      </dl>

      {runners.length > FILTER_ABOVE ? (
        <div className="px-4 pb-2.5">
          <div className="pl-field flex h-[38px] items-center gap-2 rounded-[11px] px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              aria-label={t('outcomeLadder.filterPlaceholder', {
                count: runners.length,
              })}
              autoComplete="off"
              autoCorrect="off"
              // 16px so iOS Safari does not auto-zoom the page on focus.
              className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={(e) => {
                setQuery(e.target.value)
                setShown(PAGE_SIZE)
              }}
              placeholder={t('outcomeLadder.filterPlaceholder', {
                count: runners.length,
              })}
              spellCheck={false}
              value={query}
            />
            {query ? (
              <button
                aria-label={t('common.clear')}
                className="pl-hit-44 pl-press-soft flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--pl-wash-heavy)] text-muted-foreground"
                onClick={() => setQuery('')}
                type="button"
                {...PRESS}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-[color:var(--pl-wash)]">
            <ListOrdered className="size-6 text-muted-foreground" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-foreground">
            {deferredQuery
              ? t('outcomeLadder.noMatches')
              : t('outcomeLadder.emptyTitle')}
          </p>
          {!deferredQuery ? (
            <p className="mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">
              {t('outcomeLadder.emptyBody')}
            </p>
          ) : null}
        </div>
      ) : (
        visible.map((runner, index) => (
          <LadderRow
            active={normalizePairKey(runner.yes.pairKey) === active}
            colorIndex={runnerColorIndex(runners, runner.yes.pairKey)}
            key={runner.yes.pairKey}
            onSelect={select}
            rank={index + 1}
            runner={runner}
          />
        ))
      )}

      {hidden.length > 0 ? (
        <button
          className="pl-field pl-press mx-4 mt-3 flex h-10 items-center justify-center gap-2 rounded-[11px] px-3 text-[12px] font-medium text-muted-foreground"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          style={{ width: 'calc(100% - 2rem)' }}
          type="button"
          {...PRESS}
        >
          {hiddenIsTail
            ? t('mobile.predictions.tailBelow', {
                count: hidden.length,
                price: formatPredictionPrice(TAIL_PRICE),
              })
            : t('outcomeLadder.showMore', {
                count: Math.min(PAGE_SIZE, hidden.length),
              })}
        </button>
      ) : null}
    </FullScreenOverlay>
  )
})

const LadderRow = memo(function LadderRow({
  runner,
  rank,
  active,
  colorIndex,
  onSelect,
}: {
  runner: PredictionRunner
  rank: number
  active: boolean
  colorIndex: number
  onSelect: (runner: PredictionRunner) => void
}) {
  const price = runnerPrice(runner)
  const change = runner.yes.change24h

  return (
    <button
      aria-current={active || undefined}
      className={cn(
        'pl-press-row flex min-h-[44px] w-full items-center gap-2.5 px-4 py-2 text-left',
        'border-t border-t-[color:var(--pl-hairline)]',
        active && 'bg-[color:var(--pl-wash)]',
      )}
      onClick={() => onSelect(runner)}
      type="button"
      {...PRESS}
    >
      <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {rank}
      </span>
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: runnerToken(colorIndex) }}
      />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
        {runner.label}
      </span>
      {change !== undefined ? (
        <span
          className={cn(
            'shrink-0 font-mono text-[11px] tabular-nums',
            change > 0
              ? 'text-up'
              : change < 0
                ? 'text-down'
                : 'text-muted-foreground',
          )}
        >
          {`${change > 0 ? '+' : change < 0 ? '−' : ''}${formatPredictionPrice(Math.abs(change))}`}
        </span>
      ) : null}
      <span className="w-11 shrink-0 text-right font-mono text-[14px] font-semibold tabular-nums text-foreground">
        {price === null ? '—' : formatPredictionPrice(price)}
      </span>
    </button>
  )
})
