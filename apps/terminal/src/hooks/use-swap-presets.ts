// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo } from 'react'
import { usePersistedState } from './use-persisted-state'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type { SwapPreset, SwapPresets } from '@/lib/trading/swap-presets'
import {
  SWAP_PRESETS_KEY,
  SWAP_PRESET_ACTIVE_KEY,
  clampPresetIndex,
  defaultPresetIndexFor,
  normalizeSwapPresets,
} from '@/lib/trading/swap-presets'

/**
 * The three swap execution profiles and the one in force.
 *
 * Both keys are tier-1 preferences, so a profile tuned on the desk is the
 * profile the phone and the launchpad quick buy use. `cls` only decides where
 * a ticket STARTS when the trader has never picked a slot: the choice itself
 * is global, because a trader who moved to Ultra for a launch wants Ultra on
 * the next launch too, not on the next chart of the same class.
 */
export function useSwapPresets(cls?: InstrumentClass): {
  presets: SwapPresets
  active: SwapPreset
  activeIndex: number
  setActiveIndex: (index: number) => void
  updatePreset: (index: number, patch: Partial<SwapPreset>) => void
} {
  const [raw, setRaw] = usePersistedState<unknown>(SWAP_PRESETS_KEY, null)
  const [rawActive, setRawActive] = usePersistedState<unknown>(
    SWAP_PRESET_ACTIVE_KEY,
    null,
  )
  const presets = useMemo(() => normalizeSwapPresets(raw), [raw])
  const activeIndex = clampPresetIndex(rawActive) ?? defaultPresetIndexFor(cls)
  const active = presets[activeIndex] ?? presets[0]

  const setActiveIndex = useCallback(
    (index: number) => {
      const clamped = clampPresetIndex(index)
      if (clamped !== null) setRawActive(clamped)
    },
    [setRawActive],
  )

  const updatePreset = useCallback(
    (index: number, patch: Partial<SwapPreset>) => {
      setRaw((prev: unknown) => {
        const current = normalizeSwapPresets(prev)
        return current.map((p, i) => (i === index ? { ...p, ...patch } : p))
      })
    },
    [setRaw],
  )

  return { presets, active, activeIndex, setActiveIndex, updatePreset }
}
