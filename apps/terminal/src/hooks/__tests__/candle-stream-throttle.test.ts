// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The availability probe must never turn a rate limit into a verdict.
 *
 * `useCandleStream` is the only place in the terminal that decides a venue does
 * not carry a pair, and the decision is published to a session store every pane
 * reads. For a DEX pair there is no venue-specific history endpoint to ask, so
 * the decision rests entirely on silence — and a throttled GeckoTerminal is
 * silent. That is the reproduced defect: with the free tier limited, opening
 * SOL-USDC on Jupiter rendered "SOL-USDC isn't available on Jupiter", and the
 * verdict outlived the limit.
 *
 * These are source invariants rather than a rendered hook: the decision lives
 * inside an effect over four timers and two async paths, and the terminal has no
 * React test renderer. What they pin is the ORDERING that makes the fix work,
 * which is the part a later edit can silently undo. The behaviour underneath
 * them is unit-tested where it is pure: `provider-throttle.test.ts` in
 * market-engine, and `throttle-propagation.test.ts` in the GeckoTerminal
 * provider.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  isProviderThrottled,
  noteProviderThrottled,
  resetProviderThrottles,
} from '@pairlens/market-engine/provider-throttle'

const SOURCE = readFileSync(
  join(import.meta.dir, '..', 'use-candle-stream.ts'),
  'utf8',
)

/** The body of the one function that publishes the verdict. */
const markUnavailableBody = (() => {
  const start = SOURCE.indexOf('const markUnavailable = ')
  expect(start).toBeGreaterThan(-1)
  return SOURCE.slice(start, SOURCE.indexOf('\n    }', start))
})()

/** The probe's rejection handler, where a refusal is read as a verdict. */
const probeCatchBody = (() => {
  const start = SOURCE.indexOf('.catch((err: unknown) => {')
  expect(start).toBeGreaterThan(-1)
  return SOURCE.slice(start, SOURCE.indexOf('\n        })', start))
})()

describe('the throttle check the verdict depends on', () => {
  test('the hook reads the shared throttle registry', () => {
    // Written by the DEX data providers, read here. Without this import the
    // terminal has no way to tell a cooling-off provider from an unlisted pair.
    expect(SOURCE).toContain("from '@pairlens/market-engine/provider-throttle'")
    expect(SOURCE).toContain('isProviderThrottled')
  })

  test('the silence backstop checks the throttle before deciding', () => {
    const armBody = SOURCE.slice(
      SOURCE.indexOf('function armNoDataTimer'),
      SOURCE.indexOf('function deferVerdict'),
    )
    const check = armBody.indexOf('isProviderThrottled()')
    const decide = armBody.indexOf('markUnavailable()')
    expect(check).toBeGreaterThan(-1)
    expect(decide).toBeGreaterThan(check)
  })

  test('the deferral is bounded, so it cannot become an endless spinner', () => {
    // Deferring forever would trade a wrong answer for no answer. After the
    // cap the verdict lands exactly as it did before this fix.
    expect(SOURCE).toContain('MAX_THROTTLE_DEFERRALS')
    const deferBody = SOURCE.slice(
      SOURCE.indexOf('function deferVerdict'),
      SOURCE.indexOf('const markUnavailable'),
    )
    expect(deferBody).toContain('throttleDeferrals >= MAX_THROTTLE_DEFERRALS')
    expect(deferBody).toContain('throttleDeferrals += 1')
  })
})

describe('the probe rejection path', () => {
  test('a typed throttle is handled before the catch-all verdict', () => {
    // The catch-all at the bottom of this handler is what publishes "the venue
    // refuses this market". A throttle reaching it is the defect.
    const throttle = probeCatchBody.indexOf('isProviderThrottledError(err)')
    const verdict = probeCatchBody.lastIndexOf('markUnavailable()')
    expect(throttle).toBeGreaterThan(-1)
    expect(verdict).toBeGreaterThan(throttle)
  })

  test('the throttle branch returns rather than falling through', () => {
    const branch = probeCatchBody.slice(
      probeCatchBody.indexOf('isProviderThrottledError(err)'),
    )
    const firstReturn = branch.indexOf('return')
    const fallThrough = branch.indexOf('markUnavailable()')
    expect(firstReturn).toBeGreaterThan(-1)
    expect(fallThrough).toBeGreaterThan(firstReturn)
  })

  test('a throttle never settles the question', () => {
    // `resolved = true` closes the question for the life of the subscription.
    // A cooling-off provider has not answered it, so the branch must not set it.
    const branch = probeCatchBody.slice(
      probeCatchBody.indexOf('isProviderThrottledError(err)'),
      probeCatchBody.indexOf('isGeoRestrictedError(err)'),
    )
    expect(branch).not.toContain('resolved = true')
    expect(branch).toContain('deferVerdict()')
  })
})

describe('what the verdict itself still does', () => {
  test('it publishes to the shared store, unchanged', () => {
    // The fix is about WHEN the verdict is published, never about whether the
    // panes still agree on it.
    expect(markUnavailableBody).toContain('setNoData(true)')
    expect(markUnavailableBody).toContain(
      'usePairAvailabilityStore.getState().report(market, normalizedPairKey)',
    )
  })

  test('an empty probe answer is still a verdict, with no deferral', () => {
    // A venue that ANSWERED, emptily, has told us something. Deferring that
    // would hide a real empty state behind a spinner.
    const thenBody = SOURCE.slice(
      SOURCE.indexOf('.then((probed) => {'),
      SOURCE.indexOf('.catch((err: unknown) => {'),
    )
    expect(thenBody).toContain('if (probed.length === 0) markUnavailable()')
    expect(thenBody).not.toContain('deferVerdict')
  })
})

describe('the registry read the hook performs', () => {
  test('a provider-wide cool-off is visible without naming the provider', () => {
    // The hook cannot name the provider serving a DEX market: GeckoTerminal
    // declares `markets: ['*']`, so nothing maps `jupiter` to it. The wildcard
    // read is what makes the check possible at all.
    resetProviderThrottles()
    expect(isProviderThrottled()).toBe(false)
    noteProviderThrottled('GeckoTerminal', 20_000)
    expect(isProviderThrottled()).toBe(true)
    resetProviderThrottles()
    expect(isProviderThrottled()).toBe(false)
  })
})
