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
 */
import { INSTRUMENT_CLASSES } from '@pairlens/shared/market-ref'
import {
  PRESET_DEFAULT,
  PRESET_DEX_TERMINAL,
  PRESET_EQUITIES_TERMINAL,
  PRESET_PERPS_TERMINAL,
  PRESET_PREDICTION_TERMINAL,
} from '../presets'
import type { InstrumentClass } from '@pairlens/shared/market-ref'

import type { TerminalLayout, WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

const DEFAULT_PRESETS: Record<InstrumentClass, TerminalLayout> = {
  spot: PRESET_DEFAULT,
  perp: PRESET_PERPS_TERMINAL,
  dex: PRESET_DEX_TERMINAL,
  stocks: PRESET_EQUITIES_TERMINAL,
  prediction: PRESET_PREDICTION_TERMINAL,
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
        pairClass: cls,
        defaultPreset: DEFAULT_PRESETS[cls],
        // Quick-apply layouts derived from the Workspace Store (single
        // source), narrowed to what this asset class can actually use.
        presets: routePresets('pair', cls),
      } satisfies WorkspaceConfig,
    ]),
  ) as Record<InstrumentClass, WorkspaceConfig>

export function pairWorkspaceFor(cls: InstrumentClass): WorkspaceConfig {
  return PAIR_WORKSPACES[cls]
}
