// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The live bot runtime: candle streams in, orders out.
 *
 * Shaped like `NotificationSubscriptionManager` — start with a plugin manager,
 * subscribe to the definitions store, reconcile a keyed subscription map — but
 * with a much harsher failure model, because this one spends money.
 *
 * Three rules run through everything below:
 *
 * 1. **Only closed bars decide.** The forming bar is held separately and is
 *    never handed to the strategy. A signal that reads the current bar is a
 *    signal that can change its mind after the order is placed.
 * 2. **Nothing retries.** A rejected order, a Python error, or a halting guard
 *    stops the bot and disables it. An automatic retry against a venue that
 *    just said no is how one rejected order becomes ten filled ones.
 * 3. **Every decision leaves a line in the log**, especially the decisions not
 *    to trade. A bot that quietly stops trading is worse than one that stops
 *    loudly: the user finds out about the first kind from their P&L.
 *
 * Leader-gated by the caller (`pairlens-provider`): N windows running this
 * would place N copies of every order.
 */
import { applyFill, checkGuards } from '@pairlens/bot-engine/guards'
import { decideTransition } from '@pairlens/bot-engine/decide'
import { evaluateRisk, updateExtreme } from '@pairlens/bot-engine/risk'
import { resolveQuantity } from '@pairlens/bot-engine/sizing'
import { executeBotOrder, realizedPnl } from './bot-executor'
import {
  BOT_WINDOW_BARS,
  BotComputeBusyError,
  computeBotOutputs,
} from './bot-python'
import { getBotOrderSource } from './bot-order-source'
import type { PluginManager } from '@pairlens/plugin-system'
import type { ChartBar } from '@pairlens/fast-financial-charts/types'
import type {
  BotDefinition,
  BotEvent,
  BotOrderIntent,
  BotPosition,
  BotStatus,
} from '@pairlens/bot-engine/types'
import type {
  CustomIndicatorMeta,
  CustomIndicatorStrategySpec,
} from '@pairlens/shared/plugin-types'
import type { OrderEvent } from '@/stores/order-events-store'
import type { BotTrade } from '@/stores/bot-runs-store'
import {
  getOrderEvents,
  subscribeOrderEvents,
} from '@/stores/order-events-store'
import { getBalancesForCredential } from '@/stores/balances-store'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useCredentialsStore } from '@/stores/credentials-store'
import { useVaultAttentionStore } from '@/stores/vault-attention-store'
import { isVaultSealed } from '@/lib/security/vault/vault-errors'
import i18n from '@/lib/i18n'
import {
  isVaultEnrolled,
  isVaultUnlocked,
  subscribeVault,
} from '@/lib/security/vault/vault-session'
import { startVaultBootstrap } from '@/lib/security/vault/vault-bootstrap'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'
import { resolveTargets } from '@/lib/indicators/backtest'
import { fetchHistoryDepth } from '@/lib/indicators/fetch-depth'
import { getCountrySetting } from '@/lib/region-settings'
import {
  isKeepAwakeEnabled,
  refreshSleepBlocked,
  setSleepBlocked,
  subscribeKeepAwake,
} from '@/lib/keep-awake'

const MINUTE_MS = 60_000

/**
 * Bar durations, used to turn a bar's timestamp into an absolute bar index.
 * Unknown timeframes fall back to an hour, which only affects cooldown maths.
 */
const TIMEFRAME_MS: Record<string, number> = {
  '1m': MINUTE_MS,
  '3m': 3 * MINUTE_MS,
  '5m': 5 * MINUTE_MS,
  '15m': 15 * MINUTE_MS,
  '30m': 30 * MINUTE_MS,
  '1h': 60 * MINUTE_MS,
  '2h': 120 * MINUTE_MS,
  '4h': 240 * MINUTE_MS,
  '6h': 360 * MINUTE_MS,
  '12h': 720 * MINUTE_MS,
  '1d': 1440 * MINUTE_MS,
  '3d': 3 * 1440 * MINUTE_MS,
  '1w': 7 * 1440 * MINUTE_MS,
  '1M': 30 * 1440 * MINUTE_MS,
}

/** How long to wait for a live order's fill report before giving up on it. */
const LIVE_FILL_TIMEOUT_MS = 2 * MINUTE_MS

/**
 * Absolute bar number for a bar's open time.
 *
 * The engine's `barIndex` has to be comparable ACROSS bars — `cooldownBars`
 * subtracts one from another — so a window-relative index is useless here: in
 * a sliding window the last closed bar is always at the same offset. Deriving
 * it from the timestamp gives a monotonic counter that also survives a restart,
 * which matters because `lastLossBarIndex` is persisted.
 */
const barIndexOf = (ts: number, timeframe: string): number =>
  Math.floor(ts / (TIMEFRAME_MS[timeframe] ?? 60 * MINUTE_MS))

/** UTC day number — the boundary the daily guard counters reset on. */
const utcDayOf = (ts: number): number => Math.floor(ts / (24 * 60 * MINUTE_MS))

const quoteCurrencyOf = (pair: string): string =>
  pair.toUpperCase().split('-')[1] ?? ''

const numberOr = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function makeEvent(
  botId: string,
  level: BotEvent['level'],
  kind: BotEvent['kind'],
  message: string,
  detail?: string,
): BotEvent {
  return {
    id: crypto.randomUUID(),
    botId,
    ts: Date.now(),
    level,
    kind,
    message,
    ...(detail ? { detail } : {}),
  }
}

/** What a bot needs from its script before it can decide anything. */
type BotScript = {
  source: string
  modules: Array<{ path: string; source: string }>
  meta: CustomIndicatorMeta
  strategy: CustomIndicatorStrategySpec
  params: Record<string, unknown>
}

/**
 * Resolve a bot's script, or explain why it can't run. A bot pointing at a
 * deleted script, a plain indicator, or a script that has never been run
 * successfully (no cached meta) is a configuration error the user must see.
 */
function loadScript(bot: BotDefinition): BotScript | { error: string } {
  const script = useIndicatorScriptsStore
    .getState()
    .scripts.find((s) => s.id === bot.scriptId)
  if (!script) return { error: 'Script not found' }
  const meta = script.meta
  if (!meta) {
    return {
      error: script.metaError ?? 'Script has no metadata — run it once first',
    }
  }
  if (!meta.strategy) {
    return { error: 'Script is an indicator, not a strategy' }
  }
  // Declared defaults first, the bot's overrides on top: a script that gained
  // an input since the bot was configured still gets a value for it.
  const params: Record<string, unknown> = {}
  for (const input of meta.inputs) params[input.key] = input.default
  for (const [key, value] of Object.entries(bot.params)) {
    if (value !== undefined) params[key] = value
  }
  return {
    source: script.source,
    modules: script.modules ?? [],
    meta,
    strategy: meta.strategy,
    params,
  }
}

/** Live-mode credential for a venue, or null when the user has none. */
function liveCredentialId(market: string): string | null {
  const found = useCredentialsStore
    .getState()
    .credentials.find((c) => c.market === market && c.mode === 'live')
  return found?.id ?? null
}

/** Tradable quote-currency balance a sizing rule may commit. */
function tradableEquity(
  bot: BotDefinition,
  strategy: CustomIndicatorStrategySpec,
  realized: number,
  credentialId: string | null,
): { equity: number } | { equity: 0; reason: string } {
  if (bot.mode === 'paper') {
    // Paper equity compounds exactly like the backtester's: starting capital
    // plus everything closed since. Same rule, same numbers, same story.
    const equity = strategy.initialCapital + realized
    if (!(equity > 0)) return { equity: 0, reason: 'paper equity exhausted' }
    return { equity }
  }
  if (!credentialId) return { equity: 0, reason: 'no live credential' }
  const quote = quoteCurrencyOf(bot.pair)
  const record = getBalancesForCredential(credentialId).find(
    (b) => b.currency.toUpperCase() === quote,
  )
  if (!record) {
    // Fail closed. Balances are populated when the app talks to the venue
    // (Accounts, trade panel); guessing an equity here would size a real order
    // off a number nobody supplied.
    return {
      equity: 0,
      reason: `no ${quote} balance known for this account — open Accounts to refresh it`,
    }
  }
  const available = numberOr(record.available, 0)
  if (!(available > 0)) {
    return { equity: 0, reason: `no ${quote} available on this account` }
  }
  return { equity: available }
}

type ActiveSub = {
  unsub: () => void
  /**
   * Identity of the deployment. Market/pair/timeframe/mode changes mean the
   * subscription is pointed at the wrong thing and must be rebuilt; params and
   * guards are read fresh on every bar, so they don't appear here.
   */
  deployment: string
  /** Closed bars, oldest first. The window handed to Python. */
  bars: Array<ChartBar>
  /** The bar currently forming. Never fed to a decision. */
  forming: ChartBar | null
  /** True once seeded — before that, bar closes are history, not signals. */
  warm: boolean
  /**
   * The deep-history fetch is still running.
   *
   * The venue's stream snapshot (one page, ~300 bars) always beats the paged
   * REST warmup home, so without this the bot would go warm on the snapshot
   * alone and could decide its first bar on a window shallower than the one
   * its author tested against. Cleared however the warmup ends — a failed
   * fetch still releases the bot to run on the snapshot, which is the
   * documented fallback.
   */
  historyPending: boolean
  /** A bar-close pipeline is running; the next close waits rather than races. */
  processing: boolean
  /** Fee charged on the open position's entry, quote currency. */
  entryFee: number
  /** Cancels a pending live fill watch. */
  stopFillWatch: (() => void) | null
  disposed: boolean
}

const deploymentKey = (bot: BotDefinition): string =>
  `${bot.market}|${bot.pair}|${bot.timeframe}|${bot.mode}|${bot.scriptId}`

/**
 * Watch the order journal for one live order and report where it ended up.
 *
 * The private order stream is the only place a real fill price exists; the
 * runtime submits at market and finds out what it paid here. Bounded, because
 * a venue that never reports must not leak a subscription for the life of the
 * window.
 */
export function watchOrderFill(
  orderId: string,
  onSettled: (event: OrderEvent | null) => void,
  timeoutMs: number = LIVE_FILL_TIMEOUT_MS,
): () => void {
  let done = false
  const finish = (event: OrderEvent | null) => {
    if (done) return
    done = true
    clearTimeout(timer)
    unsub()
    onSettled(event)
  }
  const check = () => {
    const event = getOrderEvents().find((e) => e.orderId === orderId)
    if (!event) return
    if (
      event.status === 'filled' ||
      event.status === 'cancelled' ||
      event.status === 'failed'
    ) {
      finish(event)
    }
  }
  const timer = setTimeout(() => finish(null), timeoutMs)
  const unsub = subscribeOrderEvents(check)
  // The fill may already have landed between submit and subscribe.
  check()
  return () => finish(null)
}

export class BotRuntime {
  private pluginManager: PluginManager | null = null
  private readonly subs = new Map<string, ActiveSub>()
  private storeUnsub: (() => void) | null = null
  private keepAwakeUnsub: (() => void) | null = null
  private vaultUnsub: (() => void) | null = null
  private credentialsUnsub: (() => void) | null = null
  private sleepHeld = false

  start(pluginManager: PluginManager): void {
    this.pluginManager = pluginManager
    // Definitions can change from anywhere (this window's UI, another window's
    // sync write, the panic button) — reconcile off the store, never off a
    // caller remembering to tell us.
    this.storeUnsub = useBotsStore.subscribe(() =>
      queueMicrotask(() => this.reconcile()),
    )
    useBotsStore.getState().load()
    useBotRunsStore.getState().load()
    // Credentials live in the keychain and load asynchronously; a live bot
    // can't be armed until they're in memory. A sealed vault settles the store
    // into `sealed` rather than throwing, so this chain is safe either way —
    // and the vault subscription below is what resumes the parked bots.
    void useCredentialsStore
      .getState()
      .load()
      .then(() => this.reconcile())
    // …and reconcile again whenever that store settles somewhere new. This is
    // what makes the unlock path safe: `subscribeVault` fires synchronously
    // from `setDek`, at which point the credentials store is still `sealed`
    // with nothing in it, and the reload that repopulates it is async. Without
    // this listener the unlock-driven reconcile would find no credential and
    // halt — disabling exactly the bots the park/halt split exists to keep.
    this.credentialsUnsub = useCredentialsStore.subscribe((state, previous) => {
      if (state.status === previous.status) return
      queueMicrotask(() => this.reconcile())
    })
    // The runtime outlives any render, so it cannot rely on a component
    // having called this. Cheap and idempotent.
    startVaultBootstrap()
    // Unlocking is the event that un-parks every waiting bot. Reconcile off
    // the vault the same way we reconcile off the store: never off a caller
    // remembering to tell us.
    this.vaultUnsub = subscribeVault(() => {
      if (isVaultUnlocked()) useVaultAttentionStore.getState().clearAll()
      this.reconcile()
    })
    // Toggling the switch mid-run must take effect immediately: turning it off
    // while a bot trades should release the machine, not wait for the bot to
    // stop.
    this.keepAwakeUnsub = subscribeKeepAwake(() => {
      void this.syncSleepBlock()
    })
    // Ask the OS what it is actually holding before trusting our own field.
    // A webview reload — or a whole new window after the process outlived its
    // last one — starts this class at `sleepHeld: false` while the Rust side
    // may still be holding an assertion from the previous life. Without this
    // the "nothing changed" short-circuit below would never issue the release
    // and the machine would stay awake for bots that no longer exist.
    void refreshSleepBlocked().then((held) => {
      this.sleepHeld = held
      void this.syncSleepBlock()
    })
    this.announceRearms()
    this.reconcile()
  }

  stop(): void {
    this.storeUnsub?.()
    this.storeUnsub = null
    this.keepAwakeUnsub?.()
    this.keepAwakeUnsub = null
    this.vaultUnsub?.()
    this.vaultUnsub = null
    this.credentialsUnsub?.()
    this.credentialsUnsub = null
    for (const botId of Array.from(this.subs.keys())) {
      this.teardown(botId, 'stopped')
    }
    this.subs.clear()
    this.pluginManager = null
    void this.syncSleepBlock()
  }

  /** Bots the store disarmed on load say so once, so the UI has a reason. */
  private announceRearms(): void {
    for (const bot of useBotsStore.getState().bots) {
      if (!bot.needsRearm) continue
      this.log(
        bot.id,
        'warning',
        'rearm-required',
        'Live bot was disarmed on load',
        'A live bot never resumes by itself across a restart. Re-arm it when you are ready for real orders to flow again.',
      )
    }
  }

  private reconcile(): void {
    if (!this.pluginManager) return
    const bots = useBotsStore.getState().bots
    const wanted = new Map<string, BotDefinition>()
    for (const bot of bots) {
      // `needsRearm` bots are already `enabled: false`; the check is belt and
      // braces against anything that flips enabled without clearing it.
      if (bot.enabled && !bot.needsRearm) wanted.set(bot.id, bot)
    }

    for (const [botId, sub] of this.subs) {
      const bot = wanted.get(botId)
      if (!bot || sub.deployment !== deploymentKey(bot)) {
        this.teardown(botId, 'stopped')
      }
    }

    for (const [botId, bot] of wanted) {
      if (this.subs.has(botId)) continue
      this.open(bot)
    }

    void this.syncSleepBlock()
  }

  private open(bot: BotDefinition): void {
    const manager = this.pluginManager
    if (!manager) return

    const script = loadScript(bot)
    if ('error' in script) {
      this.halt(bot.id, 'error', 'Cannot start', script.error)
      return
    }
    // The vault comes BEFORE the credential check on purpose: with a sealed
    // vault the credentials store is empty because it could not read, not
    // because there is nothing there, and `halt()` would disable a perfectly
    // good bot over a lock screen.
    if (bot.mode === 'live' && isVaultEnrolled() && !isVaultUnlocked()) {
      this.park(bot)
      return
    }
    if (bot.mode === 'live') {
      // "No credential" is only ever true of a store that finished reading.
      // Anything else — still loading, sealed, or a keychain that refused —
      // is an empty list for a reason that has nothing to do with the user's
      // keys, and halting on it disables an armed bot the user would have to
      // re-arm by hand. Wait instead: the credentials subscription in
      // `start()` reconciles again the moment the status changes.
      const credentials = useCredentialsStore.getState()
      if (credentials.status !== 'ready') {
        if (credentials.status === 'sealed' || credentials.status === 'error') {
          this.park(bot, credentials.status)
        }
        return
      }
      if (!liveCredentialId(bot.market)) {
        this.halt(
          bot.id,
          'error',
          'Cannot start live',
          `No live credential for ${bot.market}. Add one in Accounts, or switch the bot to paper.`,
        )
        return
      }
    }

    const session: ActiveSub = {
      unsub: () => {},
      deployment: deploymentKey(bot),
      bars: [],
      forming: null,
      warm: false,
      historyPending: true,
      processing: false,
      entryFee: 0,
      stopFillWatch: null,
      disposed: false,
    }

    // Scope resolution to this bot's venue before subscribing. The resolver
    // reads the manager's ambient context, so without this the subscription
    // lands on whatever market the last UI stream happened to set.
    manager.setContext({
      market: bot.market,
      pair: bot.pair,
      country: getCountrySetting(),
    })

    try {
      session.unsub = manager.subscribe(
        'market-data:candles',
        { pair: bot.pair, timeframe: bot.timeframe },
        (data) => this.handleUpdate(bot.id, data),
      )
    } catch (err) {
      // Connectors throw synchronously when they statically know the venue is
      // unavailable here (region block).
      this.halt(
        bot.id,
        'error',
        'Could not connect to the venue',
        err instanceof Error ? err.message : String(err),
      )
      return
    }

    this.subs.set(bot.id, session)
    useBotRunsStore.getState().patchRun(bot.id, {
      status: 'warming-up',
      statusDetail: undefined,
      startedAt: Date.now(),
    })
    this.log(
      bot.id,
      'info',
      'started',
      `Started on ${bot.market} ${bot.pair} ${bot.timeframe} (${bot.mode})`,
    )
    void this.warmup(bot, session)
  }

  /**
   * Seed the window with real depth before deciding anything.
   *
   * A venue caps one candles call well below a useful window (OKX at 300), and
   * the stream's own snapshot is capped the same way — so a bot that decided
   * off the snapshot alone would be trading a strategy evaluated over a window
   * it never had.
   */
  private async warmup(bot: BotDefinition, session: ActiveSub): Promise<void> {
    const source = getBotOrderSource()
    if (!source) {
      session.historyPending = false
      this.markWarm(bot.id, session)
      return
    }
    try {
      const bars = await fetchHistoryDepth(
        (limit, endTs) =>
          source.fetchHistory(
            bot.market,
            bot.pair,
            bot.timeframe,
            limit,
            endTs,
          ),
        BOT_WINDOW_BARS,
      )
      if (session.disposed) return
      this.ingest(session, bars)
    } catch (err) {
      // Non-fatal: the stream snapshot still seeds a shorter window. Say so —
      // a bot deciding off 300 bars instead of 500 is a different bot.
      this.log(
        bot.id,
        'warning',
        'signal',
        'History warmup was incomplete',
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      // Released however the fetch ended, so a dead venue can't leave a bot
      // permanently un-warm and silently not trading.
      session.historyPending = false
      if (!session.disposed) this.markWarm(bot.id, session)
    }
  }

  private teardown(botId: string, status: BotStatus): void {
    const session = this.subs.get(botId)
    if (!session) return
    session.disposed = true
    session.stopFillWatch?.()
    session.unsub()
    this.subs.delete(botId)
    const run = useBotRunsStore.getState().getRun(botId)
    // Never overwrite a halt: the reason it stopped is the whole message.
    if (run.status !== 'error' && run.status !== 'halted') {
      useBotRunsStore.getState().patchRun(botId, { status })
      this.log(botId, 'info', 'stopped', 'Stopped')
    }
    void this.syncSleepBlock()
  }

  /**
   * Fold an update into the window. Returns the bars that just closed —
   * normally one, more only when a reconnect replays a gap.
   */
  private ingest(
    session: ActiveSub,
    candles: Array<ChartBar>,
  ): Array<ChartBar> {
    const closed: Array<ChartBar> = []
    for (const candle of candles) {
      if (!Number.isFinite(candle.ts)) continue
      if (session.forming === null || candle.ts > session.forming.ts) {
        // A bar with a newer timestamp exists, so the one we were holding is
        // final. This is the only close signal connectors give us: they emit
        // 'snapshot' and 'update', never an explicit close.
        if (session.forming !== null) {
          session.bars.push(session.forming)
          closed.push(session.forming)
        }
        session.forming = candle
      } else if (candle.ts === session.forming.ts) {
        session.forming = candle
      } else {
        // Backfill or a late correction to a bar we already closed.
        const index = session.bars.findIndex((b) => b.ts === candle.ts)
        if (index === -1) session.bars.push(candle)
        else session.bars[index] = candle
      }
    }
    if (closed.length > 0 || candles.length > 1) {
      session.bars.sort((a, b) => a.ts - b.ts)
    }
    if (session.bars.length > BOT_WINDOW_BARS) {
      session.bars = session.bars.slice(-BOT_WINDOW_BARS)
    }
    return closed
  }

  private markWarm(botId: string, session: ActiveSub): void {
    if (session.warm || session.historyPending || session.bars.length === 0) {
      return
    }
    session.warm = true
    const run = useBotRunsStore.getState().getRun(botId)
    if (run.status === 'warming-up') {
      useBotRunsStore.getState().patchRun(botId, { status: 'running' })
      this.log(
        botId,
        'info',
        'signal',
        `Warmed up on ${session.bars.length} bars — waiting for the next bar close`,
      )
    }
  }

  private handleUpdate(botId: string, data: unknown): void {
    const session = this.subs.get(botId)
    if (!session || session.disposed) return
    const update = data as { type?: string; candles?: Array<ChartBar> }
    if (!update?.candles?.length) return

    const closed = this.ingest(session, update.candles)

    if (!session.warm) {
      // Everything before warm-up is history, not signal. Replaying it as
      // decisions would fire a burst of orders at today's price for bars that
      // closed days ago.
      this.markWarm(botId, session)
      return
    }
    if (closed.length === 0) return

    // Only the newest close is actionable. If a reconnect handed us a gap, the
    // older bars' signals are answers to prices that have already moved on.
    const bar = closed[closed.length - 1]
    if (session.processing) {
      this.log(
        botId,
        'warning',
        'signal',
        'Skipped a bar close — the previous one was still being evaluated',
        new Date(bar.ts).toISOString(),
      )
      return
    }
    session.processing = true
    void this.onBarClose(botId, session, bar).finally(() => {
      session.processing = false
    })
  }

  /**
   * The decision pipeline for one closed bar.
   *
   * Order matters and is not negotiable: risk before signal (a protective exit
   * outranks whatever the strategy now thinks), guards before execution, and
   * every branch that declines to trade writes a line saying so.
   */
  private async onBarClose(
    botId: string,
    session: ActiveSub,
    bar: ChartBar,
  ): Promise<void> {
    const bot = useBotsStore.getState().bots.find((b) => b.id === botId)
    if (!bot || !bot.enabled) return
    const runs = useBotRunsStore.getState()
    const run = runs.getRun(botId)

    const script = loadScript(bot)
    if ('error' in script) {
      this.halt(botId, 'error', 'Script unavailable', script.error)
      return
    }

    const barIndex = barIndexOf(bar.ts, bot.timeframe)
    const referencePrice = session.forming?.open ?? bar.close
    const credentialId =
      bot.mode === 'live' ? liveCredentialId(bot.market) : null

    // ── Roll the daily guard counters over a UTC day boundary ──
    // Derived from the last evaluated bar rather than a stored day marker, so
    // it survives a reload without the run state carrying an extra field.
    let guards = run.guards
    let position = run.position
    if (
      run.lastBarTs !== null &&
      utcDayOf(run.lastBarTs) !== utcDayOf(bar.ts)
    ) {
      guards = {
        ...guards,
        realizedToday: 0,
        tradesToday: 0,
        dayStartEquity: 0,
        // The loss streak and cooldown are not daily facts; a new day does not
        // undo the last three losing trades.
      }
    }

    // Age the position and mark it before anything can exit it.
    if (position) {
      position = {
        ...position,
        barsHeld: position.barsHeld + 1,
      }
    }

    const equityResult = tradableEquity(
      bot,
      script.strategy,
      run.realizedPnl,
      credentialId,
    )
    const equity = equityResult.equity
    if (guards.dayStartEquity <= 0 && equity > 0) {
      guards = { ...guards, dayStartEquity: equity }
    }

    const unrealized = position
      ? (position.side === 'long' ? 1 : -1) *
        (bar.close - position.entryPrice) *
        position.quantity
      : 0
    runs.patchRun(
      botId,
      {
        lastBarTs: bar.ts,
        lastPrice: bar.close,
        guards,
        position,
        unrealizedPnl: unrealized,
      },
      { persist: false },
    )

    // ── 1. Protective exits win over everything the strategy has to say ──
    if (position && script.strategy.risk) {
      const exit = evaluateRisk(position, bar, script.strategy.risk)
      if (exit) {
        this.log(
          botId,
          'info',
          'risk-exit',
          `${exit.reason} at ${exit.price}`,
          `Position opened at ${position.entryPrice}`,
        )
        const intent: BotOrderIntent = {
          kind: 'exit',
          side: position.side === 'long' ? 'sell' : 'buy',
          targetSide: null,
          reason: exit.reason,
          barIndex,
        }
        // Paper fills at the trigger level, which is what the level MEANS: a
        // stop that filled at the bar's close would flatter every gap. Live
        // fills at the market, because that is what the venue will actually
        // give us now that the bar has closed.
        await this.execute(botId, bot, session, {
          intent,
          position,
          entryQuantity: 0,
          referencePrice: bot.mode === 'paper' ? exit.price : referencePrice,
          strategy: script.strategy,
          barIndex,
          credentialId,
        })
        return
      }
      // Trailing stops measure from the extreme AFTER this bar survived it.
      position = { ...position, extremePrice: updateExtreme(position, bar) }
      runs.patchRun(botId, { position }, { persist: false })
    }

    // ── 2. What does the strategy want to hold? ──
    let target: number
    try {
      const outputs = await computeBotOutputs({
        botId,
        source: script.source,
        modules: script.modules,
        bars: session.bars,
        params: script.params,
        pair: bot.pair,
        timeframe: bot.timeframe,
      })
      // The window is closed bars only, so the last entry IS the last closed
      // bar — the forming bar is never in here.
      const count = session.bars.length
      const targets = resolveTargets(
        count,
        {
          long: outputs.long,
          short: outputs.short,
          position: outputs.position,
          entries: outputs.entries,
          exits: outputs.exits,
        },
        script.strategy.allowShort,
      )
      target = targets[count - 1] ?? 0
    } catch (err) {
      if (err instanceof BotComputeBusyError) return
      this.halt(
        botId,
        'error',
        'Strategy failed to compute',
        err instanceof Error ? err.message : String(err),
      )
      return
    }

    const intent = decideTransition({
      position,
      target,
      allowShort: script.strategy.allowShort,
      barIndex,
    })
    if (!intent) return

    this.log(
      botId,
      'info',
      'signal',
      `${intent.kind} ${intent.side} (${intent.reason})`,
      `Target ${target} at bar ${new Date(bar.ts).toISOString()}`,
    )

    // ── 3. Size the entry leg (guards need its notional) ──
    let entryQuantity = 0
    if (intent.kind === 'enter' || intent.kind === 'flip') {
      if ('reason' in equityResult) {
        this.log(
          botId,
          bot.mode === 'live' ? 'error' : 'warning',
          'order-rejected',
          'Cannot size the order',
          equityResult.reason,
        )
        return
      }
      const sized = resolveQuantity(bot.sizing, equity, referencePrice)
      if ('reason' in sized) {
        // Verbatim: sizing writes its refusals for a human to read, and a
        // silently skipped signal is the thing this feature must never do.
        this.log(
          botId,
          'warning',
          'order-rejected',
          'Order not placed',
          sized.reason,
        )
        return
      }
      entryQuantity = sized.quantity
    }

    // ── 4. Guards ──
    if (intent.kind === 'enter' || intent.kind === 'flip') {
      const verdict = checkGuards(guards, bot.guards, {
        intendedNotional: entryQuantity * referencePrice,
        barIndex,
        equity,
      })
      if (!verdict.allowed) {
        this.log(
          botId,
          verdict.halts ? 'error' : 'warning',
          'guard-blocked',
          verdict.detail,
          `Guard: ${verdict.code}`,
        )
        if (verdict.halts) {
          this.halt(botId, 'halted', 'Guard stopped the bot', verdict.detail)
          return
        }
        if (intent.kind === 'flip' && position) {
          // A blocked flip still means "stop being long". Honouring the exit
          // leg is the conservative half of what the strategy asked for;
          // holding the position because the entry was refused would leave
          // risk on the book that nothing is managing.
          await this.execute(botId, bot, session, {
            intent: {
              kind: 'exit',
              side: position.side === 'long' ? 'sell' : 'buy',
              targetSide: null,
              reason: 'signal-exit',
              barIndex,
            },
            position,
            entryQuantity: 0,
            referencePrice,
            strategy: script.strategy,
            barIndex,
            credentialId,
          })
        }
        return
      }
    }

    await this.execute(botId, bot, session, {
      intent,
      position,
      entryQuantity,
      referencePrice,
      strategy: script.strategy,
      barIndex,
      credentialId,
    })
  }

  /** Submit one intent and book whatever comes back. */
  private async execute(
    botId: string,
    bot: BotDefinition,
    session: ActiveSub,
    input: {
      intent: BotOrderIntent
      position: BotPosition | null
      entryQuantity: number
      referencePrice: number
      strategy: CustomIndicatorStrategySpec
      barIndex: number
      credentialId: string | null
    },
  ): Promise<void> {
    const {
      intent,
      position,
      entryQuantity,
      referencePrice,
      strategy,
      barIndex,
      credentialId,
    } = input
    const runs = useBotRunsStore.getState()
    const closeQuantity = position ? position.quantity : 0
    const submitQuantity =
      intent.kind === 'exit'
        ? closeQuantity
        : intent.kind === 'flip'
          ? closeQuantity + entryQuantity
          : entryQuantity

    this.log(
      botId,
      'info',
      'order-submitted',
      `${intent.side} ${submitQuantity} ${bot.pair} (${bot.mode})`,
      `~${referencePrice}`,
    )

    const result = await executeBotOrder({
      botId,
      mode: bot.mode,
      market: bot.market,
      pair: bot.pair,
      intent,
      quantity: submitQuantity,
      referencePrice,
      spec: strategy,
      ...(credentialId ? { credentialId } : {}),
    })

    if (!result.ok) {
      // A hard lock mid-run is not a rejection to halt over: the venue never
      // saw the order, and the bot is fine the moment the vault reopens.
      // Halting here would disable the definition — the exact silent-disarm
      // this path exists to prevent.
      if (isVaultSealed(result.cause)) {
        this.park(bot)
        return
      }
      this.log(botId, 'error', 'order-rejected', 'Order rejected', result.error)
      // Live rejections stop the bot: the venue said no, and the next bar
      // would ask again with the same parameters. Paper failures are
      // configuration problems the user can fix while the bot keeps watching.
      if (bot.mode === 'live') {
        this.halt(botId, 'error', 'Live order rejected', result.error)
      }
      return
    }

    const feeRate = Math.max(strategy.fee, 0)
    const now = result.ts

    // ── Close the outgoing position, if any ──
    if (position && (intent.kind === 'exit' || intent.kind === 'flip')) {
      const direction = position.side === 'long' ? 1 : -1
      // The entry fee is recomputed rather than remembered: for paper it is
      // exactly what was charged (same rate, same notional), and recomputing
      // survives a page reload that a session field would not.
      const entryFee =
        session.entryFee > 0
          ? session.entryFee
          : position.quantity * position.entryPrice * feeRate
      const exitFee =
        intent.kind === 'flip'
          ? closeQuantity * result.price * feeRate
          : result.fee
      const pnl = realizedPnl({
        direction: direction,
        entryPrice: position.entryPrice,
        exitPrice: result.price,
        quantity: position.quantity,
        entryFee,
        exitFee,
      })
      const notional = position.quantity * position.entryPrice
      runs.closeTrade(botId, {
        exitTs: now,
        exitPrice: result.price,
        pnl,
        pnlPercent: notional > 0 ? pnl / notional : 0,
        exitReason: intent.reason,
      })
      // Guard counters fold on the CLOSE, because that is the event that
      // carries a P&L.
      const nextGuards = applyFill(
        useBotRunsStore.getState().getRun(botId).guards,
        { realizedPnl: pnl, barIndex },
      )
      // The mark goes with the position: leaving a stale unrealized number on
      // a flat bot would show P&L that no longer exists anywhere.
      runs.patchRun(botId, {
        guards: nextGuards,
        position: null,
        unrealizedPnl: 0,
      })
      this.log(
        botId,
        'info',
        'order-filled',
        `Closed ${position.side} at ${result.price} for ${pnl.toFixed(2)}`,
        intent.reason,
      )
      session.entryFee = 0
    }

    // ── Open the incoming position, if any ──
    if (intent.targetSide && entryQuantity > 0) {
      const entryFee =
        intent.kind === 'flip'
          ? entryQuantity * result.price * feeRate
          : result.fee
      const opened: BotPosition = {
        side: intent.targetSide,
        quantity: entryQuantity,
        entryPrice: result.price,
        entryTs: now,
        barsHeld: 0,
        extremePrice: result.price,
      }
      session.entryFee = entryFee
      const trade: BotTrade = {
        id: crypto.randomUUID(),
        direction: intent.targetSide,
        entryTs: now,
        entryPrice: result.price,
        exitTs: null,
        exitPrice: null,
        quantity: entryQuantity,
        pnl: null,
        pnlPercent: null,
        exitReason: null,
        mode: bot.mode,
      }
      runs.appendTrade(botId, trade)
      runs.patchRun(botId, { position: opened })
      this.log(
        botId,
        'info',
        'order-filled',
        `Opened ${intent.targetSide} ${entryQuantity} at ${result.price}`,
        bot.mode === 'live'
          ? 'Submitted at market — price shown is the reference until the venue reports the fill'
          : intent.reason,
      )
    }

    if (bot.mode === 'live' && result.orderId) {
      this.reconcileLiveFill(botId, session, result.orderId, {
        opensPosition: intent.targetSide !== null && entryQuantity > 0,
        feeRate,
      })
    }
  }

  /**
   * Replace the assumed fill with the venue's own numbers.
   *
   * A market order's reference price is a guess made before the order existed;
   * the private order stream carries what was actually paid. Reporting the
   * guess as the fill would compound an error across every trade the bot takes.
   */
  private reconcileLiveFill(
    botId: string,
    session: ActiveSub,
    orderId: string,
    context: { opensPosition: boolean; feeRate: number },
  ): void {
    session.stopFillWatch?.()
    session.stopFillWatch = watchOrderFill(orderId, (event) => {
      session.stopFillWatch = null
      if (session.disposed) return
      if (!event) {
        // No report inside the window — some venues have no private stream at
        // all (DEX paths). Say so rather than letting the approximation pass
        // for a fill.
        this.log(
          botId,
          'warning',
          'order-filled',
          'No fill report from the venue',
          `Order ${orderId}: the recorded price is the submission reference, not a confirmed fill.`,
        )
        return
      }
      if (event.status !== 'filled') {
        this.log(
          botId,
          'warning',
          'order-rejected',
          `Order ${event.status}`,
          `Order ${orderId} never filled — the bot's recorded position may not match the venue.`,
        )
        return
      }

      const avgPrice = numberOr(event.avgPrice, 0)
      const fillSize = numberOr(event.fillSize, 0)
      const venueFee = Math.abs(numberOr(event.fee, 0))
      const runs = useBotRunsStore.getState()
      const run = runs.getRun(botId)

      if (context.opensPosition && run.position && avgPrice > 0) {
        // Correcting an entry is free of consequences — nothing has been
        // derived from it yet. Correcting a closed trade's P&L is not, so an
        // exit only gets its numbers restated in the log below.
        const quantity = fillSize > 0 ? fillSize : run.position.quantity
        session.entryFee = venueFee > 0 ? venueFee : session.entryFee
        runs.patchRun(botId, {
          position: {
            ...run.position,
            entryPrice: avgPrice,
            quantity,
            extremePrice: avgPrice,
          },
        })
        const trades = run.trades.slice()
        const openIndex = trades.findIndex((t) => t.exitTs === null)
        if (openIndex !== -1) {
          trades[openIndex] = {
            ...trades[openIndex],
            entryPrice: avgPrice,
            quantity,
          }
          runs.patchRun(botId, { trades })
        }
      }

      this.log(
        botId,
        'info',
        'order-filled',
        `Venue filled ${fillSize} at ${avgPrice}`,
        `Order ${orderId}${venueFee > 0 ? `, fee ${venueFee} ${event.feeCcy}` : ''}`,
      )
    })
  }

  private log(
    botId: string,
    level: BotEvent['level'],
    kind: BotEvent['kind'],
    message: string,
    detail?: string,
  ): void {
    useBotRunsStore
      .getState()
      .appendEvent(botId, makeEvent(botId, level, kind, message, detail))
  }

  /**
   * Stand a live bot down until the vault opens — WITHOUT disabling it.
   *
   * This is the whole difference between `park` and `halt`, and it is the
   * difference between "your bots resume when you unlock" and "your bots are
   * off and you found out from your P&L". `bot.enabled` is untouched, so the
   * unlock-driven `reconcile()` picks the bot straight back up; the run status
   * says why it is idle; and the attention store drives a banner plus one OS
   * notification from the leader window, because a paused live bot the user
   * does not know about is the failure mode this whole path exists to avoid.
   */
  private park(
    bot: BotDefinition,
    reason: 'sealed' | 'error' = 'sealed',
  ): void {
    const detail =
      reason === 'error'
        ? i18n.t('security.vault.botParkDetailError', {
            defaultValue:
              'Your stored credentials could not be read on this device. This bot resumes live trading as soon as they load. Paper bots are unaffected.',
          })
        : i18n.t('security.vault.botParkDetailSealed', {
            defaultValue:
              'Your credential vault is locked. This bot resumes live trading as soon as you unlock Pairlens. Paper bots are unaffected.',
          })
    this.log(bot.id, 'warning', 'guard-blocked', 'Waiting for unlock', detail)
    useBotRunsStore
      .getState()
      .patchRun(bot.id, { status: 'waiting-unlock', statusDetail: detail })
    const session = this.subs.get(bot.id)
    if (session) {
      session.disposed = true
      session.stopFillWatch?.()
      session.unsub()
      this.subs.delete(bot.id)
    }
    // Deliberately no `setEnabled(false)`: reconcile() must find this bot
    // wanted again the moment the vault opens.
    //
    // Only a sealed vault feeds the banner — its copy tells the user to
    // unlock, and a read that failed for some other reason is not something
    // unlocking fixes. That case lives in the run status, where it is true.
    if (reason === 'sealed') {
      useVaultAttentionStore.getState().report({ id: bot.id, label: bot.name })
    }
    void this.syncSleepBlock()
  }

  /**
   * Stop a bot loudly. The status carries the reason, the definition is
   * disabled so nothing restarts it, and no order is ever retried.
   */
  private halt(
    botId: string,
    status: Extract<BotStatus, 'error' | 'halted'>,
    message: string,
    detail: string,
  ): void {
    this.log(
      botId,
      status === 'halted' ? 'warning' : 'error',
      status === 'halted' ? 'guard-blocked' : 'compute-error',
      message,
      detail,
    )
    useBotRunsStore.getState().patchRun(botId, { status, statusDetail: detail })
    const session = this.subs.get(botId)
    if (session) {
      session.disposed = true
      session.stopFillWatch?.()
      session.unsub()
      this.subs.delete(botId)
    }
    // Disabling triggers reconcile, which finds nothing left to tear down.
    useBotsStore.getState().setEnabled(botId, false)
    void this.syncSleepBlock()
  }

  /**
   * Hold the machine awake while bots are armed AND the user has asked us to.
   * Bots run here and nowhere else — a suspended laptop is a bot that stopped
   * managing a real position — but keeping someone's machine open is their call
   * to make, so the switch on the bots page governs this outright. A user who
   * believes sleep is blocked when it isn't is worse off than one who was told
   * it can't be.
   */
  private async syncSleepBlock(): Promise<void> {
    const wanted = this.subs.size > 0 && isKeepAwakeEnabled()
    if (wanted === this.sleepHeld) return
    this.sleepHeld = wanted
    const result = await setSleepBlocked(wanted)
    if (!result.ok && result.reason === 'failed') {
      const botId = Array.from(this.subs.keys())[0]
      if (botId) {
        this.log(
          botId,
          'warning',
          'started',
          'Could not keep this machine awake',
          result.error ??
            'The OS refused the request — if it sleeps, the bot stops managing its position.',
        )
      }
    }
  }
}

export const botRuntime = new BotRuntime()
