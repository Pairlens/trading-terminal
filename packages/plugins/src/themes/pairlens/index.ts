// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

// Pairlens — the signature theme. Crisp black & white with rainbow prism accents.
// Inspired by the brand icon: silver aviator glasses refracting a spectrum of color.
const theme: ThemeDefinition = {
  id: 'pairlens',
  name: 'Pairlens',
  light: {
    // Clean white surfaces
    '--background': 'oklch(0.985 0 0)',
    '--foreground': 'oklch(0.14 0 0)',
    '--card': 'oklch(0.97 0 0)',
    '--card-foreground': 'oklch(0.14 0 0)',
    '--popover': 'oklch(0.97 0 0)',
    '--popover-foreground': 'oklch(0.14 0 0)',
    // Rainbow-derived primary — a vivid spectral blue
    '--primary': 'oklch(0.45 0.18 265)',
    '--primary-foreground': 'oklch(0.99 0 0)',
    '--secondary': 'oklch(0.93 0 0)',
    '--secondary-foreground': 'oklch(0.18 0 0)',
    '--muted': 'oklch(0.94 0 0)',
    '--muted-foreground': 'oklch(0.45 0 0)',
    '--accent': 'oklch(0.94 0.01 265)',
    '--accent-foreground': 'oklch(0.14 0 0)',
    '--destructive': 'oklch(0.55 0.22 25)',
    '--destructive-foreground': 'oklch(0.99 0 0)',
    '--border': 'oklch(0.88 0 0)',
    '--input': 'oklch(0.88 0 0)',
    '--ring': 'oklch(0.45 0.18 265)',
    // Chart colors — the rainbow spectrum
    '--chart-1': 'oklch(0.60 0.22 25)',
    '--chart-2': 'oklch(0.65 0.20 145)',
    '--chart-3': 'oklch(0.55 0.20 265)',
    '--chart-4': 'oklch(0.70 0.18 85)',
    '--chart-5': 'oklch(0.60 0.20 310)',
    // Dark sidebar for contrast
    '--sidebar': 'oklch(0.10 0 0)',
    '--sidebar-foreground': 'oklch(0.88 0 0)',
    '--sidebar-primary': 'oklch(0.88 0 0)',
    '--sidebar-primary-foreground': 'oklch(0.10 0 0)',
    '--sidebar-accent': 'oklch(0.20 0 0)',
    '--sidebar-accent-foreground': 'oklch(0.88 0 0)',
    '--sidebar-border': 'oklch(0.22 0 0)',
    '--sidebar-ring': 'oklch(0.88 0 0)',
    // Orb — subtle rainbow
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.55 0.18 265)',
    '--orb-c2': 'oklch(0.60 0.22 25)',
    '--orb-c3': 'oklch(0.58 0.16 145)',
    '--noise-opacity': '0.04',
    '--radius': '0.5rem',
  },
  dark: {
    // Deep black surfaces
    '--background': 'oklch(0.08 0 0)',
    '--foreground': 'oklch(0.92 0 0)',
    '--card': 'oklch(0.13 0 0)',
    '--card-foreground': 'oklch(0.92 0 0)',
    '--popover': 'oklch(0.11 0 0)',
    '--popover-foreground': 'oklch(0.92 0 0)',
    // Rainbow-derived primary — vivid spectral blue, brighter for dark
    '--primary': 'oklch(0.68 0.18 265)',
    '--primary-foreground': 'oklch(0.08 0 0)',
    '--secondary': 'oklch(0.18 0 0)',
    '--secondary-foreground': 'oklch(0.88 0 0)',
    '--muted': 'oklch(0.15 0 0)',
    '--muted-foreground': 'oklch(0.55 0 0)',
    '--accent': 'oklch(0.22 0.02 265)',
    '--accent-foreground': 'oklch(0.92 0 0)',
    '--destructive': 'oklch(0.62 0.22 25)',
    '--destructive-foreground': 'oklch(0.97 0 0)',
    '--border': 'oklch(0.24 0 0)',
    '--input': 'oklch(0.22 0 0)',
    '--ring': 'oklch(0.68 0.18 265)',
    // Chart colors — the rainbow spectrum
    '--chart-1': 'oklch(0.65 0.22 25)',
    '--chart-2': 'oklch(0.70 0.18 145)',
    '--chart-3': 'oklch(0.65 0.20 265)',
    '--chart-4': 'oklch(0.75 0.16 85)',
    '--chart-5': 'oklch(0.65 0.18 310)',
    // Chrome frame — a soft gray, a touch lighter than --background (0.08) so
    // the content / pane gaps read as a gentle container edge (near-black
    // chrome was invisible), without being stark.
    '--sidebar': 'oklch(0.135 0 0)',
    '--sidebar-foreground': 'oklch(0.82 0 0)',
    '--sidebar-primary': 'oklch(0.82 0 0)',
    '--sidebar-primary-foreground': 'oklch(0.12 0 0)',
    '--sidebar-accent': 'oklch(0.22 0 0)',
    '--sidebar-accent-foreground': 'oklch(0.92 0 0)',
    '--sidebar-border': 'oklch(0.22 0 0)',
    '--sidebar-ring': 'oklch(0.82 0 0)',
    // Orb — vivid rainbow
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.20 265)',
    '--orb-c2': 'oklch(0.65 0.24 25)',
    '--orb-c3': 'oklch(0.62 0.18 145)',
    '--noise-opacity': '0.08',
    '--radius': '0.5rem',
  },
  chart: {
    background: '#111111',
    upCandle: '#22c55e',
    downCandle: '#ef4444',
    crosshair: '#6b7280',
    grid: '#1a1a1a',
    axisText: '#71717a',
    axisBackground: '#0a0a0a',
    hudBg: 'rgba(10, 10, 10, 0.95)',
    hudText: '#e4e4e7',
    volumeUp: '#22c55e44',
    volumeDown: '#ef444444',
  },
  // Crisp neutral paper — the theme's own #fafafa, deliberately NOT the
  // engine's warm-paper fallback: this theme is black & white by design and
  // a warm plot inside a neutral UI is the mismatch we're avoiding.
  chartLight: {
    background: '#fafafa',
    upCandle: '#0b8c40',
    downCandle: '#c8252d',
    crosshair: '#838383',
    grid: '#e1e1e1',
    axisText: '#555555',
    axisBackground: '#f4f4f4',
    hudBg: 'rgba(253, 253, 253, 0.93)',
    hudText: '#090909',
    volumeUp: '#0b8c4044',
    volumeDown: '#c8252d44',
  },
}

export const pairlensThemeManifest: PluginManifest = {
  id: 'pairlens',
  name: 'Pairlens',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'The signature Pairlens theme — crisp black & white with rainbow prism accents',
  capabilities: [
    {
      id: 'theme:override',
      singleton: true,
      markets: ['*'],
      priority: 1,
      streaming: false,
    },
  ],
  metadata: { family: 'themes' },
  config: {},
  theme: {
    entry: 'pairlens',
    previewColors: {
      light: ['#ffffff', '#111111', '#3366cc', '#e04040', '#22aa55'],
      dark: ['#111111', '#e8e8e8', '#5588ee', '#ef4444', '#22c55e'],
    },
  },
}

export function createPairlensThemePlugin(
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
