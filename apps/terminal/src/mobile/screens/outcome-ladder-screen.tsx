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
import type { PredictionOutcomeSummary } from '@pairlens/shared/instrument-types'
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
    (runner: PredictionRunner, leg: PredictionOutcomeSummary) =>
      openOutcome(venue, event, runner.market, leg),
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
            activeKey={active}
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
  activeKey,
  colorIndex,
  onSelect,
}: {
  runner: PredictionRunner
  rank: number
  /** The leg the shell is on, normalized. Either side of a row can be it. */
  activeKey: string
  colorIndex: number
  onSelect: (runner: PredictionRunner, leg: PredictionOutcomeSummary) => void
}) {
  const { t } = useTranslation()
  const price = runnerPrice(runner)
  const change = runner.yes.change24h
  const noPrice = runner.no
    ? (runner.no.price ?? runner.no.ask ?? (price === null ? null : 1 - price))
    : null
  const yesActive = normalizePairKey(runner.yes.pairKey) === activeKey
  const noActive =
    runner.no !== null && normalizePairKey(runner.no.pairKey) === activeKey

  return (
    <div
      className={cn(
        'flex min-h-[48px] w-full items-center gap-2 px-4 py-1.5',
        'border-t border-t-[color:var(--pl-hairline)]',
        (yesActive || noActive) && 'bg-[color:var(--pl-wash)]',
      )}
    >
      <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {rank}
      </span>
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: runnerToken(colorIndex) }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[13.5px] font-medium text-foreground">
          {runner.label}
        </span>
        {change !== undefined ? (
          <span
            className={cn(
              'font-mono text-[10.5px] leading-none tabular-nums',
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
      </span>
      {/* Both sides, both tappable. The event is the pair here, so taking No
          on a runner is as ordinary a move as taking Yes, and a row that only
          offered the affirmative would put the other half of the market behind
          a screen the phone does not have room for. */}
      <SideChip
        active={yesActive}
        label={t('outcomeLadder.columns.yes')}
        onSelect={() => onSelect(runner, runner.yes)}
        price={price}
        side="yes"
      />
      <SideChip
        active={noActive}
        label={t('outcomeLadder.columns.no')}
        onSelect={() => (runner.no ? onSelect(runner, runner.no) : undefined)}
        price={runner.no ? noPrice : null}
        side="no"
      />
    </div>
  )
})

/**
 * One side of one runner, priced, at a full 44px tap target.
 *
 * Disabled rather than hidden when the venue publishes no complement: the row
 * keeps its shape down the whole list, and a missing chip would read as a
 * rendering fault rather than as a market that only quotes one side.
 */
function SideChip({
  label,
  price,
  side,
  active,
  onSelect,
}: {
  label: string
  price: number | null
  side: 'yes' | 'no'
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      aria-current={active || undefined}
      aria-label={`${label} ${price === null ? '' : formatPredictionPrice(price)}`}
      className={cn(
        'pl-press flex h-11 w-[52px] shrink-0 flex-col items-center justify-center gap-[2px] rounded-xl',
        side === 'yes' ? 'bg-up/15 text-up' : 'bg-down/12 text-down',
        active && 'ring-1 ring-current',
        price === null && 'opacity-40',
      )}
      disabled={price === null}
      onClick={onSelect}
      type="button"
      {...PRESS}
    >
      <span className="text-[9.5px] font-medium uppercase leading-none tracking-[.08em]">
        {label}
      </span>
      <span className="font-mono text-[12.5px] font-semibold leading-none tabular-nums">
        {price === null ? '—' : formatPredictionPrice(price)}
      </span>
    </button>
  )
}
