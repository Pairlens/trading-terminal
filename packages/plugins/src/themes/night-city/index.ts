// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Night City — Cyberpunk 2077 inspired. Electric yellow on dark gunmetal.
const theme: ThemeDefinition = {
  id: 'night-city',
  name: 'Night City',
  light: {
    '--background': 'oklch(0.93 0.008 90)',
    '--foreground': 'oklch(0.18 0.01 90)',
    '--card': 'oklch(0.96 0.005 90)',
    '--card-foreground': 'oklch(0.18 0.01 90)',
    '--popover': 'oklch(0.96 0.005 90)',
    '--popover-foreground': 'oklch(0.18 0.01 90)',
    '--primary': 'oklch(0.80 0.18 95)',
    '--primary-foreground': 'oklch(0.15 0.01 90)',
    '--secondary': 'oklch(0.90 0.01 90)',
    '--secondary-foreground': 'oklch(0.22 0.01 90)',
    '--muted': 'oklch(0.91 0.008 90)',
    '--muted-foreground': 'oklch(0.48 0.01 90)',
    '--accent': 'oklch(0.90 0.04 95)',
    '--accent-foreground': 'oklch(0.18 0.01 90)',
    '--destructive': 'oklch(0.55 0.22 15)',
    '--destructive-foreground': 'oklch(0.99 0 0)',
    '--border': 'oklch(0.85 0.01 90)',
    '--input': 'oklch(0.85 0.01 90)',
    '--ring': 'oklch(0.80 0.18 95)',
    '--chart-1': 'oklch(0.80 0.18 95)',
    '--chart-2': 'oklch(0.55 0.20 15)',
    '--chart-3': 'oklch(0.60 0.15 195)',
    '--chart-4': 'oklch(0.50 0.01 90)',
    '--chart-5': 'oklch(0.70 0.10 60)',
    '--sidebar': 'oklch(0.20 0.01 250)',
    '--sidebar-foreground': 'oklch(0.88 0.12 95)',
    '--sidebar-primary': 'oklch(0.88 0.12 95)',
    '--sidebar-primary-foreground': 'oklch(0.20 0.01 250)',
    '--sidebar-accent': 'oklch(0.28 0.02 250)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.12 95)',
    '--sidebar-border': 'oklch(0.30 0.02 250)',
    '--sidebar-ring': 'oklch(0.88 0.12 95)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.85 0.18 95)',
    '--orb-c2': 'oklch(0.60 0.20 15)',
    '--orb-c3': 'oklch(0.55 0.12 195)',
    '--noise-opacity': '0.08',
    '--radius': '0.25rem',
  },
  dark: {
    '--background': 'oklch(0.10 0.01 250)',
    '--foreground': 'oklch(0.88 0.12 95)',
    '--card': 'oklch(0.14 0.01 250)',
    '--card-foreground': 'oklch(0.88 0.12 95)',
    '--popover': 'oklch(0.12 0.01 250)',
    '--popover-foreground': 'oklch(0.88 0.12 95)',
    '--primary': 'oklch(0.88 0.18 95)',
    '--primary-foreground': 'oklch(0.12 0.01 250)',
    '--secondary': 'oklch(0.18 0.01 250)',
    '--secondary-foreground': 'oklch(0.85 0.10 95)',
    '--muted': 'oklch(0.16 0.01 250)',
    '--muted-foreground': 'oklch(0.52 0.02 90)',
    '--accent': 'oklch(0.22 0.04 95)',
    '--accent-foreground': 'oklch(0.88 0.12 95)',
    '--destructive': 'oklch(0.60 0.22 15)',
    '--destructive-foreground': 'oklch(0.97 0 0)',
    '--border': 'oklch(0.24 0.02 250)',
    '--input': 'oklch(0.22 0.02 250)',
    '--ring': 'oklch(0.88 0.18 95)',
    '--chart-1': 'oklch(0.88 0.18 95)',
    '--chart-2': 'oklch(0.60 0.22 15)',
    '--chart-3': 'oklch(0.65 0.15 195)',
    '--chart-4': 'oklch(0.50 0.02 250)',
    '--chart-5': 'oklch(0.75 0.12 60)',
    '--sidebar': 'oklch(0.12 0.015 250)',
    '--sidebar-foreground': 'oklch(0.88 0.14 95)',
    '--sidebar-primary': 'oklch(0.88 0.14 95)',
    '--sidebar-primary-foreground': 'oklch(0.12 0.015 250)',
    '--sidebar-accent': 'oklch(0.20 0.03 95)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.14 95)',
    '--sidebar-border': 'oklch(0.22 0.02 250)',
    '--sidebar-ring': 'oklch(0.88 0.14 95)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.88 0.20 95)',
    '--orb-c2': 'oklch(0.65 0.22 15)',
    '--orb-c3': 'oklch(0.60 0.14 195)',
    '--noise-opacity': '0.15',
    '--radius': '0.25rem',
  },
  chart: {
    background: '#0f111a',
    upCandle: '#fcee09',
    downCandle: '#e11d48',
    crosshair: '#737373',
    grid: '#181c2a',
    axisText: '#808080',
    axisBackground: '#0a0c14',
    hudBg: 'rgba(10, 12, 20, 0.95)',
    hudText: '#fcee09',
    volumeUp: '#fcee0944',
    volumeDown: '#e11d4844',
  },
  // Concrete paper. The neon yellow lands as brass (pure yellow reads at
  // about 1.4:1 on paper), crimson down.
  chartLight: {
    background: '#eae8e2',
    upCandle: '#927c00',
    downCandle: '#c0163b',
    crosshair: '#878377',
    grid: '#d4d1c9',
    axisText: '#605d57',
    axisBackground: '#e3e1db',
    hudBg: 'rgba(245, 244, 242, 0.93)',
    hudText: '#13110d',
    volumeUp: '#927c0044',
    volumeDown: '#c0163b44',
  },
}

export const nightCityManifest: PluginManifest = {
  id: 'night-city',
  name: 'Night City',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Cyberpunk 2077 inspired — electric yellow on dark gunmetal with sharp edges',
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
    entry: 'night-city',
    previewColors: {
      light: ['#fcee09', '#2a2d3a', '#f0f0e0', '#e11d48', '#404560'],
      dark: ['#fcee09', '#0f111a', '#e8e6c0', '#e11d48', '#303348'],
    },
  },
}

export function createNightCityPlugin(
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
