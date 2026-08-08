// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, mock, test } from 'bun:test'

/**
 * The mobile ticket must not be able to commit an order that the user's own
 * risk configuration refuses.
 *
 * That guarantee is a chain of three links, and every one of them is invisible
 * to the type checker:
 *
 *   1. `useTradeRisk` turns (order, portfolio, cap, action) into `blocks`.
 *   2. the ticket folds `blocks` into `canSubmit` and hands `!canSubmit` to
 *      `TradeSlideConfirm` — and refuses again inside `handleSubmit`, so a
 *      stale render cannot slip an order through.
 *   3. `useHoldConfirm` refuses both of its entry points while disabled, so a
 *      disabled bar cannot fire on a press OR on a click.
 *
 * Link 1 is exercised for real below. Links 2 and 3 are wiring, and wiring is
 * what silently rots: this file pins the shape so that deleting `!riskBlocks`
 * from the gate, or dropping `disabled` on the way to the hook, fails here
 * instead of in production.
 *
 * (The "`placeOrder` is the only exit" assertions live in
 * `order-draft-store.test.ts` and are deliberately not repeated.)
 */

// ── Link 1: the real verdict ──────────────────────────────────────────
//
// `useTradeRisk` reads two hooks and is otherwise pure. Replacing exactly
// those two makes it an ordinary function, so the arithmetic under test is the
// shipped arithmetic — `orderNotionalUsd` and `evaluatePositionSize` are NOT
// mocked, and neither is the block policy.

type Portfolio = { totalValueUsd: number; priceUsd: Map<string, number> }
type RiskConfig = {
  maxPositionSize: number
  positionSizeAction: 'warn' | 'block_buys' | 'block_all'
}

let portfolio: Portfolio = {
  totalValueUsd: 10_000,
  priceUsd: new Map([['BTC', 60_000]]),
}
let riskConfig: RiskConfig = {
  maxPositionSize: 2,
  positionSizeAction: 'block_all',
}

// `mock.module` is process-wide in bun, and handing back a partial namespace
// would delete every other export for the rest of the run. Capture the real
// modules, spread them, and put them back — the same discipline
// `stores/__tests__/credentials-store-vault.test.ts` documents.
const realPortfolio = { ...(await import('@/hooks/use-portfolio-value')) }
const realRiskStore = { ...(await import('@/stores/risk-config-store')) }

mock.module('@/hooks/use-portfolio-value', () => ({
  ...realPortfolio,
  usePortfolioValue: () => portfolio,
}))
mock.module('@/stores/risk-config-store', () => ({
  ...realRiskStore,
  useRiskConfigStore: <T>(selector: (state: RiskConfig) => T): T =>
    selector(riskConfig),
}))

const { useTradeRisk } = await import('../panels/trade-risk-row')

afterAll(() => {
  mock.module('@/hooks/use-portfolio-value', () => realPortfolio)
  mock.module('@/stores/risk-config-store', () => realRiskStore)
})

/** A buy sized in the quote currency, so notional needs no price at all. */
function quoteOrder(size: number, side: 'buy' | 'sell' = 'buy') {
  return {
    pairKey: 'BTC-USDT',
    side,
    size,
    quoteDenominated: true,
    price: null,
  }
}

describe('risk verdict', () => {
  test('an order inside the cap neither exceeds nor blocks', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'block_all' }
    const verdict = useTradeRisk(quoteOrder(150))

    expect(verdict.ratioPct).toBeCloseTo(1.5, 6)
    expect(verdict.capPct).toBe(2)
    expect(verdict.exceeds).toBe(false)
    expect(verdict.blocks).toBe(false)
  })

  test('over the cap with block_all blocks either side', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'block_all' }

    const buy = useTradeRisk(quoteOrder(500, 'buy'))
    expect(buy.exceeds).toBe(true)
    expect(buy.blocks).toBe(true)

    const sell = useTradeRisk(quoteOrder(500, 'sell'))
    expect(sell.exceeds).toBe(true)
    expect(sell.blocks).toBe(true)
  })

  test('block_buys blocks a buy and lets a sell out', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'block_buys' }

    expect(useTradeRisk(quoteOrder(500, 'buy')).blocks).toBe(true)
    // Closing a position that is already too big must never be the thing the
    // size limit prevents.
    const sell = useTradeRisk(quoteOrder(500, 'sell'))
    expect(sell.exceeds).toBe(true)
    expect(sell.blocks).toBe(false)
  })

  test('warn colours the row without stopping the order', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'warn' }
    const verdict = useTradeRisk(quoteOrder(500))

    expect(verdict.exceeds).toBe(true)
    expect(verdict.blocks).toBe(false)
  })

  test('no cap configured never blocks, and still reports the share', () => {
    riskConfig = { maxPositionSize: 0, positionSizeAction: 'block_all' }
    const verdict = useTradeRisk(quoteOrder(9_000))

    expect(verdict.capPct).toBe(0)
    expect(verdict.exceeds).toBe(false)
    expect(verdict.blocks).toBe(false)
    expect(verdict.ratioPct).toBeCloseTo(90, 6)
  })

  test('an unpriceable order fails OPEN rather than blocking', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'block_all' }
    // Base-denominated, no limit price, and no USD price for either leg.
    const verdict = useTradeRisk({
      pairKey: 'WIF-MOODENG',
      side: 'buy',
      size: 1_000_000,
      quoteDenominated: false,
      price: null,
    })

    expect(verdict.ratioPct).toBeNull()
    expect(verdict.exceeds).toBe(false)
    expect(verdict.blocks).toBe(false)
  })

  test('an empty portfolio cannot manufacture a block', () => {
    riskConfig = { maxPositionSize: 2, positionSizeAction: 'block_all' }
    portfolio = { totalValueUsd: 0, priceUsd: new Map() }
    const verdict = useTradeRisk(quoteOrder(500))

    expect(verdict.exceeds).toBe(false)
    expect(verdict.blocks).toBe(false)
    expect(verdict.ratioPct).toBeNull()

    portfolio = { totalValueUsd: 10_000, priceUsd: new Map([['BTC', 60_000]]) }
  })
})

// ── Links 2 and 3: the wiring that carries the verdict to the bar ──────

const MOBILE_ROOT = join(import.meta.dir, '..')

function read(relative: string): string {
  return readFileSync(join(MOBILE_ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the ticket cannot submit while risk blocks', () => {
  const ticket = read('panels/trade-panel.tsx')
  const slide = read('panels/trade-slide-confirm.tsx')
  const holdConfirm = readFileSync(
    join(MOBILE_ROOT, '..', 'hooks', 'use-trade-confirm.ts'),
    'utf8',
  )

  test('the verdict reaches the ticket and nothing else does', () => {
    // The row reports one bit upward, on change — see trade-risk-row's header
    // for why the ticket must not own the hook itself.
    expect(ticket).toContain('onBlocksChange={setRiskBlocks}')
  })

  test('riskBlocks is a conjunct of canSubmit', () => {
    const gate = /const canSubmit\s*=([\s\S]*?)\n\n/.exec(ticket)?.[1] ?? ''
    expect(gate).not.toBe('')
    expect(gate).toContain('!riskBlocks')
    // The other guards the bar depends on, so a rewrite that drops one is
    // caught here too.
    expect(gate).toContain('!needsConnect')
    expect(gate).toContain('!submitting')
    expect(gate).toContain('sizeNumber > 0')
  })

  test('the submit handler refuses again, after the render', () => {
    expect(ticket).toMatch(
      /handleSubmit = useCallback\(async \(\) => \{\s*if \(!canSubmit\) return/,
    )
  })

  test('the slide bar is disabled by the same gate', () => {
    const props = /<TradeSlideConfirm([\s\S]*?)\/>/.exec(ticket)?.[1] ?? ''
    expect(props).not.toBe('')
    expect(props).toContain('disabled={!canSubmit}')
  })

  test('the bar hands disabled to the hook AND to the button', () => {
    expect(slide).toMatch(/useHoldConfirm\(\{[\s\S]*?disabled,[\s\S]*?\}\)/)
    expect(slide).toContain(
      'const blocked = Boolean(disabled) || Boolean(busy)',
    )
    expect(slide).toContain('disabled={blocked}')
  })

  test('the confirm gesture refuses both of its entry points', () => {
    // A hold that starts and a click that lands are two independent ways to
    // commit; guarding only one would leave the disabled bar firing on tap.
    const press = /const onPointerDown = useCallback\(([\s\S]*?)\n {2}\)/.exec(
      holdConfirm,
    )?.[1]
    const click = /const onClick = useCallback\(([\s\S]*?)\n {2}\)/.exec(
      holdConfirm,
    )?.[1]
    expect(press).toContain('if (blocked) return')
    expect(click).toContain('if (blocked) return')
  })
})
