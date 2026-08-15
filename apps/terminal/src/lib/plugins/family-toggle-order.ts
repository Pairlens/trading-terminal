// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Ordering for a family-wide enable/disable in the Plugin Store.
 *
 * A bulk toggle is a SEQUENCE of per-plugin toggles, and every step of it is
 * observable: each one bumps `pluginStateVersion`, React re-renders, and
 * effects that watch the live plugin set run against the half-toggled state.
 * One of those effects destroys user state.
 *
 * `useThemePlugin` (hooks/use-theme-plugin.ts) clears the persisted theme
 * selection when the selected theme is no longer among the ACTIVE theme
 * plugins, guarded by `availableThemes.length > 0` so that disabling every
 * theme at once preserves the choice. A naive bulk toggle trips that guard
 * twice over a round trip: disabling any other theme first leaves the set
 * non-empty without the selected one, and re-enabling any other theme first
 * does the same. Either way the user ends up on the stock look with nothing
 * to undo.
 *
 * Ordering fixes it without a snapshot, a restore, or a visible flash: the
 * currently-selected plugin goes FIRST when enabling and LAST when disabling,
 * so the set never once contains other members without it. It is only ever
 * empty-without-it, which is exactly the case the guard already tolerates.
 */

import type { PluginInstance } from '@pairlens/plugin-system'

/**
 * @param selectedId the family's user-selected member (the active theme id;
 *   null for families that have no such notion, which pass through unchanged)
 * @param enabling true for enable-all, false for disable-all
 */
export function orderForBulkToggle(
  members: Array<PluginInstance>,
  selectedId: string | null,
  enabling: boolean,
): Array<PluginInstance> {
  if (!selectedId) return [...members]
  const selected = members.filter((p) => p.manifest.id === selectedId)
  if (selected.length === 0) return [...members]
  const rest = members.filter((p) => p.manifest.id !== selectedId)
  return enabling ? [...selected, ...rest] : [...rest, ...selected]
}
