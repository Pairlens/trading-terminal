/**
 * Aurora Borealis — reference community theme plugin.
 *
 * Community plugins are self-contained: no imports from Pairlens packages are
 * needed at runtime (the module runs in the plugin sandbox). The module
 * contract is two exports: `manifest` and `createPlugin`.
 */
import manifestJson from '../manifest.json'

type ThemeVars = Record<string, string>

type ThemeDefinition = {
  id: string
  name: string
  light: ThemeVars
  dark: ThemeVars
  chart: {
    background: string
    upCandle: string
    downCandle: string
    crosshair: string
    grid: string
    axisText: string
    axisBackground: string
    hudBg: string
    hudText: string
    volumeUp: string
    volumeDown: string
  }
}

const theme: ThemeDefinition = {
  id: 'pairlens-aurora-theme',
  name: 'Aurora Borealis',
  light: {
    '--background': 'oklch(0.97 0.010 175)',
    '--foreground': 'oklch(0.21 0.030 190)',
    '--card': 'oklch(0.98 0.008 175)',
    '--card-foreground': 'oklch(0.21 0.030 190)',
    '--popover': 'oklch(0.98 0.008 175)',
    '--popover-foreground': 'oklch(0.21 0.030 190)',
    '--primary': 'oklch(0.56 0.14 168)',
    '--primary-foreground': 'oklch(0.98 0 0)',
    '--secondary': 'oklch(0.93 0.014 175)',
    '--secondary-foreground': 'oklch(0.28 0.030 190)',
    '--muted': 'oklch(0.95 0.010 175)',
    '--muted-foreground': 'oklch(0.52 0.024 190)',
    '--accent': 'oklch(0.92 0.030 300)',
    '--accent-foreground': 'oklch(0.24 0.040 300)',
    '--destructive': 'oklch(0.58 0.20 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.90 0.014 175)',
    '--input': 'oklch(0.90 0.014 175)',
    '--ring': 'oklch(0.56 0.14 168)',
    '--chart-1': 'oklch(0.56 0.14 168)',
    '--chart-2': 'oklch(0.62 0.11 195)',
    '--chart-3': 'oklch(0.55 0.14 300)',
    '--chart-4': 'oklch(0.72 0.018 185)',
    '--chart-5': 'oklch(0.88 0.010 175)',
    '--sidebar': 'oklch(0.19 0.045 195)',
    '--sidebar-foreground': 'oklch(0.86 0.030 170)',
    '--sidebar-primary': 'oklch(0.86 0.030 170)',
    '--sidebar-primary-foreground': 'oklch(0.19 0.045 195)',
    '--sidebar-accent': 'oklch(0.28 0.055 195)',
    '--sidebar-accent-foreground': 'oklch(0.86 0.030 170)',
    '--sidebar-border': 'oklch(0.33 0.045 195)',
    '--sidebar-ring': 'oklch(0.86 0.030 170)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.62 0.14 168)',
    '--orb-c2': 'oklch(0.58 0.12 195)',
    '--orb-c3': 'oklch(0.62 0.12 300)',
    '--noise-opacity': '0.05',
    '--radius': '0.625rem',
  },
  dark: {
    '--background': 'oklch(0.14 0.020 200)',
    '--foreground': 'oklch(0.89 0.020 170)',
    '--card': 'oklch(0.18 0.026 200)',
    '--card-foreground': 'oklch(0.89 0.020 170)',
    '--popover': 'oklch(0.16 0.022 200)',
    '--popover-foreground': 'oklch(0.89 0.020 170)',
    '--primary': 'oklch(0.72 0.15 168)',
    '--primary-foreground': 'oklch(0.14 0.020 200)',
    '--secondary': 'oklch(0.22 0.028 200)',
    '--secondary-foreground': 'oklch(0.89 0.020 170)',
    '--muted': 'oklch(0.19 0.020 200)',
    '--muted-foreground': 'oklch(0.58 0.024 190)',
    '--accent': 'oklch(0.28 0.055 300)',
    '--accent-foreground': 'oklch(0.90 0.030 300)',
    '--destructive': 'oklch(0.62 0.18 25)',
    '--destructive-foreground': 'oklch(0.98 0 0)',
    '--border': 'oklch(0.28 0.030 200)',
    '--input': 'oklch(0.28 0.030 200)',
    '--ring': 'oklch(0.72 0.15 168)',
    '--chart-1': 'oklch(0.72 0.15 168)',
    '--chart-2': 'oklch(0.66 0.11 195)',
    '--chart-3': 'oklch(0.70 0.13 300)',
    '--chart-4': 'oklch(0.40 0.028 200)',
    '--chart-5': 'oklch(0.28 0.024 200)',
    '--sidebar': 'oklch(0.12 0.024 205)',
    '--sidebar-foreground': 'oklch(0.84 0.024 170)',
    '--sidebar-primary': 'oklch(0.84 0.024 170)',
    '--sidebar-primary-foreground': 'oklch(0.12 0.024 205)',
    '--sidebar-accent': 'oklch(0.22 0.040 205)',
    '--sidebar-accent-foreground': 'oklch(0.84 0.024 170)',
    '--sidebar-border': 'oklch(0.26 0.028 205)',
    '--sidebar-ring': 'oklch(0.84 0.024 170)',
    '--orb-bg': 'transparent',
    '--orb-c1': 'oklch(0.72 0.15 168)',
    '--orb-c2': 'oklch(0.62 0.12 195)',
    '--orb-c3': 'oklch(0.66 0.13 300)',
    '--noise-opacity': '0.10',
    '--radius': '0.625rem',
  },
  chart: {
    background: '#0b1418',
    upCandle: '#2dd4a7',
    downCandle: '#a78bfa',
    crosshair: '#4f8f7d',
    grid: '#16242a',
    axisText: '#5f8a80',
    axisBackground: '#0a1114',
    hudBg: 'rgba(11, 20, 24, 0.94)',
    hudText: '#a9e6d4',
    volumeUp: '#2dd4a744',
    volumeDown: '#a78bfa44',
  },
}

type PluginExecuteParams = {
  capability: string
  params: Record<string, unknown>
  context: Record<string, unknown>
}

type PluginInstance = {
  manifest: typeof manifestJson
  status: 'installed'
  config: Record<string, unknown>
  execute: (params: PluginExecuteParams) => Promise<unknown>
}

export const manifest = manifestJson

export function createPlugin(): PluginInstance {
  return {
    manifest: manifestJson,
    status: 'installed',
    config: {},
    execute: async () => theme,
  }
}
