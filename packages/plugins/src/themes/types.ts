// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export type ThemeVariableMap = Record<string, string>

export type ThemeDefinition = {
  id: string
  name: string
  light: ThemeVariableMap
  dark: ThemeVariableMap
  chart?: {
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
}
