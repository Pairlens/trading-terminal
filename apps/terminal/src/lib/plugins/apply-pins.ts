// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Applying the capability pins the App Server holds for this account.
 *
 * A pin is a per-device choice ("use Gate for OKX candles") stored per account,
 * so a plugin uninstalled on THIS device can still have a live pin row on the
 * server from another one. Replaying such a row would resurrect a choice the
 * user has already undone locally: the resolver would report an override that
 * cannot resolve, and reinstalling the plugin later would silently bring the
 * old routing back.
 *
 * So every pin is checked against what is actually installed here, and a pin
 * naming a plugin this device does not have is pruned on the server rather than
 * quietly skipped — otherwise it comes back on the next hydrate, forever.
 */

import type { CapabilityId, PluginManager } from '@pairlens/plugin-system'
import { api } from '@/lib/api'

export type ServerPin = {
  capability: string
  market: string
  pluginId: string
}

/**
 * Apply the server's pins to the manager, dropping the ones whose plugin is not
 * installed on this device. Returns how many were actually applied so callers
 * can skip a state-change notification when nothing moved.
 */
export function applyServerPins(
  manager: PluginManager,
  pins: ReadonlyArray<ServerPin>,
): number {
  if (pins.length === 0) return 0

  const installed = new Set(
    manager.getInstalledPlugins().map((p) => p.manifest.id),
  )

  let applied = 0
  for (const pin of pins) {
    if (!installed.has(pin.pluginId)) {
      api.removePluginPin(pin.capability, pin.market).catch(() => {
        // Offline: the pin stays on the server and is skipped again next boot.
      })
      continue
    }
    manager.pinPlugin(pin.capability as CapabilityId, pin.market, pin.pluginId)
    applied += 1
  }
  return applied
}
