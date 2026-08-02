// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTheme } from 'next-themes'

import type { ChartThemeInput } from 'fast-financial-charts/types'

import { useThemePluginContext } from '@/hooks/use-theme-plugin'

export function usePairlensChartTheme(): ChartThemeInput {
  const { resolvedTheme } = useTheme()
  const { activeChartOverrides } = useThemePluginContext()

  return useMemo<ChartThemeInput>(() => {
    const isDark = resolvedTheme !== 'light'
    const o = activeChartOverrides

    // Warm Precision — graphite (dark) / warm-paper (light). Hex values are
    // OKLCH conversions of the design tokens so the WebGL chart stays cohesive
    // with the CSS theme (the engine reads concrete colors, not CSS variables).
    return {
      background: o?.background ?? (isDark ? '#0f0d0b' : '#f6f3ee'),
      upCandle: o?.upCandle ?? (isDark ? '#40c786' : '#008c53'),
      downCandle: o?.downCandle ?? (isDark ? '#e94f55' : '#cc2631'),
      crosshair: o?.crosshair ?? (isDark ? '#a29c94' : '#8a8378'),
      grid: o?.grid ?? (isDark ? '#221f1a' : '#e0dcd5'),
      axisText: o?.axisText ?? (isDark ? '#96918c' : '#69625b'),
      axisBackground: o?.axisBackground ?? (isDark ? '#0c0a08' : '#efece8'),
      selection: o?.crosshair ?? (isDark ? '#929bf5' : '#575ac2'),
      hudBg:
        o?.hudBg ??
        (isDark ? 'rgba(26, 22, 18, 0.92)' : 'rgba(254, 253, 250, 0.92)'),
      hudText: o?.hudText ?? (isDark ? '#edebe7' : '#231e19'),
      fontFamilyMono:
        "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      fontSizeAxis: 11,
      fontSizeHud: 12,
      indicator: {
        volume: {
          up: o?.volumeUp ?? (isDark ? '#40c78644' : '#008c5344'),
          down: o?.volumeDown ?? (isDark ? '#e94f5544' : '#cc263144'),
        },
      },
    }
  }, [resolvedTheme, activeChartOverrides])
}
