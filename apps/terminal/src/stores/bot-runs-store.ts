// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Live state for each bot: what it holds, what it has done, and why.
 *
 * Split from `bots-store` on purpose. The runtime touches this on every bar
 * close, and definitions must not be rewritten (and re-broadcast to every
 * window) just because a status dot changed.
 *
 * Broadcast across windows but never to the cloud. Only the leader window runs
 * bots, so without the broadcast a second terminal window would show every
 * armed bot as "stopped" — the run state would be sitting in another window's
 * memory. `SYNC_KEY` is deliberately absent from the sync coordinator's tier-2
 * table, which skips keys it doesn't know: a run log is a record of what THIS
 * computer did, and merging two machines' ledgers for the same bot would
 * produce a history that never happened.
 */
import { create } from 'zustand'

import type {
  BotEvent,
  BotGuardState,
  BotPosition,
  BotStatus,
} from '@pairlens/bot-engine/types'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

const STORAGE_KEY = 'pairlens:bot-runs'
const SYNC_KEY = 'bot-runs'

/** Keep the log useful without letting it grow unbounded in localStorage. */
const MAX_EVENTS_PER_BOT = 200
const MAX_TRADES_PER_BOT = 500

/** One completed round trip a bot actually took (paper or live). */
export type BotTrade = {
  id: string
  direction: 'long' | 'short'
  entryTs: number
  entryPrice: number
  exitTs: number | null
  exitPrice: number | null
  quantity: number
  /** Net of fees, quote currency. Null while the trade is still open. */
  pnl: number | null
  pnlPercent: number | null
  /** Why it closed — mirrors the backtester's `exitReason`. */
  exitReason: string | null
  mode: 'paper' | 'live'
}

/** Everything the runtime knows about one bot right now. */
export type BotRunState = {
  botId: string
  status: BotStatus
  /** Set when status is 'error' or 'halted' — shown on the card. */
  statusDetail?: string
  position: BotPosition | null
  /** Mark-to-market of the open position, quote currency. */
  unrealizedPnl: number
  /** Closed-trade P&L since the bot was created, quote currency. */
  realizedPnl: number
  guards: BotGuardState
  trades: Array<BotTrade>
  events: Array<BotEvent>
  /** Close time of the last bar the bot evaluated. */
  lastBarTs: number | null
  /** Last price the runtime saw, for unrealized marks in the UI. */
  lastPrice: number | null
  startedAt: number | null
}

export function emptyRunState(botId: string): BotRunState {
  return {
    botId,
    status: 'stopped',
    position: null,
    unrealizedPnl: 0,
    realizedPnl: 0,
    guards: {
      realizedToday: 0,
      dayStartEquity: 0,
      tradesToday: 0,
      consecutiveLosses: 0,
      lastLossBarIndex: null,
    },
    trades: [],
    events: [],
    lastBarTs: null,
    lastPrice: null,
    startedAt: null,
  }
}

type RunMap = Record<string, BotRunState>

function loadFromStorage(): RunMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // A run that was live when the window died is not live now. Whatever
        // the venue is holding, this process is not managing it until the user
        // looks — so never restore a 'running' status.
        const runs = parsed as RunMap
        for (const key of Object.keys(runs)) {
          const run = runs[key]
          if (run.status === 'running' || run.status === 'warming-up') {
            runs[key] = { ...run, status: 'stopped' }
          }
        }
        return runs
      }
    }
  } catch {
    // Ignore corrupted data — a lost log must never block the page
  }
  return {}
}

function saveToStorage(runs: RunMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
  } catch {
    // Ignore quota errors
  }
  emitWrite(SYNC_KEY, runs)
}

type BotRunsStore = {
  runs: RunMap
  loaded: boolean
  load: () => void
  /** Read-or-create; never returns undefined so callers don't branch. */
  getRun: (botId: string) => BotRunState
  /**
   * Merge a partial update. `persist: false` for high-frequency marks (price
   * ticks) so localStorage isn't written on every candle.
   */
  patchRun: (
    botId: string,
    patch: Partial<BotRunState>,
    options?: { persist?: boolean },
  ) => void
  appendEvent: (botId: string, event: BotEvent) => void
  appendTrade: (botId: string, trade: BotTrade) => void
  /** Close the newest open trade of a bot. */
  closeTrade: (
    botId: string,
    patch: Pick<
      BotTrade,
      'exitTs' | 'exitPrice' | 'pnl' | 'pnlPercent' | 'exitReason'
    >,
  ) => void
  /** Wipe one bot's history — used by "reset" and on bot deletion. */
  resetRun: (botId: string) => void
}

export const useBotRunsStore = create<BotRunsStore>((set, get) => ({
  runs: {},
  loaded: false,

  load() {
    if (get().loaded) return
    set({ runs: loadFromStorage(), loaded: true })
  },

  getRun(botId) {
    return get().runs[botId] ?? emptyRunState(botId)
  },

  patchRun(botId, patch, options) {
    const current = get().runs[botId] ?? emptyRunState(botId)
    const next = { ...get().runs, [botId]: { ...current, ...patch } }
    set({ runs: next })
    if (options?.persist !== false) saveToStorage(next)
  },

  appendEvent(botId, event) {
    const current = get().runs[botId] ?? emptyRunState(botId)
    const events = [event, ...current.events].slice(0, MAX_EVENTS_PER_BOT)
    const next = { ...get().runs, [botId]: { ...current, events } }
    set({ runs: next })
    saveToStorage(next)
  },

  appendTrade(botId, trade) {
    const current = get().runs[botId] ?? emptyRunState(botId)
    const trades = [trade, ...current.trades].slice(0, MAX_TRADES_PER_BOT)
    const next = { ...get().runs, [botId]: { ...current, trades } }
    set({ runs: next })
    saveToStorage(next)
  },

  closeTrade(botId, patch) {
    const current = get().runs[botId]
    if (!current) return
    const index = current.trades.findIndex((trade) => trade.exitTs === null)
    if (index === -1) return
    const trades = current.trades.slice()
    trades[index] = { ...trades[index], ...patch }
    const realizedPnl = current.realizedPnl + (patch.pnl ?? 0)
    const next = {
      ...get().runs,
      [botId]: { ...current, trades, realizedPnl },
    }
    set({ runs: next })
    saveToStorage(next)
  },

  resetRun(botId) {
    const next = { ...get().runs }
    delete next[botId]
    set({ runs: next })
    saveToStorage(next)
  },
}))

// Follower windows mirror the leader's run state so a bot armed in one window
// doesn't read as stopped in another. In-memory only — the leader already
// persisted, and echoing it back as a write would loop.
onHydrate((key, value) => {
  if (key !== SYNC_KEY || !value || typeof value !== 'object') return
  useBotRunsStore.setState({ runs: value as RunMap, loaded: true })
})
