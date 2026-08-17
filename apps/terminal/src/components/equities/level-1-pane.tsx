// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The quote, where a crypto workspace would put a book.
 *
 * A stock has one consolidated quote and a spread, not fourteen tapes, and the
 * broker's free feed carries top of book only — so this pane states the bid,
 * the ask, their sizes and the spread, and says out loud that there is no
 * depth behind them rather than drawing a one-row ladder that looks broken.
 *
 * It opens NO stream of its own. The pair route already streams this venue's
 * quotes for the chart, so the numbers come from the shared orderbook context;
 * a second subscription would double the socket traffic to show the same two
 * prices.
 *
 * The halt row appears ONLY when the venue has actually said something. The
 * connector subscribes Alpaca's `statuses` channel and puts what it hears on
 * the ticker payload, and a ticker that carries no status means the venue has
 * not spoken, which is not the same as "trading normally". So an absent status
 * renders no row at all rather than a reassuring green one.
 */
import { BookOpen, OctagonAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePanePair } from '@pairlens/plugin-sdk'
import { cn } from '@pairlens/ui'
import { TIMEFRAME_TO_MS, isTimeframe } from '@pairlens/shared/timeframe'
import type { TradingStatus } from '@pairlens/market-engine/types'

import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneDataUnavailable } from '@/components/layout/pane-data-unavailable'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  useOptionalCandleData,
  useOptionalChartConfig,
  useOptionalOrderbookData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { useEquitySession } from '@/hooks/use-equity-session'
import { useMarketCredentialGate } from '@/hooks/use-market-credential-gate'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { usePairUnavailable } from '@/stores/pair-availability-store'
import { formatShares } from '@/lib/equities/format'
import { dayEndMs, dayStartMs, sessionRange } from '@/lib/equities/session'
import { formatPrice } from '@/lib/format-price'

export function Level1Pane() {
  const activePair = usePanePair()
  const orderbookData = useOptionalOrderbookData()

  if (!activePair || !orderbookData) {
    return <PanePairPicker />
  }

  return <Level1PaneInner pairKey={activePair.pairKey} />
}

function Level1PaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const chartConfig = useOptionalChartConfig()
  const market = chartConfig?.market ?? ''
  const orderbookData = useOptionalOrderbookData()
  const tickerData = useOptionalTickerData()
  const candleData = useOptionalCandleData()
  const venue = usePaneVenue(market)
  const gate = useMarketCredentialGate(market)
  const unavailable = usePairUnavailable(market, pairKey)
  const session = useEquitySession()

  if (gate.state !== 'ok') {
    return (
      <PaneCredentialsRequired
        compact
        market={market}
        state={gate.state}
        venueLabel={gate.venueLabel}
      />
    )
  }

  // The venue does not carry this symbol at all: the same sentence the chart
  // beside it is showing, rather than an empty quote that reads as a stall.
  if (unavailable) {
    return <PaneDataUnavailable compact market={market} pairKey={pairKey} />
  }

  const book = orderbookData?.orderbook
  const bid = book?.bids[0]
  const ask = book?.asks[0]

  if (!bid && !ask) {
    return (
      <PaneEmpty
        body={t('level1.emptyBody')}
        icon={BookOpen}
        title={t('level1.emptyTitle')}
      />
    )
  }

  const spread =
    bid && ask ? ask.price - bid.price : (tickerData?.spread ?? null)
  const mid = bid && ask ? (ask.price + bid.price) / 2 : null
  const spreadBps = spread !== null && mid ? (spread / mid) * 10_000 : null

  // The range is anchored on the session, so a thin overnight print cannot
  // widen "today". Without a published session there is nothing to anchor to
  // and the row is dropped rather than quietly becoming a 24-hour range.
  const day = session.state?.day ?? null
  const timeframe = chartConfig?.timeframe
  const timeframeMs = isTimeframe(timeframe) ? TIMEFRAME_TO_MS[timeframe] : null
  const range =
    day && timeframeMs
      ? sessionRange(
          candleData?.candles ?? [],
          dayStartMs(day),
          dayEndMs(day),
          timeframeMs,
        )
      : null
  const last = tickerData?.lastTradePrice ?? null
  const rangePosition =
    range && last !== null && range.high > range.low
      ? Math.min(1, Math.max(0, (last - range.low) / (range.high - range.low)))
      : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-3">
      {/* Only when the venue has spoken; see the module note. */}
      {tickerData?.tradingStatus && (
        <TradingStatusRow status={tickerData.tradingStatus} />
      )}

      <div className="flex gap-1.5">
        <QuoteCard
          label={t('level1.bid')}
          price={bid?.price}
          side="bid"
          size={bid?.size}
        />
        <QuoteCard
          label={t('level1.ask')}
          price={ask?.price}
          side="ask"
          size={ask?.size}
        />
      </div>

      <Row label={t('level1.spread')}>
        {spread === null ? (
          '—'
        ) : (
          <>
            {formatPrice(spread)}
            {spreadBps !== null && (
              <span className="ml-1.5 text-muted-foreground">
                {spreadBps.toFixed(1)} {t('level1.bps')}
              </span>
            )}
          </>
        )}
      </Row>

      {range && (
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatPrice(range.low)}
            </span>
            <span>{t('level1.dayRange')}</span>
            <span className="font-mono tabular-nums">
              {formatPrice(range.high)}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-muted">
            <span className="absolute inset-0 rounded-full bg-[color-mix(in_oklch,var(--chart-3)_55%,transparent)]" />
            {rangePosition !== null && (
              <span
                aria-hidden
                className="absolute -top-1 h-3.5 w-[3px] rounded-sm bg-foreground"
                style={{ left: `${(rangePosition * 100).toFixed(2)}%` }}
              />
            )}
          </div>
        </div>
      )}

      <Row label={t('level1.feed')}>{venue.label}</Row>

      {/* The honest footnote, not a fake second level. */}
      <p className="text-[10px] leading-snug text-muted-foreground/80">
        {t('level1.depthNote')}
      </p>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

/**
 * What the tape says about whether this stock is trading.
 *
 * 'active' is stated quietly: it only ever appears right after a resumption
 * message, and a loud green badge sitting there all day would train people to
 * stop reading the row that matters. A halt takes the destructive tone, a
 * volatility pause the caution one, and the venue's own reason text rides
 * underneath verbatim because 'News Pending' is the useful part.
 */
function TradingStatusRow({ status }: { status: TradingStatus }) {
  const { t } = useTranslation()
  const since =
    status.sinceMs === null
      ? null
      : new Date(status.sinceMs).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/40 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t('level1.status')}
        </span>
        {status.state === 'active' ? (
          <span className="text-[11px] text-muted-foreground">
            {t('level1.statusTrading')}
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              status.state === 'halted'
                ? 'bg-destructive/15 text-destructive'
                : 'bg-[color-mix(in_oklch,var(--chart-4)_20%,transparent)] text-[var(--chart-4)]',
            )}
          >
            <OctagonAlert aria-hidden className="size-3" />
            {status.state === 'halted'
              ? t('level1.statusHalted')
              : t('level1.statusPaused')}
          </span>
        )}
      </div>
      {(status.reason || since) && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {status.reason}
          {status.reason && since ? ' · ' : ''}
          {since && t('level1.statusSince', { time: since })}
        </p>
      )}
    </div>
  )
}

function QuoteCard({
  label,
  price,
  size,
  side,
}: {
  label: string
  price: number | undefined
  size: number | undefined
  side: 'bid' | 'ask'
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-lg px-2.5 py-2',
        side === 'bid' ? 'bg-up/10' : 'bg-down/10',
      )}
    >
      <p className="truncate text-[10px] text-muted-foreground">
        {label}
        {size !== undefined && (
          <span className="ml-1 font-mono tabular-nums">
            · {formatShares(size)}
          </span>
        )}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono text-base font-semibold tabular-nums',
          side === 'bid' ? 'text-up' : 'text-down',
        )}
      >
        {price === undefined ? '—' : formatPrice(price)}
      </p>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="truncate font-mono tabular-nums text-foreground">
        {children}
      </span>
    </div>
  )
}
