// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  IndicatorInstanceInput,
  IndicatorParams,
  IndicatorType,
} from '@pairlens/fast-financial-charts/types'
import { INDICATOR_CATALOG } from '@/lib/indicators/indicator-catalog'
import {
  customIndicatorRegistry,
  isCustomIndicatorType,
} from '@/lib/indicators/custom-indicator-registry'
import { defaultParamsFromInputs } from '@/lib/indicators/custom-indicator-definitions'

// ---------------------------------------------------------------------------
// Name → indicator instance, for callers that only have a name.
//
// The picker builds an instance from a catalog entry, so it always carries a
// `pane` and the entry's default params. The assistant had neither: it sent
// `{ type }` and let the engine fill the gaps, and the engine's fallback pane
// is `overlay` for everything except RSI, MACD, ATR and Volume. That put every
// other oscillator — Stochastic, ADX, and every Python indicator declaring
// `pane='sub'` — on the price axis, where a 0..100 line sits so far off a
// PEPE-USDT scale that the chart reads as "the indicator did not render".
//
// So both doors go through the same table now. A custom indicator can also be
// named by its title or its script id: the assistant creates a script and then
// wants it on the chart, and `custom:user-indicators:<scriptId>` is a machine
// string nothing hands it.
// ---------------------------------------------------------------------------

export type IndicatorRequestOverrides = {
  /** Shorthand the assistant's add_indicator still speaks. */
  period?: number
  params?: Record<string, unknown>
  color?: string
}

/** Fold a loose params record onto the resolved defaults. */
function mergeParams(
  defaults: IndicatorParams | null,
  overrides: IndicatorRequestOverrides | undefined,
): IndicatorParams {
  const merged: IndicatorParams = { ...(defaults ?? {}) }
  for (const [key, value] of Object.entries(overrides?.params ?? {})) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      merged[key] = value
    }
  }
  // `period` is the legacy single-knob shorthand. Against a known indicator
  // it only means anything when that input exists, so a Python script with a
  // `length` input never gains a stray `period` key it would ignore. Against
  // a type we have no table for, it is passed through as given.
  if (overrides?.period != null && (defaults === null || 'period' in merged)) {
    merged.period = overrides.period
  }
  return merged
}

const squash = (value: string): string =>
  value.toLowerCase().replace(/[\s_-]/g, '')

/**
 * Resolve a requested indicator name to a full instance: the real type
 * string, its default params (with any overrides folded in) and the pane it
 * belongs in. Unknown names pass through untouched rather than being refused —
 * the engine's catalog is larger than the picker's table, and a type it knows
 * and we do not must still reach it.
 */
export function resolveIndicatorRequest(
  requested: string,
  overrides?: IndicatorRequestOverrides,
): Omit<IndicatorInstanceInput, 'seriesId'> {
  const wanted = squash(requested)

  const builtIn =
    INDICATOR_CATALOG.find((entry) => entry.type === requested) ??
    INDICATOR_CATALOG.find((entry) => squash(entry.type) === wanted)
  if (builtIn) {
    return {
      type: builtIn.type,
      params: mergeParams(builtIn.defaultParams, overrides),
      pane: builtIn.pane,
      ...(overrides?.color ? { color: overrides.color } : {}),
    }
  }

  const entries = customIndicatorRegistry.getAll()
  const custom =
    entries.find((entry) => entry.type === requested) ??
    entries.find((entry) => squash(entry.type) === wanted) ??
    entries.find((entry) => squash(entry.descriptor.meta.title) === wanted) ??
    // `custom:<provider>:<metaId>` — the meta id is the script id, which is
    // what list_scripts and create_script hand back.
    entries.find((entry) => squash(entry.descriptor.meta.id) === wanted)
  if (custom) {
    return {
      type: custom.type,
      params: mergeParams(
        defaultParamsFromInputs(custom.descriptor.meta.inputs),
        overrides,
      ),
      pane: custom.descriptor.meta.pane === 'overlay' ? 'overlay' : 'separate',
      ...(overrides?.color ? { color: overrides.color } : {}),
    }
  }

  // Unregistered custom type: keep the type (a definition may still arrive —
  // the engine recomputes on register) but do NOT let it default to overlay,
  // which is the wrong pane for most scripts and cannot be corrected later.
  const params = mergeParams(null, overrides)
  return {
    type: requested as IndicatorType,
    ...(Object.keys(params).length > 0 ? { params } : {}),
    ...(isCustomIndicatorType(requested) ? { pane: 'separate' as const } : {}),
    ...(overrides?.color ? { color: overrides.color } : {}),
  }
}
