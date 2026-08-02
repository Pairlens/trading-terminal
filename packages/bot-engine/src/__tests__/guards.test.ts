// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { applyFill, checkGuards } from '../guards'
import type { GuardContext } from '../guards'
import type { BotGuardState, GuardVerdict } from '../types'

function state(overrides: Partial<BotGuardState> = {}): BotGuardState {
  return {
    realizedToday: 0,
    dayStartEquity: 1000,
    tradesToday: 0,
    consecutiveLosses: 0,
    lastLossBarIndex: null,
    ...overrides,
  }
}

function ctx(overrides: Partial<GuardContext> = {}): GuardContext {
  return { intendedNotional: 100, barIndex: 100, equity: 1000, ...overrides }
}

/** Narrow to the blocked shape so a test that expected a block cannot pass. */
function blocked(verdict: GuardVerdict) {
  expect(verdict.allowed).toBe(false)
  if (verdict.allowed) throw new Error('expected a blocked verdict')
  return verdict
}

describe('checkGuards — nothing configured', () => {
  test('an empty config allows everything', () => {
    expect(checkGuards(state(), {}, ctx())).toEqual({ allowed: true })
  })

  test('zero-valued limits read as unconfigured', () => {
    const verdict = checkGuards(
      state({ tradesToday: 50, consecutiveLosses: 9 }),
      {
        maxDailyLossPercent: 0,
        maxTradesPerDay: 0,
        maxPositionQuote: 0,
        cooldownBars: 0,
        maxConsecutiveLosses: 0,
      },
      ctx(),
    )
    expect(verdict).toEqual({ allowed: true })
  })
})

describe('checkGuards — halting limits', () => {
  test('daily-loss blocks and halts once the cap is reached', () => {
    const verdict = blocked(
      checkGuards(
        state({ realizedToday: -50 }),
        { maxDailyLossPercent: 0.05 },
        ctx(),
      ),
    )
    expect(verdict.code).toBe('daily-loss')
    expect(verdict.halts).toBe(true)
    expect(verdict.detail).toContain('50.00')
  })

  test('daily-loss tolerates a loss one cent short of the cap', () => {
    expect(
      checkGuards(
        state({ realizedToday: -49.99 }),
        { maxDailyLossPercent: 0.05 },
        ctx(),
      ),
    ).toEqual({ allowed: true })
  })

  test('the cap is measured against the day-start equity, not what is left', () => {
    // Equity has halved intraday; the cap must still be 5% of 1000, otherwise
    // it shrinks with every loss and never actually stops the bot.
    const verdict = blocked(
      checkGuards(
        state({ realizedToday: -50, dayStartEquity: 1000 }),
        { maxDailyLossPercent: 0.05 },
        ctx({ equity: 500 }),
      ),
    )
    expect(verdict.code).toBe('daily-loss')
  })

  test('current equity is the fallback base before a day has started', () => {
    const verdict = blocked(
      checkGuards(
        state({ realizedToday: -100, dayStartEquity: 0 }),
        { maxDailyLossPercent: 0.05 },
        ctx({ equity: 1000 }),
      ),
    )
    expect(verdict.code).toBe('daily-loss')
  })

  test('a profitable day never trips the loss cap', () => {
    expect(
      checkGuards(
        state({ realizedToday: 250 }),
        { maxDailyLossPercent: 0.05 },
        ctx(),
      ),
    ).toEqual({ allowed: true })
  })

  test('loss-streak blocks and halts at the limit', () => {
    const verdict = blocked(
      checkGuards(
        state({ consecutiveLosses: 3 }),
        { maxConsecutiveLosses: 3 },
        ctx(),
      ),
    )
    expect(verdict.code).toBe('loss-streak')
    expect(verdict.halts).toBe(true)
  })

  test('loss-streak allows the trade one below the limit', () => {
    expect(
      checkGuards(
        state({ consecutiveLosses: 2 }),
        { maxConsecutiveLosses: 3 },
        ctx(),
      ),
    ).toEqual({ allowed: true })
  })
})

describe('checkGuards — skip-this-signal limits', () => {
  test('trade-cap blocks without halting', () => {
    const verdict = blocked(
      checkGuards(state({ tradesToday: 5 }), { maxTradesPerDay: 5 }, ctx()),
    )
    expect(verdict.code).toBe('trade-cap')
    expect(verdict.halts).toBe(false)
  })

  test('trade-cap allows the last trade under the cap', () => {
    expect(
      checkGuards(state({ tradesToday: 4 }), { maxTradesPerDay: 5 }, ctx()),
    ).toEqual({ allowed: true })
  })

  test('cooldown blocks without halting inside the window', () => {
    const verdict = blocked(
      checkGuards(
        state({ lastLossBarIndex: 10 }),
        { cooldownBars: 3 },
        ctx({ barIndex: 12 }),
      ),
    )
    expect(verdict.code).toBe('cooldown')
    expect(verdict.halts).toBe(false)
    expect(verdict.detail).toContain('2 of 3')
  })

  test('cooldown expires exactly on the nth bar', () => {
    expect(
      checkGuards(
        state({ lastLossBarIndex: 10 }),
        { cooldownBars: 3 },
        ctx({ barIndex: 13 }),
      ),
    ).toEqual({ allowed: true })
  })

  test('no recorded loss means no cooldown', () => {
    expect(
      checkGuards(
        state({ lastLossBarIndex: null }),
        { cooldownBars: 3 },
        ctx(),
      ),
    ).toEqual({ allowed: true })
  })

  test('position-cap blocks an oversized notional without halting', () => {
    const verdict = blocked(
      checkGuards(
        state(),
        { maxPositionQuote: 500 },
        ctx({ intendedNotional: 600 }),
      ),
    )
    expect(verdict.code).toBe('position-cap')
    expect(verdict.halts).toBe(false)
    expect(verdict.detail).toContain('600.00')
  })

  test('position-cap allows a notional exactly at the cap', () => {
    expect(
      checkGuards(
        state(),
        { maxPositionQuote: 500 },
        ctx({ intendedNotional: 500 }),
      ),
    ).toEqual({ allowed: true })
  })
})

describe('checkGuards — precedence', () => {
  test('a halting reason is reported over a transient one', () => {
    const verdict = blocked(
      checkGuards(
        state({ realizedToday: -100, lastLossBarIndex: 99, tradesToday: 9 }),
        {
          maxDailyLossPercent: 0.05,
          cooldownBars: 5,
          maxTradesPerDay: 5,
        },
        ctx({ barIndex: 100 }),
      ),
    )
    expect(verdict.code).toBe('daily-loss')
    expect(verdict.halts).toBe(true)
  })

  test('loss-streak outranks the trade cap', () => {
    const verdict = blocked(
      checkGuards(
        state({ consecutiveLosses: 4, tradesToday: 9 }),
        { maxConsecutiveLosses: 3, maxTradesPerDay: 5 },
        ctx(),
      ),
    )
    expect(verdict.code).toBe('loss-streak')
  })
})

describe('applyFill', () => {
  test('a loss accumulates P&L, counts the trade, extends the streak and starts the cooldown', () => {
    const next = applyFill(
      state({ realizedToday: -10, consecutiveLosses: 1 }),
      {
        realizedPnl: -25,
        barIndex: 77,
      },
    )
    expect(next.realizedToday).toBe(-35)
    expect(next.tradesToday).toBe(1)
    expect(next.consecutiveLosses).toBe(2)
    expect(next.lastLossBarIndex).toBe(77)
  })

  test('a win resets the streak', () => {
    const next = applyFill(
      state({ realizedToday: -35, consecutiveLosses: 4, lastLossBarIndex: 70 }),
      { realizedPnl: 60, barIndex: 80 },
    )
    expect(next.consecutiveLosses).toBe(0)
    expect(next.realizedToday).toBe(25)
  })

  test('a win does not clear the cooldown clock a loss started', () => {
    const next = applyFill(state({ lastLossBarIndex: 70 }), {
      realizedPnl: 60,
      barIndex: 80,
    })
    expect(next.lastLossBarIndex).toBe(70)
  })

  test('a scratched trade neither extends nor clears the streak', () => {
    const next = applyFill(state({ consecutiveLosses: 2 }), {
      realizedPnl: 0,
      barIndex: 80,
    })
    expect(next.consecutiveLosses).toBe(2)
    expect(next.lastLossBarIndex).toBe(null)
    expect(next.tradesToday).toBe(1)
  })

  test('is a pure reducer — the caller keeps its old state', () => {
    const before = state({ consecutiveLosses: 1 })
    const next = applyFill(before, { realizedPnl: -5, barIndex: 12 })
    expect(before).toEqual(state({ consecutiveLosses: 1 }))
    expect(next).not.toBe(before)
    expect(next.dayStartEquity).toBe(before.dayStartEquity)
  })

  test('folded fills eventually trip the guard they feed', () => {
    // The round trip that matters: three losses in a row, and the fourth
    // signal is refused before it becomes an order.
    let s = state()
    for (const barIndex of [10, 20, 30]) {
      s = applyFill(s, { realizedPnl: -20, barIndex })
    }
    const verdict = blocked(
      checkGuards(s, { maxConsecutiveLosses: 3 }, ctx({ barIndex: 40 })),
    )
    expect(verdict.code).toBe('loss-streak')
    expect(s.realizedToday).toBe(-60)
    expect(s.tradesToday).toBe(3)
  })
})
