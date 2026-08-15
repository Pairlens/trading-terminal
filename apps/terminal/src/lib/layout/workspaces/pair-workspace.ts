// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pair route's workspace, per asset class. A prediction market and a spot
 * pair share a URL shape but not a page shape: the panes that make BTC-USDT
 * work (spot positions, a deep order book) are dead weight on an event
 * contract, and the panes that make an event contract legible (the event
 * browser, open contracts) do not exist on a spot desk. So each
 * `InstrumentClass` gets its own workspace config — its own persisted layout,
 * its own default preset, and its own slice of the workspaces menu.
 *
 * `spot` keeps the original storage key: it was the only pair layout before
 * classes split, so whatever a user has tuned there is, definitionally, their
 * spot layout.
 *
 * ## Where the non-spot defaults come from
 *
 * Every class beyond spot has a family plugin that ships its layouts through
 * `contributes.workspaces`, and the store entry, the "Default" menu item and
 * Discovery all read them from the workspace-template registry — so disabling
 * the family takes them away. The class DEFAULT below is the one thing that
 * cannot be reactive: it seeds the layout reducer on first paint, before any
 * plugin has activated. So it imports the same geometry the plugin ships,
 * statically, from a leaf data module in the plugin package. One source, two
 * paths in. Without the connectors the class is unreachable anyway, and a
 * layout the user already saved still boots.
 */
import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { PERPS_TERMINAL_LAYOUT } from '@pairlens/plugins/pairlens-cex-futures/workspaces'
import { PREDICTION_TERMINAL_LAYOUT } from '@pairlens/plugins/pairlens-predictions/workspaces'
import { DEX_TERMINAL_LAYOUT } from '@pairlens/plugins/pairlens-dex/workspaces'
import { EQUITIES_TERMINAL_LAYOUT } from '@pairlens/plugins/pairlens-equities/workspaces'
import { PRESET_DEFAULT } from '../presets'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import type { TerminalLayout, WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

const DEFAULT_PRESETS: Record<InstrumentClass, TerminalLayout> = {
  spot: PRESET_DEFAULT,
  perp: PERPS_TERMINAL_LAYOUT,
  dex: DEX_TERMINAL_LAYOUT,
  stocks: EQUITIES_TERMINAL_LAYOUT,
  prediction: PREDICTION_TERMINAL_LAYOUT,
}

function storageKeyFor(cls: InstrumentClass): string {
  return cls === 'spot'
    ? 'pairlens:terminal.layout'
    : `pairlens:terminal.layout.${cls}`
}

/** Built once at module scope so every render of a class reads one identity. */
const PAIR_WORKSPACES: Record<InstrumentClass, WorkspaceConfig> =
  Object.fromEntries(
    INSTRUMENT_CLASSES.map((cls) => [
      cls,
      {
        storageKey: storageKeyFor(cls),
        assetClass: cls,
        presetContext: 'pair',
        defaultPreset: DEFAULT_PRESETS[cls],
        // The built-in quick-apply base, narrowed to what this asset class can
        // actually use. Plugin-contributed layouts join it at render time —
        // see `useRoutePresets` — so the menu tracks what is installed.
        presets: routePresets('pair', cls),
      } satisfies WorkspaceConfig,
    ]),
  ) as Record<InstrumentClass, WorkspaceConfig>

export function pairWorkspaceFor(cls: InstrumentClass): WorkspaceConfig {
  return PAIR_WORKSPACES[cls]
}
