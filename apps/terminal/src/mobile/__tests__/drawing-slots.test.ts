// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The toolbar slots are persisted user state driven by an LRU rule, which is
 * the kind of thing a type check cannot see going wrong: an off-by-one in the
 * eviction quietly costs a trader the tool they use most, a sheet button that
 * ever entered the list would leave no way back to the full sheet, and an
 * evicted cursor would leave no way back to pan-and-select.
 *
 * The bar went from five slots to three when it grew an indicators door, a
 * crosshair-mode cycler and undo — so `normalizeSlots` is load-bearing for
 * every user who already has five persisted.
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_DRAWING_SLOTS,
  DRAWING_SLOT_LIMIT,
  GRID_SLOT,
  SELECT_SLOT,
  SLOT_GLYPHS,
  insertSlot,
  normalizeSlots,
} from '../chart/use-drawing-slots'
import { findDrawingTool } from '@/components/terminal/drawing-tool-catalog'

describe('insertSlot', () => {
  test('a new tool enters behind the cursor and the oldest falls off', () => {
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, 'rectangle')
    expect(next[0]).toBe(SELECT_SLOT)
    expect(next[1]).toBe('rectangle')
    expect(next).toHaveLength(DRAWING_SLOT_LIMIT)
    // 'hline' was the stalest tool, so it is the one that leaves.
    expect(next).not.toContain('hline')
    expect(next).toEqual([SELECT_SLOT, 'rectangle', 'line'])
  })

  test('re-picking a slot moves it up and costs nothing', () => {
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, 'hline')
    expect(next).toEqual([SELECT_SLOT, 'hline', 'line'])
    expect(next).toHaveLength(DEFAULT_DRAWING_SLOTS.length)
    for (const key of DEFAULT_DRAWING_SLOTS) expect(next).toContain(key)
  })

  test('re-picking the front tool is a no-op, identity included', () => {
    // Identity matters: usePersistedState writes on every changed value, and a
    // new array here would churn localStorage and the cross-tab sync bus.
    const next = insertSlot(DEFAULT_DRAWING_SLOTS, DEFAULT_DRAWING_SLOTS[1])
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
    expect(slots).toEqual([SELECT_SLOT, 'brush', 'callout'])
  })

  test('eviction is least-recently-used, not first-declared', () => {
    // Touch 'hline' so it is freshest, then push one new tool: 'line' is the
    // stalest and leaves, and 'hline' survives on recency alone.
    let slots = insertSlot(DEFAULT_DRAWING_SLOTS, 'hline')
    slots = insertSlot(slots, 'rectangle')
    expect(slots).toContain('hline')
    expect(slots).not.toContain('line')
  })

  test('the cursor is pinned: never inserted, never evicted, always first', () => {
    const untouched = insertSlot(DEFAULT_DRAWING_SLOTS, SELECT_SLOT)
    expect(untouched).toBe(DEFAULT_DRAWING_SLOTS)

    let slots = DEFAULT_DRAWING_SLOTS
    for (const key of ['rectangle', 'ellipse', 'channel', 'measure', 'brush']) {
      slots = insertSlot(slots, key)
      expect(slots[0]).toBe(SELECT_SLOT)
      expect(slots.filter((entry) => entry === SELECT_SLOT)).toHaveLength(1)
    }
  })

  test('the sheet button is never a slot and can never be inserted', () => {
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

describe('normalizeSlots', () => {
  test('a five-slot value from the old bar is trimmed to three', () => {
    // Exactly what shipped: cursor first, four earned tools behind it.
    expect(
      normalizeSlots([SELECT_SLOT, 'line', 'hline', 'fibonacci', 'text']),
    ).toEqual([SELECT_SLOT, 'line', 'hline'])
  })

  test('a cursor evicted by the old LRU comes back at the front', () => {
    // The old list could evict `select`; the new bar pins it, so a stored
    // value without one is repaired rather than rendered cursor-less.
    expect(
      normalizeSlots(['rectangle', 'ellipse', 'channel', 'measure']),
    ).toEqual([SELECT_SLOT, 'rectangle', 'ellipse'])
  })

  test('a duplicated cursor is collapsed, wherever it sat', () => {
    expect(normalizeSlots(['line', SELECT_SLOT, 'hline'])).toEqual([
      SELECT_SLOT,
      'line',
      'hline',
    ])
  })

  test('a grid key left in old storage never survives', () => {
    expect(normalizeSlots([GRID_SLOT, 'line', GRID_SLOT, 'hline'])).toEqual([
      SELECT_SLOT,
      'line',
      'hline',
    ])
  })

  test('anything that is not a usable list falls back to the defaults', () => {
    // Cloud-hydrated values arrive as `unknown`.
    expect(normalizeSlots(null)).toBe(DEFAULT_DRAWING_SLOTS)
    expect(normalizeSlots('line')).toBe(DEFAULT_DRAWING_SLOTS)
    expect(normalizeSlots([])).toBe(DEFAULT_DRAWING_SLOTS)
    expect(normalizeSlots([SELECT_SLOT])).toBe(DEFAULT_DRAWING_SLOTS)
    expect(normalizeSlots([1, 2, 3])).toBe(DEFAULT_DRAWING_SLOTS)
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
