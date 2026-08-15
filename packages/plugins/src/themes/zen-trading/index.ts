// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Zen Trading — the original Pairlens default theme, warm and earthy
const theme: ThemeDefinition = {
  id: 'zen-trading',
  name: 'Zen Trading',
  light: {
    '--background': 'oklch(0.9195 0.0169 88.003)',
    '--foreground': 'oklch(0.235 0 0)',
    '--card': 'oklch(0.953 0.0156 86.4257)',
    '--card-foreground': 'oklch(0.235 0 0)',
    '--popover': 'oklch(0.953 0.0156 86.4257)',
    '--popover-foreground': 'oklch(0.235 0 0)',
    '--primary': 'oklch(0.3012 0 0)',
    '--primary-foreground': 'oklch(0.9169 0.0175 99.616)',
    '--secondary': 'oklch(0.8647 0.0201 87.5232)',
    '--secondary-foreground': 'oklch(0.3012 0 0)',
    '--muted': 'oklch(0.834 0.0232 87.163)',
    '--muted-foreground': 'oklch(0.4688 0.0136 84.5932)',
    '--accent': 'oklch(0.9169 0.0175 99.616)',
    '--accent-foreground': 'oklch(0.3012 0 0)',
    '--destructive': 'oklch(0.5771 0.2152 27.325)',
    '--destructive-foreground': 'oklch(1 0 0)',
    '--border': 'oklch(0.8434 0.0231 87.1621)',
    '--input': 'oklch(0.8434 0.0231 87.1621)',
    '--ring': 'oklch(0.3012 0 0)',
    '--chart-1': 'oklch(0.6863 0.1743 34.2614)',
    '--chart-2': 'oklch(0.235 0 0)',
    '--chart-3': 'oklch(0.4688 0.0136 84.5932)',
    '--chart-4': 'oklch(0.7057 0.025 82.0932)',
    '--chart-5': 'oklch(0.834 0.0232 87.163)',
    '--sidebar': 'oklch(0.2244 0.0031 17.3887)',
    '--sidebar-foreground': 'oklch(0.852 0.0205 100.6306)',
    '--sidebar-primary': 'oklch(0.852 0.0205 100.6306)',
    '--sidebar-primary-foreground': 'oklch(0.3329 0 0)',
    '--sidebar-accent': 'oklch(0.3329 0 0)',
    '--sidebar-accent-foreground': 'oklch(0.852 0.0205 100.6306)',
    '--sidebar-border': 'oklch(0.2931 0 0)',
    '--sidebar-ring': 'oklch(0.852 0.0205 100.6306)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.54 0.07 98)',
    '--orb-c2': 'oklch(0.5 0.1 32)',
    '--orb-c3': 'oklch(0.52 0.05 86)',
    '--noise-opacity': '0.12',
    '--radius': '0.5rem',
  },
  dark: {
    '--background': 'oklch(0.1591 0 0)',
    '--foreground': 'oklch(0.9173 0.0133 82.4015)',
    '--card': 'oklch(0.2724 0.0018 106.5195)',
    '--card-foreground': 'oklch(0.9099 0.0236 90.7611)',
    '--popover': 'oklch(0.2264 0 0)',
    '--popover-foreground': 'oklch(0.9173 0.0133 82.4015)',
    '--primary': 'oklch(0.852 0.0205 100.6306)',
    '--primary-foreground': 'oklch(0.2244 0.0031 17.3887)',
    '--secondary': 'oklch(0.252 0 0)',
    '--secondary-foreground': 'oklch(0.852 0.0205 100.6306)',
    '--muted': 'oklch(0.1591 0 0)',
    '--muted-foreground': 'oklch(0.6348 0.0113 81.7875)',
    '--accent': 'oklch(0.3523 0 0)',
    '--accent-foreground': 'oklch(0.852 0.0205 100.6306)',
    '--destructive': 'oklch(0.6598 0.1899 23.9148)',
    '--destructive-foreground': 'oklch(0.9378 0.0011 17.179)',
    '--border': 'oklch(0.3189 0.0133 81.7187)',
    '--input': 'oklch(0.3904 0 0)',
    '--ring': 'oklch(0.6975 0.0173 99.1042)',
    '--chart-1': 'oklch(0.6863 0.1743 34.2614)',
    '--chart-2': 'oklch(0.859 0.0209 74.6369)',
    '--chart-3': 'oklch(0.6348 0.0113 81.7875)',
    '--chart-4': 'oklch(0.4681 0.0069 84.5829)',
    '--chart-5': 'oklch(0.3523 0 0)',
    '--sidebar': 'oklch(0.42 0.0199 87.5195)',
    '--sidebar-foreground': 'oklch(0.9169 0.0175 99.616)',
    '--sidebar-primary': 'oklch(0.9169 0.0175 99.616)',
    '--sidebar-primary-foreground': 'oklch(0.3012 0 0)',
    '--sidebar-accent': 'oklch(0.38 0.0199 87.5195)',
    '--sidebar-accent-foreground': 'oklch(0.9169 0.0175 99.616)',
    '--sidebar-border': 'oklch(0.4 0.0199 87.5195)',
    '--sidebar-ring': 'oklch(0.9169 0.0175 99.616)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.1 98)',
    '--orb-c2': 'oklch(0.62 0.14 32)',
    '--orb-c3': 'oklch(0.65 0.08 86)',
    '--noise-opacity': '0.3',
    '--radius': '0.5rem',
  },
  // Sand paper — the theme's own warm ground rather than the engine's paler
  // default. Moss up, clay down, both muted to stay calm.
  chartLight: {
    background: '#e9e4d8',
    upCandle: '#427751',
    downCandle: '#ae3f27',
    crosshair: '#8c826a',
    grid: '#d7d0c0',
    axisText: '#5e5a52',
    axisBackground: '#e0dbcf',
    hudBg: 'rgba(246, 244, 239, 0.93)',
    hudText: '#1e1e1e',
    volumeUp: '#42775144',
    volumeDown: '#ae3f2744',
  },
}

export const zenTradingManifest: PluginManifest = {
  id: 'zen-trading',
  name: 'Zen Trading',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Warm, earthy tones with a calm aesthetic for focused trading sessions',
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
    entry: 'zen-trading',
    previewColors: {
      light: ['#d4c9a8', '#3a3a3a', '#a09070', '#c8b98a', '#e8dcc0'],
      dark: ['#7a6e55', '#e8dcc0', '#4a4230', '#a09070', '#3a3a3a'],
    },
  },
}

export function createZenTradingPlugin(
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
