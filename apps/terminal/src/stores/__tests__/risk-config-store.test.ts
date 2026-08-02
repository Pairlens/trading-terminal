// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, describe, expect, it } from 'bun:test'
import { useRiskConfigStore } from '../risk-config-store'

// The store is a module singleton; reset to a known state before each assertion.
function reset() {
  useRiskConfigStore.getState().updateConfig({
    maxDailyLoss: 0,
    maxDailyTrades: 0,
    dailyLossAction: 'off',
    dailyTradesAction: 'off',
    dailyPnl: 0,
    dailyTradeCount: 0,
    ordersLocked: false,
    buyOrdersLocked: false,
    windowStart: 1_700_000_000_000,
    resetInterval: 'daily',
  })
}

afterEach(reset)

describe('daily-loss guard — now driven by realized PnL', () => {
  it('locks all orders once a net loss reaches the limit', () => {
    reset()
    useRiskConfigStore
      .getState()
      .updateConfig({ maxDailyLoss: 100, dailyLossAction: 'block_all' })

    // A loss below the limit does not lock.
    useRiskConfigStore.getState().addPnl(-50)
    useRiskConfigStore.getState().checkAndLock()
    expect(useRiskConfigStore.getState().ordersLocked).toBe(false)

    // Crossing the limit locks.
    useRiskConfigStore.getState().addPnl(-60) // dailyPnl now -110
    useRiskConfigStore.getState().checkAndLock()
    expect(useRiskConfigStore.getState().ordersLocked).toBe(true)
  })

  it('does NOT lock after a large profit (the old Math.abs bug)', () => {
    reset()
    useRiskConfigStore
      .getState()
      .updateConfig({ maxDailyLoss: 100, dailyLossAction: 'block_all' })

    useRiskConfigStore.getState().addPnl(+500) // big gain
    useRiskConfigStore.getState().checkAndLock()
    expect(useRiskConfigStore.getState().ordersLocked).toBe(false)
  })

  it('block_buys locks only buys', () => {
    reset()
    useRiskConfigStore
      .getState()
      .updateConfig({ maxDailyLoss: 100, dailyLossAction: 'block_buys' })
    useRiskConfigStore.getState().addPnl(-150)
    useRiskConfigStore.getState().checkAndLock()
    expect(useRiskConfigStore.getState().buyOrdersLocked).toBe(true)
    expect(useRiskConfigStore.getState().ordersLocked).toBe(false)
  })
})
