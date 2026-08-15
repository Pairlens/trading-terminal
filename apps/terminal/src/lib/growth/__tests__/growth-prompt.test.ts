// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import {
  readEngagement,
  recordActiveDay,
  recordGrowthSignal,
} from '../engagement'
import {
  GLOBAL_SPACING_MS,
  MAX_ASKS,
  SESSION_SETTLE_MS,
  SNOOZE_MS,
  markPromptDone,
  markPromptOptedOut,
  markPromptShown,
  markPromptSnoozed,
  pickGrowthAction,
  promptAskCount,
} from '../growth-prompt'

// localStorage backing scoped to THIS file: installed here, restored in
// afterAll, so suites running later in the same bun process never see a
// browser-shaped global they didn't ask for.
const globals = globalThis as Record<string, unknown>
const hadStorage = 'localStorage' in globals
const priorStorage = globals.localStorage
const backing = new Map<string, string>()
globals.localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => {
    backing.set(k, String(v))
  },
  removeItem: (k: string) => {
    backing.delete(k)
  },
  clear: () => backing.clear(),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size
  },
} as Storage
afterAll(() => {
  if (hadStorage) globals.localStorage = priorStorage
  else delete globals.localStorage
})

const NOW = 1_800_000_000_000
/** A session old enough that the settle window is over. */
const SETTLED_SESSION = NOW - SESSION_SETTLE_MS - 1

/** Seed the tally directly — same shape engagement.ts persists. */
function seedEngagement(partial: Record<string, unknown>): void {
  backing.set(
    'pairlens:growth-engagement',
    JSON.stringify({
      v: 1,
      days: [],
      pairs: [],
      trades: 0,
      edits: 0,
      builds: 0,
      copilot: 0,
      ...partial,
    }),
  )
}

const TWO_DAYS = ['2026-08-10', '2026-08-14']

beforeEach(() => backing.clear())

describe('engagement recorder', () => {
  test('pair_opened accumulates distinct pairs and marks the day active', () => {
    recordGrowthSignal('pair_opened', { venue: 'okx', pair: 'BTC-USDT' })
    recordGrowthSignal('pair_opened', { venue: 'okx', pair: 'BTC-USDT' })
    recordGrowthSignal('pair_opened', { venue: 'okx', pair: 'ETH-USDT' })
    const stats = readEngagement()
    expect(stats.pairs).toEqual(['okx:BTC-USDT', 'okx:ETH-USDT'])
    expect(stats.days.length).toBe(1)
  })

  test('depth counters map events to the right axis', () => {
    recordGrowthSignal('trade_executed', {})
    recordGrowthSignal('panel_added', {})
    recordGrowthSignal('workspace_created', {})
    recordGrowthSignal('alert_created', {})
    recordGrowthSignal('copilot_message_sent', {})
    const stats = readEngagement()
    expect(stats.trades).toBe(1)
    expect(stats.edits).toBe(2)
    expect(stats.builds).toBe(1)
    expect(stats.copilot).toBe(1)
  })

  test('uncounted events write nothing', () => {
    recordGrowthSignal('timeframe_changed', { timeframe: '1h' })
    expect(backing.has('pairlens:growth-engagement')).toBe(false)
  })

  test('recordActiveDay dedupes the calendar day', () => {
    recordActiveDay()
    recordActiveDay()
    expect(readEngagement().days.length).toBe(1)
  })
})

describe('eligibility', () => {
  test('a fresh install is never prompted', () => {
    expect(pickGrowthAction(SETTLED_SESSION, NOW)).toBeNull()
  })

  test('the habit gate is non-negotiable: one day of heavy use is not enough', () => {
    seedEngagement({
      days: ['2026-08-14'],
      pairs: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5'],
      trades: 10,
      edits: 10,
      builds: 10,
      copilot: 10,
    })
    expect(pickGrowthAction(SETTLED_SESSION, NOW)).toBeNull()
  })

  test('two days plus any one depth signal qualifies', () => {
    for (const depth of [
      { pairs: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5'] },
      { trades: 3 },
      { edits: 2 },
      { builds: 2 },
      { copilot: 5 },
    ]) {
      backing.clear()
      seedEngagement({ days: TWO_DAYS, ...depth })
      expect(pickGrowthAction(SETTLED_SESSION, NOW)?.id).toBe('github-star')
    }
  })

  test('two days with shallow use everywhere stays silent', () => {
    seedEngagement({
      days: TWO_DAYS,
      pairs: ['a:1', 'a:2'],
      trades: 2,
      edits: 1,
      builds: 1,
      copilot: 4,
    })
    expect(pickGrowthAction(SETTLED_SESSION, NOW)).toBeNull()
  })
})

describe('pacing', () => {
  const eligible = () => seedEngagement({ days: TWO_DAYS, trades: 3 })

  test('never inside the session settle window', () => {
    eligible()
    expect(pickGrowthAction(NOW - SESSION_SETTLE_MS + 1000, NOW)).toBeNull()
    expect(pickGrowthAction(NOW - SESSION_SETTLE_MS - 1000, NOW)).not.toBeNull()
  })

  test('a shown prompt starts the global spacing window', () => {
    eligible()
    markPromptShown('github-star', NOW)
    // No snooze recorded: spacing alone must block the next pick.
    expect(
      pickGrowthAction(
        SETTLED_SESSION + GLOBAL_SPACING_MS - 1000,
        NOW + GLOBAL_SPACING_MS - 1000,
      ),
    ).toBeNull()
  })

  test('snooze holds for its full window, then the ask returns', () => {
    eligible()
    markPromptShown('github-star', NOW)
    markPromptSnoozed('github-star')
    const later = NOW + SNOOZE_MS - 1000
    expect(pickGrowthAction(later - SESSION_SETTLE_MS - 1, later)).toBeNull()
    const after = NOW + SNOOZE_MS + 1000
    expect(pickGrowthAction(after - SESSION_SETTLE_MS - 1, after)?.id).toBe(
      'github-star',
    )
  })

  test('done and opted-out are permanent', () => {
    for (const mark of [markPromptDone, markPromptOptedOut]) {
      backing.clear()
      eligible()
      mark('github-star')
      const after = NOW + SNOOZE_MS * 10
      expect(pickGrowthAction(after - SESSION_SETTLE_MS - 1, after)).toBeNull()
    }
  })

  test('after MAX_ASKS showings the action goes silent forever', () => {
    eligible()
    let now = NOW
    for (let i = 0; i < MAX_ASKS; i++) {
      markPromptShown('github-star', now)
      markPromptSnoozed('github-star')
      now += Math.max(GLOBAL_SPACING_MS, SNOOZE_MS) + 1000
    }
    expect(promptAskCount('github-star')).toBe(MAX_ASKS)
    expect(pickGrowthAction(now - SESSION_SETTLE_MS - 1, now)).toBeNull()
  })
})
