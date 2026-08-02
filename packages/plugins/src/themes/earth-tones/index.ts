// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'earth-tones',
  name: 'Earth Tones',
  light: {
    '--background': 'oklch(0.94 0.015 140)',
    '--foreground': 'oklch(0.25 0.02 50)',
    '--card': 'oklch(0.96 0.012 140)',
    '--card-foreground': 'oklch(0.25 0.02 50)',
    '--popover': 'oklch(0.96 0.012 140)',
    '--popover-foreground': 'oklch(0.25 0.02 50)',
    '--primary': 'oklch(0.50 0.10 150)',
    '--primary-foreground': 'oklch(0.98 0.005 140)',
    '--secondary': 'oklch(0.88 0.02 140)',
    '--secondary-foreground': 'oklch(0.30 0.02 50)',
    '--muted': 'oklch(0.90 0.015 140)',
    '--muted-foreground': 'oklch(0.52 0.02 80)',
    '--accent': 'oklch(0.88 0.03 60)',
    '--accent-foreground': 'oklch(0.25 0.02 50)',
    '--destructive': 'oklch(0.55 0.15 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.85 0.02 140)',
    '--input': 'oklch(0.85 0.02 140)',
    '--ring': 'oklch(0.50 0.10 150)',
    '--chart-1': 'oklch(0.55 0.15 25)',
    '--chart-2': 'oklch(0.55 0.10 150)',
    '--chart-3': 'oklch(0.52 0.02 80)',
    '--chart-4': 'oklch(0.72 0.03 100)',
    '--chart-5': 'oklch(0.85 0.02 140)',
    '--sidebar': 'oklch(0.28 0.03 50)',
    '--sidebar-foreground': 'oklch(0.88 0.02 100)',
    '--sidebar-primary': 'oklch(0.88 0.02 100)',
    '--sidebar-primary-foreground': 'oklch(0.28 0.03 50)',
    '--sidebar-accent': 'oklch(0.38 0.04 50)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.02 100)',
    '--sidebar-border': 'oklch(0.43 0.03 50)',
    '--sidebar-ring': 'oklch(0.88 0.02 100)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.55 0.10 150)',
    '--orb-c2': 'oklch(0.55 0.15 25)',
    '--orb-c3': 'oklch(0.60 0.08 80)',
    '--noise-opacity': '0.15',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.16 0.015 50)',
    '--foreground': 'oklch(0.88 0.02 100)',
    '--card': 'oklch(0.22 0.02 50)',
    '--card-foreground': 'oklch(0.88 0.02 100)',
    '--popover': 'oklch(0.19 0.015 50)',
    '--popover-foreground': 'oklch(0.88 0.02 100)',
    '--primary': 'oklch(0.65 0.12 150)',
    '--primary-foreground': 'oklch(0.16 0.015 50)',
    '--secondary': 'oklch(0.25 0.02 50)',
    '--secondary-foreground': 'oklch(0.88 0.02 100)',
    '--muted': 'oklch(0.20 0.015 50)',
    '--muted-foreground': 'oklch(0.60 0.02 80)',
    '--accent': 'oklch(0.35 0.04 40)',
    '--accent-foreground': 'oklch(0.88 0.02 100)',
    '--destructive': 'oklch(0.60 0.15 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.30 0.03 50)',
    '--input': 'oklch(0.32 0.03 50)',
    '--ring': 'oklch(0.65 0.12 150)',
    '--chart-1': 'oklch(0.60 0.15 25)',
    '--chart-2': 'oklch(0.65 0.12 150)',
    '--chart-3': 'oklch(0.60 0.02 80)',
    '--chart-4': 'oklch(0.42 0.02 60)',
    '--chart-5': 'oklch(0.30 0.02 50)',
    '--sidebar': 'oklch(0.20 0.025 50)',
    '--sidebar-foreground': 'oklch(0.88 0.02 100)',
    '--sidebar-primary': 'oklch(0.88 0.02 100)',
    '--sidebar-primary-foreground': 'oklch(0.20 0.025 50)',
    '--sidebar-accent': 'oklch(0.30 0.04 40)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.02 100)',
    '--sidebar-border': 'oklch(0.35 0.03 50)',
    '--sidebar-ring': 'oklch(0.88 0.02 100)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.65 0.12 150)',
    '--orb-c2': 'oklch(0.60 0.15 25)',
    '--orb-c3': 'oklch(0.62 0.08 80)',
    '--noise-opacity': '0.25',
    '--radius': '0.625rem',
  },
  chart: {
    background: '#2a2318',
    upCandle: '#5a9e6f',
    downCandle: '#c45d3e',
    crosshair: '#8ba67a',
    grid: '#3a3228',
    axisText: '#8a7e6a',
    axisBackground: '#221c14',
    hudBg: 'rgba(42, 35, 24, 0.94)',
    hudText: '#d4c8a8',
    volumeUp: '#5a9e6f44',
    volumeDown: '#c45d3e44',
  },
}

export const earthTonesManifest: PluginManifest = {
  id: 'earth-tones',
  name: 'Earth Tones',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Warm nature-inspired theme with sage greens, terracotta, and browns',
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
    entry: 'earth-tones',
    previewColors: {
      light: ['#3d7a4a', '#c45d3e', '#8a7e6a', '#6b8f5e', '#d4c8a8'],
      dark: ['#5a9e6f', '#c45d3e', '#8ba67a', '#8a7e6a', '#d4c8a8'],
    },
  },
}

export function createEarthTonesPlugin(
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
