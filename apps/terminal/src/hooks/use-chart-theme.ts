// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTheme } from 'next-themes'

import type { ChartThemeInput } from '@pairlens/fast-financial-charts/types'

import { useThemePluginContext } from '@/hooks/use-theme-plugin'

/**
 * A CSS colour token, resolved to something a canvas can be handed.
 *
 * `getComputedStyle` gives back whatever the theme wrote (`oklch(...)` for
 * every Pairlens theme), so the value goes through a 1x1 canvas and comes out
 * as sRGB hex: the format the chart engine's own palettes are written in, and
 * the one its colour helpers can take apart.
 */
let probe: CanvasRenderingContext2D | null | undefined

function resolveCssColor(token: string): string | null {
  if (typeof document === 'undefined') return null

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim()
  if (!raw) return null

  if (probe === undefined) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    probe = canvas.getContext('2d', { willReadFrequently: true })
  }
  if (!probe) return null

  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = raw
  probe.fillRect(0, 0, 1, 1)

  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  if (a === 0) return null
  return `#${[r, g, b].map((c) => (c ?? 0).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Which of the app's surfaces this chart is painted on.
 *
 * `card` is the workspace board: a chart pane sits directly on its column's
 * `--card` with nothing between them. `background` is the app ground, for a
 * chart that runs full-bleed on it (the indicator workbench's preview).
 * `palette` opts out and keeps whatever the theme's own chart block says: the
 * phone paints its shell FROM this value rather than the other way round, so
 * its plot and its chrome already agree and deriving a surface would only
 * move both.
 */
export type ChartSurface = 'card' | 'background' | 'palette'

export function usePairlensChartTheme(
  surface: ChartSurface = 'card',
): ChartThemeInput {
  const { resolvedTheme } = useTheme()
  const { activeChartOverrides } = useThemePluginContext()

  return useMemo<ChartThemeInput>(() => {
    const isDark = resolvedTheme !== 'light'
    // Palettes are per-mode: a theme with no light palette gets the engine's
    // light defaults below, NOT its dark palette — the dark-plot-under-a-
    // light-UI combination is exactly the bug this split exists to prevent.
    const o = isDark ? activeChartOverrides?.dark : activeChartOverrides?.light

    // Warm Precision — graphite (dark) / warm-paper (light). Hex values are
    // OKLCH conversions of the design tokens so the WebGL chart stays cohesive
    // with the CSS theme (the engine reads concrete colors, not CSS variables).
    // The plot's colour comes from the surface under it, not from the palette.
    // A chart pane sits directly on its column's `--card` with nothing between
    // them, so a plot painted in the theme's own `background` reads as a
    // rectangle inset into the card rather than as part of it. Themes keep
    // every colour that is genuinely theirs — candles, grid, crosshair, axis
    // text, HUD — and give up the two surface values, which then follow
    // whatever they are sitting on, across all 18 themes and both modes, with
    // nothing to re-tune per theme.
    const ground =
      surface === 'palette' ? null : resolveCssColor(`--${surface}`)

    return {
      background: ground ?? o?.background ?? (isDark ? '#0f0d0b' : '#f6f3ee'),
      upCandle: o?.upCandle ?? (isDark ? '#40c786' : '#008c53'),
      downCandle: o?.downCandle ?? (isDark ? '#e94f55' : '#cc2631'),
      crosshair: o?.crosshair ?? (isDark ? '#a29c94' : '#8a8378'),
      grid: o?.grid ?? (isDark ? '#221f1a' : '#e0dcd5'),
      axisText: o?.axisText ?? (isDark ? '#96918c' : '#69625b'),
      axisBackground:
        ground ?? o?.axisBackground ?? (isDark ? '#0c0a08' : '#efece8'),
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
  }, [resolvedTheme, activeChartOverrides, surface])
}
