// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Macro releases by the clock.
 *
 * The seam is gone: the App Server compiles this window from the agencies'
 * own publication schedules (BLS, BEA, the FOMC calendar, Census), so the
 * rows are the government's, not a vendor's copy of them.
 *
 * There is still no CONSENSUS column, and there will not be one until someone
 * licenses that data: the street's forecast is a paid product and no free
 * source publishes it. What the server can fill, it does. Actual and prior come
 * from the agencies' own APIs after the print, and the third figure is a
 * market-implied expectation derived from Kalshi contract pricing, which is a
 * live price rather than a survey median taken days earlier. It is labelled
 * Implied and names Kalshi, never Consensus, because a reader who knows the
 * difference would be misled by the wrong word.
 *
 * The figure columns appear only when the window actually carries figures. A
 * deployment whose server cannot fill them gets the schedule alone rather than
 * three columns of dashes, which was the original reason this pane had none.
 * Absent stays blank: no zero, no dash, no placeholder.
 *
 * The rest is what a trader plans around: the day, the clock, who publishes,
 * and how hard it usually hits. The impact filter earns its place from the
 * data, not the design: two thirds of a federal calendar is county employment
 * tables that nobody repositions on.
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
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { useEconomicCalendar } from '@/hooks/use-economic-calendar'
import { hasEconomicFigures } from '@/lib/equities/calendar-figures'
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
  // Figures are a server capability, not a given. Showing the columns when
  // nothing can fill them is the "columns of dashes" this pane was built to
  // avoid, so the header follows the data.
  const hasFigures = useMemo(() => hasEconomicFigures(entries), [entries])
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
            <HeadCell className={TIME_COL}>
              {t('economicCalendar.columns.time', { zone })}
            </HeadCell>
            <HeadCell>{t('economicCalendar.columns.event')}</HeadCell>
            {hasFigures && (
              <>
                <HeadCell align="right" className={FIGURE_COL}>
                  {t('economicCalendar.columns.actual')}
                </HeadCell>
                <HeadCell align="right" className={PRIOR_COL}>
                  {t('economicCalendar.columns.prior')}
                </HeadCell>
                <HeadCell
                  align="right"
                  className={IMPLIED_COL}
                  title={t('economicCalendar.impliedHint')}
                >
                  {t('economicCalendar.columns.implied')}
                </HeadCell>
              </>
            )}
            <HeadCell align="right" className={SOURCE_COL}>
              {t('economicCalendar.columns.source')}
            </HeadCell>
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
                showFigures={hasFigures}
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

/**
 * Column widths, shared by the header table and every day's body table.
 *
 * The header is its own <table> so it can stay put while the days scroll, which
 * means the two tables size independently: every column except the flexible
 * release title has to state the same width on both sides or the labels drift
 * off the values they name.
 *
 * The narrow-pane behaviour is deliberate rather than a media-query afterthought.
 * A pane in a dense grid can be 20rem wide, and six columns do not fit in that,
 * so the figures drop in order of how much a reader needs them: the actual print
 * survives longest, the prior goes first. `@container/pane` is declared by the
 * pane wrapper, so this reacts to the PANE's width, not the window's.
 */
const TIME_COL = 'w-[4.5rem]'
const FIGURE_COL = 'w-[3.75rem]'
const PRIOR_COL = 'hidden w-[3.75rem] @[30rem]/pane:table-cell'
const IMPLIED_COL = 'hidden w-[5.25rem] @[24rem]/pane:table-cell'
const SOURCE_COL = 'w-[4.25rem]'

/**
 * A header cell that can carry a width and a hint. The shared `Th` primitive
 * takes neither, and both are load-bearing here: the width keeps the two tables
 * aligned, and the hint is where "implied is not consensus" gets said.
 */
function HeadCell({
  align = 'left',
  children,
  className,
  title,
}: {
  align?: 'left' | 'right'
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <th
      className={cn(
        'pb-1.5 pr-3 font-mono text-[10px] font-medium uppercase tracking-[.14em] last:pr-0',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      title={title}
    >
      {children}
    </th>
  )
}

/**
 * One figure, or an empty cell.
 *
 * Empty means empty: no dash, no zero, no em-space placeholder. A calendar that
 * renders '0.0%' where it has nothing has told the reader something false about
 * the economy, and '-' reads as a value in a column of numbers.
 */
function FigureCell({
  className,
  strong,
  title,
  value,
}: {
  className?: string
  strong?: boolean
  title?: string
  value?: string
}) {
  return (
    <td className={cn(className, 'py-1.5 pr-3 text-right')}>
      {value ? (
        <span
          className={cn(
            'font-mono text-[11px] tabular-nums',
            strong ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
          title={title}
        >
          {value}
        </span>
      ) : null}
    </td>
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
  showFigures,
  windowStart,
}: {
  date: string
  entries: Array<EconomicCalendarEntry>
  locale: string
  nextId: string | null
  showFigures: boolean
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
              showFigures={showFigures}
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
  showFigures,
}: {
  entry: EconomicCalendarEntry
  isNext: boolean
  showFigures: boolean
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
      <td className={cn(TIME_COL, 'py-1.5 pl-3 pr-3')}>
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
      {showFigures && (
        <>
          <FigureCell className={FIGURE_COL} strong value={entry.actual} />
          <FigureCell className={PRIOR_COL} value={entry.prior} />
          <FigureCell
            className={IMPLIED_COL}
            title={
              entry.implied && entry.impliedSource
                ? t('economicCalendar.impliedFrom', {
                    source: entry.impliedSource,
                  })
                : undefined
            }
            value={entry.implied}
          />
        </>
      )}
      <td
        className={cn(SOURCE_COL, 'whitespace-nowrap py-1.5 pr-3 text-right')}
      >
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
