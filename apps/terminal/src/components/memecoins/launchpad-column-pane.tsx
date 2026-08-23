// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The four columns of the memecoin board: New, Graduating, Graduated,
 * Legendary.
 *
 * One implementation, four configurations, because the columns differ in what
 * they RANK by and what the third number means, not in what a row is. Keeping
 * them as one component is what guarantees a token reads identically as it
 * moves left to right across the board over an hour, which is the whole
 * literacy the layout is teaching.
 *
 * ## What each column shows in its variable slot
 *
 * - **New** — age, because on a fresh mint nothing else has happened yet.
 * - **Graduating** — curve progress, the only number that matters there.
 * - **Graduated** — time since migration, so the freshest are readable at a
 *   glance without reading the sort order.
 * - **Legendary** — 24h change, since these are established coins and their
 *   move is the news.
 *
 * ## Legendary rows are resolved, not guessed
 *
 * That column ranks COINS rather than contracts, so a row arrives as a coin id
 * and a market cap. The provider resolves it to a real contract through
 * CoinGecko's own mapping and picks the chain the token trades deepest on (see
 * `legendary-links.ts`), which is why these rows carry an EVM chain as often
 * as a Solana one and why `VENUE_BY_CHAIN` below is a table rather than a
 * constant.
 *
 * A row the provider could not resolve keeps `chain: 'coingecko'` and renders
 * without a link. That is the honest outcome, not a gap: DOGE has no contract
 * on any chain, and a coin whose every candidate measures zero liquidity is
 * one we would be guessing about.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronUp,
  Crown,
  GraduationCap,
  ListFilter,
  Rocket,
  Sparkles,
} from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type {
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

import type {
  LaunchpadBoardPrefs,
  LaunchpadSort,
  LaunchpadSortKey,
  LaunchpadStagePrefs,
} from '@/lib/memecoins/board-prefs'
import {
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import {
  LaunchpadGhostRows,
  MemecoinPacedNote,
} from '@/components/memecoins/memecoin-skeletons'
import {
  ChangeCell,
  CurveBar,
  FlowBar,
  TokenMark,
  formatAge,
  formatCount,
  formatMcap,
} from '@/components/memecoins/memecoin-pane-primitives'
import { track } from '@/lib/analytics-events'
import {
  UNUSUAL_TURNOVER,
  formatTurnoverMultiple,
  turnoverKey,
  turnoverMultiples,
} from '@/lib/launchpad-turnover'
import { LaunchpadFilterDialog } from '@/components/memecoins/launchpad-filter-dialog'
import { PaneHeaderSlot } from '@/components/layout/pane-header-slot'
import {
  MEMECOIN_BOARD_PREFS_KEY,
  activeFilterCount,
  activeFlow,
  arrangeTokens,
  nextSort,
} from '@/lib/memecoins/board-prefs'
import { useLaunchpadColumn } from '@/hooks/use-launchpad'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useSlowLoad } from '@/hooks/use-slow-load'
import { chartLinkProps } from '@/lib/market-ref/link'
import { registerDisplayToken } from '@/stores/token-directory-store'

/**
 * The venue a token is charted and swapped on, by the chain it lives on.
 *
 * The three launchpad columns are Solana only, so for them this is effectively
 * a constant. Legendary is the reason it is a table: those rows are resolved
 * to whichever chain the coin actually trades deepest on, which is Ethereum
 * for PEPE and Solana for BONK. A chain that is absent here is a chain no
 * connector routes, and its rows render without a link rather than with a
 * dead one.
 */
const VENUE_BY_CHAIN: Readonly<Record<string, string>> = {
  solana: 'jupiter',
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  polygon: 'polygon',
}

/** The quote leg a memecoin board trades against. */
const QUOTE = 'USDC'

/** Stable identity for the three columns that never measure turnover. */
const EMPTY_TURNOVER: ReadonlyMap<string, number> = new Map()

/**
 * Stable identity for the default preferences.
 *
 * A fresh object literal here would be a new default on every render, and
 * `usePersistedState` would hand back a new object each time, re-running every
 * memo downstream of it once a second on the ticking columns.
 */
const EMPTY_PREFS: LaunchpadBoardPrefs = {}

type ColumnConfig = {
  icon: typeof Sparkles
  titleKey: string
  emptyTitleKey: string
  emptyBodyKey: string
  /** Header for the third column, which differs per stage. */
  metricHeaderKey: string
}

// No footnote key, and the four sentences that used to sit under these columns
// are gone with it. They explained the pane's own window ("minted in the last 6
// hours"), which is a thing a reader learns once and then reads past forever —
// and they cost a permanent line of the shortest column on the board. The
// column headers and the pane titles carry the same information in the place
// somebody is already looking.
const COLUMNS: Readonly<Record<LaunchpadStage, ColumnConfig>> = {
  new: {
    icon: Sparkles,
    titleKey: 'memecoins.new.title',
    emptyTitleKey: 'memecoins.new.emptyTitle',
    emptyBodyKey: 'memecoins.new.emptyBody',
    metricHeaderKey: 'memecoins.columns.age',
  },
  graduating: {
    icon: Rocket,
    titleKey: 'memecoins.graduating.title',
    emptyTitleKey: 'memecoins.graduating.emptyTitle',
    emptyBodyKey: 'memecoins.graduating.emptyBody',
    metricHeaderKey: 'memecoins.columns.curve',
  },
  graduated: {
    icon: GraduationCap,
    titleKey: 'memecoins.graduated.title',
    emptyTitleKey: 'memecoins.graduated.emptyTitle',
    emptyBodyKey: 'memecoins.graduated.emptyBody',
    metricHeaderKey: 'memecoins.columns.since',
  },
  legendary: {
    icon: Crown,
    titleKey: 'memecoins.legendary.title',
    emptyTitleKey: 'memecoins.legendary.emptyTitle',
    emptyBodyKey: 'memecoins.legendary.emptyBody',
    metricHeaderKey: 'memecoins.columns.change24h',
  },
}

/**
 * A clock the rows share.
 *
 * Ages are recomputed on a tick rather than per render, and one interval for
 * the whole column rather than one per row: thirty rows each holding their own
 * timer is thirty timers, and they would drift against each other so two rows
 * a second apart could read the same age.
 */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function LaunchpadColumn({ stage }: { stage: LaunchpadStage }) {
  const { t } = useTranslation()
  const config = COLUMNS[stage]
  const { tokens, isLoading, revalidating, error, throttled, retrying } =
    useLaunchpadColumn(stage)
  // Only the two columns that show an elapsed time need a ticking clock.
  const now = useTick(stage === 'new' || stage === 'graduated')
  const slow = useSlowLoad(isLoading)

  const [prefs, setPrefs] = usePersistedState<LaunchpadBoardPrefs>(
    MEMECOIN_BOARD_PREFS_KEY,
    EMPTY_PREFS,
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const stagePrefs = prefs[stage]

  // A clock for the FILTER, not for the rows. `now` above only ticks on the
  // two columns that print an elapsed time, and an age bound has to be
  // measured on every column that offers one.
  const arranged = useMemo(
    () => arrangeTokens(tokens, stage, stagePrefs, Date.now()),
    // `now` is in the deps on purpose: an age filter has to be re-measured as
    // the clock moves, and on the two columns that tick it re-runs each
    // second. On the other two it is a constant and this is a no-op.

    [tokens, stage, stagePrefs, now],
  )

  const rows = arranged
  // Only Legendary spends a cell on this: the other three columns rank tokens
  // minutes old, whose "usual" volume does not exist yet.
  //
  // Measured on the FILTERED rows, which is the honest baseline: a reader who
  // has cut the column to coins above a billion is asking what is unusual for
  // those, not for a market they have excluded.
  const turnover = useMemo(
    () => (stage === 'legendary' ? turnoverMultiples(rows) : EMPTY_TURNOVER),
    [stage, rows],
  )

  const setStagePrefs = useCallback(
    (patch: LaunchpadStagePrefs) => {
      setPrefs((prev) => ({
        ...prev,
        [stage]: { ...prev[stage], ...patch },
      }))
    },
    [setPrefs, stage],
  )

  const onSort = useCallback(
    (key: LaunchpadSortKey) => {
      setStagePrefs({ sort: nextSort(stagePrefs?.sort ?? null, key) })
    },
    [setStagePrefs, stagePrefs],
  )

  // Teach the token directory what each row is called, keyed by VENUE the way
  // the pool rows do it, because that is the key `pairEntryForRef` reads back.
  // Without it, clicking a row opens a board whose header, watchlist entry and
  // recents chip all show the raw 44-character mint. Display only: the pin
  // never decides which token an order buys.
  useEffect(() => {
    for (const token of rows) {
      const venue = VENUE_BY_CHAIN[token.chain]
      if (!venue) continue
      registerDisplayToken({
        chain: venue,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        ...(token.decimals !== null ? { decimals: token.decimals } : {}),
      })
    }
  }, [rows])

  if (!isLoading && rows.length === 0 && !error) {
    // Two different empty states, and telling them apart is the whole point:
    // "nothing is minting" is a fact about the market, and a reader who has
    // just set a floor of ten million dollars needs to be told it was their
    // own filter rather than a quiet hour.
    const filtered = tokens.length > 0
    return (
      <>
        <PaneHeaderSlot>
          <FilterButton
            count={activeFilterCount(stagePrefs?.filters)}
            label={t('memecoins.filters.open')}
            onClick={() => setFiltersOpen(true)}
          />
        </PaneHeaderSlot>
        <LaunchpadFilterDialog
          stage={stage}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filters={stagePrefs?.filters}
          onApply={(filters) => setStagePrefs({ filters })}
        />
        <PaneEmpty
          icon={filtered ? ListFilter : config.icon}
          title={
            filtered
              ? t('memecoins.filters.emptyTitle')
              : t(config.emptyTitleKey)
          }
          body={
            filtered
              ? t('memecoins.filters.emptyBody', { count: tokens.length })
              : t(config.emptyBodyKey)
          }
          action={
            filtered ? (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => setStagePrefs({ filters: {} })}
              >
                {t('memecoins.filters.clear')}
              </Button>
            ) : undefined
          }
        />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PaneHeaderSlot>
        <FilterButton
          count={activeFilterCount(stagePrefs?.filters)}
          label={t('memecoins.filters.open')}
          onClick={() => setFiltersOpen(true)}
        />
      </PaneHeaderSlot>

      <LaunchpadFilterDialog
        stage={stage}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={stagePrefs?.filters}
        onApply={(filters) => setStagePrefs({ filters })}
      />

      {error && rows.length === 0 ? (
        <div className="pb-2">
          <PaneErrorBanner
            venue={t(config.titleKey)}
            // A throttle already words itself in the user's language; anything
            // else is plumbing detail and gets the pane's own sentence.
            message={throttled ? error : t('memecoins.unavailableBody')}
          />
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={isLoading || revalidating}
      >
        {isLoading ? (
          <SkeletonStatus
            label={t(retrying ? 'memecoins.retrying' : 'memecoins.loading')}
          />
        ) : null}

        {/* The table itself is drawn from the first frame, headers and all.
            They are furniture rather than data, and a column that renders
            nothing until its feed answers reads as the empty state it also
            uses for "nothing is minting" — then rebuilds itself under the
            reader when the rows land. */}
        {isLoading || rows.length > 0 ? (
          <table className={cn('w-full', PANE_TABLE_BODY)}>
            <thead>
              <tr>
                {/* The token cell absorbs the slack and the three numeric
                    cells shrink to their content. Four even columns is what a
                    table does by default, and on a quarter-width board that
                    truncated every ticker to a single letter.

                    The three numeric headers are `whitespace-nowrap` for the
                    other half of that: a header allowed to wrap takes a second
                    line from every row rather than width from the token cell,
                    which is what "Buys / Sells" did on any board narrower than
                    full width. */}
                <Th>
                  <SortHeader
                    sort={stagePrefs?.sort ?? null}
                    sortKey="token"
                    onSort={onSort}
                  >
                    {t('memecoins.columns.token')}
                  </SortHeader>
                </Th>
                <Th align="right" className="whitespace-nowrap">
                  <SortHeader
                    align="right"
                    sort={stagePrefs?.sort ?? null}
                    sortKey="mcap"
                    onSort={onSort}
                  >
                    {t('memecoins.columns.mcap')}
                  </SortHeader>
                </Th>
                <Th align="right" className="whitespace-nowrap">
                  <SortHeader
                    align="right"
                    sort={stagePrefs?.sort ?? null}
                    sortKey="metric"
                    onSort={onSort}
                  >
                    {t(config.metricHeaderKey)}
                  </SortHeader>
                </Th>
                <Th
                  align="right"
                  className="whitespace-nowrap"
                  title={
                    stage === 'legendary'
                      ? t('memecoins.columns.turnoverHint')
                      : t('memecoins.columns.flowSortHint')
                  }
                >
                  <SortHeader
                    align="right"
                    sort={stagePrefs?.sort ?? null}
                    sortKey="flow"
                    onSort={onSort}
                  >
                    {stage === 'legendary' ? (
                      t('memecoins.columns.volume')
                    ) : (
                      // The widest header on the board, over the narrowest
                      // cell, so below 16rem of pane it would set the column's
                      // width and take that width from the tickers. Two spans
                      // rather than `sr-only`/`not-sr-only`, which resets
                      // `white-space` and put the header back on two lines.
                      <>
                        <span className="sr-only @min-[16rem]/pane:hidden">
                          {t('memecoins.columns.flow')}
                        </span>
                        <span className="hidden @min-[16rem]/pane:inline">
                          {t('memecoins.columns.flow')}
                        </span>
                      </>
                    )}
                  </SortHeader>
                </Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LaunchpadGhostRows stage={stage} />
              ) : (
                rows.map((token) => (
                  <LaunchpadRow
                    key={turnoverKey(token)}
                    token={token}
                    stage={stage}
                    now={now}
                    turnoverMultiple={turnover.get(turnoverKey(token)) ?? null}
                  />
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </div>

      <MemecoinPacedNote show={isLoading && slow} />
    </div>
  )
}

/**
 * A column header that sorts.
 *
 * A button inside the `<th>` rather than a clickable `<th>`: the header is a
 * table cell first, and a real button is what gets the keyboard, the focus
 * ring and the role for free. `aria-sort` goes on the cell, which is where a
 * screen reader looks for it.
 *
 * The caret is laid out at rest and only fades, so a header does not change
 * width when it becomes the sorted one and the row of headers never twitches
 * as somebody clicks along it.
 */
function SortHeader({
  children,
  sort,
  sortKey,
  onSort,
  align = 'left',
}: {
  children: React.ReactNode
  sort: LaunchpadSort
  sortKey: LaunchpadSortKey
  onSort: (key: LaunchpadSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort?.key === sortKey
  const Caret = active && sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
        active && 'text-foreground',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {children}
      <Caret
        className={cn('size-2.5 shrink-0', !active && 'opacity-0')}
        aria-hidden
      />
    </button>
  )
}

/**
 * The pane header's filter control.
 *
 * It lives in the header slot rather than above the rows because a board of
 * four columns cannot spend a toolbar row per column, and the header is the
 * one strip every pane already has. The count is the whole state readout: a
 * column filtered down to nothing looks identical to a quiet market until
 * something says two bounds are set.
 */
function FilterButton({
  count,
  label,
  onClick,
}: {
  count: number
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[10px] leading-none outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
        count > 0 ? 'text-asset-memecoin' : 'text-muted-foreground',
      )}
    >
      <ListFilter className="size-3 shrink-0" aria-hidden />
      {count > 0 ? count : null}
    </button>
  )
}

/** The third cell, which is what the four columns actually disagree about. */
function MetricCell({
  token,
  stage,
  now,
}: {
  token: LaunchpadToken
  stage: LaunchpadStage
  now: number
}) {
  if (stage === 'graduating') {
    return (
      <CurveBar
        progress={token.curveProgress}
        // The published feed computes the percentage; the fallback
        // reconstructs it. Only the reconstruction gets the tilde.
        estimated={token.source !== 'jupiter-gems'}
      />
    )
  }
  if (stage === 'new') {
    return <span>{formatAge(token.createdAt, now)}</span>
  }
  if (stage === 'graduated') {
    return <span>{formatAge(token.graduatedAt, now)}</span>
  }
  return <ChangeCell percent={token.flow.h24?.priceChangePercent ?? null} />
}

function LaunchpadRow({
  token,
  stage,
  now,
  turnoverMultiple,
}: {
  token: LaunchpadToken
  stage: LaunchpadStage
  now: number
  /** Legendary only, and null until the column has a baseline to measure on. */
  turnoverMultiple: number | null
}) {
  const { t } = useTranslation()
  const venue = VENUE_BY_CHAIN[token.chain] ?? null
  // The five-minute window on a launch, the daily one on a coin that has been
  // around for years. Both are "what just happened" at that column's scale.
  // Shared with the sort comparator rather than repeated here: a column ranked
  // on a window it is not showing is a column that looks broken.
  const flow = activeFlow(token, stage)

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <TokenMark
        iconUrl={token.iconUrl}
        symbol={token.symbol}
        address={token.address}
      />
      <span className="truncate font-medium">{token.symbol}</span>
      {token.holders !== null ? (
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatCount(token.holders)}
        </span>
      ) : null}
    </span>
  )

  return (
    <tr className="group/row border-none hover:bg-muted/40">
      <td className="w-full max-w-0 py-1 pr-3">
        {venue ? (
          <Link
            {...chartLinkProps({
              cls: 'memecoin',
              market: venue,
              id: normalizeInstrumentId(
                'memecoin',
                `${token.address}-${QUOTE}`,
              ),
            })}
            title={t('memecoins.openChart', { symbol: token.symbol })}
            className="block outline-none focus-visible:underline"
            onClick={() =>
              track('memecoin_row_opened', { stage, chain: token.chain })
            }
          >
            {identity}
          </Link>
        ) : (
          identity
        )}
      </td>
      {/* `marketCapUsd ?? fdvUsd`: a freshly migrated row often carries no
          market cap at all, because its curve figures are gone and the pool is
          minutes old. FDV is the same number for a launchpad token, whose
          whole supply is circulating, so a dash there was a gap with an answer
          sitting beside it. */}
      <td className="w-px whitespace-nowrap py-1 pr-3 text-right">
        {formatMcap(token.marketCapUsd ?? token.fdvUsd)}
      </td>
      <td className="w-px whitespace-nowrap py-1 pr-3 text-right">
        <MetricCell token={token} stage={stage} now={now} />
      </td>
      <td className="w-px whitespace-nowrap py-1 text-right">
        {/* Legendary has no buy/sell split to show — CoinGecko publishes a
            market-cap ranking, not a tape — so that column spends its width on
            traded volume instead of a full column of dashes, with the turnover
            multiple beside it. Volume without the multiple is unreadable
            across three orders of market cap: $310M is enormous for a $500M
            coin and a quiet day for a $14B one. */}
        {stage === 'legendary' ? (
          <span className="inline-flex items-center justify-end gap-1">
            <span>{formatMcap(flow ? flow.volumeUsd : null)}</span>
            {turnoverMultiple !== null ? (
              // Its own fixed column, four characters wide. Inline after the
              // volume, the cell was as wide as the multiple happened to be,
              // and `22.1×` on a live board took the width out of the ticker
              // beside it.
              <span
                className="hidden w-[38px] text-right @min-[17rem]/pane:inline-block"
                title={t('memecoins.columns.turnoverHint')}
              >
                <span
                  className={
                    turnoverMultiple >= UNUSUAL_TURNOVER
                      ? '[color:var(--chart-4)]'
                      : 'text-muted-foreground'
                  }
                >
                  {formatTurnoverMultiple(turnoverMultiple)}
                </span>
              </span>
            ) : null}
          </span>
        ) : (
          <FlowBar flow={flow} />
        )}
      </td>
    </tr>
  )
}

// Four zero-arg exports, because a pane type resolves to a component and the
// layout carries no per-pane configuration to pass a stage through.

export function MemeNewPane() {
  return <LaunchpadColumn stage="new" />
}

export function MemeGraduatingPane() {
  return <LaunchpadColumn stage="graduating" />
}

export function MemeGraduatedPane() {
  return <LaunchpadColumn stage="graduated" />
}

export function MemeLegendaryPane() {
  return <LaunchpadColumn stage="legendary" />
}
