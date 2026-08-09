// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { stackWithOverlay } from '../lib/overlay-stack'
import type { MobileOverlay } from '../mobile-focus-context'

const pair = (
  extra?: Partial<Extract<MobileOverlay, { kind: 'pairPicker' }>>,
) => ({ kind: 'pairPicker', ...extra }) as MobileOverlay
const venue = () => ({ kind: 'venuePicker' }) as MobileOverlay
const settings = () => ({ kind: 'settings' }) as MobileOverlay

describe('stackWithOverlay', () => {
  test('pushes onto an empty stack', () => {
    const a = pair()
    expect(stackWithOverlay([], a)).toEqual([a])
  })

  test('picker over the OTHER picker swaps, not stacks', () => {
    // The user-reported cycle: pair → venue → pair → … must never grow the
    // stack — each dismissed picker was resurrecting the one before it.
    const a = pair()
    const b = venue()
    const c = pair()
    let stack = stackWithOverlay([], a)
    stack = stackWithOverlay(stack, b)
    expect(stack).toEqual([b])
    stack = stackWithOverlay(stack, c)
    expect(stack).toEqual([c])
  })

  test('picker over the SAME picker kind swaps too', () => {
    const a = pair({ mode: 'watchlistAdd' })
    const b = pair({ autoFocus: true })
    expect(stackWithOverlay([a], b)).toEqual([b])
  })

  test('a non-picker stacks on a picker — back must return to it', () => {
    const a = pair()
    const s = settings()
    expect(stackWithOverlay([a], s)).toEqual([a, s])
  })

  test('a picker stacks on a non-picker', () => {
    const s = settings()
    const a = pair()
    expect(stackWithOverlay([s], a)).toEqual([s, a])
  })

  test('the swap only touches the top entry', () => {
    const s = settings()
    const a = pair()
    const b = venue()
    expect(stackWithOverlay([s, a], b)).toEqual([s, b])
  })
})
