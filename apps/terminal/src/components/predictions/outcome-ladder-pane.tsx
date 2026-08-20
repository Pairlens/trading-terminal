// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every answer in the field, priced, sortable, searchable, tradeable from the
 * row.
 *
 * This is the fix for "show 124 more". A race event is one question with a
 * hundred answers, and until now the only way to reach the ninetieth was to
 * page through an event dialog that showed four at a time. Here the whole
 * field is one table: filter it, sort it, and stake from the row you land on.
 *
 * Three rules the pane is built around.
 *
 * The ladder is the event's TRADING surface. A Yes or No chip points the book,
 * the tape and the ticket at that answer, without leaving the event: the pair
 * is the question, and picking a side of it is a selection rather than a trip
 * to another instrument. That is why the chips are the biggest targets in the
 * row. The basket button beside them is deliberately smaller and separate:
 * adding to a basket must never be something a user does by accident while
 * trying to look at a runner.
 *
 * The whole ROW takes Yes. Anywhere that is not one of those three controls —
 * the rank, the sparkline, the volume, the empty space between them — is the
 * same target as the runner's name, because a row in a ladder reads as one
 * object and a 12px name is a small thing to have to hit. The three controls
 * stop the event so they keep their own meanings, and so `select` (which
 * tracks) fires exactly once per click.
 *
 * Sorting never happens on a tick. The prices come from the events index on a
 * 60-second stale timer, so rows hold still while you read them; the live
 * price lives on the chart, one click away.
 *
 * The tail is stated, never hidden. A field of 128 has a hundred runners under
 * 4¢ and rendering all of them costs a REST call per sparkline, so the pane
 * renders a page at a time and the footer says exactly what is not on screen
 * and what it is worth.
 */
import { memo, useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListOrdered, Plus, Search } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { PredictionEventContext } from '@/hooks/use-prediction-event'
import type { PredictionRunner } from '@/lib/predictions/race'
import { MiniPriceChart } from '@/components/discovery/mini-price-chart'
import { PaneDesktopOnly } from '@/components/layout/pane-desktop-only'
import {
  PANE_FOOTNOTE,
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { usePanePair } from '@/lib/layout/pane-context'
import { usePredictionEventContext } from '@/hooks/use-prediction-event'
import { MONTH_WINDOW } from '@/hooks/use-sparkline'
import { basketEventKey, stageBasketLeg } from '@/lib/predictions/basket-store'
import { usePredictionSelect } from '@/lib/predictions/navigate'
import { runnerColorIndex, runnerToken } from '@/lib/predictions/palette'
import { runnerPrice } from '@/lib/predictions/race'
import { formatCompactUsd, formatPredictionPrice } from '@/lib/format-price'
import { normalizePairKey } from '@/lib/pairs'

/** Rows rendered before the footer takes over. Each carries a sparkline. */
const PAGE_SIZE = 40

/** Below this the runners are the tail, and the footer sums them instead. */
const TAIL_PRICE = 0.04

type LadderSort = 'probability' | 'change' | 'volume' | 'name'

const SORT_LABEL_KEYS: Record<LadderSort, string> = {
  probability: 'outcomeLadder.sort.probability',
  change: 'outcomeLadder.sort.change',
  volume: 'outcomeLadder.sort.volume',
  name: 'outcomeLadder.sort.name',
}

export function OutcomeLadderPane() {
  const { t } = useTranslation()
  const pane = usePanePair()
  const context = usePredictionEventContext(
    pane?.pairKey ?? '',
    pane?.market ?? '',
  )

  if (!pane) {
    return (
      <PaneEmpty
        body={t('outcomeLadder.noPairBody')}
        icon={ListOrdered}
        title={t('outcomeLadder.noPairTitle')}
      />
    )
  }

  if (context.state === 'desktop-only') {
    return (
      <PaneDesktopOnly
        descriptionKey="events.desktopOnlyDescription"
        titleKey="events.desktopOnlyTitle"
      />
    )
  }

  if (context.state === 'loading') {
    return (
      <PaneEmpty
        body={t('outcomeLadder.loadingBody')}
        icon={ListOrdered}
        title={t('outcomeLadder.loadingTitle')}
      />
    )
  }

  if (context.runners.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {context.state === 'error' && context.error && (
          <div className="py-2">
            <PaneErrorBanner
              message={context.error}
              venue={context.venueLabel}
            />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <PaneEmpty
            body={
              context.state === 'not-found'
                ? t('outcomeLadder.notFoundBody')
                : t('outcomeLadder.emptyBody')
            }
            icon={ListOrdered}
            title={
              context.state === 'not-found'
                ? t('outcomeLadder.notFoundTitle')
                : t('outcomeLadder.emptyTitle')
            }
          />
        </div>
      </div>
    )
  }

  return <Ladder activePairKey={pane.pairKey} context={context} />
}

function Ladder({
  context,
  activePairKey,
}: {
  context: PredictionEventContext
  activePairKey: string
}) {
  const { t } = useTranslation()
  const select = usePredictionSelect()
  const [sort, setSort] = useState<LadderSort>('probability')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const deferredQuery = useDeferredValue(query)

  const { runners, event } = context
  const active = normalizePairKey(activePairKey)

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) return runners
    return runners.filter(
      (runner) =>
        runner.label.toLowerCase().includes(needle) ||
        runner.market.title.toLowerCase().includes(needle),
    )
  }, [runners, deferredQuery])

  const sorted = useMemo(() => sortRunners(filtered, sort), [filtered, sort])

  const visible = sorted.slice(0, shown)
  const hidden = sorted.slice(shown)
  const hiddenVolume = hidden.reduce(
    (sum, runner) => sum + (runner.market.volume ?? 0),
    0,
  )
  // Only claim "below 4¢" when the hidden rows really are the cheap tail; on
  // any other sort the hidden rows are simply the ones further down.
  const hiddenIsTail =
    sort === 'probability' &&
    hidden.length > 0 &&
    hidden.every((runner) => (runnerPrice(runner) ?? 0) < TAIL_PRICE)

  const eventKey = event ? basketEventKey(context.venue, event.id) : null

  return (
    <div className="flex h-full flex-col">
      {/* Controls only: the shell header already names the pane. */}
      <div className="flex shrink-0 items-center gap-1.5 pb-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-6 rounded-md pl-6 text-[11px]"
            onChange={(e) => {
              setQuery(e.target.value)
              setShown(PAGE_SIZE)
            }}
            placeholder={t('outcomeLadder.filterPlaceholder', {
              count: runners.length,
            })}
            value={query}
          />
        </div>
        <Select
          onValueChange={(value) => setSort(value as LadderSort)}
          value={sort}
        >
          <SelectTrigger
            className="h-6 w-[126px] rounded-md text-[11px]"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL_KEYS) as Array<LadderSort>).map(
              (option) => (
                <SelectItem
                  className="text-[11.5px]"
                  key={option}
                  value={option}
                >
                  {t(SORT_LABEL_KEYS[option])}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed text-[11px]">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-14" />
            <col className="w-14" />
            <col className="w-20" />
            <col className="w-[76px]" />
            {/* Wide enough that a chip never wraps, in any locale. Worst case
                is a 5-letter word ("Tidak", "Không") plus the longest price a
                0..1 contract can print, "99.9¢" — 74px of JetBrains Mono at
                11px/600, so a 94px chip carries it with room for a fallback
                mono face whose metrics are not ours. Two of those, two 4px
                gaps, and the 18px basket button. The chips are `flex-1` and
                split the column evenly rather than sizing to their own text,
                so the Yes chips line up down the pane instead of going ragged,
                and `whitespace-nowrap` makes a miss overflow visibly rather
                than quietly wrapping again. */}
            <col className="w-[214px]" />
          </colgroup>
          {/* Paints the column's own card surface, not the page's: a
              sticky bg-background thead reads as a hole once the pane sits
              on a --card column. */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-muted-foreground">
              <Th>{t('outcomeLadder.columns.rank')}</Th>
              <Th>{t('outcomeLadder.columns.outcome')}</Th>
              <Th align="right">{t('outcomeLadder.columns.yes')}</Th>
              <Th align="right">{t('outcomeLadder.columns.change')}</Th>
              <Th>{t('outcomeLadder.columns.trend')}</Th>
              <Th align="right">{t('outcomeLadder.columns.volume')}</Th>
              <Th align="right">{t('outcomeLadder.columns.trade')}</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((runner, index) => (
              <LadderRow
                active={
                  normalizePairKey(runner.yes.pairKey) === active ||
                  (runner.no !== null &&
                    normalizePairKey(runner.no.pairKey) === active)
                }
                colorIndex={runnerColorIndex(runners, runner.yes.pairKey)}
                context={context}
                eventKey={eventKey}
                key={runner.yes.pairKey}
                onOpen={select.select}
                onStage={select.pin}
                rank={index + 1}
                runner={runner}
              />
            ))}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="py-6 text-center text-[11.5px] text-muted-foreground">
            {t('outcomeLadder.noMatches')}
          </p>
        )}
      </div>

      {hidden.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          <span className={cn('min-w-0 flex-1 truncate', PANE_FOOTNOTE)}>
            {hiddenIsTail
              ? t('outcomeLadder.tailBelow', {
                  count: hidden.length,
                  price: formatPredictionPrice(TAIL_PRICE),
                  volume: formatCompactUsd(hiddenVolume),
                })
              : t('outcomeLadder.tailMore', {
                  count: hidden.length,
                  volume: formatCompactUsd(hiddenVolume),
                })}
          </span>
          <button
            className="shrink-0 text-[11px] text-primary hover:underline"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            type="button"
          >
            {t('outcomeLadder.showMore', {
              count: Math.min(PAGE_SIZE, hidden.length),
            })}
          </button>
        </div>
      )}
    </div>
  )
}

function sortRunners(
  runners: Array<PredictionRunner>,
  sort: LadderSort,
): Array<PredictionRunner> {
  const scored = runners.map((runner, index) => ({ runner, index }))

  const rank = (entry: { runner: PredictionRunner }): number | null => {
    switch (sort) {
      case 'probability':
        return runnerPrice(entry.runner)
      case 'change': {
        const change = entry.runner.yes.change24h
        return typeof change === 'number' ? Math.abs(change) : null
      }
      case 'volume': {
        const volume = entry.runner.market.volume
        return typeof volume === 'number' ? volume : null
      }
      case 'name':
        return null
    }
  }

  if (sort === 'name') {
    return scored
      .sort(
        (a, b) =>
          a.runner.label.localeCompare(b.runner.label) || a.index - b.index,
      )
      .map((entry) => entry.runner)
  }

  // Unrankable rows sink rather than sorting as zero: a runner with no
  // published volume is not the least-traded runner.
  return scored
    .sort((a, b) => {
      const left = rank(a)
      const right = rank(b)
      if (left === null && right === null) return a.index - b.index
      if (left === null) return 1
      if (right === null) return -1
      return right - left || a.index - b.index
    })
    .map((entry) => entry.runner)
}

const LadderRow = memo(function LadderRow({
  runner,
  rank,
  active,
  colorIndex,
  context,
  eventKey,
  onOpen,
  onStage,
}: {
  runner: PredictionRunner
  rank: number
  active: boolean
  colorIndex: number
  context: PredictionEventContext
  eventKey: string | null
  onOpen: ReturnType<typeof usePredictionSelect>['select']
  onStage: ReturnType<typeof usePredictionSelect>['pin']
}) {
  const { t } = useTranslation()
  const price = runnerPrice(runner)
  const change = runner.yes.change24h
  const volume = runner.market.volume
  const noPrice = runner.no
    ? (runner.no.price ?? runner.no.ask ?? (price === null ? null : 1 - price))
    : price === null
      ? null
      : 1 - price

  const selection = (pairKey: string, label: string) => ({
    venue: context.venue,
    event: context.event!,
    market: runner.market,
    pairKey,
    label,
    surface: 'ladder' as const,
  })

  const canSelect = context.event !== null

  const takeYes = () => {
    if (!canSelect) return
    onOpen(selection(runner.yes.pairKey, runner.yes.label))
  }

  return (
    <tr
      className={cn(
        'border-b border-border/40 last:border-0',
        canSelect && 'cursor-pointer',
        active ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-accent/40',
      )}
      onClick={takeYes}
    >
      <td className="py-1.5 pr-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        {rank}
      </td>
      <td className="min-w-0 py-1.5 pr-3">
        {/* Still a real button, and still the only one in the row a keyboard
            reaches: the row's own click is a pointer shortcut, not the
            control. */}
        <button
          className="flex min-w-0 items-center gap-2 text-left"
          disabled={!canSelect}
          onClick={(e) => {
            e.stopPropagation()
            takeYes()
          }}
          title={runner.market.title}
          type="button"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: runnerToken(colorIndex) }}
          />
          <span className="truncate text-[12.5px] font-medium hover:underline">
            {runner.label}
          </span>
        </button>
      </td>
      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono text-[13px] font-semibold tabular-nums',
          active && 'text-up',
        )}
      >
        {price === null ? '—' : formatPredictionPrice(price)}
      </td>
      <td
        className={cn(
          'py-1.5 pr-3 text-right font-mono text-[11.5px] tabular-nums',
          change === undefined || change === 0
            ? 'text-muted-foreground'
            : change > 0
              ? 'text-up'
              : 'text-down',
        )}
      >
        {change === undefined
          ? '—'
          : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatPredictionPrice(Math.abs(change))}`}
      </td>
      <td className="py-1.5 pr-3">
        <MiniPriceChart
          className="h-[18px] w-full"
          historyWindow={MONTH_WINDOW}
          market={context.venue}
          pair={runner.yes.pairKey}
        />
      </td>
      <td className="py-1.5 pr-3 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {typeof volume === 'number' ? formatCompactUsd(volume) : '—'}
      </td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-1">
          <button
            className="flex-1 whitespace-nowrap rounded-md bg-up/18 px-2 py-[3px] font-mono text-[11px] font-semibold text-up transition-colors hover:bg-up/28 disabled:opacity-40"
            disabled={!canSelect || price === null}
            onClick={(e) => {
              e.stopPropagation()
              takeYes()
            }}
            type="button"
          >
            {t('outcomeLadder.yesChip', {
              price: price === null ? '—' : formatPredictionPrice(price),
            })}
          </button>
          <button
            className="flex-1 whitespace-nowrap rounded-md bg-down/14 px-2 py-[3px] font-mono text-[11px] font-semibold text-down transition-colors hover:bg-down/24 disabled:opacity-40"
            disabled={!canSelect || !runner.no || noPrice === null}
            onClick={(e) => {
              e.stopPropagation()
              if (!canSelect || !runner.no) return
              onOpen(selection(runner.no.pairKey, runner.no.label))
            }}
            type="button"
          >
            {t('outcomeLadder.noChip', {
              price: noPrice === null ? '—' : formatPredictionPrice(noPrice),
            })}
          </button>
          {/* Smaller and separate from the chips on purpose: staking must not
              be a thing a user does while reaching for a runner. */}
          <button
            aria-label={t('outcomeLadder.addToBasket', { name: runner.label })}
            className="shrink-0 rounded-md bg-muted/40 p-[3px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            disabled={!canSelect || !eventKey || price === null}
            onClick={(e) => {
              e.stopPropagation()
              if (!canSelect || !eventKey) return
              onStage(selection(runner.yes.pairKey, runner.yes.label))
              stageBasketLeg(eventKey, {
                pairKey: runner.yes.pairKey,
                market: context.venue,
                label: runner.label,
                stake: '',
              })
            }}
            title={t('outcomeLadder.addToBasket', { name: runner.label })}
            type="button"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </td>
    </tr>
  )
})
