// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'royal-violet',
  name: 'Royal Violet',
  light: {
    '--background': 'oklch(0.96 0.012 300)',
    '--foreground': 'oklch(0.20 0.03 295)',
    '--card': 'oklch(0.97 0.010 300)',
    '--card-foreground': 'oklch(0.20 0.03 295)',
    '--popover': 'oklch(0.97 0.010 300)',
    '--popover-foreground': 'oklch(0.20 0.03 295)',
    '--primary': 'oklch(0.52 0.20 295)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.92 0.015 300)',
    '--secondary-foreground': 'oklch(0.25 0.03 295)',
    '--muted': 'oklch(0.94 0.010 300)',
    '--muted-foreground': 'oklch(0.50 0.02 295)',
    '--accent': 'oklch(0.92 0.025 300)',
    '--accent-foreground': 'oklch(0.20 0.03 295)',
    '--destructive': 'oklch(0.58 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.89 0.015 300)',
    '--input': 'oklch(0.89 0.015 300)',
    '--ring': 'oklch(0.52 0.20 295)',
    '--chart-1': 'oklch(0.52 0.20 295)',
    '--chart-2': 'oklch(0.62 0.15 320)',
    '--chart-3': 'oklch(0.50 0.02 295)',
    '--chart-4': 'oklch(0.72 0.015 300)',
    '--chart-5': 'oklch(0.89 0.010 300)',
    '--sidebar': 'oklch(0.18 0.04 295)',
    '--sidebar-foreground': 'oklch(0.84 0.025 300)',
    '--sidebar-primary': 'oklch(0.84 0.025 300)',
    '--sidebar-primary-foreground': 'oklch(0.18 0.04 295)',
    '--sidebar-accent': 'oklch(0.28 0.05 295)',
    '--sidebar-accent-foreground': 'oklch(0.84 0.025 300)',
    '--sidebar-border': 'oklch(0.33 0.04 295)',
    '--sidebar-ring': 'oklch(0.84 0.025 300)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.58 0.20 295)',
    '--orb-c2': 'oklch(0.55 0.15 320)',
    '--orb-c3': 'oklch(0.50 0.12 270)',
    '--noise-opacity': '0.07',
    '--radius': '0.5rem',
  },
  dark: {
    '--background': 'oklch(0.13 0.025 295)',
    '--foreground': 'oklch(0.87 0.02 300)',
    '--card': 'oklch(0.17 0.03 295)',
    '--card-foreground': 'oklch(0.87 0.02 300)',
    '--popover': 'oklch(0.15 0.025 295)',
    '--popover-foreground': 'oklch(0.87 0.02 300)',
    '--primary': 'oklch(0.68 0.18 295)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.20 0.03 295)',
    '--secondary-foreground': 'oklch(0.87 0.02 300)',
    '--muted': 'oklch(0.18 0.02 295)',
    '--muted-foreground': 'oklch(0.56 0.02 295)',
    '--accent': 'oklch(0.25 0.05 295)',
    '--accent-foreground': 'oklch(0.87 0.02 300)',
    '--destructive': 'oklch(0.62 0.18 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.27 0.035 295)',
    '--input': 'oklch(0.27 0.035 295)',
    '--ring': 'oklch(0.68 0.18 295)',
    '--chart-1': 'oklch(0.68 0.18 295)',
    '--chart-2': 'oklch(0.60 0.14 320)',
    '--chart-3': 'oklch(0.56 0.02 295)',
    '--chart-4': 'oklch(0.38 0.025 295)',
    '--chart-5': 'oklch(0.27 0.025 295)',
    '--sidebar': 'oklch(0.11 0.03 295)',
    '--sidebar-foreground': 'oklch(0.82 0.025 300)',
    '--sidebar-primary': 'oklch(0.82 0.025 300)',
    '--sidebar-primary-foreground': 'oklch(0.11 0.03 295)',
    '--sidebar-accent': 'oklch(0.20 0.05 295)',
    '--sidebar-accent-foreground': 'oklch(0.82 0.025 300)',
    '--sidebar-border': 'oklch(0.26 0.035 295)',
    '--sidebar-ring': 'oklch(0.82 0.025 300)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.18 295)',
    '--orb-c2': 'oklch(0.60 0.15 320)',
    '--orb-c3': 'oklch(0.55 0.12 270)',
    '--noise-opacity': '0.14',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#16101e',
    upCandle: '#b388ff',
    downCandle: '#ff6e80',
    crosshair: '#8060b0',
    grid: '#201828',
    axisText: '#7a60a0',
    axisBackground: '#120c18',
    hudBg: 'rgba(22, 16, 30, 0.94)',
    hudText: '#d8c8f0',
    volumeUp: '#b388ff44',
    volumeDown: '#ff6e8044',
  },
}

export const royalVioletManifest: PluginManifest = {
  id: 'royal-violet',
  name: 'Royal Violet',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Rich purple theme with violet accents, lavender highlights, and deep plum darks',
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
    entry: 'royal-violet',
    previewColors: {
      light: ['#7c3aed', '#b388ff', '#ff6e80', '#7a60a0', '#ece0ff'],
      dark: ['#b388ff', '#9c5cf0', '#ff6e80', '#8060b0', '#16101e'],
    },
  },
}

export function createRoyalVioletPlugin(
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
