// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

/**
 * Extended-hours routing is an opt-in that must stay narrow, and every part of
 * that narrowness is invisible to the type checker: `extendedHours` is just a
 * boolean on an untyped order-params bag, so nothing stops a refactor from
 * sending it on a market order, on a crypto venue, or from a toggle the user
 * left on last Tuesday.
 *
 * The venue-side contract is exercised for real in the Alpaca connector's
 * order-executor tests (limit only, no stops, composes with the fractional
 * DAY rule). What this file pins is the two tickets' wiring:
 *
 *   1. eligibility is equities AND a limit order, on both surfaces,
 *   2. the flag reaches `placeOrder` only when eligible,
 *   3. the toggle resets when eligibility is lost, and is not persisted.
 *
 * Both tickets are asserted because they are separate implementations of the
 * same promise, and the mobile one is easy to forget.
 */

const SRC = join(import.meta.dir, '..', '..', '..')

/** Source with comments stripped, so prose can't satisfy an assertion. */
function read(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const TICKETS = [
  ['desktop', 'components/terminal/trade-entry-panel.tsx'],
  ['mobile', 'mobile/panels/trade-panel.tsx'],
] as const

describe.each(TICKETS)('%s ticket — extended-hours wiring', (_name, path) => {
  const src = read(path)

  test('eligibility is equities AND a limit order', () => {
    expect(src).toContain(
      "marketInfo?.assetClasses?.includes('stocks') === true",
    )
    expect(src).toMatch(
      /extendedHoursEligible\s*=\s*isEquities && orderType === 'limit'/,
    )
  })

  test('the flag reaches placeOrder only when eligible', () => {
    // Both the user's toggle AND the eligibility gate, never one alone.
    expect(src).toMatch(/extendedHours && extendedHoursEligible/)
    // No unguarded assignment anywhere else in the ticket.
    const assignments = src.match(
      /extendedHours: true|'extendedHours'\] = true/g,
    )
    expect(assignments).toHaveLength(1)
  })

  test('the toggle clears itself when eligibility is lost', () => {
    expect(src).toMatch(
      /if \(!extendedHoursEligible && extendedHours\) setExtendedHours\(false\)/,
    )
  })

  test('the toggle is not persisted across orders', () => {
    // usePersistedState would carry a thin-session choice into tomorrow.
    expect(src).toContain('const [extendedHours, setExtendedHours] = useState')
    expect(src).not.toMatch(/usePersistedState[^\n]*extendedHours/i)
    expect(src).not.toMatch(/trade:extendedHours/)
  })

  test('the control is only rendered when eligible', () => {
    expect(src).toMatch(/\{extendedHoursEligible \?|\{extendedHoursEligible &&/)
  })
})
