// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Trash2, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Switch } from '@pairlens/ui/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pairlens/ui/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'

import { BotCharts, BotSummaryStrip } from './bot-charts'
import { GuardsEditor, SizingEditor } from './bot-sizing-guards'
import {
  formatQuantity,
  formatSignedPnl,
  mergeBotParams,
  pnlClass,
  statusLabelKey,
} from './bot-display'

import type { BotDefinition, BotEvent } from '@pairlens/bot-engine/types'
import type { BotTrade } from '@/stores/bot-runs-store'
import { PreviewParamsBar } from '@/components/indicators/preview-params'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { isScriptMissing } from '@/lib/bots/bot-script-link'
import { emptyRunState, useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

function formatTs(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

/** Event levels borrow the same vocabulary as the status dots. */
function eventLevelClass(level: BotEvent['level']): string {
  switch (level) {
    case 'error':
      return 'text-destructive'
    case 'warning':
      return 'text-amber-500'
    case 'info':
    default:
      return 'text-muted-foreground'
  }
}

type BotDetailProps = {
  bot: BotDefinition
  /** Opens the live-arming flow; promotion never happens inline. */
  onRequestArm: (bot: BotDefinition) => void
}

/**
 * Everything one bot has done and every knob it exposes — the whole main
 * content area, not a pinned side panel.
 *
 * Identity and live state run across the top, then the record and the controls
 * split left and right. Settings sit beside the ledger rather than behind a
 * tab on purpose: the most common reason to open a bot's settings is that its
 * charts or its log just told you something you did not like, and making that
 * a navigation loses the thing you were reacting to.
 */
export function BotDetail({ bot, onRequestArm }: BotDetailProps) {
  const { t } = useTranslation()
  const updateBot = useBotsStore((s) => s.updateBot)
  const deleteBot = useBotsStore((s) => s.deleteBot)
  const setEnabled = useBotsStore((s) => s.setEnabled)
  const resetRun = useBotRunsStore((s) => s.resetRun)
  const script = useIndicatorScriptsStore((s) =>
    s.scripts.find((entry) => entry.id === bot.scriptId),
  )
  // Distinct from `!script`: before the store has read localStorage every bot
  // looks scriptless, and that must not be reported as a deleted strategy.
  const scriptMissing = useIndicatorScriptsStore((s) =>
    isScriptMissing(s, bot.scriptId),
  )
  const { markets } = useAvailableMarkets()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(bot.name)

  // Selecting a different bot must not leave the previous name in the field.
  useEffect(() => {
    setName(bot.name)
  }, [bot.id, bot.name])

  // Select the stored entry, not `getRun()` — the latter mints a fresh object
  // on every call, which useSyncExternalStore would read as an endless stream
  // of new snapshots.
  const storedRun = useBotRunsStore((s) => s.runs[bot.id])
  const run = useMemo(
    () => storedRun ?? emptyRunState(bot.id),
    [storedRun, bot.id],
  )

  const venueLabel =
    markets.find((m) => m.value === bot.market)?.label ??
    bot.market.toUpperCase()

  const params = useMemo(
    () => (script?.meta ? mergeBotParams(script.meta, bot.params) : null),
    [script?.meta, bot.params],
  )

  const commitName = () => {
    const next = name.trim()
    if (next.length === 0 || next === bot.name) {
      setName(bot.name)
      return
    }
    updateBot(bot.id, { name: next })
  }

  const handleModeChange = (live: boolean) => {
    if (live) {
      onRequestArm(bot)
      return
    }
    // Demoting to paper stops the bot: a position opened with real money is
    // not something a simulated runtime should inherit mid-flight.
    setEnabled(bot.id, false)
    updateBot(bot.id, { mode: 'paper', needsRearm: undefined })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        Header — identity and state only. `h-10` matches the sidebar's own
        header strip so the two rules meet across the divider.

        There is deliberately no on/off control here: the list row owns
        arming, and a second switch for the same bot two inches away asks the
        user to work out whether they are the same thing.
      */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="truncate text-sm font-medium">{bot.name}</span>
        <Badge
          variant={bot.mode === 'live' ? 'destructive' : 'secondary'}
          className="shrink-0 text-[10px] uppercase tracking-wide"
        >
          {bot.mode === 'live'
            ? t('botsPage.modeLive')
            : t('botsPage.modePaper')}
        </Badge>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {/* A bot awaiting re-arm reads as "Stopped" otherwise, which is true
              but hides the part that needs a decision. */}
          {bot.needsRearm ? (
            <span className="text-amber-500">{t('botsPage.rearm')}</span>
          ) : (
            t(statusLabelKey(run.status))
          )}
          {run.statusDetail && (
            <span className="text-amber-500"> — {run.statusDetail}</span>
          )}
        </span>
      </div>

      {/*
        An orphaned bot: its strategy was deleted, so there is nothing left for
        it to run and nothing that will ever start it again. The bot cannot be
        repaired — `scriptId` is an id, and a new script with the same name is
        a different script — so the banner says what happened and offers the
        only two moves there are.
      */}
      {scriptMissing && (
        <div className="flex shrink-0 items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="grid min-w-0 gap-1.5">
            <p className="text-xs font-medium text-destructive">
              {t('botsPage.scriptMissingTitle')}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('botsPage.scriptMissingDetail')}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
                {t('botsPage.scriptMissingDelete')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                // It renders as an anchor, so Base UI must not assume the
                // native button semantics it would otherwise warn about.
                nativeButton={false}
                render={<Link to="/indicators" />}
              >
                {t('botsPage.openIndicators')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live numbers — position, marks, and where the bot is deployed. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-border px-3 py-2.5 text-xs sm:grid-cols-3 xl:grid-cols-7">
        {/* Which script this runs comes first: a bot's name is the user's
            label for it, not a statement of what it trades on, and one script
            commonly backs several bots. Without this the page never says what
            code is making the decisions. */}
        <Stat label={t('botsPage.strategyLabel')}>
          {script ? (
            // Links to the exact code this bot runs — the workbench opens
            // with it selected, so "what is it doing?" is one click away.
            <Link
              to="/indicators"
              search={{ script: script.id }}
              className="truncate underline-offset-2 hover:underline"
              title={t('botsPage.editStrategyHint', { name: script.name })}
            >
              {script.name}
            </Link>
          ) : (
            <span className="truncate text-destructive">
              {t('botsPage.scriptMissing')}
            </span>
          )}
        </Stat>
        <Stat label={t('botsPage.venue')}>
          <span className="font-mono">
            {venueLabel} {bot.pair} · {bot.timeframe}
          </span>
        </Stat>
        <Stat label={t('botsPage.position')}>
          {run.position ? (
            <span
              className={cn(
                'font-mono',
                run.position.side === 'long' ? 'text-up' : 'text-down',
              )}
            >
              {run.position.side === 'long'
                ? t('botsPage.sideLong')
                : t('botsPage.sideShort')}{' '}
              {formatQuantity(run.position.quantity)} @{' '}
              {formatQuantity(run.position.entryPrice)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('botsPage.flat')}</span>
          )}
        </Stat>
        <Stat label={t('botsPage.unrealized')}>
          <span className={cn('font-mono', pnlClass(run.unrealizedPnl))}>
            {formatSignedPnl(run.unrealizedPnl)}
          </span>
        </Stat>
        <Stat label={t('botsPage.realized')}>
          <span className={cn('font-mono', pnlClass(run.realizedPnl))}>
            {formatSignedPnl(run.realizedPnl)}
          </span>
        </Stat>
        <Stat label={t('botsPage.lastBar')}>
          <span className="font-mono">{formatTs(run.lastBarTs)}</span>
        </Stat>
        <Stat label={t('botsPage.lastPrice')}>
          <span className="font-mono">
            {run.lastPrice === null ? '—' : formatQuantity(run.lastPrice)}
          </span>
        </Stat>
      </div>

      {/*
        Body — performance on the left, the knobs on the right.

        Settings used to be the third tab, which meant every "why did it do
        that, and how do I stop it doing that again" ended in a navigation.
        Guards and sizing are the answer to the ledger sitting next to them, so
        they are always on screen.

        Container query, not a viewport one: this pane sits beside a sidebar
        whose width the viewport says nothing about, and `window.innerWidth`
        reads 0 in the preview harness.
      */}
      <div className="@container/detail min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col overflow-y-auto @4xl/detail:flex-row @4xl/detail:overflow-hidden">
          {/* Left — the record. Scrolls as one column so the charts stay with
              the ledger they summarise rather than pinning above it. */}
          <div className="@container/panel flex min-w-0 flex-col gap-3 p-3 @4xl/detail:min-h-0 @4xl/detail:flex-1 @4xl/detail:overflow-y-auto">
            <BotCharts trades={run.trades} />
            <BotSummaryStrip trades={run.trades} />

            <Tabs defaultValue="trades" className="gap-0">
              <TabsList variant="line" className="w-auto self-start">
                <TabsTrigger value="trades" className="text-xs">
                  {t('botsPage.tabTrades')}
                </TabsTrigger>
                <TabsTrigger value="events" className="text-xs">
                  {t('botsPage.tabEvents')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trades">
                <TradeLedger trades={run.trades} />
              </TabsContent>

              <TabsContent value="events">
                <EventLog events={run.events} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right — settings. Stacks under the left column when the pane is
              too narrow to give it 22rem without squeezing the charts flat. */}
          <div className="shrink-0 border-t border-border @4xl/detail:min-h-0 @4xl/detail:w-88 @4xl/detail:overflow-y-auto @4xl/detail:border-t-0 @4xl/detail:border-l">
            <div className="sticky top-0 z-10 flex h-8 items-center border-b border-border bg-background px-3 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('botsPage.tabSettings')}
            </div>

            <div className="grid gap-4 p-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bot-detail-name" className="text-xs">
                  {t('common.name')}
                </Label>
                <Input
                  id="bot-detail-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  className="text-sm"
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="grid min-w-0 gap-0.5">
                  <Label htmlFor="bot-detail-live" className="text-xs">
                    {t('botsPage.liveTrading')}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t('botsPage.liveTradingHint')}
                  </p>
                </div>
                <Switch
                  id="bot-detail-live"
                  className="ml-auto shrink-0"
                  checked={bot.mode === 'live'}
                  // Promoting a bot with no strategy to live would open the
                  // arming dialog for a deployment that cannot place a single
                  // order. Demotion stays available: it is the safe direction.
                  disabled={scriptMissing && bot.mode !== 'live'}
                  onCheckedChange={handleModeChange}
                  aria-label={t('botsPage.liveTrading')}
                />
              </div>

              {params && script?.meta && (
                <div className="grid gap-1.5">
                  <Label className="text-xs">{t('botsPage.paramsTitle')}</Label>
                  <div className="rounded-lg border border-border">
                    <PreviewParamsBar
                      meta={script.meta}
                      params={params}
                      onChange={(next) => updateBot(bot.id, { params: next })}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label className="text-xs">{t('botsPage.stepSizing')}</Label>
                <SizingEditor
                  sizing={bot.sizing}
                  onChange={(sizing) => updateBot(bot.id, { sizing })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs">{t('botsPage.stepGuards')}</Label>
                <GuardsEditor
                  guards={bot.guards}
                  onChange={(guards) => updateBot(bot.id, { guards })}
                />
              </div>

              <Button
                variant="destructive"
                size="sm"
                className="justify-self-start gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" />
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('botsPage.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('botsPage.deleteDescription', { name: bot.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={() => {
                // The run log is a record of THIS bot; nothing else can read
                // it once the definition is gone, so it goes too.
                deleteBot(bot.id)
                resetRun(bot.id)
                setConfirmDelete(false)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-xs">{children}</span>
    </div>
  )
}

/**
 * The round trips, as columns. A ledger is read down one column at a time —
 * "how did the exits go", "which ones lost" — which a stack of paragraphs
 * cannot answer at a glance.
 */
function TradeLedger({ trades }: { trades: Array<BotTrade> }) {
  const { t } = useTranslation()
  if (trades.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        {t('botsPage.tradesEmpty')}
      </p>
    )
  }

  return (
    <Table className="text-xs">
      <TableHeader className="sticky top-0 bg-background">
        <TableRow>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeSide')}
          </TableHead>
          <TableHead className="h-8 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeSize')}
          </TableHead>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeEntry')}
          </TableHead>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeExit')}
          </TableHead>
          <TableHead className="h-8 w-full text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeReason')}
          </TableHead>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradeMode')}
          </TableHead>
          <TableHead className="h-8 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.tradePnl')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {trades.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell
              className={cn(
                'py-1.5 font-medium',
                trade.direction === 'long' ? 'text-up' : 'text-down',
              )}
            >
              {trade.direction === 'long'
                ? t('botsPage.sideLong')
                : t('botsPage.sideShort')}
            </TableCell>
            <TableCell className="py-1.5 text-right font-mono">
              {formatQuantity(trade.quantity)}
            </TableCell>
            <TableCell className="py-1.5 font-mono text-muted-foreground">
              {formatTs(trade.entryTs)} @ {formatQuantity(trade.entryPrice)}
            </TableCell>
            <TableCell className="py-1.5 font-mono text-muted-foreground">
              {trade.exitTs !== null && trade.exitPrice !== null
                ? `${formatTs(trade.exitTs)} @ ${formatQuantity(trade.exitPrice)}`
                : '—'}
            </TableCell>
            <TableCell className="py-1.5 text-muted-foreground">
              {trade.exitReason ?? '—'}
            </TableCell>
            <TableCell className="py-1.5">
              <Badge variant="outline" className="text-[10px] uppercase">
                {trade.mode === 'live'
                  ? t('botsPage.modeLive')
                  : t('botsPage.modePaper')}
              </Badge>
            </TableCell>
            <TableCell
              className={cn(
                'py-1.5 text-right font-mono',
                trade.pnl === null
                  ? 'text-muted-foreground'
                  : pnlClass(trade.pnl),
              )}
            >
              {trade.pnl === null
                ? t('botsPage.tradeOpen')
                : formatSignedPnl(trade.pnl)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The log, with the timestamp in its own column so the messages line up. */
function EventLog({ events }: { events: Array<BotEvent> }) {
  const { t } = useTranslation()
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        {t('botsPage.eventsEmpty')}
      </p>
    )
  }

  return (
    <Table className="text-xs">
      <TableHeader className="sticky top-0 bg-background">
        <TableRow>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.eventTime')}
          </TableHead>
          <TableHead className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.eventMessage')}
          </TableHead>
          <TableHead className="h-8 w-full text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('botsPage.eventDetail')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="py-1.5 align-top font-mono text-[11px] text-muted-foreground">
              {new Date(event.ts).toLocaleString()}
            </TableCell>
            <TableCell
              className={cn('py-1.5 align-top', eventLevelClass(event.level))}
            >
              {event.message}
            </TableCell>
            <TableCell className="py-1.5 align-top whitespace-normal text-muted-foreground">
              {event.detail ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
