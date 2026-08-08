// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'cyberpunk-neon',
  name: 'Cyberpunk Neon',
  light: {
    '--background': 'oklch(0.92 0.02 280)',
    '--foreground': 'oklch(0.20 0.03 290)',
    '--card': 'oklch(0.95 0.015 280)',
    '--card-foreground': 'oklch(0.20 0.03 290)',
    '--popover': 'oklch(0.95 0.015 280)',
    '--popover-foreground': 'oklch(0.20 0.03 290)',
    '--primary': 'oklch(0.55 0.25 310)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.87 0.03 280)',
    '--secondary-foreground': 'oklch(0.25 0.03 290)',
    '--muted': 'oklch(0.90 0.02 280)',
    '--muted-foreground': 'oklch(0.50 0.02 280)',
    '--accent': 'oklch(0.88 0.04 200)',
    '--accent-foreground': 'oklch(0.20 0.03 290)',
    '--destructive': 'oklch(0.60 0.22 15)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.84 0.03 280)',
    '--input': 'oklch(0.84 0.03 280)',
    '--ring': 'oklch(0.55 0.25 310)',
    '--chart-1': 'oklch(0.65 0.25 310)',
    '--chart-2': 'oklch(0.70 0.20 195)',
    '--chart-3': 'oklch(0.55 0.02 280)',
    '--chart-4': 'oklch(0.72 0.03 280)',
    '--chart-5': 'oklch(0.84 0.03 280)',
    '--sidebar': 'oklch(0.22 0.04 290)',
    '--sidebar-foreground': 'oklch(0.85 0.04 200)',
    '--sidebar-primary': 'oklch(0.85 0.04 200)',
    '--sidebar-primary-foreground': 'oklch(0.22 0.04 290)',
    '--sidebar-accent': 'oklch(0.32 0.05 290)',
    '--sidebar-accent-foreground': 'oklch(0.85 0.04 200)',
    '--sidebar-border': 'oklch(0.37 0.04 290)',
    '--sidebar-ring': 'oklch(0.85 0.04 200)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.65 0.25 310)',
    '--orb-c2': 'oklch(0.70 0.20 195)',
    '--orb-c3': 'oklch(0.60 0.15 280)',
    '--noise-opacity': '0.08',
    '--radius': '0.375rem',
  },
  dark: {
    '--background': 'oklch(0.13 0.03 290)',
    '--foreground': 'oklch(0.88 0.04 200)',
    '--card': 'oklch(0.18 0.04 290)',
    '--card-foreground': 'oklch(0.88 0.04 200)',
    '--popover': 'oklch(0.16 0.03 290)',
    '--popover-foreground': 'oklch(0.88 0.04 200)',
    '--primary': 'oklch(0.75 0.20 195)',
    '--primary-foreground': 'oklch(0.13 0.03 290)',
    '--secondary': 'oklch(0.22 0.04 290)',
    '--secondary-foreground': 'oklch(0.88 0.04 200)',
    '--muted': 'oklch(0.18 0.03 290)',
    '--muted-foreground': 'oklch(0.60 0.03 280)',
    '--accent': 'oklch(0.30 0.06 310)',
    '--accent-foreground': 'oklch(0.88 0.04 200)',
    '--destructive': 'oklch(0.65 0.22 15)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.28 0.06 290)',
    '--input': 'oklch(0.30 0.05 290)',
    '--ring': 'oklch(0.75 0.20 195)',
    '--chart-1': 'oklch(0.75 0.20 195)',
    '--chart-2': 'oklch(0.65 0.25 310)',
    '--chart-3': 'oklch(0.60 0.03 280)',
    '--chart-4': 'oklch(0.42 0.04 290)',
    '--chart-5': 'oklch(0.30 0.04 290)',
    '--sidebar': 'oklch(0.16 0.05 290)',
    '--sidebar-foreground': 'oklch(0.88 0.04 200)',
    '--sidebar-primary': 'oklch(0.88 0.04 200)',
    '--sidebar-primary-foreground': 'oklch(0.16 0.05 290)',
    '--sidebar-accent': 'oklch(0.25 0.06 310)',
    '--sidebar-accent-foreground': 'oklch(0.88 0.04 200)',
    '--sidebar-border': 'oklch(0.31 0.05 290)',
    '--sidebar-ring': 'oklch(0.88 0.04 200)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.75 0.20 195)',
    '--orb-c2': 'oklch(0.65 0.25 310)',
    '--orb-c3': 'oklch(0.70 0.15 280)',
    '--noise-opacity': '0.18',
    '--radius': '0.375rem',
  },
  chart: {
    background: '#1a1028',
    upCandle: '#00e5ff',
    downCandle: '#ff2d7b',
    crosshair: '#b388ff',
    grid: '#261a3d',
    axisText: '#8b7faa',
    axisBackground: '#140e22',
    hudBg: 'rgba(26, 16, 40, 0.94)',
    hudText: '#c4efff',
    volumeUp: '#00e5ff44',
    volumeDown: '#ff2d7b44',
  },
  // Lavender paper. The neon cyan/magenta pair rendered as ink instead of
  // glow — the hues survive, the bloom does not.
  chartLight: {
    background: '#e1e3f2',
    upCandle: '#00818c',
    downCandle: '#cf0063',
    crosshair: '#757895',
    grid: '#cacce0',
    axisText: '#61626f',
    axisBackground: '#dadceb',
    hudBg: 'rgba(243, 244, 251, 0.93)',
    hudText: '#161423',
    volumeUp: '#00818c44',
    volumeDown: '#cf006344',
  },
}

export const cyberpunkNeonManifest: PluginManifest = {
  id: 'cyberpunk-neon',
  name: 'Cyberpunk Neon',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Dark-forward theme with vibrant cyans, magentas, and electric purples',
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
    entry: 'cyberpunk-neon',
    previewColors: {
      light: ['#8b2fc9', '#00bcd4', '#e040fb', '#7e57c2', '#b388ff'],
      dark: ['#00e5ff', '#ff2d7b', '#b388ff', '#7c4dff', '#c4efff'],
    },
  },
}

export function createCyberpunkNeonPlugin(
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
