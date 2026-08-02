// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createSyncedSetting } from './synced-setting'
import { getDesktopBridge, onDesktopBridgeChange } from './desktop-bridge'
import { COLOR_MODES, readStoredColorMode } from './color-mode'
import type { ColorMode } from './color-mode'
import type { RiskConfig } from '@/stores/risk-config-store'
import i18n from '@/lib/i18n'
import { hasAppServer } from '@/lib/auth-client'
import { openTerminalWindow } from '@/lib/platform'
import {
  getCanGoBack,
  getCanGoForward,
  goBack,
  goForward,
  subscribeNavHistory,
} from '@/lib/nav-history'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import {
  DISPLAY_CURRENCIES,
  DISPLAY_CURRENCY_DEFAULT,
  DISPLAY_CURRENCY_KEY,
} from '@/hooks/use-display-currency'
import { SUPPORTED_LANGUAGES, applyLanguage } from '@/hooks/use-language'
import {
  PERFORMANCE_MODES,
  PERFORMANCE_MODE_DEFAULT,
  PERFORMANCE_MODE_KEY,
} from '@/hooks/use-performance-mode'
import { IDLE_GUARD_DEFAULT, IDLE_GUARD_KEY } from '@/components/idle-guard'
import { marqueeSetting } from '@/lib/recent-tickers'

/**
 * The single, declarative source of truth for the desktop OS menu. Every entry
 * is a thin descriptor over the SAME accessors, stores and option lists the
 * settings dialog renders from — so the two UI layers can never drift. The
 * `desktop-menu` builder turns these descriptors into native Tauri menu items;
 * the dialog renders its own React controls over the identical primitives.
 *
 * Label text is produced lazily via `text()`/`options()` so the builder can
 * re-evaluate it after a language change without the descriptors caring.
 */

type Translated = () => string

/** A radio group: rendered as a submenu of mutually-exclusive check items. */
export type MenuChoice = {
  kind: 'choice'
  id: string
  text: Translated
  options: () => Array<{ value: string; text: string }>
  get: () => string
  set: (value: string) => void
  subscribe: (onChange: () => void) => () => void
}

/** A boolean toggle: rendered as a single check item. */
export type MenuToggle = {
  kind: 'toggle'
  id: string
  text: Translated
  get: () => boolean
  set: (value: boolean) => void
  subscribe: (onChange: () => void) => () => void
}

/** A one-shot action. `text`/`isEnabled` may depend on live state. */
export type MenuCommand = {
  kind: 'command'
  id: string
  text: Translated
  accelerator?: string
  run: () => void
  isEnabled?: () => boolean
  subscribe?: (onChange: () => void) => () => void
}

export type MenuSeparator = { kind: 'separator' }

/** A plain grouping submenu (for commands). Choices render as submenus too. */
export type MenuSubmenu = {
  kind: 'submenu'
  id: string
  text: Translated
  items: Array<MenuNode>
}

export type MenuNode =
  | MenuChoice
  | MenuToggle
  | MenuCommand
  | MenuSeparator
  | MenuSubmenu

export type MenuModel = {
  /** Inserted into the app (first) submenu, just below "About". */
  appMenu: Array<MenuNode>
  /** Inserted at the top of the File submenu. */
  file: Array<MenuNode>
  /** Appended to the View submenu. */
  view: Array<MenuNode>
  /** New top-level menus, added after View. */
  extraMenus: Array<MenuSubmenu>
}

const t = (key: string, fallback: string): string =>
  i18n.t(key, { defaultValue: fallback })

// ── Synced settings shared with the dialog's hooks (same keys + bus) ──

const currencySetting = createSyncedSetting<string>(
  DISPLAY_CURRENCY_KEY,
  DISPLAY_CURRENCY_DEFAULT,
)
const performanceSetting = createSyncedSetting<string>(
  PERFORMANCE_MODE_KEY,
  PERFORMANCE_MODE_DEFAULT,
)
const idleGuardSetting = createSyncedSetting<boolean>(
  IDLE_GUARD_KEY,
  IDLE_GUARD_DEFAULT,
)

// ── Choices (radio groups) ───────────────────────────────────────────

const colorModeChoice: MenuChoice = {
  kind: 'choice',
  id: 'color-mode',
  text: () => t('userMenu.colorMode', 'Color Mode'),
  options: () =>
    COLOR_MODES.map((mode) => ({
      value: mode.value,
      text: t(mode.labelKey, mode.value),
    })),
  // The React bridge owns next-themes; fall back to storage before it mounts.
  get: () => getDesktopBridge()?.colorMode ?? readStoredColorMode(),
  set: (value) => getDesktopBridge()?.setColorMode(value as ColorMode),
  subscribe: (onChange) => onDesktopBridgeChange(onChange),
}

const languageChoice: MenuChoice = {
  kind: 'choice',
  id: 'language',
  text: () => t('settings.language.title', 'Language'),
  options: () =>
    SUPPORTED_LANGUAGES.map((lang) => ({
      value: lang.code,
      text: lang.nativeName,
    })),
  get: () => i18n.language,
  set: (value) => applyLanguage(value),
  subscribe: (onChange) => {
    const handler = () => onChange()
    i18n.on('languageChanged', handler)
    return () => i18n.off('languageChanged', handler)
  },
}

const currencyChoice: MenuChoice = {
  kind: 'choice',
  id: 'currency',
  text: () => t('settings.currency.title', 'Display Currency'),
  options: () =>
    DISPLAY_CURRENCIES.map((currency) => ({
      value: currency.code,
      text: `${currency.symbol}  ${currency.label}`,
    })),
  get: () => currencySetting.get(),
  set: (value) => currencySetting.set(value),
  subscribe: (onChange) => currencySetting.subscribe(() => onChange()),
}

const performanceChoice: MenuChoice = {
  kind: 'choice',
  id: 'performance-mode',
  text: () => t('settings.performance.title', 'Performance'),
  options: () =>
    PERFORMANCE_MODES.map((mode) => ({
      value: mode.value,
      text: t(mode.labelKey, mode.value),
    })),
  get: () => performanceSetting.get(),
  set: (value) => performanceSetting.set(value),
  subscribe: (onChange) => performanceSetting.subscribe(() => onChange()),
}

// ── Toggles ──────────────────────────────────────────────────────────

const marqueeToggle: MenuToggle = {
  kind: 'toggle',
  id: 'toggle-recent-tickers-marquee',
  text: () => t('menu.recentTickersMarquee', 'Recent Tickers Marquee'),
  get: () => marqueeSetting.get(),
  set: (value) => marqueeSetting.set(value),
  subscribe: (onChange) => marqueeSetting.subscribe(() => onChange()),
}

const idleGuardToggle: MenuToggle = {
  kind: 'toggle',
  id: 'toggle-idle-guard',
  text: () => t('menu.inactivityDisconnect', 'Inactivity Disconnect'),
  get: () => idleGuardSetting.get(),
  set: (value) => idleGuardSetting.set(value),
  subscribe: (onChange) => idleGuardSetting.subscribe(() => onChange()),
}

// ── Commands ─────────────────────────────────────────────────────────

// Duplicates the current view into a new window — same semantics as the
// titlebar button and the omni-search "New window" action.
const newWindowCommand: MenuCommand = {
  kind: 'command',
  id: 'new-window',
  text: () => t('menu.newWindow', 'New Window'),
  accelerator: 'CmdOrCtrl+N',
  run: () =>
    void openTerminalWindow(window.location.pathname + window.location.search),
}

// Webview history navigation — the keyboard half of the titlebar arrows. ⌘[/⌘]
// is what every macOS browser binds; the Windows/Linux accelerator runner picks
// the same chord up from this descriptor as Ctrl+[/Ctrl+].
const backCommand: MenuCommand = {
  kind: 'command',
  id: 'nav-back',
  text: () => t('menu.back', 'Back'),
  accelerator: 'CmdOrCtrl+[',
  run: () => goBack(),
  isEnabled: () => getCanGoBack(),
  subscribe: (onChange) => subscribeNavHistory(onChange),
}

const forwardCommand: MenuCommand = {
  kind: 'command',
  id: 'nav-forward',
  text: () => t('menu.forward', 'Forward'),
  accelerator: 'CmdOrCtrl+]',
  run: () => goForward(),
  isEnabled: () => getCanGoForward(),
  subscribe: (onChange) => subscribeNavHistory(onChange),
}

// Manual update check — macOS convention puts this right under "About {app}".
// Background checks run regardless (see lib/updater.ts); this one also gives
// explicit "you're up to date" feedback.
const checkForUpdatesCommand: MenuCommand = {
  kind: 'command',
  id: 'check-for-updates',
  text: () => t('menu.checkForUpdates', 'Check for Updates…'),
  run: () =>
    void import('@/lib/updater').then((m) =>
      m.checkForUpdates({ manual: true }),
    ),
}

const openSettingsCommand: MenuCommand = {
  kind: 'command',
  id: 'open-settings',
  text: () => t('menu.settings', 'Settings…'),
  accelerator: 'CmdOrCtrl+,',
  run: () => useSettingsDialogStore.getState().open(),
}

const managePluginsCommand: MenuCommand = {
  kind: 'command',
  id: 'open-plugins',
  text: () => t('menu.managePlugins', 'Manage Plugins…'),
  run: () => useSettingsDialogStore.getState().open('plugins'),
}

// Sign in / out is session-dependent; the bridge supplies live session state
// and the router/auth-client callbacks. Only meaningful with an App Server.
const accountCommand: MenuCommand = {
  kind: 'command',
  id: 'account',
  text: () =>
    getDesktopBridge()?.hasSession
      ? t('userMenu.signOut', 'Sign out')
      : t('userMenu.signIn', 'Sign in'),
  run: () => {
    const bridge = getDesktopBridge()
    if (!bridge) return
    if (bridge.hasSession) bridge.signOut()
    else bridge.signIn()
  },
  subscribe: (onChange) => onDesktopBridgeChange(onChange),
}

const configureRiskCommand: MenuCommand = {
  kind: 'command',
  id: 'configure-risk',
  text: () => t('menu.configureRisk', 'Configure Risk…'),
  run: () => useSettingsDialogStore.getState().open('risk'),
}

const isLocked = (state: RiskConfig): boolean =>
  state.ordersLocked || state.buyOrdersLocked

const unlockOrdersCommand: MenuCommand = {
  kind: 'command',
  id: 'unlock-orders',
  text: () => t('menu.unlockOrders', 'Unlock All Orders'),
  run: () => useRiskConfigStore.getState().unlock(),
  isEnabled: () => isLocked(useRiskConfigStore.getState()),
  // The store mutates on every fill / trade count / P&L tick; only re-issue the
  // menu IPC (setText + setEnabled) when the derived lock state actually flips.
  subscribe: (onChange) =>
    useRiskConfigStore.subscribe((state, prev) => {
      if (isLocked(state) !== isLocked(prev)) onChange()
    }),
}

const setRegionCommand: MenuCommand = {
  kind: 'command',
  id: 'set-region',
  text: () => t('menu.setRegion', 'Set Region…'),
  run: () => useSettingsDialogStore.getState().open('region'),
}

export function createMenuModel(): MenuModel {
  const appMenu: Array<MenuNode> = [
    { kind: 'separator' },
    checkForUpdatesCommand,
    { kind: 'separator' },
    openSettingsCommand,
    managePluginsCommand,
    ...(hasAppServer ? [accountCommand] : []),
    { kind: 'separator' },
  ]

  const file: Array<MenuNode> = [newWindowCommand]

  const view: Array<MenuNode> = [
    backCommand,
    forwardCommand,
    { kind: 'separator' },
    colorModeChoice,
    marqueeToggle,
    { kind: 'separator' },
    languageChoice,
    currencyChoice,
    { kind: 'separator' },
    performanceChoice,
    idleGuardToggle,
  ]

  const trading: MenuSubmenu = {
    kind: 'submenu',
    id: 'trading-menu',
    text: () => t('menu.trading', 'Trading'),
    items: [
      configureRiskCommand,
      unlockOrdersCommand,
      { kind: 'separator' },
      setRegionCommand,
    ],
  }

  return { appMenu, file, view, extraMenus: [trading] }
}
