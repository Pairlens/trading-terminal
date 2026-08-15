// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'sakura-bloom',
  name: 'Sakura Bloom',
  light: {
    '--background': 'oklch(0.97 0.008 350)',
    '--foreground': 'oklch(0.25 0.02 345)',
    '--card': 'oklch(0.98 0.006 350)',
    '--card-foreground': 'oklch(0.25 0.02 345)',
    '--popover': 'oklch(0.98 0.006 350)',
    '--popover-foreground': 'oklch(0.25 0.02 345)',
    '--primary': 'oklch(0.62 0.14 350)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.94 0.01 350)',
    '--secondary-foreground': 'oklch(0.30 0.02 345)',
    '--muted': 'oklch(0.95 0.006 350)',
    '--muted-foreground': 'oklch(0.55 0.015 345)',
    '--accent': 'oklch(0.93 0.02 350)',
    '--accent-foreground': 'oklch(0.25 0.02 345)',
    '--destructive': 'oklch(0.55 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.91 0.01 350)',
    '--input': 'oklch(0.91 0.01 350)',
    '--ring': 'oklch(0.62 0.14 350)',
    '--chart-1': 'oklch(0.62 0.14 350)',
    '--chart-2': 'oklch(0.72 0.08 10)',
    '--chart-3': 'oklch(0.55 0.015 345)',
    '--chart-4': 'oklch(0.78 0.008 350)',
    '--chart-5': 'oklch(0.91 0.006 350)',
    '--sidebar': 'oklch(0.24 0.025 340)',
    '--sidebar-foreground': 'oklch(0.88 0.02 350)',
    '--sidebar-primary': 'oklch(0.88 0.02 350)',
    '--sidebar-primary-foreground': 'oklch(0.24 0.025 340)',
    '--sidebar-accent': 'oklch(0.34 0.04 345)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.02 350)',
    '--sidebar-border': 'oklch(0.39 0.03 342)',
    '--sidebar-ring': 'oklch(0.88 0.02 350)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.14 350)',
    '--orb-c2': 'oklch(0.72 0.10 10)',
    '--orb-c3': 'oklch(0.60 0.08 330)',
    '--noise-opacity': '0.04',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.15 0.015 345)',
    '--foreground': 'oklch(0.90 0.015 350)',
    '--card': 'oklch(0.19 0.018 345)',
    '--card-foreground': 'oklch(0.90 0.015 350)',
    '--popover': 'oklch(0.17 0.016 345)',
    '--popover-foreground': 'oklch(0.90 0.015 350)',
    '--primary': 'oklch(0.72 0.12 350)',
    '--primary-foreground': 'oklch(0.15 0.015 345)',
    '--secondary': 'oklch(0.22 0.02 345)',
    '--secondary-foreground': 'oklch(0.90 0.015 350)',
    '--muted': 'oklch(0.20 0.012 345)',
    '--muted-foreground': 'oklch(0.58 0.015 345)',
    '--accent': 'oklch(0.27 0.035 350)',
    '--accent-foreground': 'oklch(0.90 0.015 350)',
    '--destructive': 'oklch(0.60 0.18 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.28 0.025 345)',
    '--input': 'oklch(0.28 0.025 345)',
    '--ring': 'oklch(0.72 0.12 350)',
    '--chart-1': 'oklch(0.72 0.12 350)',
    '--chart-2': 'oklch(0.65 0.08 10)',
    '--chart-3': 'oklch(0.58 0.015 345)',
    '--chart-4': 'oklch(0.40 0.02 345)',
    '--chart-5': 'oklch(0.28 0.018 345)',
    '--sidebar': 'oklch(0.13 0.02 340)',
    '--sidebar-foreground': 'oklch(0.85 0.02 350)',
    '--sidebar-primary': 'oklch(0.85 0.02 350)',
    '--sidebar-primary-foreground': 'oklch(0.13 0.02 340)',
    '--sidebar-accent': 'oklch(0.23 0.035 345)',
    '--sidebar-accent-foreground': 'oklch(0.85 0.02 350)',
    '--sidebar-border': 'oklch(0.28 0.025 342)',
    '--sidebar-ring': 'oklch(0.85 0.02 350)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.72 0.12 350)',
    '--orb-c2': 'oklch(0.65 0.10 10)',
    '--orb-c3': 'oklch(0.58 0.08 330)',
    '--noise-opacity': '0.10',
    '--radius': '0.625rem',
  },
  chart: {
    background: '#1e1418',
    upCandle: '#f298b0',
    downCandle: '#7a8a9a',
    crosshair: '#c87090',
    grid: '#281c22',
    axisText: '#9a7888',
    axisBackground: '#160e12',
    hudBg: 'rgba(30, 20, 24, 0.94)',
    hudText: '#f0d8e0',
    volumeUp: '#f298b044',
    volumeDown: '#7a8a9a44',
  },
  // Blossom paper. Deep sakura pink up, slate down — the dark palette's
  // pink/slate contrast in ink.
  chartLight: {
    background: '#faf3f6',
    upCandle: '#b93f67',
    downCandle: '#51667a',
    crosshair: '#8c7f85',
    grid: '#e5dbdf',
    axisText: '#6d6368',
    axisBackground: '#f3ecef',
    hudBg: 'rgba(255, 253, 254, 0.93)',
    hudText: '#291e24',
    volumeUp: '#b93f6744',
    volumeDown: '#51667a44',
  },
}

export const sakuraBloomManifest: PluginManifest = {
  id: 'sakura-bloom',
  name: 'Sakura Bloom',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Delicate cherry blossom theme with soft pinks, rose accents, and gentle warmth',
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
    entry: 'sakura-bloom',
    previewColors: {
      light: ['#d45880', '#f298b0', '#7a8a9a', '#9a7888', '#fce8f0'],
      dark: ['#f298b0', '#c87090', '#7a8a9a', '#9a7888', '#1e1418'],
    },
  },
}

export function createSakuraBloomPlugin(
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
