// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The five toolbar slots are persisted user state driven by an LRU rule, which
 * is the kind of thing a type check cannot see going wrong: an off-by-one in
 * the eviction quietly costs a trader the tool they use most, and a grid button
 * that ever entered the list would leave no way back to the full sheet.
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_DRAWING_SLOTS,
  DRAWING_SLOT_LIMIT,
  GRID_SLOT,
  SELECT_SLOT,
  SLOT_GLYPHS,
  insertSlot,
} from '../chart/use-drawing-slots'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'

describe('insertSlot', () => {
  test('a new tool enters at the front and the oldest falls off', () => {
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, 'rectangle')
    expect(next[0]).toBe('rectangle')
    expect(next).toHaveLength(DRAWING_SLOT_LIMIT)
    // 'text' was last in, so it is the one that leaves.
    expect(next).not.toContain('text')
    expect(next).toEqual([
      'rectangle',
      SELECT_SLOT,
      'line',
      'hline',
      'fibonacci',
    ])
  })

  test('re-picking a slot moves it up and costs nothing', () => {
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, 'fibonacci')
    expect(next[0]).toBe('fibonacci')
    expect(next).toHaveLength(DEFAULT_DRAWING_SLOTS.length)
    for (const key of DEFAULT_DRAWING_SLOTS) expect(next).toContain(key)
  })

  test('re-picking the front slot is a no-op, identity included', () => {
    // Identity matters: usePersistedState writes on every changed value, and a
    // new array here would churn localStorage and the cross-tab sync bus.
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, DEFAULT_DRAWING_SLOTS[0])
    expect(next).toBe(DEFAULT_DRAWING_SLOTS)
  })

  test('the list never grows past the limit, however many are picked', () => {
    let slots = DEFAULT_DRAWING_SLOTS
    for (const key of [
      'rectangle',
      'ellipse',
      'channel',
      'measure',
      'arrow',
      'callout',
      'brush',
    ]) {
      slots = insertSlot(slots, key)
      expect(slots).toHaveLength(DRAWING_SLOT_LIMIT)
    }
    expect(slots).toEqual(['brush', 'callout', 'arrow', 'measure', 'channel'])
  })

  test('eviction is least-recently-used, not first-declared', () => {
    // Touch 'text' so it is freshest, then push three new tools: the three
    // stalest leave and 'text' survives on recency alone.
    let slots = insertSlot(DEFAULT_DRAWING_SLOTS, 'text')
    slots = insertSlot(slots, 'rectangle')
    slots = insertSlot(slots, 'ellipse')
    slots = insertSlot(slots, 'measure')
    expect(slots).toContain('text')
    expect(slots).not.toContain('hline')
    expect(slots).not.toContain('fibonacci')
  })

  test('the grid button is never a slot and can never be inserted', () => {
    expect(DEFAULT_DRAWING_SLOTS).not.toContain(GRID_SLOT)
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, GRID_SLOT)
    expect(next).toBe(DEFAULT_DRAWING_SLOTS)
    expect(next).not.toContain(GRID_SLOT)

    // And no sequence of picks can smuggle it in.
    let slots = DEFAULT_DRAWING_SLOTS
    for (const key of ['rectangle', GRID_SLOT, 'ellipse', GRID_SLOT]) {
      slots = insertSlot(slots, key)
      expect(slots).not.toContain(GRID_SLOT)
    }
  })
})

describe('slot keys resolve', () => {
  test('every default slot is either the cursor or a real catalog tool', () => {
    for (const key of DEFAULT_DRAWING_SLOTS) {
      if (key === SELECT_SLOT) continue
      expect(findDrawingTool(key)).toBeDefined()
    }
  })

  test('every glyph override names a tool this build still ships', () => {
    // A stale key here is a toolbar chip that silently loses its icon.
    for (const key of Object.keys(SLOT_GLYPHS)) {
      expect(findDrawingTool(key)).toBeDefined()
    }
  })
})
