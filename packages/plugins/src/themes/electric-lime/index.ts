// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Electric Lime — vivid lime sidebar with clean B&W content areas
const theme: ThemeDefinition = {
  id: 'electric-lime',
  name: 'Electric Lime',
  light: {
    '--background': 'oklch(0.98 0 0)',
    '--foreground': 'oklch(0.15 0 0)',
    '--card': 'oklch(0.96 0 0)',
    '--card-foreground': 'oklch(0.15 0 0)',
    '--popover': 'oklch(0.96 0 0)',
    '--popover-foreground': 'oklch(0.15 0 0)',
    '--primary': 'oklch(0.55 0.20 135)',
    '--primary-foreground': 'oklch(0.99 0 0)',
    '--secondary': 'oklch(0.93 0 0)',
    '--secondary-foreground': 'oklch(0.18 0 0)',
    '--muted': 'oklch(0.94 0 0)',
    '--muted-foreground': 'oklch(0.45 0 0)',
    '--accent': 'oklch(0.92 0.04 135)',
    '--accent-foreground': 'oklch(0.15 0 0)',
    '--destructive': 'oklch(0.55 0.22 25)',
    '--destructive-foreground': 'oklch(0.99 0 0)',
    '--border': 'oklch(0.88 0 0)',
    '--input': 'oklch(0.88 0 0)',
    '--ring': 'oklch(0.55 0.20 135)',
    '--chart-1': 'oklch(0.65 0.22 135)',
    '--chart-2': 'oklch(0.55 0.18 25)',
    '--chart-3': 'oklch(0.50 0.15 265)',
    '--chart-4': 'oklch(0.60 0.12 85)',
    '--chart-5': 'oklch(0.45 0 0)',
    '--sidebar': 'oklch(0.50 0.22 135)',
    '--sidebar-foreground': 'oklch(0.10 0 0)',
    '--sidebar-primary': 'oklch(0.10 0 0)',
    '--sidebar-primary-foreground': 'oklch(0.50 0.22 135)',
    '--sidebar-accent': 'oklch(0.55 0.24 135)',
    '--sidebar-accent-foreground': 'oklch(0.10 0 0)',
    '--sidebar-border': 'oklch(0.45 0.20 135)',
    '--sidebar-ring': 'oklch(0.10 0 0)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.65 0.24 135)',
    '--orb-c2': 'oklch(0.55 0.18 100)',
    '--orb-c3': 'oklch(0.60 0.15 160)',
    '--noise-opacity': '0.06',
    '--radius': '0.5rem',
  },
  dark: {
    '--background': 'oklch(0.09 0 0)',
    '--foreground': 'oklch(0.92 0 0)',
    '--card': 'oklch(0.13 0 0)',
    '--card-foreground': 'oklch(0.92 0 0)',
    '--popover': 'oklch(0.11 0 0)',
    '--popover-foreground': 'oklch(0.92 0 0)',
    '--primary': 'oklch(0.75 0.22 135)',
    '--primary-foreground': 'oklch(0.10 0 0)',
    '--secondary': 'oklch(0.18 0 0)',
    '--secondary-foreground': 'oklch(0.88 0 0)',
    '--muted': 'oklch(0.15 0 0)',
    '--muted-foreground': 'oklch(0.55 0 0)',
    '--accent': 'oklch(0.22 0.04 135)',
    '--accent-foreground': 'oklch(0.92 0 0)',
    '--destructive': 'oklch(0.62 0.22 25)',
    '--destructive-foreground': 'oklch(0.97 0 0)',
    '--border': 'oklch(0.24 0 0)',
    '--input': 'oklch(0.22 0 0)',
    '--ring': 'oklch(0.75 0.22 135)',
    '--chart-1': 'oklch(0.75 0.22 135)',
    '--chart-2': 'oklch(0.65 0.18 25)',
    '--chart-3': 'oklch(0.60 0.15 265)',
    '--chart-4': 'oklch(0.70 0.12 85)',
    '--chart-5': 'oklch(0.50 0 0)',
    '--sidebar': 'oklch(0.30 0.16 135)',
    '--sidebar-foreground': 'oklch(0.92 0.04 135)',
    '--sidebar-primary': 'oklch(0.92 0.04 135)',
    '--sidebar-primary-foreground': 'oklch(0.15 0.08 135)',
    '--sidebar-accent': 'oklch(0.35 0.18 135)',
    '--sidebar-accent-foreground': 'oklch(0.92 0.04 135)',
    '--sidebar-border': 'oklch(0.25 0.12 135)',
    '--sidebar-ring': 'oklch(0.92 0.04 135)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.75 0.24 135)',
    '--orb-c2': 'oklch(0.65 0.18 100)',
    '--orb-c3': 'oklch(0.70 0.15 160)',
    '--noise-opacity': '0.12',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#111111',
    upCandle: '#84cc16',
    downCandle: '#ef4444',
    crosshair: '#6b7280',
    grid: '#1a1a1a',
    axisText: '#71717a',
    axisBackground: '#0a0a0a',
    hudBg: 'rgba(10, 10, 10, 0.95)',
    hudText: '#d9f99d',
    volumeUp: '#84cc1644',
    volumeDown: '#ef444444',
  },
  // Neutral paper. Lime survives as a deep olive-lime; the literal #84cc16
  // is invisible on white (about 1.7:1).
  chartLight: {
    background: '#f8f8f8',
    upCandle: '#578c00',
    downCandle: '#c8252d',
    crosshair: '#838383',
    grid: '#dfdfdf',
    axisText: '#555555',
    axisBackground: '#f1f1f1',
    hudBg: 'rgba(253, 253, 253, 0.93)',
    hudText: '#0b0b0b',
    volumeUp: '#578c0044',
    volumeDown: '#c8252d44',
  },
}

export const electricLimeManifest: PluginManifest = {
  id: 'electric-lime',
  name: 'Electric Lime',
  version: '0.1.0',
  author: 'Pairlens',
  description: 'Vivid lime green sidebar with clean monochrome content areas',
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
    entry: 'electric-lime',
    previewColors: {
      light: ['#84cc16', '#ffffff', '#111111', '#e0e0e0', '#4d7c0f'],
      dark: ['#84cc16', '#111111', '#e8e8e8', '#2a4a0a', '#a3e635'],
    },
  },
}

export function createElectricLimePlugin(
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
