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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Crown, GraduationCap, Rocket, Sparkles } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type {
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'

import {
  PANE_TABLE_BODY,
  PaneEmpty,
  PaneErrorBanner,
  Th,
} from '@/components/panes/pane-primitives'
import { SkeletonStatus } from '@/components/panes/pane-skeletons'
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
  turnoverKey,
  turnoverMultiples,
} from '@/lib/launchpad-turnover'
import { useLaunchpadColumn } from '@/hooks/use-launchpad'
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

  const rows = useMemo(() => tokens, [tokens])
  // Only Legendary spends a cell on this: the other three columns rank tokens
  // minutes old, whose "usual" volume does not exist yet.
  const turnover = useMemo(
    () => (stage === 'legendary' ? turnoverMultiples(rows) : EMPTY_TURNOVER),
    [stage, rows],
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
    return (
      <PaneEmpty
        icon={config.icon}
        title={t(config.emptyTitleKey)}
        body={t(config.emptyBodyKey)}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
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

        {rows.length > 0 ? (
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
                <Th>{t('memecoins.columns.token')}</Th>
                <Th align="right" className="whitespace-nowrap">
                  {t('memecoins.columns.mcap')}
                </Th>
                <Th align="right" className="whitespace-nowrap">
                  {t(config.metricHeaderKey)}
                </Th>
                <Th
                  align="right"
                  className="whitespace-nowrap"
                  title={
                    stage === 'legendary'
                      ? t('memecoins.columns.turnoverHint')
                      : undefined
                  }
                >
                  {stage === 'legendary' ? (
                    t('memecoins.columns.volume')
                  ) : (
                    // The widest header on the board, over the narrowest cell,
                    // so below 16rem of pane it would set the column's width
                    // and take that width from the tickers. Two spans rather
                    // than `sr-only`/`not-sr-only`, which resets
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
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((token) => (
                <LaunchpadRow
                  key={turnoverKey(token)}
                  token={token}
                  stage={stage}
                  now={now}
                  turnoverMultiple={turnover.get(turnoverKey(token)) ?? null}
                />
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
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
  const flow =
    stage === 'legendary'
      ? token.flow.h24
      : (token.flow.m5 ?? token.flow.h1 ?? token.flow.h24)

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <TokenMark iconUrl={token.iconUrl} symbol={token.symbol} />
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
          <span>
            {formatMcap(flow ? flow.volumeUsd : null)}
            {turnoverMultiple !== null ? (
              <span
                className="hidden @min-[17rem]/pane:inline"
                title={t('memecoins.columns.turnoverHint')}
              >
                {' · '}
                <span
                  className={
                    turnoverMultiple >= UNUSUAL_TURNOVER
                      ? '[color:var(--chart-4)]'
                      : 'text-muted-foreground'
                  }
                >
                  {turnoverMultiple.toFixed(1)}×
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
