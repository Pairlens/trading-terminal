// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Handing the palette back before a theme plugin is removed.
 *
 * A `theme:override` plugin does not own the tokens it painted: the style tag
 * and its localStorage cache outlive the plugin, so uninstalling the theme that
 * is currently painting the terminal leaves ghost colors behind and a selection
 * pointing at a plugin that no longer exists. The Store remembered to hand the
 * palette back first; the Installed tab did not.
 *
 * So the handoff lives here, on the uninstall path itself, and both surfaces
 * get it whether they remember or not. It runs without React on purpose:
 * `applyTheme` is already exported for the onboarding route, and the selection
 * is a `usePersistedState` key, which means writing localStorage plus an
 * `emitWrite` is a full, in-order update — every mounted hook instance for that
 * key hears it and re-renders.
 */

import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { applyTheme } from '@/lib/theme/apply-theme'
import { emitWrite } from '@/lib/sync/sync-channel'
import { track } from '@/lib/analytics-events'

/** The `usePersistedState` key `useThemePlugin` keeps its selection under. */
const ACTIVE_THEME_KEY = 'theme.activePluginId'

/** The theme plugin currently painting the terminal, read without React. */
export function activeThemePluginId(): string | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${ACTIVE_THEME_KEY}`)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

/**
 * If `pluginId` is the theme painting the terminal, drop back to the built-in
 * palette: clear the selection, remove the injected style tag and its cache.
 * Returns whether a handoff actually happened.
 */
export function releaseThemeIfActive(pluginId: string): boolean {
  if (activeThemePluginId() !== pluginId) return false

  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${ACTIVE_THEME_KEY}`,
      JSON.stringify(null),
    )
  } catch {
    // Storage full or blocked — the style tag still goes, which is what shows.
  }
  emitWrite(ACTIVE_THEME_KEY, null)
  applyTheme(null)
  track('theme_changed', { theme: 'default' })
  return true
}
