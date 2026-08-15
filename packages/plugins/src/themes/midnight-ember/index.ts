// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'midnight-ember',
  name: 'Midnight Ember',
  light: {
    '--background': 'oklch(0.95 0.01 60)',
    '--foreground': 'oklch(0.22 0.02 50)',
    '--card': 'oklch(0.96 0.008 55)',
    '--card-foreground': 'oklch(0.22 0.02 50)',
    '--popover': 'oklch(0.96 0.008 55)',
    '--popover-foreground': 'oklch(0.22 0.02 50)',
    '--primary': 'oklch(0.58 0.16 45)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.91 0.012 55)',
    '--secondary-foreground': 'oklch(0.28 0.02 50)',
    '--muted': 'oklch(0.93 0.008 55)',
    '--muted-foreground': 'oklch(0.52 0.015 50)',
    '--accent': 'oklch(0.90 0.03 50)',
    '--accent-foreground': 'oklch(0.22 0.02 50)',
    '--destructive': 'oklch(0.55 0.22 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.88 0.012 55)',
    '--input': 'oklch(0.88 0.012 55)',
    '--ring': 'oklch(0.58 0.16 45)',
    '--chart-1': 'oklch(0.58 0.16 45)',
    '--chart-2': 'oklch(0.68 0.12 65)',
    '--chart-3': 'oklch(0.52 0.015 50)',
    '--chart-4': 'oklch(0.74 0.01 55)',
    '--chart-5': 'oklch(0.88 0.008 55)',
    '--sidebar': 'oklch(0.20 0.02 40)',
    '--sidebar-foreground': 'oklch(0.82 0.03 55)',
    '--sidebar-primary': 'oklch(0.82 0.03 55)',
    '--sidebar-primary-foreground': 'oklch(0.20 0.02 40)',
    '--sidebar-accent': 'oklch(0.30 0.04 45)',
    '--sidebar-accent-foreground': 'oklch(0.82 0.03 55)',
    '--sidebar-border': 'oklch(0.35 0.03 42)',
    '--sidebar-ring': 'oklch(0.82 0.03 55)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.62 0.16 45)',
    '--orb-c2': 'oklch(0.55 0.14 30)',
    '--orb-c3': 'oklch(0.50 0.10 65)',
    '--noise-opacity': '0.06',
    '--radius': '0.5rem',
  },
  dark: {
    '--background': 'oklch(0.14 0.015 45)',
    '--foreground': 'oklch(0.86 0.025 55)',
    '--card': 'oklch(0.18 0.02 45)',
    '--card-foreground': 'oklch(0.86 0.025 55)',
    '--popover': 'oklch(0.16 0.018 45)',
    '--popover-foreground': 'oklch(0.86 0.025 55)',
    '--primary': 'oklch(0.68 0.16 45)',
    '--primary-foreground': 'oklch(0.14 0.015 45)',
    '--secondary': 'oklch(0.22 0.02 45)',
    '--secondary-foreground': 'oklch(0.86 0.025 55)',
    '--muted': 'oklch(0.19 0.015 45)',
    '--muted-foreground': 'oklch(0.55 0.02 50)',
    '--accent': 'oklch(0.26 0.04 45)',
    '--accent-foreground': 'oklch(0.86 0.025 55)',
    '--destructive': 'oklch(0.60 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.28 0.025 45)',
    '--input': 'oklch(0.28 0.025 45)',
    '--ring': 'oklch(0.68 0.16 45)',
    '--chart-1': 'oklch(0.68 0.16 45)',
    '--chart-2': 'oklch(0.60 0.12 65)',
    '--chart-3': 'oklch(0.55 0.02 50)',
    '--chart-4': 'oklch(0.38 0.02 45)',
    '--chart-5': 'oklch(0.28 0.02 45)',
    '--sidebar': 'oklch(0.12 0.02 40)',
    '--sidebar-foreground': 'oklch(0.80 0.03 55)',
    '--sidebar-primary': 'oklch(0.80 0.03 55)',
    '--sidebar-primary-foreground': 'oklch(0.12 0.02 40)',
    '--sidebar-accent': 'oklch(0.22 0.04 45)',
    '--sidebar-accent-foreground': 'oklch(0.80 0.03 55)',
    '--sidebar-border': 'oklch(0.27 0.025 42)',
    '--sidebar-ring': 'oklch(0.80 0.03 55)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.16 45)',
    '--orb-c2': 'oklch(0.58 0.14 30)',
    '--orb-c3': 'oklch(0.55 0.10 65)',
    '--noise-opacity': '0.12',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#1e1610',
    upCandle: '#e8873a',
    downCandle: '#8a9aaa',
    crosshair: '#c07830',
    grid: '#28201a',
    axisText: '#8a7a68',
    axisBackground: '#161008',
    hudBg: 'rgba(30, 22, 16, 0.94)',
    hudText: '#e8d8c0',
    volumeUp: '#e8873a44',
    volumeDown: '#8a9aaa44',
  },
  // Warm paper. Ember orange up, ash slate down: the same warm/cool split
  // the dark palette runs.
  chartLight: {
    background: '#f4ede8',
    upCandle: '#b25e13',
    downCandle: '#526678',
    crosshair: '#8e8076',
    grid: '#dfd6cf',
    axisText: '#706761',
    axisBackground: '#ede6e1',
    hudBg: 'rgba(251, 248, 245, 0.93)',
    hudText: '#221812',
    volumeUp: '#b25e1344',
    volumeDown: '#52667844',
  },
}

export const midnightEmberManifest: PluginManifest = {
  id: 'midnight-ember',
  name: 'Midnight Ember',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Warm dark theme with deep charcoal base and glowing orange-amber ember accents',
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
    entry: 'midnight-ember',
    previewColors: {
      light: ['#c06820', '#e8873a', '#8a9aaa', '#8a7a68', '#f0e8d8'],
      dark: ['#e8873a', '#c07830', '#8a9aaa', '#8a7a68', '#1e1610'],
    },
  },
}

export function createMidnightEmberPlugin(
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
