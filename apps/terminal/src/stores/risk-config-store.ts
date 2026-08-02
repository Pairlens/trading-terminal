// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'
import { track } from '@/lib/analytics-events'

import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Storage ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'pairlens:risk-config'

// ── Types ───────────────────────────────────────────────────────────

export type BreachAction = 'block_all' | 'block_buys' | 'warn' | 'off'
export type ResetInterval = '4h' | '12h' | 'daily' | 'weekly'

export type RiskConfig = {
  // Limits (user-configured, 0 = disabled)
  maxDailyLoss: number
  maxPositionSize: number
  maxDailyTrades: number

  // Per-limit breach actions
  dailyLossAction: BreachAction
  dailyTradesAction: BreachAction
  positionSizeAction: BreachAction

  // Reset window
  resetInterval: ResetInterval

  // Tracked state (resets on window expiry)
  dailyPnl: number
  dailyTradeCount: number
  windowStart: number

  // Lock state (set on breach, cleared on reset or manual unlock)
  ordersLocked: boolean
  buyOrdersLocked: boolean
}

const DEFAULTS: RiskConfig = {
  maxDailyLoss: 0,
  maxPositionSize: 0,
  maxDailyTrades: 0,
  dailyLossAction: 'off',
  dailyTradesAction: 'off',
  positionSizeAction: 'off',
  resetInterval: 'daily',
  dailyPnl: 0,
  dailyTradeCount: 0,
  windowStart: Date.now(),
  ordersLocked: false,
  buyOrdersLocked: false,
}

// ── Interval durations ──────────────────────────────────────────────

const INTERVAL_MS: Record<ResetInterval, number> = {
  '4h': 4 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

// ── Persistence helpers ─────────────────────────────────────────────

function loadConfig(): RiskConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RiskConfig>
      return { ...DEFAULTS, ...parsed }
    }
  } catch {
    // Ignore corrupted data
  }
  return { ...DEFAULTS }
}

function saveConfig(config: RiskConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    emitWrite('risk-config', config)
  } catch {
    // Ignore quota errors
  }
}

// ── Window reset check ──────────────────────────────────────────────

function applyWindowReset(config: RiskConfig): RiskConfig {
  const elapsed = Date.now() - config.windowStart
  const windowMs = INTERVAL_MS[config.resetInterval] ?? INTERVAL_MS.daily
  if (elapsed >= windowMs) {
    return {
      ...config,
      dailyPnl: 0,
      dailyTradeCount: 0,
      ordersLocked: false,
      buyOrdersLocked: false,
      windowStart: Date.now(),
    }
  }
  return config
}

// ── Breach evaluation ───────────────────────────────────────────────

function evaluateBreaches(config: RiskConfig): {
  lockAll: boolean
  lockBuys: boolean
  warnings: Array<string>
} {
  let lockAll = false
  let lockBuys = false
  const warnings: Array<string> = []

  // Daily loss check — trips only on a NET LOSS of at least the limit.
  // dailyPnl is signed (negative = loss), so compare against -maxDailyLoss;
  // using Math.abs() here would wrongly lock orders after a large profit too.
  if (config.maxDailyLoss > 0 && config.dailyPnl <= -config.maxDailyLoss) {
    if (config.dailyLossAction === 'block_all') lockAll = true
    else if (config.dailyLossAction === 'block_buys') lockBuys = true
    else if (config.dailyLossAction === 'warn')
      warnings.push('Daily loss limit reached')
  }

  // Daily trades check
  if (
    config.maxDailyTrades > 0 &&
    config.dailyTradeCount >= config.maxDailyTrades
  ) {
    if (config.dailyTradesAction === 'block_all') lockAll = true
    else if (config.dailyTradesAction === 'block_buys') lockBuys = true
    else if (config.dailyTradesAction === 'warn')
      warnings.push('Daily trade limit reached')
  }

  // Position size is a per-order check, not tracked cumulatively here.
  // It will be checked at order time if/when real exposure tracking is added.

  return { lockAll, lockBuys, warnings }
}

// ── Store ───────────────────────────────────────────────────────────

type RiskConfigStore = RiskConfig & {
  /** Update one or more config fields. Persists immediately. */
  updateConfig: (patch: Partial<RiskConfig>) => void
  /** Check if the current window has expired and reset if so. */
  checkWindowReset: () => void
  /** Increment trade count by 1. Persists immediately. */
  incrementTradeCount: () => void
  /** Add to daily P&L. Persists immediately. */
  addPnl: (amount: number) => void
  /** Clear all locks. Persists immediately. */
  unlock: () => void
  /**
   * Evaluate all limits vs tracked values, apply breach actions.
   * Returns warnings to display (for 'warn' actions).
   */
  checkAndLock: () => Array<string>
}

export const useRiskConfigStore = create<RiskConfigStore>((set, get) => {
  const initial = applyWindowReset(loadConfig())
  if (initial.windowStart !== loadConfig().windowStart) {
    // Window was reset during load — persist the reset
    saveConfig(initial)
  }

  return {
    ...initial,

    updateConfig: (patch) => {
      for (const setting of Object.keys(patch)) {
        track('risk_setting_changed', { setting })
      }
      set((state) => {
        const next = { ...state, ...patch }
        saveConfig(next)
        return next
      })
    },

    checkWindowReset: () => {
      const state = get()
      const reset = applyWindowReset(state)
      if (reset.windowStart !== state.windowStart) {
        set(reset)
        saveConfig(reset)
      }
    },

    incrementTradeCount: () => {
      set((state) => {
        const next = { ...state, dailyTradeCount: state.dailyTradeCount + 1 }
        saveConfig(next)
        return next
      })
    },

    addPnl: (amount) => {
      set((state) => {
        const next = { ...state, dailyPnl: state.dailyPnl + amount }
        saveConfig(next)
        return next
      })
    },

    unlock: () => {
      set((state) => {
        const next = {
          ...state,
          ordersLocked: false,
          buyOrdersLocked: false,
        }
        saveConfig(next)
        return next
      })
    },

    checkAndLock: () => {
      const state = get()
      const { lockAll, lockBuys, warnings } = evaluateBreaches(state)
      const needsUpdate =
        (lockAll && !state.ordersLocked) || (lockBuys && !state.buyOrdersLocked)

      if (needsUpdate) {
        set((prev) => {
          const next = {
            ...prev,
            ordersLocked: prev.ordersLocked || lockAll,
            buyOrdersLocked: prev.buyOrdersLocked || lockBuys,
          }
          saveConfig(next)
          return next
        })
      }

      return warnings
    },
  }
})

// Cross-window hydration: risk limits and lock state are guardrails that
// must hold app-wide — a breach lock tripped in one window has to block
// orders in every window immediately.
onHydrate((key, value) => {
  if (key !== 'risk-config' || !value || typeof value !== 'object') return
  useRiskConfigStore.setState({
    ...DEFAULTS,
    ...(value as Partial<RiskConfig>),
  })
})
