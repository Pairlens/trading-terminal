// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Eye Comfort — warm, low-contrast palette designed to reduce eye fatigue
// during long trading sessions. Avoids pure white/black and blue light.
const theme: ThemeDefinition = {
  id: 'eye-comfort',
  name: 'Eye Comfort',
  light: {
    '--background': 'oklch(0.94 0.01 85)',
    '--foreground': 'oklch(0.28 0.01 70)',
    '--card': 'oklch(0.96 0.008 85)',
    '--card-foreground': 'oklch(0.28 0.01 70)',
    '--popover': 'oklch(0.96 0.008 85)',
    '--popover-foreground': 'oklch(0.28 0.01 70)',
    '--primary': 'oklch(0.50 0.08 165)',
    '--primary-foreground': 'oklch(0.96 0.008 85)',
    '--secondary': 'oklch(0.91 0.008 85)',
    '--secondary-foreground': 'oklch(0.32 0.01 70)',
    '--muted': 'oklch(0.92 0.008 85)',
    '--muted-foreground': 'oklch(0.50 0.008 70)',
    '--accent': 'oklch(0.92 0.015 165)',
    '--accent-foreground': 'oklch(0.28 0.01 70)',
    '--destructive': 'oklch(0.55 0.14 25)',
    '--destructive-foreground': 'oklch(0.96 0.008 85)',
    '--border': 'oklch(0.88 0.01 85)',
    '--input': 'oklch(0.88 0.01 85)',
    '--ring': 'oklch(0.50 0.08 165)',
    '--chart-1': 'oklch(0.55 0.10 165)',
    '--chart-2': 'oklch(0.55 0.10 45)',
    '--chart-3': 'oklch(0.50 0.06 250)',
    '--chart-4': 'oklch(0.60 0.08 90)',
    '--chart-5': 'oklch(0.50 0.06 310)',
    '--sidebar': 'oklch(0.90 0.01 85)',
    '--sidebar-foreground': 'oklch(0.32 0.01 70)',
    '--sidebar-primary': 'oklch(0.50 0.08 165)',
    '--sidebar-primary-foreground': 'oklch(0.96 0.008 85)',
    '--sidebar-accent': 'oklch(0.87 0.015 85)',
    '--sidebar-accent-foreground': 'oklch(0.32 0.01 70)',
    '--sidebar-border': 'oklch(0.85 0.01 85)',
    '--sidebar-ring': 'oklch(0.50 0.08 165)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.55 0.08 165)',
    '--orb-c2': 'oklch(0.55 0.08 45)',
    '--orb-c3': 'oklch(0.52 0.05 90)',
    '--noise-opacity': '0.03',
    '--radius': '0.5rem',
  },
  dark: {
    // Warm dark gray, never pure black — reduces contrast fatigue
    '--background': 'oklch(0.18 0.008 70)',
    '--foreground': 'oklch(0.82 0.01 85)',
    '--card': 'oklch(0.22 0.008 70)',
    '--card-foreground': 'oklch(0.82 0.01 85)',
    '--popover': 'oklch(0.20 0.008 70)',
    '--popover-foreground': 'oklch(0.82 0.01 85)',
    '--primary': 'oklch(0.65 0.08 165)',
    '--primary-foreground': 'oklch(0.18 0.008 70)',
    '--secondary': 'oklch(0.24 0.008 70)',
    '--secondary-foreground': 'oklch(0.78 0.01 85)',
    '--muted': 'oklch(0.22 0.006 70)',
    '--muted-foreground': 'oklch(0.55 0.008 70)',
    '--accent': 'oklch(0.28 0.02 165)',
    '--accent-foreground': 'oklch(0.82 0.01 85)',
    '--destructive': 'oklch(0.58 0.14 25)',
    '--destructive-foreground': 'oklch(0.92 0.01 85)',
    '--border': 'oklch(0.30 0.008 70)',
    '--input': 'oklch(0.28 0.008 70)',
    '--ring': 'oklch(0.65 0.08 165)',
    '--chart-1': 'oklch(0.62 0.10 165)',
    '--chart-2': 'oklch(0.62 0.10 45)',
    '--chart-3': 'oklch(0.55 0.06 250)',
    '--chart-4': 'oklch(0.65 0.08 90)',
    '--chart-5': 'oklch(0.55 0.06 310)',
    '--sidebar': 'oklch(0.20 0.01 70)',
    '--sidebar-foreground': 'oklch(0.78 0.01 85)',
    '--sidebar-primary': 'oklch(0.65 0.08 165)',
    '--sidebar-primary-foreground': 'oklch(0.18 0.008 70)',
    '--sidebar-accent': 'oklch(0.26 0.015 70)',
    '--sidebar-accent-foreground': 'oklch(0.78 0.01 85)',
    '--sidebar-border': 'oklch(0.28 0.008 70)',
    '--sidebar-ring': 'oklch(0.65 0.08 165)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.62 0.08 165)',
    '--orb-c2': 'oklch(0.60 0.08 45)',
    '--orb-c3': 'oklch(0.58 0.05 90)',
    '--noise-opacity': '0.06',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#2a2520',
    upCandle: '#4ade80',
    downCandle: '#f87171',
    crosshair: '#8b8070',
    grid: '#332e28',
    axisText: '#8b8070',
    axisBackground: '#221e1a',
    hudBg: 'rgba(34, 30, 26, 0.95)',
    hudText: '#d4c8b8',
    volumeUp: '#4ade8044',
    volumeDown: '#f8717144',
  },
}

export const eyeComfortManifest: PluginManifest = {
  id: 'eye-comfort',
  name: 'Eye Comfort',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Warm, low-contrast palette designed to reduce eye fatigue during long sessions',
  capabilities: [
    {
      id: 'theme:override',
      singleton: true,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  config: {},
  theme: {
    entry: 'eye-comfort',
    previewColors: {
      light: ['#e8dfc8', '#3a3530', '#6b9980', '#b8aa90', '#f0e8d8'],
      dark: ['#3a3530', '#c8b8a0', '#6b9980', '#4a4440', '#e0d0b8'],
    },
  },
}

export function createEyeComfortPlugin(
  manifest: PluginManifest,
): PluginInstance {
  async function execute(_params: PluginExecuteParams): Promise<unknown> {
    return theme
  }

  return {
    manifest,
    status: 'installed',
    config: {},
    execute,
  }
}
