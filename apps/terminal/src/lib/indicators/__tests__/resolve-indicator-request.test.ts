// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The assistant used to add indicators by sending a bare `{ type }` and
// letting the chart engine fill in the rest. The engine's fallback pane is
// `overlay` for everything except RSI, MACD, ATR and Volume, so a Python
// indicator declaring `pane='sub'` was drawn on the price axis: present in
// the engine, present in the chips, and invisible on the chart. These lock
// the resolver that closes that gap — pane and defaults resolved from the
// same tables the picker reads, and a script addressable by its title.
import { afterEach, describe, expect, it } from 'bun:test'

import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'

// Same specifiers the subject uses: this suite writes to a module singleton
// and asserts on what the subject read back, which only holds while both see
// one module record.
const { customIndicatorRegistry } =
  await import('@/lib/indicators/custom-indicator-registry')
const { resolveIndicatorRequest } =
  await import('@/lib/indicators/resolve-indicator-request')

const PROVIDER = 'user-indicators'

const meta = (over: Partial<CustomIndicatorMeta> = {}): CustomIndicatorMeta =>
  ({
    id: 'script_1',
    title: 'Memecoin Pulse',
    pane: 'sub',
    inputs: [
      { key: 'length', kind: 'int', label: 'Length', default: 14 },
      { key: 'smooth', kind: 'int', label: 'Smooth', default: 3 },
    ],
    series: [{ key: 'pulse', label: 'Pulse', kind: 'line' }],
    ...over,
  }) as CustomIndicatorMeta

const register = (over: Partial<CustomIndicatorMeta> = {}) => {
  customIndicatorRegistry.setProviderIndicators(PROVIDER, [
    { meta: meta(over), language: 'python', source: 'x = 1' },
  ])
}

afterEach(() => {
  customIndicatorRegistry.removeProvider(PROVIDER)
})

describe('resolveIndicatorRequest — built-ins', () => {
  it('puts a sub-pane oscillator in its own pane with its declared defaults', () => {
    expect(resolveIndicatorRequest('Stochastic')).toEqual({
      type: 'Stochastic',
      params: { kPeriod: 14, dPeriod: 3, smooth: 3 },
      pane: 'separate',
    })
  })

  it('keeps an overlay indicator on the price pane', () => {
    const resolved = resolveIndicatorRequest('EMA')
    expect(resolved.pane).toBe('overlay')
    expect(resolved.params).toEqual({ period: 20 })
  })

  it('folds the period shorthand onto the defaults', () => {
    expect(resolveIndicatorRequest('EMA', { period: 200 }).params).toEqual({
      period: 200,
    })
  })

  it('matches a type case-insensitively', () => {
    expect(resolveIndicatorRequest('bollingerbands').type).toBe(
      'BollingerBands',
    )
  })

  it('passes an unknown type through rather than refusing it', () => {
    // The engine's catalog is larger than the picker's table.
    expect(
      resolveIndicatorRequest('SomeEngineOnlyType', { period: 9 }),
    ).toEqual({ type: 'SomeEngineOnlyType', params: { period: 9 } })
  })
})

describe('resolveIndicatorRequest — custom indicators', () => {
  it('resolves a script by its full engine type, into its declared pane', () => {
    register()
    expect(resolveIndicatorRequest(`custom:${PROVIDER}:script_1`)).toEqual({
      type: `custom:${PROVIDER}:script_1`,
      params: { length: 14, smooth: 3 },
      pane: 'separate',
    })
  })

  it('resolves a script by its title', () => {
    register()
    const resolved = resolveIndicatorRequest('memecoin pulse')
    expect(resolved.type).toBe(`custom:${PROVIDER}:script_1`)
    expect(resolved.pane).toBe('separate')
  })

  it('resolves a script by its id', () => {
    register()
    expect(resolveIndicatorRequest('script_1').type).toBe(
      `custom:${PROVIDER}:script_1`,
    )
  })

  it('honours an overlay script', () => {
    register({ pane: 'overlay' })
    expect(resolveIndicatorRequest('script_1').pane).toBe('overlay')
  })

  it('overrides one input and leaves the rest at their defaults', () => {
    register()
    expect(
      resolveIndicatorRequest('script_1', { params: { length: 50 } }).params,
    ).toEqual({ length: 50, smooth: 3 })
  })

  it('drops a period shorthand the script has no input for', () => {
    register()
    expect(resolveIndicatorRequest('script_1', { period: 9 }).params).toEqual({
      length: 14,
      smooth: 3,
    })
  })

  it('never leaves an unregistered custom type on the price overlay', () => {
    // The definition can still arrive late (the engine recomputes on
    // register), but the pane cannot be corrected after the fact.
    expect(resolveIndicatorRequest('custom:some-plugin:rsi2').pane).toBe(
      'separate',
    )
  })
})
