// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type {
  PluginExecuteParams,
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type { ThemeDefinition } from '../types.ts'

/**
 * Boomerg — the amber-on-black look of a classic institutional terminal.
 *
 * Three things carry that look, and all three are plain CSS variables:
 *  - pure black canvas with amber text, not grey text on charcoal,
 *  - `--radius: 0rem`, because nothing on that screen is rounded,
 *  - `--font-sans` pointed at the mono stack, so the whole shell is fixed
 *    width. It is the single loudest signal, and the mono family is already
 *    loaded for `--font-mono`, so no theme pays a font download for it.
 *
 * Blue carries selection (the menu bar), amber carries data, and green/red
 * stay conventional so P&L still reads the way every other theme reads it.
 * `--up`/`--down` are deliberately not set: the base sheet aliases them to
 * `--chart-2`/`--destructive`, which this theme already repaints.
 */

const MONO_STACK =
  "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace"

const theme: ThemeDefinition = {
  id: 'boomerg',
  name: 'Boomerg',
  // No terminal of this kind ever had a light mode. This one reads as the
  // printout: warm paper, black type, the same orange and blue, and the
  // sidebar left black so the chrome still looks like the machine.
  light: {
    '--background': 'oklch(0.97 0.008 85)',
    '--foreground': 'oklch(0.20 0.02 60)',
    '--card': 'oklch(0.99 0.004 85)',
    '--card-foreground': 'oklch(0.20 0.02 60)',
    '--popover': 'oklch(0.99 0.004 85)',
    '--popover-foreground': 'oklch(0.20 0.02 60)',
    // Darker than the dark map's orange on purpose: at 0.58 the same hue only
    // reaches 4.4:1 against its own foreground, which is under AA for the
    // label sitting on every primary button.
    '--primary': 'oklch(0.545 0.17 52)',
    '--primary-foreground': 'oklch(0.99 0.01 85)',
    '--secondary': 'oklch(0.93 0.012 85)',
    '--secondary-foreground': 'oklch(0.25 0.02 60)',
    '--muted': 'oklch(0.94 0.010 85)',
    '--muted-foreground': 'oklch(0.46 0.03 62)',
    '--accent': 'oklch(0.89 0.045 258)',
    '--accent-foreground': 'oklch(0.28 0.10 264)',
    '--destructive': 'oklch(0.52 0.22 27)',
    '--destructive-foreground': 'oklch(0.99 0.01 85)',
    '--border': 'oklch(0.86 0.015 80)',
    '--input': 'oklch(0.88 0.015 80)',
    '--ring': 'oklch(0.545 0.17 52)',
    '--chart-1': 'oklch(0.62 0.17 60)',
    '--chart-2': 'oklch(0.55 0.18 145)',
    '--chart-3': 'oklch(0.52 0.13 235)',
    '--chart-4': 'oklch(0.68 0.15 95)',
    '--chart-5': 'oklch(0.52 0.22 27)',
    '--magic-1': 'oklch(0.62 0.17 60)',
    '--magic-2': 'oklch(0.58 0.18 40)',
    '--magic-3': 'oklch(0.52 0.13 235)',
    '--sidebar': 'oklch(0.10 0.012 62)',
    '--sidebar-foreground': 'oklch(0.83 0.14 72)',
    '--sidebar-primary': 'oklch(0.78 0.16 62)',
    '--sidebar-primary-foreground': 'oklch(0.10 0.012 62)',
    '--sidebar-accent': 'oklch(0.32 0.11 264)',
    '--sidebar-accent-foreground': 'oklch(0.97 0.02 85)',
    '--sidebar-border': 'oklch(0.28 0.03 68)',
    '--sidebar-ring': 'oklch(0.78 0.16 62)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.68 0.17 62)',
    '--orb-c2': 'oklch(0.60 0.19 40)',
    '--orb-c3': 'oklch(0.52 0.14 250)',
    '--noise-opacity': '0',
    '--radius': '0rem',
    '--font-sans': MONO_STACK,
  },
  dark: {
    '--background': 'oklch(0 0 0)',
    '--foreground': 'oklch(0.83 0.14 72)',
    '--card': 'oklch(0.125 0.014 62)',
    '--card-foreground': 'oklch(0.83 0.14 72)',
    '--popover': 'oklch(0.10 0.012 62)',
    '--popover-foreground': 'oklch(0.85 0.13 74)',
    '--primary': 'oklch(0.76 0.17 62)',
    '--primary-foreground': 'oklch(0.10 0.012 62)',
    '--secondary': 'oklch(0.20 0.018 62)',
    '--secondary-foreground': 'oklch(0.86 0.12 74)',
    '--muted': 'oklch(0.16 0.014 62)',
    '--muted-foreground': 'oklch(0.63 0.085 70)',
    '--accent': 'oklch(0.34 0.12 264)',
    '--accent-foreground': 'oklch(0.96 0.02 85)',
    '--destructive': 'oklch(0.60 0.22 27)',
    '--destructive-foreground': 'oklch(0.98 0.01 85)',
    '--border': 'oklch(0.30 0.03 68)',
    '--input': 'oklch(0.24 0.022 66)',
    '--ring': 'oklch(0.76 0.17 62)',
    '--chart-1': 'oklch(0.78 0.16 65)',
    '--chart-2': 'oklch(0.75 0.20 145)',
    '--chart-3': 'oklch(0.78 0.13 210)',
    '--chart-4': 'oklch(0.88 0.17 100)',
    '--chart-5': 'oklch(0.60 0.22 27)',
    '--magic-1': 'oklch(0.80 0.16 68)',
    '--magic-2': 'oklch(0.72 0.19 45)',
    '--magic-3': 'oklch(0.76 0.13 215)',
    '--sidebar': 'oklch(0.06 0.008 62)',
    '--sidebar-foreground': 'oklch(0.83 0.14 72)',
    '--sidebar-primary': 'oklch(0.80 0.16 64)',
    '--sidebar-primary-foreground': 'oklch(0.06 0.008 62)',
    '--sidebar-accent': 'oklch(0.30 0.11 264)',
    '--sidebar-accent-foreground': 'oklch(0.96 0.02 85)',
    '--sidebar-border': 'oklch(0.26 0.025 66)',
    '--sidebar-ring': 'oklch(0.80 0.16 64)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.80 0.16 68)',
    '--orb-c2': 'oklch(0.72 0.19 45)',
    '--orb-c3': 'oklch(0.76 0.13 215)',
    '--noise-opacity': '0',
    '--radius': '0rem',
    '--font-sans': MONO_STACK,
  },
  chart: {
    background: '#000000',
    upCandle: '#28c93f',
    downCandle: '#f5333f',
    crosshair: '#ffa028',
    grid: '#2a2116',
    axisText: '#ffa028',
    axisBackground: '#000000',
    hudBg: 'rgba(0, 0, 0, 0.94)',
    hudText: '#ffb454',
    volumeUp: '#28c93f55',
    volumeDown: '#f5333f55',
  },
  // Cream paper that keeps the terminal's amber axis and crosshair; the
  // green/red pair is darkened to read as ink rather than phosphor.
  chartLight: {
    background: '#f8f5ef',
    upCandle: '#15892a',
    downCandle: '#bf1e2b',
    crosshair: '#b07d2c',
    grid: '#e0dcd4',
    axisText: '#7a5a20',
    axisBackground: '#f1eee8',
    hudBg: 'rgba(255, 253, 251, 0.93)',
    hudText: '#1d140d',
    volumeUp: '#15892a44',
    volumeDown: '#bf1e2b44',
  },
}

export const boomergManifest: PluginManifest = {
  id: 'boomerg',
  name: 'Boomerg',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Amber-on-black homage to the classic Bloomberg terminal — monospace UI, square corners, and function-key colors',
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
    entry: 'boomerg',
    previewColors: {
      light: ['#c25a00', '#f7f3ec', '#1a8f2f', '#c1121f', '#1b2f9e'],
      dark: ['#ffa028', '#000000', '#28c93f', '#f5333f', '#1b2f9e'],
    },
  },
}

export function createBoomergPlugin(manifest: PluginManifest): PluginInstance {
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
