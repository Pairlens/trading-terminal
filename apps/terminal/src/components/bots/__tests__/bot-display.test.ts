// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `requestBotToggle` decides whether flicking a switch starts real trading or
 * opens the arming dialog. It is shared by the sidebar row and the detail
 * header precisely so the two cannot disagree, and these tests are what stop a
 * future third caller from quietly getting it wrong.
 */
import { describe, expect, test } from 'bun:test'

import {
  TONE_FILL,
  TONE_SELECTED,
  requestBotToggle,
  rowTone,
  statusDotClass,
  statusLabelKey,
} from '../bot-display'

type Calls = { enabled: Array<[string, boolean]>; armed: number }

function run(
  bot: { id: string; mode: 'paper' | 'live'; needsRearm?: boolean },
  checked: boolean,
): Calls {
  const calls: Calls = { enabled: [], armed: 0 }
  requestBotToggle(bot, checked, {
    setEnabled: (id, value) => calls.enabled.push([id, value]),
    requestArm: () => {
      calls.armed += 1
    },
  })
  return calls
}

describe('requestBotToggle', () => {
  test('starts a paper bot directly — nothing is at stake', () => {
    const calls = run({ id: 'b1', mode: 'paper' }, true)
    expect(calls.enabled).toEqual([['b1', true]])
    expect(calls.armed).toBe(0)
  })

  test('routes a live bot through the arming dialog instead of starting it', () => {
    const calls = run({ id: 'b1', mode: 'live' }, true)
    expect(calls.armed).toBe(1)
    // Critically, it must NOT have enabled the bot as well.
    expect(calls.enabled).toEqual([])
  })

  test('treats a bot awaiting re-arm as live even in paper mode', () => {
    // `needsRearm` is only ever set on a live bot that came back from a
    // restart, so honouring the flag over the mode is the safe reading.
    const calls = run({ id: 'b1', mode: 'paper', needsRearm: true }, true)
    expect(calls.armed).toBe(1)
    expect(calls.enabled).toEqual([])
  })

  test('turning off is always immediate, whatever the mode', () => {
    for (const mode of ['paper', 'live'] as const) {
      const calls = run({ id: 'b1', mode, needsRearm: true }, false)
      expect(calls.enabled).toEqual([['b1', false]])
      expect(calls.armed).toBe(0)
    }
  })
})

describe('rowTone', () => {
  test('only a bot that is actually trading reads as active', () => {
    expect(rowTone('running', false)).toBe('active')
    expect(rowTone('warming-up', false)).toBe('active')
  })

  test('a halted or errored bot never shares the active tone', () => {
    // The row's fill is the only status signal left in the list, so these
    // must not be able to collapse into "looks fine".
    expect(rowTone('halted', false)).toBe('attention')
    expect(rowTone('error', false)).toBe('error')
    expect(rowTone('stopped', false)).toBe('idle')
  })

  test('awaiting re-arm outranks the status underneath it', () => {
    // Such a bot is 'stopped', but stopped pending a decision — it must not
    // blend in with the ones deliberately switched off.
    expect(rowTone('stopped', true)).toBe('attention')
    expect(rowTone('running', true)).toBe('attention')
  })

  test('every tone has both a resting and a selected fill', () => {
    for (const tone of ['active', 'attention', 'error', 'idle'] as const) {
      expect(TONE_FILL[tone]).toBeTruthy()
      expect(TONE_SELECTED[tone]).toBeTruthy()
    }
  })
})

describe('status vocabulary', () => {
  test('only running wears the up-token green', () => {
    expect(statusDotClass('running')).toContain('bg-up')
    for (const status of [
      'stopped',
      'error',
      'halted',
      'warming-up',
    ] as const) {
      expect(statusDotClass(status)).not.toContain('bg-up')
    }
  })

  test('every status has its own label key', () => {
    const keys = (
      ['running', 'warming-up', 'error', 'halted', 'stopped'] as const
    ).map(statusLabelKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
