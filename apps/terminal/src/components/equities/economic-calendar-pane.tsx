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
 * Inside a window that does carry them, an absent cell is the '—' glyph the
 * funding matrix and the movers table already use for the same thing: once a
 * column exists, a blank cell and a cell that has not printed yet look
 * identical, and the reader cannot tell a missing figure from a missing row.
 *
 * Column order is Actual, Implied, Prior, which is not the order the fields
 * were added in. A reader scans left to right for what happened and then for
 * what was expected, and the expectation is the implied number; the prior is
 * context and sits last, which is also the first column a narrow pane drops.
 *
 * The rest is what a trader plans around: the day, the clock, who publishes,
 * and how hard it usually hits. The impact filter earns its place from the
 * data, not the design: two thirds of a federal calendar is county employment
 * tables that nobody repositions on. Impact also reaches the type: a high
 * impact release carries weight on its title, because a 6px colour chip is
 * not something the eye finds while scrolling a month of rows.
 *
 * Times are Eastern, labelled as Eastern, because '08:30 ET' is how every
 * headline quotes CPI. The reader's own clock rides in the row's tooltip
 * rather than replacing it, and the ONE thing that must not happen is a bare
 * '08:30' with no city attached. The zone rides the header as a subdued suffix
 * rather than a parenthetical inside the label, which is what used to break
 * 'TIME (EDT)' over two lines in a column sized for '08:30'. Implied names its
 * venue the same way, and drops the venue rather than wrapping when the pane
 * is too narrow to carry both words.
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
import type { TFunction } from 'i18next'
import type {
  EconomicCalendarEntry,
  EconomicEventImportance,
} from '@pairlens/shared/instrument-types'

import type { FundamentalsUnavailable } from '@/hooks/use-equity-fundamentals'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { useEconomicCalendar } from '@/hooks/use-economic-calendar'
import { hasEconomicFigures } from '@/lib/equities/calendar-figures'
import { splitCountdown } from '@/lib/equities/session'
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
  // How long until the next one prints, computed once for the one row that
  // shows it rather than per row. Minute resolution, because that is the
  // cadence the clock above ticks at and a stale second hand reads as broken.
  const countdown = useMemo(() => {
    const next = entries.find((entry) => entry.id === nextId)
    if (!next || next.releaseMs === null) return null
    return countdownLabel(t, next.releaseMs - nowMs)
  }, [entries, nextId, nowMs, t])
  const zone = useMemo(() => exchangeZoneLabel(nowMs, ECONOMIC_ZONE), [nowMs])
  const windowStart = data?.start ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Wrapping toolbar rather than a squeezed one: two toggle groups and a
          title do not fit a 20rem pane on one line, and a control row that
          drops to a second line still reads, while five clipped segments do
          not. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-border px-3 py-2">
        <h2 className="min-w-0 truncate text-[13px] font-semibold">
          {t('economicCalendar.title')}
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
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

      <table className={cn(GRID, 'shrink-0')}>
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <HeadCell
              className={cn(TIME_COL, 'pl-3')}
              title={`${t('economicCalendar.columns.time')} · ${zone}`}
            >
              {t('economicCalendar.columns.time')}
              <SubLabel>{zone}</SubLabel>
            </HeadCell>
            <HeadCell>{t('economicCalendar.columns.event')}</HeadCell>
            {hasFigures && (
              <>
                <HeadCell align="right" className={FIGURE_COL}>
                  {t('economicCalendar.columns.actual')}
                </HeadCell>
                <HeadCell
                  align="right"
                  className={IMPLIED_COL}
                  title={t('economicCalendar.impliedHint')}
                >
                  {t('economicCalendar.columns.implied')}
                  {/* The venue is the half a narrow pane can do without: the
                      cell tooltip and the note under the rows both name it. */}
                  <SubLabel className="hidden @[34rem]/pane:inline">
                    {t('economicCalendar.columns.impliedSource')}
                  </SubLabel>
                </HeadCell>
                <HeadCell align="right" className={PRIOR_COL}>
                  {t('economicCalendar.columns.prior')}
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
                countdown={countdown}
                date={group.date}
                entries={group.entries}
                key={group.date}
                locale={i18n.language}
                nextId={nextId}
                showFigures={hasFigures}
                windowStart={windowStart}
              />
            ))}
            <p className="mt-1 border-t border-border/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground/80">
              {t('economicCalendar.sourceNote')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The one geometry the header table and every day's body table are laid out
 * with.
 *
 * `table-fixed` is what makes the columns a property of the PANE rather than
 * of whatever happens to be in a given day. Under auto layout each day sizes
 * itself: a Thursday holding 'Quarterly Selected Services Revenue' and a
 * Friday holding 'PPI' disagree about where the figures start, the header
 * (its own table, so it can stay put while the days scroll) disagrees with
 * both, and the labels drift off the values they name. Fixed layout reads the
 * widths below off the first row and every table lands on the same grid.
 *
 * The corollary is that nothing can push a column wider any more, so both the
 * heads and the release titles truncate instead, each with the full text in a
 * tooltip.
 */
const GRID = 'w-full table-fixed text-xs'

/**
 * Column widths.
 *
 * The narrow-pane behaviour is deliberate rather than a media-query afterthought.
 * A pane in a dense grid can be 20rem wide, and six columns do not fit in that,
 * so the figures drop in order of how much a reader needs them: the actual print
 * survives longest, the prior goes first. `@container/pane` is declared by the
 * pane wrapper, so this reacts to the PANE's width, not the window's.
 *
 * Implied is the one that also grows: it is the only head carrying two words,
 * and it earns the room for the venue name only where there is room.
 */
const TIME_COL = 'w-[4.75rem]'
const FIGURE_COL = 'w-[4.5rem]'
const PRIOR_COL = 'hidden w-[4.25rem] @[32rem]/pane:table-cell'
const IMPLIED_COL =
  'hidden w-[5.5rem] @[28rem]/pane:table-cell @[34rem]/pane:w-[7.25rem]'
const SOURCE_COL = 'w-[4.5rem]'

/**
 * A header cell that can carry a width and a hint. The shared `Th` primitive
 * takes neither, and both are load-bearing here: the width keeps the tables
 * aligned, and the hint is where "implied is not consensus" gets said.
 *
 * It truncates rather than wraps. A head is a label, and a label that grows a
 * second line pushes every column's values down a row and makes the pane look
 * broken; 'GERÇEKLEŞEN' clipped to fit still reads, and the tooltip holds the
 * whole of it.
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
        'truncate pb-1.5 pr-3 font-mono text-[10px] font-medium uppercase tracking-[.14em]',
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
 * The quieter half of a head: the zone on Time, the venue on Implied.
 *
 * Same line, less weight. These are qualifiers on the column rather than part
 * of its name, and the tracked-out uppercase they used to sit inside was what
 * made them cost a second line.
 */
function SubLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'ml-1 font-normal normal-case tracking-normal text-muted-foreground/70',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** What an unpublished figure renders as, matching the other boards. */
const DASH = '—'

/**
 * One figure, or the glyph that says there isn't one.
 *
 * A zero is still forbidden: rendering '0.0%' where nothing printed tells the
 * reader something false about the economy. What changed is the empty case. A
 * blank cell was the right call when the columns themselves were in doubt, and
 * the wrong one once they are on screen — a reader cannot tell a figure the
 * agency has not published from a row the pane failed to fill, and every other
 * board answers that question with '—'. The glyph is a placeholder, never a
 * value: it is muted, it never carries the strong weight, and nothing sorts or
 * colours off it.
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
    <td className={cn(className, 'truncate py-1.5 pr-3 text-right')}>
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
      ) : (
        <span
          aria-hidden
          className="font-mono text-[11px] text-muted-foreground/50"
        >
          {DASH}
        </span>
      )}
    </td>
  )
}

/**
 * 'in 41m' — how long until the next release prints.
 *
 * Two units at most, and never seconds: the pane's clock ticks once a minute,
 * so a second hand here would be wrong for fifty-nine seconds out of sixty.
 */
function countdownLabel(t: TFunction, ms: number): string {
  const { days, hours, minutes } = splitCountdown(ms)
  if (days > 0) return t('economicCalendar.countdownDh', { days, hours })
  if (hours > 0) return t('economicCalendar.countdownHm', { hours, minutes })
  return t('economicCalendar.countdownM', { minutes })
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
  countdown,
  date,
  entries,
  locale,
  nextId,
  showFigures,
  windowStart,
}: {
  /** Time to the next release, for whichever day holds it. */
  countdown: string | null
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
      <table className={GRID}>
        <tbody>
          {entries.map((entry) => (
            <ReleaseRow
              countdown={entry.id === nextId ? countdown : null}
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
  countdown,
  entry,
  isNext,
  showFigures,
}: {
  /** Non-null only on the next release: 'in 41m', shown where its actual will land. */
  countdown: string | null
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
  const impact = t(`economicCalendar.impact.${entry.importance}`)

  return (
    <tr
      className={cn(
        'border-b border-border/40 transition-colors last:border-0 hover:bg-accent/40',
        isNext && 'bg-[color-mix(in_oklch,var(--primary)_7%,transparent)]',
      )}
    >
      <td className={cn(TIME_COL, 'truncate py-1.5 pl-3 pr-3')}>
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
          {/* Hoverable as well as coloured: three tiers of chip mean nothing
              to a reader who has not been told what they are, and the pane
              has no room for a legend. */}
          <span
            aria-hidden
            className={cn(
              'h-3.5 w-1.5 shrink-0 rounded-sm',
              importanceBar(entry.importance),
            )}
            title={impact}
          />
          <span
            className={cn(
              'min-w-0 truncate text-[12px]',
              entry.importance === 'high' && 'font-medium',
            )}
            title={entry.title}
          >
            {entry.title}
          </span>
          <span className="sr-only">{impact}</span>
        </span>
      </td>
      {showFigures && (
        <>
          {/* The countdown stands where the actual will land, on the one row
              that has not printed yet. Nothing else could go in that cell, and
              a reader looking for what is next looks at the top of the column
              of numbers rather than at a badge somewhere else. It carries the
              row's own accent, so the highlighted row, its clock and its
              countdown all say "next" in one colour. */}
          {countdown && !entry.actual ? (
            <td
              className={cn(FIGURE_COL, 'truncate py-1.5 pr-3 text-right')}
              title={countdown}
            >
              <span className="font-mono text-[11px] font-medium tabular-nums text-primary">
                {countdown}
              </span>
            </td>
          ) : (
            <FigureCell className={FIGURE_COL} strong value={entry.actual} />
          )}
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
          <FigureCell className={PRIOR_COL} value={entry.prior} />
        </>
      )}
      <td className={cn(SOURCE_COL, 'py-1.5 pr-3 text-right')}>
        <span className="inline-block max-w-full truncate rounded-md bg-secondary px-1.5 py-0.5 align-middle font-mono text-[9.5px] uppercase tracking-[.06em] text-muted-foreground">
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

/**
 * The shape of the thing that is coming, not a stack of grey bars.
 *
 * A skeleton row is a clock, a title and an agency chip on the same grid the
 * rows land on, so the pane does not visibly re-lay itself the moment the
 * window arrives. The sweep is staggered down the list rather than pulsed in
 * lockstep, which is the shared `.shimmer` contract.
 */
function LoadingRows() {
  return (
    <div className="px-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          className="flex items-center gap-2 border-b border-border/40 py-2"
          key={i}
        >
          <span
            aria-hidden
            className="shimmer h-2.5 w-9 shrink-0 rounded-sm"
            style={{ '--shimmer-delay': `${i * 60}ms` } as React.CSSProperties}
          />
          <span
            aria-hidden
            className="shimmer h-2.5 rounded-sm"
            style={
              {
                '--shimmer-delay': `${i * 60}ms`,
                width: `${52 + ((i * 13) % 34)}%`,
              } as React.CSSProperties
            }
          />
          <span
            aria-hidden
            className="shimmer ml-auto h-3 w-10 shrink-0 rounded-md"
            style={{ '--shimmer-delay': `${i * 60}ms` } as React.CSSProperties}
          />
        </div>
      ))}
    </div>
  )
}
