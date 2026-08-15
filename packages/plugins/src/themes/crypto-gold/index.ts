// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'crypto-gold',
  name: 'Crypto Gold',
  light: {
    '--background': 'oklch(0.95 0.015 75)',
    '--foreground': 'oklch(0.22 0.02 60)',
    '--card': 'oklch(0.97 0.012 75)',
    '--card-foreground': 'oklch(0.22 0.02 60)',
    '--popover': 'oklch(0.97 0.012 75)',
    '--popover-foreground': 'oklch(0.22 0.02 60)',
    '--primary': 'oklch(0.65 0.16 70)',
    '--primary-foreground': 'oklch(0.15 0.02 60)',
    '--secondary': 'oklch(0.90 0.02 75)',
    '--secondary-foreground': 'oklch(0.28 0.02 60)',
    '--muted': 'oklch(0.92 0.012 75)',
    '--muted-foreground': 'oklch(0.50 0.02 65)',
    '--accent': 'oklch(0.90 0.04 75)',
    '--accent-foreground': 'oklch(0.22 0.02 60)',
    '--destructive': 'oklch(0.58 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.87 0.025 75)',
    '--input': 'oklch(0.87 0.025 75)',
    '--ring': 'oklch(0.65 0.16 70)',
    '--chart-1': 'oklch(0.65 0.16 70)',
    '--chart-2': 'oklch(0.60 0.14 145)',
    '--chart-3': 'oklch(0.50 0.02 65)',
    '--chart-4': 'oklch(0.72 0.03 75)',
    '--chart-5': 'oklch(0.87 0.02 75)',
    '--sidebar': 'oklch(0.18 0.015 60)',
    '--sidebar-foreground': 'oklch(0.80 0.06 75)',
    '--sidebar-primary': 'oklch(0.80 0.06 75)',
    '--sidebar-primary-foreground': 'oklch(0.18 0.015 60)',
    '--sidebar-accent': 'oklch(0.28 0.03 60)',
    '--sidebar-accent-foreground': 'oklch(0.80 0.06 75)',
    '--sidebar-border': 'oklch(0.33 0.02 60)',
    '--sidebar-ring': 'oklch(0.80 0.06 75)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.72 0.16 75)',
    '--orb-c2': 'oklch(0.55 0.12 50)',
    '--orb-c3': 'oklch(0.60 0.08 85)',
    '--noise-opacity': '0.10',
    '--radius': '0.5rem',
  },
  dark: {
    '--background': 'oklch(0.14 0.01 60)',
    '--foreground': 'oklch(0.85 0.06 75)',
    '--card': 'oklch(0.19 0.015 60)',
    '--card-foreground': 'oklch(0.85 0.06 75)',
    '--popover': 'oklch(0.17 0.012 60)',
    '--popover-foreground': 'oklch(0.85 0.06 75)',
    '--primary': 'oklch(0.75 0.14 75)',
    '--primary-foreground': 'oklch(0.14 0.01 60)',
    '--secondary': 'oklch(0.22 0.015 60)',
    '--secondary-foreground': 'oklch(0.85 0.06 75)',
    '--muted': 'oklch(0.19 0.01 60)',
    '--muted-foreground': 'oklch(0.58 0.03 70)',
    '--accent': 'oklch(0.28 0.04 65)',
    '--accent-foreground': 'oklch(0.85 0.06 75)',
    '--destructive': 'oklch(0.62 0.18 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.28 0.03 65)',
    '--input': 'oklch(0.28 0.03 65)',
    '--ring': 'oklch(0.75 0.14 75)',
    '--chart-1': 'oklch(0.75 0.14 75)',
    '--chart-2': 'oklch(0.65 0.14 145)',
    '--chart-3': 'oklch(0.58 0.03 70)',
    '--chart-4': 'oklch(0.40 0.02 65)',
    '--chart-5': 'oklch(0.28 0.02 60)',
    '--sidebar': 'oklch(0.12 0.015 55)',
    '--sidebar-foreground': 'oklch(0.80 0.08 75)',
    '--sidebar-primary': 'oklch(0.80 0.08 75)',
    '--sidebar-primary-foreground': 'oklch(0.12 0.015 55)',
    '--sidebar-accent': 'oklch(0.22 0.04 65)',
    '--sidebar-accent-foreground': 'oklch(0.80 0.08 75)',
    '--sidebar-border': 'oklch(0.27 0.02 60)',
    '--sidebar-ring': 'oklch(0.80 0.08 75)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.75 0.14 75)',
    '--orb-c2': 'oklch(0.60 0.12 50)',
    '--orb-c3': 'oklch(0.65 0.08 85)',
    '--noise-opacity': '0.22',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#1c1810',
    upCandle: '#d4a437',
    downCandle: '#c0392b',
    crosshair: '#b8a060',
    grid: '#2a2518',
    axisText: '#8a7d5a',
    axisBackground: '#161208',
    hudBg: 'rgba(28, 24, 16, 0.94)',
    hudText: '#e8d8a0',
    volumeUp: '#d4a43744',
    volumeDown: '#c0392b44',
  },
  // Parchment. Gold up against brick red — the closest hue pair of any theme
  // here, so the separation is carried by lightness (0.61 vs 0.47 in OKLCH) as
  // well as hue. Pushing the gold lighter than this reads as gold but drops
  // under 3:1 on parchment.
  chartLight: {
    background: '#f5ede4',
    upCandle: '#a87800',
    downCandle: '#a61d1d',
    crosshair: '#90806e',
    grid: '#e0d6ca',
    axisText: '#6c6158',
    axisBackground: '#eee6dd',
    hudBg: 'rgba(251, 248, 244, 0.93)',
    hudText: '#221811',
    volumeUp: '#a8780044',
    volumeDown: '#a61d1d44',
  },
}

export const cryptoGoldManifest: PluginManifest = {
  id: 'crypto-gold',
  name: 'Crypto Gold',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Bitcoin-inspired theme with gold accents, dark amber backgrounds, and bullish energy',
  capabilities: [
    {
      id: 'theme:override',
      singleton: true,
      markets: ['*'],
      priority: 5,
      streaming: false,
    },
  ],
  metadata: { family: 'themes' },
  config: {},
  theme: {
    entry: 'crypto-gold',
    previewColors: {
      light: ['#c89b30', '#d4a437', '#c0392b', '#8a7d5a', '#e8d8a0'],
      dark: ['#f0c040', '#d4a437', '#c0392b', '#b8a060', '#1c1810'],
    },
  },
}

export function createCryptoGoldPlugin(
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
