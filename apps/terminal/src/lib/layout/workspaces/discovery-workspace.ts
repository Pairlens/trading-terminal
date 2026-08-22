// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Discovery's workspaces, one per asset class.
 *
 * Discovery used to be a single board, which forced every trader through one
 * arrangement: a perps scalper and a prediction-market trader were tuning the
 * same three columns against each other. So each asset class is its own
 * section with its own workspace — its own persisted layout, its own default
 * board, and its own slice of the layouts menu.
 *
 * `spot` keeps the original storage key. It was the only Discovery layout
 * before sections existed, and that board is a crypto scanner over a
 * sentiment rail, so whatever a user tuned there is, definitionally, their
 * spot board.
 *
 * ## Where the non-spot defaults come from
 *
 * Same rule as the pair route (see `pair-workspace.ts`): every class beyond
 * spot has a family plugin that ships its board through
 * `contributes.workspaces`, and the store entry plus the menu's Default read
 * it from the workspace-template registry — so disabling the family takes it
 * away, tab included. The DEFAULT below is the one thing that cannot be
 * reactive: it seeds the layout reducer on first paint, before any plugin has
 * activated. So it imports the same geometry the plugin ships, statically,
 * from a leaf data module in the plugin package. One source, two paths in.
 */
import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import { PERPS_DISCOVERY_LAYOUT } from '@pairlens/plugins/pairlens-cex-futures/workspaces'
import { PREDICTION_DISCOVERY_LAYOUT } from '@pairlens/plugins/pairlens-predictions/workspaces'
import { DEX_DISCOVERY_LAYOUT } from '@pairlens/plugins/pairlens-dex/workspaces'
import { MEMECOIN_DISCOVERY_LAYOUT } from '@pairlens/plugins/pairlens-memecoins/workspaces'
import { EQUITIES_DISCOVERY_LAYOUT } from '@pairlens/plugins/pairlens-equities/workspaces'
import { DISCOVERY_HOME } from './discovery-presets'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { TerminalLayout, WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

const DEFAULT_BOARDS: Record<InstrumentClass, TerminalLayout> = {
  // Every pane on the spot board works without an account — signing in is a
  // lean-in, never a prerequisite for a useful home.
  spot: DISCOVERY_HOME,
  perp: PERPS_DISCOVERY_LAYOUT,
  dex: DEX_DISCOVERY_LAYOUT,
  memecoin: MEMECOIN_DISCOVERY_LAYOUT,
  stocks: EQUITIES_DISCOVERY_LAYOUT,
  prediction: PREDICTION_DISCOVERY_LAYOUT,
}

export function discoveryStorageKeyFor(cls: InstrumentClass): string {
  return cls === 'spot'
    ? 'pairlens:discovery.layout'
    : `pairlens:discovery.layout.${cls}`
}

/** Built once at module scope so every render of a section reads one identity. */
const DISCOVERY_WORKSPACES: Record<InstrumentClass, WorkspaceConfig> =
  Object.fromEntries(
    INSTRUMENT_CLASSES.map((cls) => [
      cls,
      {
        storageKey: discoveryStorageKeyFor(cls),
        assetClass: cls,
        presetContext: 'discovery',
        defaultPreset: DEFAULT_BOARDS[cls],
        // The built-in quick-apply base, narrowed to what this section can
        // actually use. Plugin-contributed boards join it at render time —
        // see `useRoutePresets` — so the menu tracks what is installed.
        presets: routePresets('discovery', cls),
      } satisfies WorkspaceConfig,
    ]),
  ) as Record<InstrumentClass, WorkspaceConfig>

export function discoveryWorkspaceFor(cls: InstrumentClass): WorkspaceConfig {
  return DISCOVERY_WORKSPACES[cls]
}
