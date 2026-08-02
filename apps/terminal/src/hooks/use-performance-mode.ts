// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createContext, useContext, useEffect } from 'react'

import { usePersistedState } from './use-persisted-state'
import { useMarketData } from '@/lib/market-data-provider'

export type PerformanceMode = 'performance' | 'balanced' | 'energy-saver'

// Persistence contract shared with the desktop menu's synced accessor.
export const PERFORMANCE_MODE_KEY = 'performance-mode'
export const PERFORMANCE_MODE_DEFAULT: PerformanceMode = 'balanced'

/**
 * Canonical mode list (value + i18n label/description keys). Shared by the
 * settings dialog's performance section and the desktop View menu so both
 * render the same options and wording. The dialog attaches its own icons.
 */
export const PERFORMANCE_MODES: ReadonlyArray<{
  value: PerformanceMode
  labelKey: string
  descKey: string
}> = [
  {
    value: 'performance',
    labelKey: 'settings.performance.performance',
    descKey: 'settings.performance.performanceDescription',
  },
  {
    value: 'balanced',
    labelKey: 'settings.performance.balanced',
    descKey: 'settings.performance.balancedDescription',
  },
  {
    value: 'energy-saver',
    labelKey: 'settings.performance.energySaver',
    descKey: 'settings.performance.energySaverDescription',
  },
]

type ChannelSpeeds = { candleMs: number; tickerMs: number; bookMs: number }

const CHANNEL_SPEEDS: Record<PerformanceMode, ChannelSpeeds> = {
  performance: { candleMs: 0, tickerMs: 0, bookMs: 0 },
  balanced: { candleMs: 500, tickerMs: 250, bookMs: 250 },
  'energy-saver': { candleMs: 2000, tickerMs: 1000, bookMs: 1000 },
}

type PerformanceModeContextValue = {
  mode: PerformanceMode
  setMode: (mode: PerformanceMode) => void
  speeds: ChannelSpeeds
}

export const PerformanceModeContext =
  createContext<PerformanceModeContextValue | null>(null)

export function usePerformanceModeState() {
  const [mode, setMode] = usePersistedState<PerformanceMode>(
    PERFORMANCE_MODE_KEY,
    PERFORMANCE_MODE_DEFAULT,
  )
  const speeds = CHANNEL_SPEEDS[mode] ?? CHANNEL_SPEEDS.performance
  return { mode, setMode, speeds }
}

export function usePerformanceMode(): PerformanceModeContextValue {
  const ctx = useContext(PerformanceModeContext)
  if (!ctx) {
    return {
      mode: 'performance',
      setMode: () => {},
      speeds: CHANNEL_SPEEDS.performance,
    }
  }
  return ctx
}

/** Syncs the current performance mode to the MarketDataProvider's StreamThrottle. */
export function usePerformanceModeSync(): void {
  const { mode } = usePerformanceMode()
  const { setThrottleMode } = useMarketData()

  useEffect(() => {
    setThrottleMode(mode)
  }, [mode, setThrottleMode])
}
