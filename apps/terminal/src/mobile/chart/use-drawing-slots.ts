// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three tool slots in the mobile drawing toolbar: a pinned cursor and two
 * earned tools.
 *
 * A phone has room for a handful of the forty-odd tools the catalog ships, so
 * the ones on the bar are earned rather than configured: picking anything from
 * the full sheet inserts it at the front of the LRU and drops the oldest. A
 * trader's two most recent stay one tap away without ever opening a settings
 * screen.
 *
 * Three rules the toolbar depends on, all enforced here rather than at the call
 * site:
 *
 *   - **The cursor is pinned at position 0.** It is the way back to pan-and-
 *     select, and a two-deep LRU would evict it after two picks. It used to be
 *     an ordinary member of a five-long list, which was survivable at five and
 *     is not at three.
 *   - **The sheet buttons are not slots.** They are the doors to the tools and
 *     indicators panels, so they can never be evicted — expressing that as
 *     "they are not in the list" is what makes it structurally impossible
 *     rather than a condition someone has to remember. `GRID_SLOT` exists only
 *     so the test can assert it never lands in the list.
 *   - **Tapping a toolbar slot does not reorder the toolbar.** Only a pick from
 *     the sheet does. Buttons that rearrange themselves under a thumb mid-draw
 *     are worse than a stale order.
 *
 * Values are `toolKey(option)` keys from the drawing-tool catalog, plus the
 * synthetic `select` (the cursor — the absence of a tool, which the chart
 * models as `applyTool(null)`).
 */
import { useCallback, useMemo } from 'react'

import type { GlyphName } from '../primitives/glyphs'
import { usePersistedState } from '@/hooks/use-persisted-state'

/** Storage key, `pairlens:`-prefixed by usePersistedState. */
export const DRAWING_SLOTS_KEY = 'mobile.drawingSlots'

/** The cursor. Not a catalog tool — `applyTool(null)` on the chart. */
export const SELECT_SLOT = 'select'

/**
 * The sheet door. Never a member of the slot list; declared so the invariant
 * can be asserted instead of assumed.
 */
export const GRID_SLOT = 'grid'

/** The design's toolbar: cursor, trend line, horizontal. */
export const DEFAULT_DRAWING_SLOTS = [SELECT_SLOT, 'line', 'hline']

/**
 * Three chips fit the 402px bar beside two sheet doors, two dividers, the
 * crosshair-mode cycler, undo and trash.
 */
export const DRAWING_SLOT_LIMIT = 3

/**
 * Insert a tool at the front of the LRU, evicting the least recently used.
 *
 * "Front" is position 1, not 0: the cursor holds 0 and is never moved, never
 * evicted and never inserted. A tool already in the list is moved up and
 * nothing is evicted — re-picking a slot must not cost the user a different
 * one.
 */
export function insertSlot(
  slots: Array<string>,
  key: string,
  limit: number = DRAWING_SLOT_LIMIT,
): Array<string> {
  if (key === GRID_SLOT || key === SELECT_SLOT) return slots
  if (slots[0] === SELECT_SLOT && slots[1] === key) return slots
  const rest = slots.filter((entry) => entry !== key && entry !== SELECT_SLOT)
  return [SELECT_SLOT, key, ...rest].slice(0, limit)
}

/**
 * A persisted value made safe to render.
 *
 * The list shipped five slots with an evictable cursor, so an existing user's
 * storage can be longer than the bar and can be missing `select` entirely.
 * Both are repaired on READ rather than written back: a migration write on
 * mount would churn localStorage and the cross-tab sync bus for every user who
 * never touches the toolbar. The first pick from the sheet persists the
 * normalized shape on its own.
 */
export function normalizeSlots(
  value: unknown,
  limit: number = DRAWING_SLOT_LIMIT,
): Array<string> {
  if (!Array.isArray(value)) return DEFAULT_DRAWING_SLOTS
  const tools = value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry !== SELECT_SLOT && entry !== GRID_SLOT,
  )
  if (tools.length === 0) return DEFAULT_DRAWING_SLOTS
  return [SELECT_SLOT, ...tools].slice(0, limit)
}

/**
 * Tool keys the design draws with a custom glyph. Everything absent from this
 * map keeps the catalog's own lucide icon, which is what stops the mobile
 * toolbar from reading as a second icon set beside the desktop rail.
 *
 * Lives here rather than in the sheet so the toolbar can resolve a slot's icon
 * without pulling the (lazily loaded) sheet chunk in with it.
 */
export const SLOT_GLYPHS: Record<string, GlyphName> = {
  ray: 'ray',
  vline: 'vline',
  channel: 'channel',
  'fib-extension': 'fibExt',
  'gann-fan': 'fibFan',
  rectangle: 'rect',
  ellipse: 'ellipse',
  'path:triangle': 'triangle',
  arrow: 'arrow',
  callout: 'callout',
  'long-position': 'longPos',
  'short-position': 'shortPos',
}

export type DrawingSlots = {
  slots: Array<string>
  /** Called when a tool is picked from the full sheet — never from a slot. */
  promote: (key: string) => void
}

export function useDrawingSlots(): DrawingSlots {
  const [stored, setSlots] = usePersistedState<Array<string>>(
    DRAWING_SLOTS_KEY,
    DEFAULT_DRAWING_SLOTS,
  )
  // Memoized on the stored value, not recomputed per render: the toolbar keys
  // its `useMemo` off this array's identity.
  const slots = useMemo(() => normalizeSlots(stored), [stored])

  const promote = useCallback(
    (key: string) => {
      setSlots((prev) => insertSlot(normalizeSlots(prev), key))
    },
    [setSlots],
  )

  return { slots, promote }
}
