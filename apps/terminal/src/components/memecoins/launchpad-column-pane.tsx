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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  AtSign,
  ChevronDown,
  ChevronUp,
  Crown,
  Globe,
  GraduationCap,
  ListFilter,
  Rocket,
  Send,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
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
  PANE_COLUMN_HEADER,
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
} from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
import {
  GHOST_FADE_START,
  LaunchpadGhostRows,
  MemecoinPacedNote,
  useGhostRowCount,
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
  QUICK_BUY_CHIPS_SOL,
  activeFilterCount,
  activeFlow,
  arrangeTokens,
  nextSort,
  quickBuySolOf,
} from '@/lib/memecoins/board-prefs'
import { useLaunchpadColumn } from '@/hooks/use-launchpad'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useQuickBuy } from '@/hooks/use-quick-buy'
import { useHoldConfirm } from '@/hooks/use-trade-confirm'
import { tradeHoldMs } from '@/lib/settings/trade-confirm'
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

/** The two lines of a row: 16px of headline, 14px of detail under it. */
const ROW_MAIN = 'text-[12px] leading-[16px]'
const ROW_SUB =
  'block min-h-[14px] truncate text-[10.5px] leading-[14px] text-muted-foreground'

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

  // The ghosts fill whatever height this column happens to have. A fixed
  // count drew a block of them across the top of a full-height pane and
  // stopped, which reads as an answer rather than a wait.
  const scrollRef = useRef<HTMLDivElement>(null)
  const ghostRows = useGhostRowCount(scrollRef, isLoading)

  const [prefs, setPrefs] = usePersistedState<LaunchpadBoardPrefs>(
    MEMECOIN_BOARD_PREFS_KEY,
    EMPTY_PREFS,
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [amountOpen, setAmountOpen] = useState(false)
  const stagePrefs = prefs[stage]
  const quickBuy = useQuickBuy()
  const quickBuySol = quickBuySolOf(stagePrefs)

  // The launchpads the FEED carries right now, offered as chips. An open set:
  // the value is whatever string the provider published, and a fixed list
  // would go stale the week a new curve launched.
  const launchpadOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const token of tokens) if (token.launchpad) seen.add(token.launchpad)
    return [...seen].sort()
  }, [tokens])

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
          launchpadOptions={launchpadOptions}
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
        launchpadOptions={launchpadOptions}
      />
      <QuickBuyAmountDialog
        open={amountOpen}
        onOpenChange={setAmountOpen}
        value={quickBuySol}
        onChange={(sol) => setStagePrefs({ quickBuySol: sol })}
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

      {/* While the ghosts are up the pane masks its own bottom and stops
          scrolling: the stack is sized to overflow slightly, and a scrollbar
          on a pane with nothing in it yet is furniture for a list that does
          not exist. The mask is what turns the end of the stack into a column
          running out of sight instead of a hard edge halfway down. */}
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1',
          isLoading ? 'skeleton-fade overflow-hidden' : 'overflow-y-auto',
        )}
        style={
          isLoading
            ? ({
                '--skeleton-fade-start': `${GHOST_FADE_START * 100}%`,
              } as React.CSSProperties)
            : undefined
        }
        aria-busy={isLoading || revalidating}
      >
        {isLoading ? (
          <SkeletonStatus
            label={t(retrying ? 'memecoins.retrying' : 'memecoins.loading')}
          />
        ) : null}

        {/* The list is drawn from the first frame, header and all. The
            header is furniture rather than data, and a column that renders
            nothing until its feed answers reads as the empty state it also
            uses for "nothing is minting" — then rebuilds itself under the
            reader when the rows land.

            A list, not a table. A row is two lines (ticker and stage figure,
            then name, holders and socials, with market cap stacked over flow
            on the right), and a table would have spent four fixed columns on
            what one flexible text block and one stacked figure now carry. On
            a quarter-width board the four columns left the ticker a single
            letter. */}
        {isLoading || rows.length > 0 ? (
          <div className={PANE_TABLE_BODY}>
            <div
              className={cn(
                'sticky top-0 z-10 flex items-center gap-2.5 pb-1',
                PANE_COLUMN_HEADER,
              )}
            >
              <span className="min-w-0 flex-1">
                <SortHeader
                  sort={stagePrefs?.sort ?? null}
                  sortKey="token"
                  onSort={onSort}
                >
                  {t('memecoins.columns.token')}
                </SortHeader>
              </span>
              <span className="whitespace-nowrap">
                <SortHeader
                  align="right"
                  sort={stagePrefs?.sort ?? null}
                  sortKey="metric"
                  onSort={onSort}
                >
                  {t(config.metricHeaderKey)}
                </SortHeader>
              </span>
              <span className="whitespace-nowrap">
                <SortHeader
                  align="right"
                  sort={stagePrefs?.sort ?? null}
                  sortKey="mcap"
                  onSort={onSort}
                >
                  {t('memecoins.columns.mcap')}
                </SortHeader>
              </span>
              <span
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
                    // The widest label on the board. Below 20rem of pane it
                    // took the ticker's room in the header, so there the
                    // sort button keeps its caret and the label goes to the
                    // screen reader only. Two spans rather than
                    // `sr-only`/`not-sr-only`, which resets `white-space`.
                    <>
                      <span className="sr-only @min-[20rem]/pane:hidden">
                        {t('memecoins.columns.flow')}
                      </span>
                      <span className="hidden @min-[20rem]/pane:inline">
                        {t('memecoins.columns.flow')}
                      </span>
                    </>
                  )}
                </SortHeader>
              </span>
              {/* The quick-buy amount, at the end of the header the bolts sit
                  under: the number every bolt below will spend, one click to
                  change it. */}
              <button
                type="button"
                onClick={() => setAmountOpen(true)}
                title={t('memecoins.quickBuy.amountTitle')}
                aria-label={t('memecoins.quickBuy.amountTitle')}
                className="inline-flex w-7 items-center justify-end gap-0.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring @min-[19rem]/pane:w-[54px]"
              >
                <Zap className="size-2.5 shrink-0" aria-hidden />
                <span className="hidden tabular-nums @min-[19rem]/pane:inline">
                  {quickBuySol}
                </span>
              </button>
            </div>
            <ul>
              {isLoading ? (
                <LaunchpadGhostRows stage={stage} rows={ghostRows} />
              ) : (
                rows.map((token) => (
                  <LaunchpadRow
                    key={turnoverKey(token)}
                    token={token}
                    stage={stage}
                    now={now}
                    turnoverMultiple={turnover.get(turnoverKey(token)) ?? null}
                    quickBuy={quickBuy}
                    quickBuySol={quickBuySol}
                  />
                ))
              )}
            </ul>
          </div>
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
  quickBuy,
  quickBuySol,
}: {
  token: LaunchpadToken
  stage: LaunchpadStage
  now: number
  /** Legendary only, and null until the column has a baseline to measure on. */
  turnoverMultiple: number | null
  quickBuy: ReturnType<typeof useQuickBuy>
  quickBuySol: number
}) {
  const { t } = useTranslation()
  const venue = VENUE_BY_CHAIN[token.chain] ?? null
  const audit = token.audit
  // Revoked means BOTH authorities are gone. One revoked and one unknown is
  // unknown, and unknown draws nothing: the dot is a claim, and the safety
  // pane makes the same refusal in words.
  const safety: 'revoked' | 'live' | null =
    audit?.mintAuthorityDisabled === true &&
    audit.freezeAuthorityDisabled === true
      ? 'revoked'
      : audit?.mintAuthorityDisabled === false ||
          audit?.freezeAuthorityDisabled === false
        ? 'live'
        : null
  // The five-minute window on a launch, the daily one on a coin that has been
  // around for years. Both are "what just happened" at that column's scale.
  // Shared with the sort comparator rather than repeated here: a column ranked
  // on a window it is not showing is a column that looks broken.
  const flow = activeFlow(token, stage)

  const chartLink = venue
    ? chartLinkProps({
        cls: 'memecoin',
        market: venue,
        id: normalizeInstrumentId('memecoin', `${token.address}-${QUOTE}`),
      })
    : null
  const linkTitle = token.launchpad
    ? `${t('memecoins.openChart', { symbol: token.symbol })} · ${t('memecoins.row.launchedOn', { launchpad: token.launchpad })}`
    : t('memecoins.openChart', { symbol: token.symbol })

  // The ticker and its safety dot. Wrapped in the chart link when the chain
  // is routed, bare when it is not.
  const headline = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn(ROW_MAIN, 'truncate font-medium')}>
        {token.symbol}
      </span>
      {safety ? (
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            safety === 'revoked' ? 'bg-up' : 'bg-down',
          )}
          title={t(
            safety === 'revoked'
              ? 'memecoins.row.authoritiesRevoked'
              : 'memecoins.row.authoritiesLive',
          )}
          aria-label={t(
            safety === 'revoked'
              ? 'memecoins.row.authoritiesRevoked'
              : 'memecoins.row.authoritiesLive',
          )}
        />
      ) : null}
    </span>
  )

  // The name, or the launchpad when the name only repeats the ticker.
  const subline =
    token.name && token.name.toUpperCase() !== token.symbol.toUpperCase()
      ? token.name
      : (token.launchpad ?? '')

  // Socials sit OUTSIDE the chart link, as their own anchors: a row is one
  // link to its chart, and a link inside a link is not HTML.
  const socials = (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {token.socials.twitter ? (
        <SocialLink
          href={token.socials.twitter}
          label={t('memecoins.row.twitter')}
          Icon={AtSign}
        />
      ) : null}
      {token.socials.telegram ? (
        <SocialLink
          href={token.socials.telegram}
          label={t('memecoins.row.telegram')}
          Icon={Send}
        />
      ) : null}
      {token.socials.website ? (
        <SocialLink
          href={token.socials.website}
          label={t('memecoins.row.website')}
          Icon={Globe}
        />
      ) : null}
    </span>
  )

  return (
    <li className="group/row grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 py-1.5 hover:bg-muted/40">
      <TokenMark
        iconUrl={token.iconUrl}
        symbol={token.symbol}
        address={token.address}
        className="size-7 text-[10px]"
      />

      {/* Two lines of text. Line one is the ticker with the stage figure
          beside it (age, time since migration, or the day's move); line two
          is the name with the holder count and the social links. Graduating
          is the exception: its figure is a 74px curve bar, which beside the
          ticker left it two letters on a quarter-width board, so the bar
          leads the second line there instead. */}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          {chartLink ? (
            <Link
              {...chartLink}
              title={linkTitle}
              className="block min-w-0 outline-none focus-visible:underline"
              onClick={() =>
                track('memecoin_row_opened', { stage, chain: token.chain })
              }
            >
              {headline}
            </Link>
          ) : (
            <span className="min-w-0">{headline}</span>
          )}
          {stage !== 'graduating' ? (
            <span className="shrink-0 text-[10.5px] text-muted-foreground">
              <MetricCell token={token} stage={stage} now={now} />
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {stage === 'graduating' ? (
            <span className="flex h-3.5 shrink-0 items-center">
              <MetricCell token={token} stage={stage} now={now} />
            </span>
          ) : null}
          <span className={cn(ROW_SUB, 'min-w-0 flex-1')}>{subline}</span>
          {token.holders !== null ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
              title={t('memecoins.stats.holders')}
            >
              <Users className="size-2.5" aria-hidden />
              {formatCount(token.holders)}
            </span>
          ) : null}
          {socials}
        </span>
      </span>

      {/* Market cap over flow, right-aligned. `marketCapUsd ?? fdvUsd`: a
          freshly migrated row often carries no market cap at all, because
          its curve figures are gone and the pool is minutes old. FDV is the
          same number for a launchpad token, whose whole supply is
          circulating, so a dash there was a gap with an answer beside it. */}
      <span className="flex flex-col items-end whitespace-nowrap">
        <span className={cn(ROW_MAIN, 'block')}>
          {formatMcap(token.marketCapUsd ?? token.fdvUsd)}
        </span>
        {/* Legendary has no buy/sell split to show — CoinGecko publishes a
            market-cap ranking, not a tape — so that column shows traded
            volume instead of a row of dashes, with the turnover multiple
            beside it. Volume without the multiple is unreadable across three
            orders of market cap: $310M is enormous for a $500M coin and a
            quiet day for a $14B one. */}
        {stage === 'legendary' ? (
          <span className="inline-flex items-center justify-end gap-1 text-[10.5px] leading-[14px] text-muted-foreground">
            <span>{formatMcap(flow ? flow.volumeUsd : null)}</span>
            {turnoverMultiple !== null ? (
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
          <span className="flex h-3.5 items-center">
            <FlowBar flow={flow} />
          </span>
        )}
      </span>

      <span className="flex items-center justify-end">
        {token.chain === 'solana' ? (
          <QuickBuyButton token={token} sol={quickBuySol} quickBuy={quickBuy} />
        ) : (
          <span className="inline-block w-7 @min-[19rem]/pane:w-[54px]" />
        )}
      </span>
    </li>
  )
}

function SocialLink({
  href,
  label,
  Icon,
}: {
  href: string
  label: string
  Icon: typeof Globe
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="rounded-sm p-0.5 text-muted-foreground/60 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring group-hover/row:text-muted-foreground"
    >
      <Icon className="size-2.5" aria-hidden />
    </a>
  )
}

/**
 * The bolt. One press buys the column's amount of this token through the
 * guarded order path, with the same gesture the ticket uses: press and hold
 * by default, a single click if the trader chose that in Settings › Risk.
 * A bolt on a device with no Solana wallet still answers: it explains and
 * points at Accounts, rather than sitting disabled with no way to learn why.
 */
function QuickBuyButton({
  token,
  sol,
  quickBuy,
}: {
  token: LaunchpadToken
  sol: number
  quickBuy: ReturnType<typeof useQuickBuy>
}) {
  const { t } = useTranslation()
  const busy = quickBuy.isBuying(token.address)
  const ready = quickBuy.readiness === 'ready'
  const { controlProps, fillProps } = useHoldConfirm({
    holdMs: tradeHoldMs(true),
    busy,
    onConfirm: () => {
      if (!ready) {
        quickBuy.explain()
        return
      }
      void quickBuy.buy(token, sol)
    },
  })
  const label = t('memecoins.quickBuy.buy', { symbol: token.symbol, sol })
  return (
    <button
      type="button"
      disabled={busy}
      {...controlProps}
      title={label}
      aria-label={label}
      className={cn(
        // A square bolt on a narrow column, the bolt plus its amount once the
        // pane is wide enough: at a quarter of a 1280px board the four cells
        // already fill the row, and a 46px button there pushed the table past
        // the pane and put a horizontal scrollbar under every column.
        'relative inline-flex h-7 w-7 select-none items-center justify-center gap-0.5 overflow-hidden rounded-md font-mono text-[10.5px] tabular-nums outline-none transition-[opacity,color] focus-visible:ring-1 focus-visible:ring-ring @min-[19rem]/pane:w-[54px]',
        'bg-up/10 text-up opacity-60 hover:opacity-100 group-hover/row:opacity-100',
        busy && 'opacity-100',
      )}
    >
      {fillProps ? <span {...fillProps} /> : null}
      <span className="relative inline-flex items-center gap-0.5">
        {busy ? (
          <Spinner className="size-2.5" />
        ) : (
          <Zap className="size-3" aria-hidden />
        )}
        <span className="hidden @min-[19rem]/pane:inline">{sol}</span>
      </span>
    </button>
  )
}

/** The column's quick-buy amount, in SOL: five chips and a field. */
function QuickBuyAmountDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: number
  onChange: (sol: number) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    if (open) setDraft(String(value))
  }, [open, value])
  const commit = (sol: number) => {
    if (!(sol > 0) || !Number.isFinite(sol)) return
    onChange(sol)
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{t('memecoins.quickBuy.amountTitle')}</DialogTitle>
          <DialogDescription>
            {t('memecoins.quickBuy.amountHint')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex gap-1">
            {QUICK_BUY_CHIPS_SOL.map((sol) => (
              <button
                key={sol}
                type="button"
                className={cn(
                  'flex-1 rounded-md border px-1 py-1 font-mono text-[11.5px] tabular-nums transition-colors',
                  Number(draft) === sol
                    ? 'border-primary text-foreground'
                    : 'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground',
                )}
                onClick={() => commit(sol)}
              >
                {sol}
              </button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            className="h-7 font-mono text-xs"
            value={draft}
            aria-label={t('memecoins.quickBuy.amountLabel')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(Number(draft))
            }}
          />
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => commit(Number(draft))}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
