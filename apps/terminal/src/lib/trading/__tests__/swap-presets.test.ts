// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_SWAP_PRESETS,
  MAX_SLIPPAGE_BPS,
  clampPresetIndex,
  defaultPresetIndexFor,
  formatSlippage,
  normalizeSwapPresets,
  swapExecutionOf,
} from '../swap-presets'

describe('normalizeSwapPresets', () => {
  test('nothing stored is the three defaults', () => {
    expect(normalizeSwapPresets(null)).toEqual(DEFAULT_SWAP_PRESETS)
    expect(normalizeSwapPresets('garbage')).toEqual(DEFAULT_SWAP_PRESETS)
  })

  test('a corrupt slot degrades to its own default, not to slot one', () => {
    const out = normalizeSwapPresets([
      { slippageBps: 250 },
      'nope',
      { mev: 'sideways', priorityLevel: 'extreme', tipSol: -3 },
    ])
    expect(out[0].slippageBps).toBe(250)
    expect(out[0].mev).toBe('off')
    expect(out[1]).toEqual(DEFAULT_SWAP_PRESETS[1])
    expect(out[2].mev).toBe('secure')
    expect(out[2].priorityLevel).toBe('veryHigh')
    expect(out[2].tipSol).toBe(DEFAULT_SWAP_PRESETS[2].tipSol)
  })

  test('slippage is clamped to the floor it can still protect', () => {
    const out = normalizeSwapPresets([{ slippageBps: 99_000 }, {}, {}])
    expect(out[0].slippageBps).toBe(MAX_SLIPPAGE_BPS)
    expect(normalizeSwapPresets([{ slippageBps: 0 }])[0].slippageBps).toBe(1)
  })

  test('an explicit null priority level means auto and survives', () => {
    const out = normalizeSwapPresets([{}, { priorityLevel: null }, {}])
    expect(out[1].priorityLevel).toBeNull()
  })

  test('names are trimmed and capped', () => {
    const out = normalizeSwapPresets([
      { name: '   ' },
      { name: 'x'.repeat(40) },
    ])
    expect(out[0].name).toBeNull()
    expect(out[1].name).toHaveLength(24)
  })
})

describe('swapExecutionOf', () => {
  test('the public lane carries no tip', () => {
    expect(swapExecutionOf(DEFAULT_SWAP_PRESETS[0])).toEqual({ mev: 'off' })
  })

  test('a priority level carries its cap in lamports', () => {
    expect(
      swapExecutionOf({
        ...DEFAULT_SWAP_PRESETS[0],
        priorityLevel: 'high',
        maxPriorityFeeSol: 0.005,
      }),
    ).toEqual({
      mev: 'off',
      priorityLevel: 'high',
      maxPriorityFeeLamports: 5_000_000,
    })
  })

  test('a private lane carries the tip in lamports', () => {
    expect(swapExecutionOf(DEFAULT_SWAP_PRESETS[2])).toEqual({
      mev: 'secure',
      priorityLevel: 'veryHigh',
      maxPriorityFeeLamports: 20_000_000,
      tipLamports: 5_000_000,
    })
  })
})

describe('slots', () => {
  test('memecoins start on Fast, everything else on Normal', () => {
    expect(defaultPresetIndexFor('memecoin')).toBe(1)
    expect(defaultPresetIndexFor('dex')).toBe(0)
    expect(defaultPresetIndexFor(undefined)).toBe(0)
  })

  test('an index outside the three slots is not an index', () => {
    expect(clampPresetIndex(2)).toBe(2)
    expect(clampPresetIndex(3)).toBeNull()
    expect(clampPresetIndex(-1)).toBeNull()
    expect(clampPresetIndex('1')).toBeNull()
  })

  test('slippage formats without trailing zeros', () => {
    expect(formatSlippage(50)).toBe('0.5%')
    expect(formatSlippage(2000)).toBe('20%')
  })
})
