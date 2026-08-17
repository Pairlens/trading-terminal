// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The derived event fields, pinned.
 *
 * All of them exist because ccxt drops them: `parsePredictionTicker` sets
 * `change` to undefined on either venue even where the raw payload carries the
 * previous price, and `parseMarket` hardcodes `created: undefined` on both. The
 * failure a user notices is a board that ranks by nonsense — a cold market
 * whose previous price is zero-filled reporting a 43-point overnight move, a No
 * leg painted green while its Yes leg fell, or a zero-filled timestamp dating a
 * market to 1970 at the bottom of a "New" sort.
 */
import { describe, expect, it } from 'bun:test'

import {
  marketChange24h,
  marketCreatedMs,
  marketRules,
  outcomeChange24h,
  outcomeChangeSign,
} from '../derived'

describe('marketChange24h', () => {
  it('takes Polymarket at its word — the delta is already signed and in units', () => {
    expect(marketChange24h({ oneDayPriceChange: 0.072 })).toBe(0.072)
    expect(marketChange24h({ oneDayPriceChange: '-0.0005' })).toBe(-0.0005)
  })

  it('subtracts the Kalshi endpoints', () => {
    expect(
      marketChange24h({
        last_price_dollars: '0.1980',
        previous_price_dollars: '0.1110',
      }),
    ).toBeCloseTo(0.087, 10)
  })

  it('refuses the zero-filled previous price a cold Kalshi market reports', () => {
    // The bug this prevents: 43¢ with no trade in the window would otherwise
    // rank first on a movers board with "+43 pts".
    expect(
      marketChange24h({
        last_price_dollars: '0.4300',
        previous_price_dollars: '0.0000',
      }),
    ).toBeUndefined()
  })

  it('has nothing to say when neither shape is present', () => {
    expect(marketChange24h({})).toBeUndefined()
    expect(marketChange24h({ last_price_dollars: '0.43' })).toBeUndefined()
    expect(marketChange24h({ oneDayPriceChange: 'n/a' })).toBeUndefined()
  })

  it('prefers the stated delta over a derivable one', () => {
    expect(
      marketChange24h({
        oneDayPriceChange: 0.01,
        last_price_dollars: '0.9',
        previous_price_dollars: '0.1',
      }),
    ).toBe(0.01)
  })
})

describe('marketCreatedMs', () => {
  it('reads the Polymarket creation instant', () => {
    // Field names measured against gamma /events on 2026-08-17.
    expect(marketCreatedMs({ createdAt: '2026-08-13T12:30:06.012391Z' })).toBe(
      Date.parse('2026-08-13T12:30:06.012Z'),
    )
  })

  it('falls back to the Polymarket trading window', () => {
    expect(marketCreatedMs({ startDate: '2026-08-13T12:30:27Z' })).toBe(
      Date.parse('2026-08-13T12:30:27Z'),
    )
  })

  it('prefers the creation instant over the window', () => {
    expect(
      marketCreatedMs({
        createdAt: '2026-08-13T12:30:06Z',
        startDate: '2026-08-14T00:00:00Z',
      }),
    ).toBe(Date.parse('2026-08-13T12:30:06Z'))
  })

  it('reads the Kalshi open time', () => {
    expect(marketCreatedMs({ open_time: '2026-08-17T17:34:53Z' })).toBe(
      Date.parse('2026-08-17T17:34:53Z'),
    )
  })

  it('ignores the Kalshi record birthday, zero-filled or not', () => {
    // Kalshi publishes `created_time: "0001-01-01T00:00:00Z"` on markets it has
    // not opened, and it can precede the listing by days when it is real. The
    // listing instant is the one a "New" sort means.
    expect(
      marketCreatedMs({ created_time: '0001-01-01T00:00:00Z' }),
    ).toBeUndefined()
    expect(
      marketCreatedMs({ created_time: '2026-06-05T17:55:43.779104Z' }),
    ).toBeUndefined()
  })

  it('refuses a timestamp at or before the epoch rather than dating it to 1970', () => {
    expect(
      marketCreatedMs({ open_time: '1970-01-01T00:00:00Z' }),
    ).toBeUndefined()
    expect(
      marketCreatedMs({ createdAt: '0001-01-01T00:00:00Z' }),
    ).toBeUndefined()
  })

  it('refuses a bare epoch, because seconds and milliseconds look alike', () => {
    expect(marketCreatedMs({ createdAt: 1_755_449_693_000 })).toBeUndefined()
    expect(marketCreatedMs({ open_time: 1_755_449_693 })).toBeUndefined()
  })

  it('has nothing to say about garbage or absence', () => {
    expect(marketCreatedMs({})).toBeUndefined()
    expect(marketCreatedMs({ createdAt: 'soon' })).toBeUndefined()
    expect(marketCreatedMs({ createdAt: '' })).toBeUndefined()
    expect(marketCreatedMs({ open_time: '   ' })).toBeUndefined()
    expect(marketCreatedMs({ createdAt: null })).toBeUndefined()
  })
})

describe('outcomeChangeSign', () => {
  it('reads the venue label first', () => {
    expect(outcomeChangeSign('Yes', 0, 2)).toBe(1)
    expect(outcomeChangeSign('No', 1, 2)).toBe(-1)
    expect(outcomeChangeSign('no', 0, 2)).toBe(-1)
  })

  it('falls back to position for a candidate pair', () => {
    expect(outcomeChangeSign('Newsom', 0, 2)).toBe(1)
    expect(outcomeChangeSign('Shapiro', 1, 2)).toBe(-1)
  })

  it('declines to split one number between three legs', () => {
    expect(outcomeChangeSign('Yes', 0, 3)).toBe(0)
    expect(outcomeChangeSign('Yes', 0, 1)).toBe(0)
  })
})

describe('outcomeChange24h', () => {
  it('mirrors the move onto the complement leg', () => {
    expect(outcomeChange24h(0.06, 'Yes', 0, 2)).toBe(0.06)
    expect(outcomeChange24h(0.06, 'No', 1, 2)).toBe(-0.06)
  })

  it('never produces negative zero', () => {
    // `-0` formats as "-0.0¢" and reads as a fall that did not happen.
    expect(Object.is(outcomeChange24h(0, 'No', 1, 2), -0)).toBe(false)
    expect(outcomeChange24h(0, 'No', 1, 2)).toBe(0)
  })

  it('passes through the absences rather than defaulting to flat', () => {
    expect(outcomeChange24h(undefined, 'Yes', 0, 2)).toBeUndefined()
    expect(outcomeChange24h(Number.NaN, 'Yes', 0, 2)).toBeUndefined()
    expect(outcomeChange24h(0.06, 'Powell', 0, 3)).toBeUndefined()
  })
})

describe('marketRules', () => {
  it('joins the Kalshi pair, criterion first', () => {
    expect(
      marketRules({
        rules_primary: 'If the FOMC lowers the target range, then Yes.',
        rules_secondary: 'An unscheduled meeting counts.',
      }),
    ).toBe(
      'If the FOMC lowers the target range, then Yes.\n\nAn unscheduled meeting counts.',
    )
  })

  it('keeps a primary clause that stands alone', () => {
    expect(marketRules({ rules_primary: 'Resolves to the BLS print.' })).toBe(
      'Resolves to the BLS print.',
    )
  })

  it('falls back to the Polymarket description', () => {
    expect(
      marketRules({ description: 'This market resolves to Yes if…' }),
    ).toBe('This market resolves to Yes if…')
  })

  it('refuses an implausibly long blob rather than truncating it', () => {
    // A half-quoted resolution rule is worse than none: it is the text a
    // dispute is settled against.
    expect(marketRules({ description: 'x'.repeat(4001) })).toBe('')
  })

  it('says nothing when the venue said nothing', () => {
    expect(marketRules({})).toBe('')
    expect(marketRules({ description: '   ' })).toBe('')
  })
})
