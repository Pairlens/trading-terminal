// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Favorites and recents for the chart drawing rail.
 *
 * Both are lists of tool keys (`hline`, `path:star`) resolved against the
 * catalog in `components/terminal/drawing-tool-catalog`. Keeping the keys here
 * — away from React and away from the icons — is what lets `applyTool` record
 * a use without importing the toolbar.
 *
 * Favorites ride the sync bus (charts domain), so a pinned set follows the
 * account. Recents deliberately do not: they change on every tool selection,
 * and a device's last few clicks are not a preference worth pushing to the
 * server on a debounce timer — they are a local trace of what this hand just
 * did. `sync-domains.domainForSyncKey` returns null for the key, so the
 * coordinator drops it.
 */
import { useCallback } from 'react'

import type { DrawingToolType } from '@pairlens/fast-financial-charts/types'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { createSyncedSetting } from '@/lib/settings/synced-setting'

export const DRAWING_FAVORITES_KEY = 'terminal.drawingFavorites'
export const DRAWING_RECENTS_KEY = 'terminal.drawingRecents'

/** How many recents the rail offers before the oldest falls off. */
export const DRAWING_RECENTS_LIMIT = 6

// Shared empty default: a fresh `[]` per render would be a new reference on
// every call, and these feed hook dependency arrays downstream.
const NO_KEYS: Array<string> = []

/** Stable identity for a tool — path presets are separate tools to a user. */
export function drawingToolKey(
  tool: DrawingToolType,
  meta?: Record<string, unknown> | null,
): string {
  const preset = meta?.preset
  return typeof preset === 'string' ? `${tool}:${preset}` : tool
}

/** Cloud-hydrated values arrive as `unknown` — never hand a non-array on. */
function asKeys(value: Array<string>): Array<string> {
  return Array.isArray(value) ? value : NO_KEYS
}

const recentsSetting = createSyncedSetting<Array<string>>(
  DRAWING_RECENTS_KEY,
  NO_KEYS,
)

/**
 * Record that a tool was picked, from wherever it was picked — the rail, a
 * keyboard chord, the copilot. Lives outside React so `applyTool` (the one
 * funnel every source passes through) can call it directly.
 */
export function trackDrawingToolUse(
  tool: DrawingToolType,
  meta?: Record<string, unknown> | null,
): void {
  const key = drawingToolKey(tool, meta)
  const previous = asKeys(recentsSetting.get())
  // Re-picking the current tool (sticky mode re-arms it on every drawing)
  // must not churn storage or the sync bus.
  if (previous[0] === key) return
  recentsSetting.set(
    [key, ...previous.filter((k) => k !== key)].slice(0, DRAWING_RECENTS_LIMIT),
  )
}

/** Recently used tools, most recent first. */
export function useDrawingRecents(): Array<string> {
  const [recents] = usePersistedState<Array<string>>(
    DRAWING_RECENTS_KEY,
    NO_KEYS,
  )
  return asKeys(recents)
}

/** Pinned tools, in the order the user pinned them. */
export function useDrawingFavorites(): [
  Array<string>,
  (key: string) => void,
  (key: string) => boolean,
] {
  const [stored, setFavorites] = usePersistedState<Array<string>>(
    DRAWING_FAVORITES_KEY,
    NO_KEYS,
  )
  const favorites = asKeys(stored)

  const toggleFavorite = useCallback(
    (key: string) => {
      setFavorites((prev) => {
        const current = asKeys(prev)
        return current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key]
      })
    },
    [setFavorites],
  )

  const isFavorite = useCallback(
    (key: string) => favorites.includes(key),
    [favorites],
  )

  return [favorites, toggleFavorite, isFavorite]
}
