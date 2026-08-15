// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Burnt Orange — warm Reddit-inspired palette with deep oranges and cream
const theme: ThemeDefinition = {
  id: 'burnt-orange',
  name: 'Burnt Orange',
  light: {
    '--background': 'oklch(0.97 0.005 70)',
    '--foreground': 'oklch(0.18 0.01 50)',
    '--card': 'oklch(0.99 0 0)',
    '--card-foreground': 'oklch(0.18 0.01 50)',
    '--popover': 'oklch(0.99 0 0)',
    '--popover-foreground': 'oklch(0.18 0.01 50)',
    '--primary': 'oklch(0.58 0.18 45)',
    '--primary-foreground': 'oklch(0.99 0 0)',
    '--secondary': 'oklch(0.93 0.01 70)',
    '--secondary-foreground': 'oklch(0.22 0.01 50)',
    '--muted': 'oklch(0.94 0.008 70)',
    '--muted-foreground': 'oklch(0.48 0.01 50)',
    '--accent': 'oklch(0.92 0.03 45)',
    '--accent-foreground': 'oklch(0.18 0.01 50)',
    '--destructive': 'oklch(0.55 0.22 25)',
    '--destructive-foreground': 'oklch(0.99 0 0)',
    '--border': 'oklch(0.88 0.01 70)',
    '--input': 'oklch(0.88 0.01 70)',
    '--ring': 'oklch(0.58 0.18 45)',
    '--chart-1': 'oklch(0.58 0.18 45)',
    '--chart-2': 'oklch(0.55 0.15 265)',
    '--chart-3': 'oklch(0.62 0.16 145)',
    '--chart-4': 'oklch(0.65 0.12 25)',
    '--chart-5': 'oklch(0.50 0.08 70)',
    '--sidebar': 'oklch(0.98 0.005 45)',
    '--sidebar-foreground': 'oklch(0.25 0.02 50)',
    '--sidebar-primary': 'oklch(0.58 0.18 45)',
    '--sidebar-primary-foreground': 'oklch(0.99 0 0)',
    '--sidebar-accent': 'oklch(0.94 0.03 45)',
    '--sidebar-accent-foreground': 'oklch(0.25 0.02 50)',
    '--sidebar-border': 'oklch(0.90 0.02 45)',
    '--sidebar-ring': 'oklch(0.58 0.18 45)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.60 0.20 45)',
    '--orb-c2': 'oklch(0.55 0.15 30)',
    '--orb-c3': 'oklch(0.65 0.12 60)',
    '--noise-opacity': '0.05',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.12 0.01 50)',
    '--foreground': 'oklch(0.90 0.01 70)',
    '--card': 'oklch(0.16 0.01 50)',
    '--card-foreground': 'oklch(0.90 0.01 70)',
    '--popover': 'oklch(0.14 0.01 50)',
    '--popover-foreground': 'oklch(0.90 0.01 70)',
    '--primary': 'oklch(0.68 0.18 45)',
    '--primary-foreground': 'oklch(0.12 0.01 50)',
    '--secondary': 'oklch(0.20 0.01 50)',
    '--secondary-foreground': 'oklch(0.85 0.01 70)',
    '--muted': 'oklch(0.18 0.01 50)',
    '--muted-foreground': 'oklch(0.55 0.01 60)',
    '--accent': 'oklch(0.25 0.04 45)',
    '--accent-foreground': 'oklch(0.90 0.01 70)',
    '--destructive': 'oklch(0.62 0.22 25)',
    '--destructive-foreground': 'oklch(0.97 0 0)',
    '--border': 'oklch(0.26 0.02 50)',
    '--input': 'oklch(0.24 0.02 50)',
    '--ring': 'oklch(0.68 0.18 45)',
    '--chart-1': 'oklch(0.68 0.18 45)',
    '--chart-2': 'oklch(0.60 0.15 265)',
    '--chart-3': 'oklch(0.68 0.16 145)',
    '--chart-4': 'oklch(0.70 0.12 25)',
    '--chart-5': 'oklch(0.55 0.06 70)',
    '--sidebar': 'oklch(0.15 0.02 45)',
    '--sidebar-foreground': 'oklch(0.88 0.02 55)',
    '--sidebar-primary': 'oklch(0.68 0.18 45)',
    '--sidebar-primary-foreground': 'oklch(0.12 0.01 50)',
    '--sidebar-accent': 'oklch(0.22 0.04 45)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.02 55)',
    '--sidebar-border': 'oklch(0.22 0.03 45)',
    '--sidebar-ring': 'oklch(0.68 0.18 45)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.20 45)',
    '--orb-c2': 'oklch(0.62 0.16 30)',
    '--orb-c3': 'oklch(0.72 0.14 60)',
    '--noise-opacity': '0.10',
    '--radius': '0.625rem',
  },
  chart: {
    background: '#1a1410',
    upCandle: '#ff6600',
    downCandle: '#6366f1',
    crosshair: '#a8a29e',
    grid: '#231c14',
    axisText: '#a8a29e',
    axisBackground: '#120e0a',
    hudBg: 'rgba(18, 14, 10, 0.95)',
    hudText: '#fed7aa',
    volumeUp: '#ff660044',
    volumeDown: '#6366f144',
  },
  // Warm paper. Burnt orange up, indigo down, both deepened — the orange
  // stays the hero it is in dark mode.
  chartLight: {
    background: '#f7f5f2',
    upCandle: '#bd4d00',
    downCandle: '#4842cf',
    crosshair: '#86837d',
    grid: '#dfdcd8',
    axisText: '#635c59',
    axisBackground: '#f0eeeb',
    hudBg: 'rgba(254, 253, 252, 0.93)',
    hudText: '#15100e',
    volumeUp: '#bd4d0044',
    volumeDown: '#4842cf44',
  },
}

export const burntOrangeManifest: PluginManifest = {
  id: 'burnt-orange',
  name: 'Burnt Orange',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'Warm Reddit-inspired palette with deep oranges and cream tones',
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
    entry: 'burnt-orange',
    previewColors: {
      light: ['#ff6600', '#fff8f0', '#1c1c1c', '#f5e6d3', '#cc5200'],
      dark: ['#ff8c3a', '#1a1410', '#f0d8c0', '#3d2a14', '#cc6600'],
    },
  },
}

export function createBurntOrangePlugin(
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
