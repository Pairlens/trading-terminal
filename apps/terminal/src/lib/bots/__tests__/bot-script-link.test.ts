// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The delete flow, the bots UI and the runtime all decide "has this bot still
 * got a strategy?" through these two functions, so the answer cannot differ
 * between the screen that refuses to delete and the runtime that halts.
 */
import { describe, expect, test } from 'bun:test'

import { botsUsingScript, isScriptMissing } from '../bot-script-link'

const bots = [
  { id: 'b1', scriptId: 's1' },
  { id: 'b2', scriptId: 's2' },
  { id: 'b3', scriptId: 's1' },
]

describe('botsUsingScript', () => {
  test('finds every bot deployed from one script', () => {
    expect(botsUsingScript(bots, 's1').map((b) => b.id)).toEqual(['b1', 'b3'])
  })

  test('is empty for a script nothing was deployed from', () => {
    expect(botsUsingScript(bots, 's-none')).toEqual([])
  })
})

describe('isScriptMissing', () => {
  const loaded = { loaded: true, scripts: [{ id: 's1' }] }

  test('reports a deleted script', () => {
    expect(isScriptMissing(loaded, 's2')).toBe(true)
  })

  test('says nothing about a script that is still there', () => {
    expect(isScriptMissing(loaded, 's1')).toBe(false)
  })

  test('an unloaded store is not an empty one', () => {
    // The whole point: the store reads localStorage lazily, and calling every
    // bot orphaned in the meantime would disable them all — in the UI, and in
    // the runtime, which halts on this.
    expect(isScriptMissing({ loaded: false, scripts: [] }, 's1')).toBe(false)
  })
})
