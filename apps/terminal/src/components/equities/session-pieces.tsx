// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The parts both clock panes draw.
 *
 * `session` is the wide discovery strip and `session-clock` is the one-row
 * version that sits above the ticket; they say the same thing at two sizes, so
 * the phase chip, the countdown sentence and the day bar live here rather than
 * in two copies that drift apart on the day a half session proves one of them
 * wrong.
 */
import { useTranslation } from 'react-i18next'
import { cn } from '@pairlens/ui'
import type { TFunction } from 'i18next'

import type { MarketSessionDay } from '@pairlens/shared/instrument-types'

import type { SessionPhase, SessionState } from '@/lib/equities/session'
import { dayBarSegments, splitCountdown } from '@/lib/equities/session'
import { formatExchangeTime } from '@/lib/equities/session-labels'

/** Under six hours of auction is a half day, and worth saying out loud. */
const HALF_DAY_MS = 6 * 3600_000

/** Regular hours read as live; the extended sessions are a caution, not a go. */
export function phaseTone(phase: SessionPhase): {
  text: string
  dot: string
  chip: string
} {
  switch (phase) {
    case 'rth':
      return { text: 'text-up', dot: 'bg-up', chip: 'bg-up/15 text-up' }
    case 'pre':
    case 'post':
      return {
        text: 'text-[var(--chart-4)]',
        dot: 'bg-[var(--chart-4)]',
        chip: 'bg-[color-mix(in_oklch,var(--chart-4)_18%,transparent)] text-[var(--chart-4)]',
      }
    case 'closed':
      return {
        text: 'text-muted-foreground',
        dot: 'bg-muted-foreground/60',
        chip: 'bg-secondary text-muted-foreground',
      }
  }
}

export function phaseLabel(t: TFunction, phase: SessionPhase): string {
  switch (phase) {
    case 'rth':
      return t('session.stateOpen')
    case 'pre':
      return t('session.statePre')
    case 'post':
      return t('session.statePost')
    case 'closed':
      return t('session.stateClosed')
  }
}

/**
 * The same phase, attributed: 'Alpaca market open' rather than 'Market open'.
 *
 * The wide strip has room to say WHOSE market, and it should, because the
 * clock, the calendar and the half days all came from one broker's answer
 * rather than from a rule about US hours. The design writes 'US market open';
 * we write the venue, because the venue is what we actually know — a second
 * broker in another country would label its own hours correctly with no change
 * here, which a hardcoded 'US' would not.
 *
 * The one-row clock pane keeps the bare `phaseLabel`: there is no room beside
 * an order ticket for an attribution the pair topbar already carries.
 */
export function phaseHeadline(
  t: TFunction,
  phase: SessionPhase,
  venue: string,
): string {
  if (!venue) return phaseLabel(t, phase)
  switch (phase) {
    case 'rth':
      return t('session.headlineOpen', { venue })
    case 'pre':
      return t('session.headlinePre', { venue })
    case 'post':
      return t('session.headlinePost', { venue })
    case 'closed':
      return t('session.headlineClosed', { venue })
  }
}

/**
 * The remaining time, in the largest two units that still mean something.
 *
 * Days appear only across a weekend or a holiday, seconds only in the last
 * hour: "opens in 2d 14h" and "closes in 4m 12s" are both readable, while
 * "opens in 62h 0m 12s" is a stopwatch nobody asked for.
 */
export function formatCountdown(t: TFunction, ms: number): string {
  const { days, hours, minutes, seconds } = splitCountdown(ms)
  if (days > 0) return t('session.durationDh', { days, hours })
  if (hours > 0) return t('session.durationHm', { hours, minutes })
  return t('session.durationMs', { minutes, seconds })
}

/** 'Closes in 3h 12m' — the sentence, not just the number. */
export function countdownSentence(
  t: TFunction,
  state: SessionState,
  nowMs: number,
): string | null {
  if (state.nextBoundaryMs === null) return null
  const time = formatCountdown(t, state.nextBoundaryMs - nowMs)
  switch (state.nextBoundary) {
    case 'close':
      return t('session.closesIn', { time })
    case 'postClose':
      return t('session.afterHoursEndsIn', { time })
    case 'preOpen':
      return t('session.preMarketIn', { time })
    default:
      return t('session.opensIn', { time })
  }
}

export function SessionPhaseChip({
  phase,
  compact = false,
}: {
  phase: SessionPhase
  compact?: boolean
}) {
  const { t } = useTranslation()
  const tone = phaseTone(phase)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium',
        compact ? 'text-[10px]' : 'text-[11px]',
        tone.chip,
      )}
    >
      <span className={cn('size-1.5 rounded-full', tone.dot)} />
      {phaseLabel(t, phase)}
    </span>
  )
}

/**
 * Pre / regular / after-hours as one bar, measured on the venue's real hours.
 *
 * The marker is the whole point: a strip that shows the windows without saying
 * where you are in them is a legend, not a clock.
 */
export function SessionDayBar({
  day,
  nowMs,
  timeZone,
  labels = true,
  className,
}: {
  day: MarketSessionDay
  nowMs: number
  timeZone: string
  /** The 04:00 / 09:30 / 16:00 / 20:00 row under the bar. */
  labels?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const segments = dayBarSegments(day, nowMs)
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`

  return (
    <div className={cn('min-w-0', className)}>
      {labels && (
        <div className="mb-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
          {day.preOpenMs !== undefined && (
            <span>
              {formatExchangeTime(day.preOpenMs, timeZone)}{' '}
              <span className="font-sans">{t('session.barPre')}</span>
            </span>
          )}
          <span>
            {formatExchangeTime(day.openMs, timeZone)}{' '}
            <span className="font-sans">{t('session.barOpen')}</span>
          </span>
          <span>
            {formatExchangeTime(day.closeMs, timeZone)}{' '}
            <span className="font-sans">{t('session.barClose')}</span>
          </span>
          {day.postCloseMs !== undefined && (
            <span>
              {formatExchangeTime(day.postCloseMs, timeZone)}{' '}
              <span className="font-sans">{t('session.barPost')}</span>
            </span>
          )}
        </div>
      )}

      <div className="relative flex h-2.5 overflow-hidden rounded-full">
        <span
          className="bg-[color-mix(in_oklch,var(--chart-4)_34%,transparent)]"
          style={{ width: pct(segments.pre) }}
        />
        <span className="bg-up/40" style={{ width: pct(segments.rth) }} />
        <span
          className="bg-[color-mix(in_oklch,var(--chart-3)_30%,transparent)]"
          style={{ width: pct(segments.post) }}
        />
        {segments.nowFraction !== null && (
          <span
            aria-hidden
            className="absolute -top-0.5 h-3.5 w-[3px] rounded-sm bg-foreground shadow-[0_0_0_1px_var(--background)]"
            style={{ left: pct(segments.nowFraction) }}
          />
        )}
      </div>
    </div>
  )
}

/** 'Half day' when the auction is short — the reason the bar is not a template. */
export function HalfDayBadge({ day }: { day: MarketSessionDay }) {
  const { t } = useTranslation()
  if (day.closeMs - day.openMs >= HALF_DAY_MS) return null
  return (
    <span className="rounded-md bg-[color-mix(in_oklch,var(--chart-4)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--chart-4)]">
      {t('session.halfDay')}
    </span>
  )
}
