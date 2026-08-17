// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where the trading day is, at discovery width.
 *
 * The strip leads the equities board because a stock desk's first question is
 * not "what is moving" but "is it open, and how long have I got" — and the
 * answer is the broker's, never a 09:30 literal. Half days and holidays are
 * the whole reason this pane exists rather than a label.
 *
 * The benchmark cells are index ETFs named by their own tickers, not indices.
 * The broker quotes SPY; it does not quote the S&P 500, and printing '5,612.40
 * S&P 500' off an ETF price would be a number from a different instrument.
 */
import { Clock, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui'

import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import {
  HalfDayBadge,
  SessionDayBar,
  countdownSentence,
  phaseLabel,
  phaseTone,
} from '@/components/equities/session-pieces'
import { useBulkTickerQuotes } from '@/hooks/use-bulk-ticker-quotes'
import { useEquitySession } from '@/hooks/use-equity-session'
import { formatExchangeDay } from '@/lib/equities/session-labels'
import { formatPrice } from '@/lib/format-price'

/** Broad-market ETFs, in the order a US desk reads them. */
const BENCHMARKS = ['SPY', 'QQQ', 'IWM', 'DIA']

export function SessionPane() {
  const { t, i18n } = useTranslation()
  const { state, nowMs, timeZone, venue, gate, venueLabel, isPending, error } =
    useEquitySession({ tick: true })
  const quotes = useBulkTickerQuotes()

  if (!venue) {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/plugins"
          >
            {t('session.noVenueAction')} →
          </Link>
        }
        body={t('session.noVenueBody')}
        icon={Clock}
        title={t('session.noVenueTitle')}
      />
    )
  }

  if (gate !== 'ok') {
    return (
      <PaneCredentialsRequired
        market={venue.market}
        state={gate}
        venueLabel={venueLabel}
      />
    )
  }

  if (!state) {
    return isPending ? (
      <div className="flex h-full items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">{t('session.loading')}</p>
      </div>
    ) : (
      <PaneEmpty
        body={error ?? t('session.unavailableBody')}
        icon={Clock}
        title={t('session.unavailableTitle')}
      />
    )
  }

  const tone = phaseTone(state.phase)
  const countdown = countdownSentence(t, state, nowMs)
  const benchmarks = BENCHMARKS.map((symbol) => ({
    symbol,
    quote: quotes.get(symbol),
  })).filter((row) => row.quote !== undefined)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      {error && <PaneErrorBanner message={error} venue={venueLabel} />}

      <div className="flex min-h-0 flex-1 items-center gap-5">
        {/* State + countdown */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn('size-2.5 shrink-0 rounded-full', tone.dot)}
            style={
              state.phase === 'rth'
                ? { boxShadow: '0 0 10px var(--up)' }
                : undefined
            }
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              {phaseLabel(t, state.phase)}
              {state.day && <HalfDayBadge day={state.day} />}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {countdown ?? t('session.noSchedule')}
            </p>
          </div>
        </div>

        <span className="h-10 w-px shrink-0 bg-border" />

        {/* The day itself */}
        <div className="min-w-0 flex-1">
          {state.day ? (
            <SessionDayBar day={state.day} nowMs={nowMs} timeZone={timeZone} />
          ) : state.nextDay ? (
            <div className="text-[11px] text-muted-foreground">
              <p>
                {t('session.nextSession', {
                  day: formatExchangeDay(
                    state.nextDay.openMs,
                    timeZone,
                    i18n.language,
                  ),
                })}
              </p>
              <SessionDayBar
                className="mt-1.5 opacity-60"
                day={state.nextDay}
                nowMs={nowMs}
                timeZone={timeZone}
              />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t('session.clockOnly')}
            </p>
          )}
        </div>

        {/* Benchmarks, by ticker, only where the venue actually quoted one */}
        {benchmarks.length > 0 && (
          <div className="flex shrink-0 gap-5">
            {benchmarks.map(({ symbol, quote }) => (
              <div key={symbol}>
                <p className="text-[11px] text-muted-foreground">{symbol}</p>
                <p className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums">
                  {formatPrice(quote!.price)}{' '}
                  {/* Percent already, and for a stock it is the move since
                      the previous close — which is the session number. */}
                  <span
                    className={cn(
                      'text-xs',
                      quote!.change24h >= 0 ? 'text-up' : 'text-down',
                    )}
                  >
                    {quote!.change24h >= 0 ? '+' : ''}
                    {quote!.change24h.toFixed(2)}%
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
