// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The five tool slots in the mobile drawing toolbar, as an LRU list.
 *
 * A phone has room for five of the forty-odd tools the catalog ships, so the
 * five are earned rather than configured: picking anything from the full sheet
 * inserts it at the front and drops the oldest. A trader's five stay one tap
 * away without ever opening a settings screen.
 *
 * Two rules the toolbar depends on, both enforced here rather than at the call
 * site:
 *
 *   - **The grid button is not a slot.** It is the door to the sheet, so it can
 *     never be evicted — expressing that as "it is not in the list" is what
 *     makes it structurally impossible rather than a condition someone has to
 *     remember. `GRID_SLOT` exists only so the test can assert it never lands
 *     in the list.
 *   - **Tapping a toolbar slot does not reorder the toolbar.** Only a pick from
 *     the sheet does. Buttons that rearrange themselves under a thumb mid-draw
 *     are worse than a stale order.
 *
 * Values are `toolKey(option)` keys from the drawing-tool catalog, plus the
 * synthetic `select` (the cursor — the absence of a tool, which the chart
 * models as `applyTool(null)`).
 */
import { useCallback } from 'react'

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

/** The design's toolbar: cursor, trend line, horizontal, retracement, text. */
export const DEFAULT_DRAWING_SLOTS = [
  SELECT_SLOT,
  'line',
  'hline',
  'fibonacci',
  'text',
]

/** Five chips fit a 402px bar beside the grid button, divider, magnet, trash. */
export const DRAWING_SLOT_LIMIT = 5

/**
 * Insert a tool at the front, evicting the least recently used.
 *
 * A tool already in the list is moved to the front and nothing is evicted —
 * re-picking a slot must not cost the user a different one.
 */
export function insertSlot(
  slots: Array<string>,
  key: string,
  limit: number = DRAWING_SLOT_LIMIT,
): Array<string> {
  if (key === GRID_SLOT) return slots
  if (slots[0] === key) return slots
  return [key, ...slots.filter((entry) => entry !== key)].slice(0, limit)
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
  // Cloud-hydrated values arrive as `unknown` — never hand a non-array on.
  const slots = Array.isArray(stored) ? stored : DEFAULT_DRAWING_SLOTS

  const promote = useCallback(
    (key: string) => {
      setSlots((prev) =>
        insertSlot(Array.isArray(prev) ? prev : DEFAULT_DRAWING_SLOTS, key),
      )
    },
    [setSlots],
  )

  return { slots, promote }
}
