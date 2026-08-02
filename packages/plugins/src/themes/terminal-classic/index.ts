// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

const theme: ThemeDefinition = {
  id: 'terminal-classic',
  name: 'Terminal Classic',
  light: {
    '--background': 'oklch(0.97 0.005 250)',
    '--foreground': 'oklch(0.25 0.015 250)',
    '--card': 'oklch(0.98 0.003 250)',
    '--card-foreground': 'oklch(0.25 0.015 250)',
    '--popover': 'oklch(0.98 0.003 250)',
    '--popover-foreground': 'oklch(0.25 0.015 250)',
    '--primary': 'oklch(0.50 0.10 250)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.93 0.008 250)',
    '--secondary-foreground': 'oklch(0.30 0.015 250)',
    '--muted': 'oklch(0.94 0.006 250)',
    '--muted-foreground': 'oklch(0.55 0.015 250)',
    '--accent': 'oklch(0.93 0.01 250)',
    '--accent-foreground': 'oklch(0.25 0.015 250)',
    '--destructive': 'oklch(0.58 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.90 0.008 250)',
    '--input': 'oklch(0.90 0.008 250)',
    '--ring': 'oklch(0.50 0.10 250)',
    '--chart-1': 'oklch(0.55 0.10 250)',
    '--chart-2': 'oklch(0.60 0.15 145)',
    '--chart-3': 'oklch(0.55 0.015 250)',
    '--chart-4': 'oklch(0.72 0.01 250)',
    '--chart-5': 'oklch(0.88 0.006 250)',
    '--sidebar': 'oklch(0.25 0.02 250)',
    '--sidebar-foreground': 'oklch(0.82 0.015 250)',
    '--sidebar-primary': 'oklch(0.82 0.015 250)',
    '--sidebar-primary-foreground': 'oklch(0.25 0.02 250)',
    '--sidebar-accent': 'oklch(0.33 0.025 250)',
    '--sidebar-accent-foreground': 'oklch(0.82 0.015 250)',
    '--sidebar-border': 'oklch(0.40 0.02 250)',
    '--sidebar-ring': 'oklch(0.82 0.015 250)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.55 0.10 250)',
    '--orb-c2': 'oklch(0.60 0.12 145)',
    '--orb-c3': 'oklch(0.50 0.08 280)',
    '--noise-opacity': '0.06',
    '--radius': '0.25rem',
  },
  dark: {
    '--background': 'oklch(0.17 0.015 250)',
    '--foreground': 'oklch(0.82 0.015 250)',
    '--card': 'oklch(0.21 0.018 250)',
    '--card-foreground': 'oklch(0.82 0.015 250)',
    '--popover': 'oklch(0.19 0.015 250)',
    '--popover-foreground': 'oklch(0.82 0.015 250)',
    '--primary': 'oklch(0.62 0.12 250)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.24 0.018 250)',
    '--secondary-foreground': 'oklch(0.82 0.015 250)',
    '--muted': 'oklch(0.22 0.012 250)',
    '--muted-foreground': 'oklch(0.58 0.015 250)',
    '--accent': 'oklch(0.28 0.02 250)',
    '--accent-foreground': 'oklch(0.82 0.015 250)',
    '--destructive': 'oklch(0.62 0.18 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.30 0.018 250)',
    '--input': 'oklch(0.30 0.018 250)',
    '--ring': 'oklch(0.62 0.12 250)',
    '--chart-1': 'oklch(0.62 0.12 250)',
    '--chart-2': 'oklch(0.65 0.15 145)',
    '--chart-3': 'oklch(0.58 0.015 250)',
    '--chart-4': 'oklch(0.40 0.015 250)',
    '--chart-5': 'oklch(0.28 0.015 250)',
    '--sidebar': 'oklch(0.15 0.018 250)',
    '--sidebar-foreground': 'oklch(0.78 0.015 250)',
    '--sidebar-primary': 'oklch(0.78 0.015 250)',
    '--sidebar-primary-foreground': 'oklch(0.15 0.018 250)',
    '--sidebar-accent': 'oklch(0.22 0.02 250)',
    '--sidebar-accent-foreground': 'oklch(0.78 0.015 250)',
    '--sidebar-border': 'oklch(0.30 0.018 250)',
    '--sidebar-ring': 'oklch(0.78 0.015 250)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.62 0.12 250)',
    '--orb-c2': 'oklch(0.65 0.15 145)',
    '--orb-c3': 'oklch(0.55 0.10 280)',
    '--noise-opacity': '0.08',
    '--radius': '0.25rem',
  },
  chart: {
    background: '#1e222d',
    upCandle: '#26a69a',
    downCandle: '#ef5350',
    crosshair: '#758696',
    grid: '#2a2e39',
    axisText: '#787b86',
    axisBackground: '#1e222d',
    hudBg: 'rgba(30, 34, 45, 0.94)',
    hudText: '#d1d4dc',
    volumeUp: '#26a69a44',
    volumeDown: '#ef535044',
  },
}

export const terminalClassicManifest: PluginManifest = {
  id: 'terminal-classic',
  name: 'Terminal Classic',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Professional trading terminal look with navy backgrounds and classic green/red candles',
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
    entry: 'terminal-classic',
    previewColors: {
      light: ['#3b5998', '#26a69a', '#ef5350', '#787b86', '#d1d4dc'],
      dark: ['#2962ff', '#26a69a', '#ef5350', '#787b86', '#1e222d'],
    },
  },
}

export function createTerminalClassicPlugin(
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
