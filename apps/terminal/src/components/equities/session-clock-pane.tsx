// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one-row clock that sits directly above the ticket.
 *
 * It is there because extended hours change what the ticket will ACCEPT, not
 * just a label on it: outside regular hours the order type is forced to limit,
 * and a trader is owed the reason in the same glance. Deliberately quiet —
 * muted type, one row, no benchmark cells — because it shares a column with a
 * chart that is doing the talking.
 */
import { Clock, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PaneCredentialsRequired } from '@/components/layout/pane-credentials-required'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import {
  HalfDayBadge,
  SessionDayBar,
  SessionPhaseChip,
  countdownSentence,
} from '@/components/equities/session-pieces'
import { useEquitySession } from '@/hooks/use-equity-session'
import {
  exchangeZoneLabel,
  formatExchangeDay,
  formatExchangeTime,
} from '@/lib/equities/session-labels'

export function SessionClockPane() {
  const { t, i18n } = useTranslation()
  const { state, nowMs, timeZone, venue, gate, venueLabel, isPending } =
    useEquitySession({ tick: true })

  if (!venue) {
    return (
      <PaneEmpty
        body={t('session.noVenueBody')}
        icon={Clock}
        title={t('session.noVenueTitle')}
      />
    )
  }

  if (gate !== 'ok') {
    return (
      <PaneCredentialsRequired
        compact
        market={venue.market}
        state={gate}
        venueLabel={venueLabel}
      />
    )
  }

  if (!state) {
    return (
      <div className="flex h-full items-center gap-2 px-3">
        {isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
            <span className="text-[11px] text-muted-foreground">
              {t('session.loading')}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {t('session.unavailableTitle')}
          </span>
        )}
      </div>
    )
  }

  const day = state.day ?? state.nextDay
  const countdown = countdownSentence(t, state, nowMs)

  return (
    <div className="flex h-full min-h-0 items-center gap-4 px-3 py-2">
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <SessionPhaseChip compact phase={state.phase} />
          {state.day && <HalfDayBadge day={state.day} />}
        </div>
        <p className="font-mono text-[13px] font-semibold tabular-nums">
          {countdown ?? t('session.noSchedule')}
        </p>
      </div>

      <span className="h-8 w-px shrink-0 bg-border" />

      {day ? (
        <>
          <SessionDayBar
            className="min-w-0 flex-1"
            day={day}
            nowMs={nowMs}
            timeZone={timeZone}
          />
          {/* Exchange time, spelled out: the bar is drawn in the venue's
              hours and the reader may well be in another zone. */}
          <p className="shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatExchangeTime(nowMs, timeZone)}{' '}
            {exchangeZoneLabel(nowMs, timeZone)}
            <span className="block font-sans">
              {formatExchangeDay(nowMs, timeZone, i18n.language)}
            </span>
          </p>
        </>
      ) : (
        <p className="flex-1 text-[11px] text-muted-foreground">
          {t('session.clockOnly')}
        </p>
      )}
    </div>
  )
}
