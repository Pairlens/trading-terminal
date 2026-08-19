// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two chart colours the SHELL needs, published to CSS.
 *
 * Everything the shell paints comes from the shadcn tokens a `theme:override`
 * plugin sets — except the three things that have to disappear into the plot:
 * the chart-top scrim, the price readout's halo, and the timeframe chip's ink
 * and ring. Those live ON the canvas, and the canvas is painted from the
 * theme's `chart` block (`usePairlensChartTheme`), which is a different colour
 * from `--background` under every bundled theme. Feeding them the UI token
 * instead prints a grey band across the top of the chart.
 *
 * The scrim needs an rgb TRIPLE rather than a colour, so its final gradient
 * stop can hold the ink's hue at alpha 0. `transparent` is black, and a
 * gradient that fades through it is exactly the artefact the scrim exists to
 * remove.
 */
import { useMemo } from 'react'

import type { CSSProperties } from 'react'
import { usePairlensChartTheme } from '@/hooks/use-chart-theme'

/** `--pl-chart-ink-rgb`'s declared fallback, for a colour we cannot parse. */
const FALLBACK_INK = '15 13 11'

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_FN = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i

/**
 * `r g b`, the space-separated form `rgb()` takes a custom property in.
 *
 * Hex and `rgb()`/`rgba()` cover the engine's own defaults and all eighteen
 * bundled themes; anything else keeps the fallback rather than guessing, and
 * a fallback that is merely the wrong shade of dark beats a black band.
 */
export function toRgbTriple(color: string | undefined): string {
  if (!color) return FALLBACK_INK
  const hex = HEX.exec(color.trim())
  if (hex) {
    const body = hex[1]
    const wide =
      body.length === 3
        ? `${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
        : body
    const value = Number.parseInt(wide, 16)
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`
  }
  const fn = RGB_FN.exec(color.trim())
  if (fn) {
    return `${Math.round(Number(fn[1]))} ${Math.round(Number(fn[2]))} ${Math.round(Number(fn[3]))}`
  }
  return FALLBACK_INK
}

/**
 * Style for the shell root. It re-resolves only when the theme does — no tick
 * reaches it, so mounting this on `.pl-mobile-root` costs nothing per frame.
 */
export function useChartPaint(): CSSProperties {
  const theme = usePairlensChartTheme('palette')
  return useMemo(
    () =>
      ({
        '--pl-chart-ink-rgb': toRgbTriple(theme.background),
        '--pl-chart-fg': theme.hudText ?? 'var(--foreground)',
      }) as CSSProperties,
    [theme.background, theme.hudText],
  )
}
