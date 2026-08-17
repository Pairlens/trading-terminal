// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Macro releases by the clock.
 *
 * The seam is gone: the App Server compiles this window from the agencies'
 * own publication schedules (BLS, BEA, the FOMC calendar, Census), so the
 * rows are the government's, not a vendor's copy of them.
 *
 * That is also why there is no actual, consensus or prior column. No agency
 * publishes a forecast of itself and none of them publish the street's, so
 * three columns of dashes would be the pane pretending to a feed it does not
 * have. What it does have is what a trader plans around: the day, the clock,
 * who publishes, and how hard it usually hits. The impact filter earns its
 * place from the data, not the design: two thirds of a federal calendar is
 * county employment tables that nobody repositions on.
 *
 * Times are Eastern, labelled as Eastern, because '08:30 ET' is how every
 * headline quotes CPI. The reader's own clock rides in the row's tooltip
 * rather than replacing it, and the ONE thing that must not happen is a bare
 * '08:30' with no city attached.
 *
 * Some rows carry no clock, and that is the feed rather than a gap: FOMC
 * minutes and the Census indicators are published as a date. Those say so
 * instead of inheriting a plausible time nobody would be able to check.
 */
import { useEffect, useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@pairlens/ui/components/ui/toggle-group'
import type {
  EconomicCalendarEntry,
  EconomicEventImportance,
} from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { PaneEmpty, Th } from '@/components/panes/pane-primitives'
import { useEconomicCalendar } from '@/hooks/use-economic-calendar'
import {
  ECONOMIC_ZONE,
  economicDayKind,
  filterByImportance,
  formatCalendarDay,
  formatReleaseClock,
  groupEconomicByDate,
  nextEconomicRelease,
} from '@/lib/equities/economic-schedule'
import { exchangeZoneLabel } from '@/lib/equities/session-labels'

type ScopeId = 'week' | 'fortnight' | 'month'

const SCOPES: ReadonlyArray<ScopeId> = ['week', 'fortnight', 'month']

const SCOPE_DAYS: Record<ScopeId, number> = {
  week: 7,
  fortnight: 14,
  month: 31,
}

/**
 * Which row is next only changes on the minute, so the whole pane re-renders
 * once a minute rather than on a clock tick. Nothing here streams.
 */
const NEXT_UP_REFRESH_MS = 60_000

export function EconomicCalendarPane() {
  const { t, i18n } = useTranslation()
  const [scope, setScope] = useState<ScopeId>('fortnight')
  const [highOnly, setHighOnly] = useState(false)
  const nowMs = useMinuteClock()

  const { data, isLoading, unavailable } = useEconomicCalendar({
    days: SCOPE_DAYS[scope],
  })

  const all = data?.entries ?? []
  const entries = useMemo(
    () => filterByImportance(all, highOnly ? 'high' : 'low'),
    [all, highOnly],
  )
  const groups = useMemo(() => groupEconomicByDate(entries), [entries])
  const nextId = useMemo(
    () => nextEconomicRelease(entries, nowMs),
    [entries, nowMs],
  )
  const zone = useMemo(() => exchangeZoneLabel(nowMs, ECONOMIC_ZONE), [nowMs])
  const windowStart = data?.start ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[13px] font-semibold">
          {t('economicCalendar.title')}
        </h2>
        <div className="flex items-center gap-1.5">
          <ToggleGroup
            aria-label={t('economicCalendar.impactLabel')}
            multiple={false}
            onValueChange={(next) => setHighOnly(next[0] === 'high')}
            size="sm"
            value={[highOnly ? 'high' : 'all']}
            variant="outline"
          >
            <ToggleGroupItem className="text-[10px]" value="all">
              {t('economicCalendar.impactAll')}
            </ToggleGroupItem>
            <ToggleGroupItem className="text-[10px]" value="high">
              {t('economicCalendar.impactHigh')}
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            aria-label={t('economicCalendar.scopeLabel')}
            multiple={false}
            onValueChange={(next) => {
              const value = next[0]
              if (SCOPES.includes(value as ScopeId)) setScope(value as ScopeId)
            }}
            size="sm"
            value={[scope]}
            variant="outline"
          >
            {SCOPES.map((id) => (
              <ToggleGroupItem className="text-[10px]" key={id} value={id}>
                {t(`economicCalendar.scopes.${id}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <table className="w-full shrink-0 px-3 text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <Th>{t('economicCalendar.columns.time', { zone })}</Th>
            <Th>{t('economicCalendar.columns.event')}</Th>
            <Th align="right">{t('economicCalendar.columns.source')}</Th>
          </tr>
        </thead>
      </table>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {unavailable ? (
          <UnavailableState reason={unavailable} />
        ) : isLoading ? (
          <LoadingRows />
        ) : groups.length === 0 ? (
          <PaneEmpty
            body={t(
              highOnly
                ? 'economicCalendar.noneHighBody'
                : `economicCalendar.noneInWindowBody.${scope}`,
            )}
            icon={CalendarRange}
            title={t('economicCalendar.noneInWindowTitle')}
          />
        ) : (
          <>
            {groups.map((group) => (
              <DayGroup
                date={group.date}
                entries={group.entries}
                key={group.date}
                locale={i18n.language}
                nextId={nextId}
                windowStart={windowStart}
              />
            ))}
            <p className="px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground/80">
              {t('economicCalendar.sourceNote')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** Now, to the minute. Nothing in this pane needs finer, and it costs a timer. */
function useMinuteClock(): number {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NEXT_UP_REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return nowMs
}

function DayGroup({
  date,
  entries,
  locale,
  nextId,
  windowStart,
}: {
  date: string
  entries: Array<EconomicCalendarEntry>
  locale: string
  nextId: string | null
  windowStart: string
}) {
  const { t } = useTranslation()
  const kind = economicDayKind(date, windowStart)
  const stamp = formatCalendarDay(date, locale)
  const label =
    kind === 'today'
      ? t('economicCalendar.today')
      : kind === 'tomorrow'
        ? t('economicCalendar.tomorrow')
        : stamp

  return (
    <section>
      <p
        className={cn(
          'sticky top-0 z-10 flex items-baseline gap-2 border-b border-border/50 bg-background/95 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[.14em] backdrop-blur-sm',
          kind === 'today' ? 'text-[var(--chart-4)]' : 'text-muted-foreground',
        )}
      >
        {label}
        {label !== stamp && (
          <span className="tracking-normal text-muted-foreground/70">
            {stamp}
          </span>
        )}
        <span className="ml-auto tabular-nums tracking-normal text-muted-foreground/70">
          {entries.length}
        </span>
      </p>
      <table className="w-full text-xs">
        <tbody>
          {entries.map((entry) => (
            <ReleaseRow
              entry={entry}
              isNext={entry.id === nextId}
              key={entry.id}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** High is a stop, medium is a look, low is context. */
function importanceBar(importance: EconomicEventImportance): string {
  switch (importance) {
    case 'high':
      return 'bg-down'
    case 'medium':
      return 'bg-[var(--chart-4)]'
    case 'low':
      return 'bg-muted-foreground/40'
  }
}

function ReleaseRow({
  entry,
  isNext,
}: {
  entry: EconomicCalendarEntry
  isNext: boolean
}) {
  const { t } = useTranslation()

  const clock =
    entry.releaseMs === null ? null : formatReleaseClock(entry.releaseMs)
  // The reader's own clock, only in the tooltip: the row states the schedule
  // in the zone the schedule is written in.
  const localTime =
    entry.releaseMs === null
      ? undefined
      : new Date(entry.releaseMs).toLocaleString()

  return (
    <tr
      className={cn(
        'border-b border-border/40 last:border-0 hover:bg-accent/40',
        isNext && 'bg-[color-mix(in_oklch,var(--primary)_7%,transparent)]',
      )}
    >
      <td className="w-[4.5rem] py-1.5 pl-3 pr-3">
        <span
          className={cn(
            'font-mono text-[11.5px] tabular-nums',
            clock === null
              ? 'text-[10px] uppercase tracking-[.08em] text-muted-foreground/60'
              : isNext
                ? 'font-medium text-primary'
                : 'text-muted-foreground',
          )}
          title={localTime}
        >
          {clock ?? t('economicCalendar.allDay')}
        </span>
      </td>
      <td className="py-1.5 pr-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'h-3.5 w-1.5 shrink-0 rounded-sm',
              importanceBar(entry.importance),
            )}
          />
          <span className="min-w-0 truncate text-[12px]">{entry.title}</span>
          <span className="sr-only">
            {t(`economicCalendar.impact.${entry.importance}`)}
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap py-1.5 pr-3 text-right">
        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[.06em] text-muted-foreground">
          {entry.source}
        </span>
      </td>
    </tr>
  )
}

/**
 * The three ways there is no calendar that are not about the window.
 * `not_configured` is a standalone build: the compiler lives on the App
 * Server, and a terminal with none has no agency schedules to read.
 */
function UnavailableState({ reason }: { reason: FundamentalsUnavailable }) {
  const { t } = useTranslation()

  if (reason === 'rate_limited') {
    return (
      <PaneEmpty
        body={t('economicCalendar.providerBusyBody')}
        icon={CalendarRange}
        title={t('economicCalendar.providerBusyTitle')}
      />
    )
  }
  if (reason === 'upstream_error') {
    return (
      <PaneEmpty
        body={t('economicCalendar.providerErrorBody')}
        icon={CalendarRange}
        title={t('economicCalendar.providerErrorTitle')}
      />
    )
  }
  return (
    <PaneEmpty
      body={t('economicCalendar.emptyBody')}
      icon={CalendarRange}
      title={t('economicCalendar.emptyTitle')}
    />
  )
}

function LoadingRows() {
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="h-6 animate-pulse rounded bg-muted" key={i} />
      ))}
    </div>
  )
}
