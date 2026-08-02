// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// High Contrast — accessibility-focused with maximum contrast, bold borders,
// and clear visual separation. WCAG AAA compliant color ratios.
const theme: ThemeDefinition = {
  id: 'high-contrast',
  name: 'High Contrast',
  light: {
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0 0 0)',
    '--card': 'oklch(0.98 0 0)',
    '--card-foreground': 'oklch(0 0 0)',
    '--popover': 'oklch(0.98 0 0)',
    '--popover-foreground': 'oklch(0 0 0)',
    '--primary': 'oklch(0.30 0.15 265)',
    '--primary-foreground': 'oklch(1 0 0)',
    '--secondary': 'oklch(0.92 0 0)',
    '--secondary-foreground': 'oklch(0 0 0)',
    '--muted': 'oklch(0.93 0 0)',
    '--muted-foreground': 'oklch(0.30 0 0)',
    '--accent': 'oklch(0.90 0.02 265)',
    '--accent-foreground': 'oklch(0 0 0)',
    '--destructive': 'oklch(0.45 0.25 25)',
    '--destructive-foreground': 'oklch(1 0 0)',
    '--border': 'oklch(0.55 0 0)',
    '--input': 'oklch(0.55 0 0)',
    '--ring': 'oklch(0.30 0.15 265)',
    '--chart-1': 'oklch(0.45 0.25 25)',
    '--chart-2': 'oklch(0.45 0.20 145)',
    '--chart-3': 'oklch(0.35 0.18 265)',
    '--chart-4': 'oklch(0.55 0.18 85)',
    '--chart-5': 'oklch(0.40 0.18 310)',
    '--sidebar': 'oklch(0 0 0)',
    '--sidebar-foreground': 'oklch(1 0 0)',
    '--sidebar-primary': 'oklch(1 0 0)',
    '--sidebar-primary-foreground': 'oklch(0 0 0)',
    '--sidebar-accent': 'oklch(0.20 0 0)',
    '--sidebar-accent-foreground': 'oklch(1 0 0)',
    '--sidebar-border': 'oklch(0.40 0 0)',
    '--sidebar-ring': 'oklch(1 0 0)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.40 0.18 265)',
    '--orb-c2': 'oklch(0.50 0.22 25)',
    '--orb-c3': 'oklch(0.45 0.16 145)',
    '--noise-opacity': '0',
    '--radius': '0.25rem',
  },
  dark: {
    '--background': 'oklch(0 0 0)',
    '--foreground': 'oklch(1 0 0)',
    '--card': 'oklch(0.08 0 0)',
    '--card-foreground': 'oklch(1 0 0)',
    '--popover': 'oklch(0.06 0 0)',
    '--popover-foreground': 'oklch(1 0 0)',
    '--primary': 'oklch(0.78 0.15 265)',
    '--primary-foreground': 'oklch(0 0 0)',
    '--secondary': 'oklch(0.15 0 0)',
    '--secondary-foreground': 'oklch(1 0 0)',
    '--muted': 'oklch(0.12 0 0)',
    '--muted-foreground': 'oklch(0.70 0 0)',
    '--accent': 'oklch(0.18 0.03 265)',
    '--accent-foreground': 'oklch(1 0 0)',
    '--destructive': 'oklch(0.65 0.25 25)',
    '--destructive-foreground': 'oklch(0 0 0)',
    '--border': 'oklch(0.50 0 0)',
    '--input': 'oklch(0.50 0 0)',
    '--ring': 'oklch(0.78 0.15 265)',
    '--chart-1': 'oklch(0.70 0.25 25)',
    '--chart-2': 'oklch(0.72 0.20 145)',
    '--chart-3': 'oklch(0.75 0.18 265)',
    '--chart-4': 'oklch(0.80 0.16 85)',
    '--chart-5': 'oklch(0.68 0.18 310)',
    '--sidebar': 'oklch(0.05 0 0)',
    '--sidebar-foreground': 'oklch(1 0 0)',
    '--sidebar-primary': 'oklch(1 0 0)',
    '--sidebar-primary-foreground': 'oklch(0 0 0)',
    '--sidebar-accent': 'oklch(0.18 0 0)',
    '--sidebar-accent-foreground': 'oklch(1 0 0)',
    '--sidebar-border': 'oklch(0.40 0 0)',
    '--sidebar-ring': 'oklch(1 0 0)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.75 0.18 265)',
    '--orb-c2': 'oklch(0.70 0.24 25)',
    '--orb-c3': 'oklch(0.72 0.16 145)',
    '--noise-opacity': '0',
    '--radius': '0.25rem',
  },
  chart: {
    background: '#000000',
    upCandle: '#00cc00',
    downCandle: '#ff0000',
    crosshair: '#ffffff',
    grid: '#333333',
    axisText: '#cccccc',
    axisBackground: '#000000',
    hudBg: 'rgba(0, 0, 0, 0.98)',
    hudText: '#ffffff',
    volumeUp: '#00cc0066',
    volumeDown: '#ff000066',
  },
}

export const highContrastManifest: PluginManifest = {
  id: 'high-contrast',
  name: 'High Contrast',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Accessibility-focused with maximum contrast, bold borders, and clear visual separation',
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
    entry: 'high-contrast',
    previewColors: {
      light: ['#000000', '#ffffff', '#2244aa', '#aa2200', '#006600'],
      dark: ['#ffffff', '#000000', '#88aaff', '#ff4444', '#44cc44'],
    },
  },
}

export function createHighContrastPlugin(
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
