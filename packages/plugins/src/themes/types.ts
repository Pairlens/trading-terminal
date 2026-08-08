// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type ThemeVariableMap = Record<string, string>

/** Concrete colors for the WebGL chart — the engine reads hex, not CSS vars. */
export type ThemeChartPalette = {
  background?: string
  upCandle?: string
  downCandle?: string
  crosshair?: string
  grid?: string
  axisText?: string
  axisBackground?: string
  hudBg?: string
  hudText?: string
  volumeUp?: string
  volumeDown?: string
}

export type ThemeDefinition = {
  id: string
  name: string
  light: ThemeVariableMap
  dark: ThemeVariableMap
  /** Chart palette for DARK mode. */
  chart?: ThemeChartPalette
  /**
   * Chart palette for LIGHT mode. A theme that omits it gets the engine's own
   * light defaults — never the dark palette, which is what used to wrap a
   * light UI around a dark plot.
   */
  chartLight?: ThemeChartPalette
}
