// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

/**
 * The keybinding command catalog — one declarative entry per bindable action.
 *
 * Nothing in the app hardcodes a chord any more: handlers register against a
 * command id, the store resolves that id to the chords currently in force, and
 * every label (tooltips, hold-⌘ hints, native menu accelerators) is rendered
 * from the same resolution. Add a command here and it shows up in the Keyboard
 * settings section, in conflict detection, and in every keymap preset for free.
 *
 * `scope` is the poor man's version of VS Code's `when` clauses: two commands
 * only collide if their scopes can be active at the same time. Chart shortcuts
 * are routed by the chart-pane router (`lib/chart-shortcuts.ts`) and never fire
 * while an overlay owns the keyboard, so `chart` bindings may reuse chords that
 * would otherwise look taken — but a `global` binding overlaps everything.
 */

export type KeybindingScope = 'global' | 'chart'

export type KeybindingCategoryId =
  | 'general'
  | 'navigation'
  | 'workspace'
  | 'chart'
  | 'timeframe'
  | 'drawing'

export type KeybindingCommand = {
  id: string
  categoryId: KeybindingCategoryId
  scope: KeybindingScope
  /** i18n key for the command's display name. */
  labelKey: string
  /** Only bindable in the Tauri desktop build (native window commands). */
  desktopOnly?: boolean
  /** Only bindable in browser builds (the desktop window chrome owns it). */
  webOnly?: boolean
}

export type KeybindingCategory = {
  id: KeybindingCategoryId
  labelKey: string
}

export const KEYBINDING_CATEGORIES: Array<KeybindingCategory> = [
  { id: 'general', labelKey: 'settings.keyboard.categories.general' },
  { id: 'navigation', labelKey: 'settings.keyboard.categories.navigation' },
  { id: 'workspace', labelKey: 'settings.keyboard.categories.workspace' },
  { id: 'chart', labelKey: 'settings.keyboard.categories.chart' },
  { id: 'timeframe', labelKey: 'settings.keyboard.categories.timeframe' },
  { id: 'drawing', labelKey: 'settings.keyboard.categories.drawing' },
]

/**
 * Timeframes that carry a shortcut, in toolbar order. The chart toolbar renders
 * its own list; this pairs each bindable timeframe with the label key both
 * share, so a rebind shows up in the timeframe menu too.
 */
export const TIMEFRAME_COMMANDS: Array<{ value: string; labelKey: string }> = [
  { value: '1m', labelKey: 'chart.timeframes.1m' },
  { value: '5m', labelKey: 'chart.timeframes.5m' },
  { value: '15m', labelKey: 'chart.timeframes.15m' },
  { value: '30m', labelKey: 'chart.timeframes.30m' },
  { value: '1h', labelKey: 'chart.timeframes.1h' },
  { value: '2h', labelKey: 'chart.timeframes.2h' },
  { value: '4h', labelKey: 'chart.timeframes.4h' },
  { value: '1d', labelKey: 'chart.timeframes.1d' },
  { value: '3d', labelKey: 'chart.timeframes.3d' },
  { value: '1w', labelKey: 'chart.timeframes.1w' },
  { value: '1M', labelKey: 'chart.timeframes.1M' },
]

/** `chart.timeframe.4h` ⇄ `4h`. */
export const timeframeCommandId = (value: string): string =>
  `chart.timeframe.${value}`

/**
 * Drawing tools that can own a chord. The `tool` value is passed straight to
 * the chart's `applyTool`, so adding a row here is all it takes to make another
 * tool bindable.
 */
export const DRAWING_TOOL_COMMANDS: Array<{
  tool: string
  labelKey: string
}> = [
  { tool: 'line', labelKey: 'chart.drawing.trendLine' },
  { tool: 'ray', labelKey: 'chart.drawing.ray' },
  { tool: 'xline', labelKey: 'chart.drawing.extendedLine' },
  { tool: 'info-line', labelKey: 'chart.drawing.infoLine' },
  { tool: 'hline', labelKey: 'chart.drawing.horizontalLine' },
  { tool: 'vline', labelKey: 'chart.drawing.verticalLine' },
  { tool: 'crossline', labelKey: 'chart.drawing.crossLine' },
  { tool: 'channel', labelKey: 'chart.drawing.channel' },
  { tool: 'rectangle', labelKey: 'chart.drawing.rectangle' },
  { tool: 'fibonacci', labelKey: 'chart.drawing.fibonacci' },
  { tool: 'measure', labelKey: 'chart.drawing.measure' },
  { tool: 'date-range', labelKey: 'chart.drawing.dateRange' },
  { tool: 'text', labelKey: 'chart.drawing.text' },
  { tool: 'arrow', labelKey: 'chart.drawing.arrow' },
  { tool: 'long-position', labelKey: 'chart.drawing.longPosition' },
  { tool: 'short-position', labelKey: 'chart.drawing.shortPosition' },
]

/** `chart.tool.hline` ⇄ `hline`. */
export const drawingToolCommandId = (tool: string): string =>
  `chart.tool.${tool}`

export const KEYBINDING_COMMANDS: Array<KeybindingCommand> = [
  // ── General ────────────────────────────────────────────────────────
  {
    id: 'general.commandPalette',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'search.omniTitle',
  },
  {
    id: 'general.settings',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.settings',
  },
  {
    id: 'general.lockTerminal',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.lockTerminal',
  },
  {
    id: 'general.toggleFullscreen',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'search.actions.fullscreen',
    webOnly: true,
  },
  {
    id: 'general.newWindow',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.newWindow',
    desktopOnly: true,
  },
  {
    id: 'general.quit',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.quit',
    desktopOnly: true,
  },
  {
    id: 'general.back',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.back',
    desktopOnly: true,
  },
  {
    id: 'general.forward',
    categoryId: 'general',
    scope: 'global',
    labelKey: 'menu.forward',
    desktopOnly: true,
  },

  // ── Navigation ─────────────────────────────────────────────────────
  {
    id: 'navigation.pairs',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.pairs',
  },
  {
    id: 'navigation.charts',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.charts',
  },
  {
    id: 'navigation.notifications',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.notifications',
  },
  {
    id: 'navigation.workflows',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.workflows',
  },
  {
    id: 'navigation.indicators',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.indicators',
  },
  {
    id: 'navigation.accounts',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.accounts',
  },
  {
    id: 'navigation.plugins',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.plugins',
  },
  {
    id: 'navigation.workspaceTree',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'settings.keyboard.commands.workspaceTree',
  },
  {
    id: 'navigation.workspaceStore',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.workspaceStore',
  },
  {
    id: 'navigation.bots',
    categoryId: 'navigation',
    scope: 'global',
    labelKey: 'nav.bots',
  },

  // ── Workspace ──────────────────────────────────────────────────────
  {
    id: 'workspace.addPane',
    categoryId: 'workspace',
    scope: 'global',
    labelKey: 'layout.addPane',
  },
  {
    id: 'workspace.menu',
    categoryId: 'workspace',
    scope: 'global',
    labelKey: 'settings.keyboard.commands.workspaceMenu',
  },

  // ── Chart ──────────────────────────────────────────────────────────
  {
    id: 'chart.indicators',
    categoryId: 'chart',
    scope: 'chart',
    labelKey: 'chart.toolbar.addIndicator',
  },
  {
    id: 'chart.undo',
    categoryId: 'chart',
    scope: 'chart',
    labelKey: 'chart.drawing.undo',
  },
  {
    id: 'chart.redo',
    categoryId: 'chart',
    scope: 'chart',
    labelKey: 'chart.drawing.redo',
  },
  {
    id: 'chart.deleteDrawing',
    categoryId: 'chart',
    scope: 'chart',
    labelKey: 'chart.contextMenu.deleteDrawing',
  },
  {
    id: 'chart.cancel',
    categoryId: 'chart',
    scope: 'chart',
    labelKey: 'settings.keyboard.commands.chartCancel',
  },

  // ── Timeframes + drawing tools (generated) ─────────────────────────
  ...TIMEFRAME_COMMANDS.map(
    ({ value, labelKey }): KeybindingCommand => ({
      id: timeframeCommandId(value),
      categoryId: 'timeframe',
      scope: 'chart',
      labelKey,
    }),
  ),
  ...DRAWING_TOOL_COMMANDS.map(
    ({ tool, labelKey }): KeybindingCommand => ({
      id: drawingToolCommandId(tool),
      categoryId: 'drawing',
      scope: 'chart',
      labelKey,
    }),
  ),
]

export const KEYBINDING_COMMANDS_BY_ID = new Map(
  KEYBINDING_COMMANDS.map((command) => [command.id, command]),
)

// ── Keymap presets ───────────────────────────────────────────────────

export type KeymapId = 'pairlens' | 'tradingview' | 'bloomberg'

export type Keymap = {
  id: KeymapId
  labelKey: string
  descriptionKey: string
  /**
   * Chords per command id. The Pairlens map is exhaustive; the others are
   * sparse overlays on top of it — list only what differs, with `[]` to strip
   * a binding the base map defines.
   */
  bindings: Record<string, Array<string>>
}

/**
 * The shipped defaults — every chord the terminal answered to before
 * keybindings became customizable, unchanged.
 */
const PAIRLENS_BINDINGS: Record<string, Array<string>> = {
  'general.commandPalette': ['Mod+K'],
  'general.settings': ['Mod+,'],
  // Shipped unbound on purpose: ⌘⇧L is the workspace menu, ⌘L is the
  // browser's focus-address-bar, and ⌃⌘Q is the macOS system lock. The
  // Keyboard settings section makes an unbound command discoverable and
  // assignable, which is a better answer than stealing a chord.
  'general.lockTerminal': [],
  // TradingView's fullscreen chord too, so the TV preset agrees for free.
  // F11 stays untouched: browsers reserve it for their own window fullscreen.
  'general.toggleFullscreen': ['Shift+F'],
  'general.newWindow': ['Mod+N'],
  // On macOS the native menubar consumes ⌘Q before the webview sees it, so
  // this chord only ever arms on Windows/Linux — where it is the only way to
  // quit from the keyboard.
  'general.quit': ['Mod+Q'],
  'general.back': ['Mod+['],
  'general.forward': ['Mod+]'],

  'navigation.pairs': ['Alt+1'],
  'navigation.charts': ['Alt+2'],
  'navigation.notifications': ['Alt+3'],
  'navigation.workflows': ['Alt+4'],
  'navigation.indicators': ['Alt+5'],
  'navigation.accounts': ['Alt+6'],
  'navigation.plugins': ['Alt+7'],
  'navigation.workspaceTree': ['Alt+8'],
  'navigation.workspaceStore': ['Alt+9'],
  'navigation.bots': ['Alt+B'],

  'workspace.addPane': ['Mod+Shift+P'],
  'workspace.menu': ['Mod+Shift+L'],

  'chart.indicators': ['Mod+I'],
  'chart.undo': ['Mod+Z'],
  'chart.redo': ['Mod+Shift+Z'],
  'chart.deleteDrawing': ['Delete', 'Backspace'],
  'chart.cancel': ['Escape'],

  'chart.timeframe.1m': ['1'],
  'chart.timeframe.5m': ['2'],
  'chart.timeframe.15m': ['3'],
  'chart.timeframe.30m': ['4'],
  'chart.timeframe.1h': ['5'],
  'chart.timeframe.2h': ['6'],
  'chart.timeframe.4h': ['7'],
  'chart.timeframe.1d': ['8'],
  'chart.timeframe.3d': ['0'],
  'chart.timeframe.1w': ['9'],
  'chart.timeframe.1M': [],

  'chart.tool.line': ['Alt+T'],
  'chart.tool.ray': ['Alt+Y'],
  'chart.tool.xline': ['Alt+E'],
  'chart.tool.info-line': ['Alt+I'],
  'chart.tool.hline': ['Alt+H'],
  'chart.tool.vline': ['Alt+V'],
  'chart.tool.crossline': ['Alt+C'],
  'chart.tool.channel': [],
  'chart.tool.rectangle': ['Alt+R'],
  'chart.tool.fibonacci': ['Alt+F'],
  'chart.tool.measure': ['Alt+M'],
  'chart.tool.date-range': ['Alt+D'],
  'chart.tool.text': ['Alt+X'],
  'chart.tool.arrow': ['Alt+A'],
  'chart.tool.long-position': ['Alt+L'],
  'chart.tool.short-position': ['Alt+S'],
}

/**
 * TradingView-flavoured. Their drawing chords (⌥T/⌥H/⌥V/⌥C/⌥F/⌥R) are already
 * what Pairlens ships; what changes is everything TradingView spends those
 * remaining ⌥ letters on — ⌥A alert, ⌥I invert scale, ⌥S snapshot, ⌥P parallel
 * channel — plus Ctrl+Y for redo. Tools displaced by those move to ⌥⇧.
 */
const TRADINGVIEW_BINDINGS: Record<string, Array<string>> = {
  'chart.redo': ['Mod+Y'],
  'chart.tool.channel': ['Alt+P'],
  'chart.tool.arrow': ['Alt+Shift+A'],
  'chart.tool.info-line': ['Alt+Shift+I'],
  'chart.tool.short-position': ['Alt+Shift+S'],
  'chart.tool.long-position': ['Alt+Shift+L'],
  'chart.tool.date-range': ['Alt+Shift+D'],
}

/**
 * Bloomberg-flavoured: the recognizable trait of that keyboard is a row of
 * unmodified function keys that jump straight to a screen, so section
 * navigation moves off ⌥-digits onto F2–F11 and the palette also answers to F1.
 * Chart and drawing chords are left alone — Bloomberg has no analogue worth
 * imitating there.
 */
const BLOOMBERG_BINDINGS: Record<string, Array<string>> = {
  'general.commandPalette': ['Mod+K', 'F1'],
  'navigation.pairs': ['F2'],
  'navigation.charts': ['F3'],
  'navigation.notifications': ['F4'],
  'navigation.workflows': ['F5'],
  'navigation.indicators': ['F6'],
  'navigation.accounts': ['F7'],
  'navigation.plugins': ['F8'],
  'navigation.workspaceTree': ['F9'],
  'navigation.workspaceStore': ['F10'],
  'navigation.bots': ['F11'],
  'chart.indicators': ['Mod+I', 'F12'],
}

export const KEYMAPS: Array<Keymap> = [
  {
    id: 'pairlens',
    labelKey: 'settings.keyboard.keymaps.pairlens',
    descriptionKey: 'settings.keyboard.keymaps.pairlensDescription',
    bindings: PAIRLENS_BINDINGS,
  },
  {
    id: 'tradingview',
    labelKey: 'settings.keyboard.keymaps.tradingview',
    descriptionKey: 'settings.keyboard.keymaps.tradingviewDescription',
    bindings: TRADINGVIEW_BINDINGS,
  },
  {
    id: 'bloomberg',
    labelKey: 'settings.keyboard.keymaps.bloomberg',
    descriptionKey: 'settings.keyboard.keymaps.bloombergDescription',
    bindings: BLOOMBERG_BINDINGS,
  },
]

export const DEFAULT_KEYMAP_ID: KeymapId = 'pairlens'

/** The chords a keymap gives a command, before user overrides. */
export function keymapDefaults(
  keymapId: KeymapId,
): Record<string, Array<string>> {
  const keymap = KEYMAPS.find((k) => k.id === keymapId)
  if (!keymap || keymap.id === DEFAULT_KEYMAP_ID) return PAIRLENS_BINDINGS
  return { ...PAIRLENS_BINDINGS, ...keymap.bindings }
}
