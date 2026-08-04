// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createSyncedSetting } from './synced-setting'
import { getDesktopBridge, onDesktopBridgeChange } from './desktop-bridge'
import { COLOR_MODES, readStoredColorMode } from './color-mode'
import type { ColorMode } from './color-mode'
import type { RiskConfig } from '@/stores/risk-config-store'
import { getCommandChords } from '@/lib/keybindings/store'
import { chordToAccelerator, parseChord } from '@/lib/keybindings/chord'
import i18n from '@/lib/i18n'
import { hasAppServer } from '@/lib/auth-client'
import { isMacDesktop, openTerminalWindow } from '@/lib/platform'
import { requestQuitApp } from '@/lib/settings/close-behavior'
import {
  getCanGoBack,
  getCanGoForward,
  goBack,
  goForward,
  subscribeNavHistory,
} from '@/lib/nav-history'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { getLockConfig, subscribeLockConfig } from '@/lib/security/lock-config'
import {
  isTerminalLocked,
  lockNow,
  subscribeLock,
} from '@/lib/security/lock-store'
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
  isEnabled?: () => boolean
}

/** A boolean toggle: rendered as a single check item. */
export type MenuToggle = {
  kind: 'toggle'
  id: string
  text: Translated
  get: () => boolean
  set: (value: boolean) => void
  subscribe: (onChange: () => void) => () => void
  isEnabled?: () => boolean
}

/** A one-shot action. `text`/`isEnabled` may depend on live state. */
export type MenuCommand = {
  kind: 'command'
  id: string
  text: Translated
  /**
   * Keybinding command id. The accelerator is resolved from the user's current
   * bindings at build time, so rebinding ⌘N in settings moves the native menu
   * item's key equivalent with it (`desktop-menu` rebuilds on every change).
   */
  keybindingId?: string
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
  keybindingId: 'general.newWindow',
  run: () =>
    void openTerminalWindow(window.location.pathname + window.location.search),
}

// An explicit quit — the one action that always quits, whatever the
// close-behavior setting says. macOS gets this from the native app menu
// (⌘Q via AppKit); Windows/Linux ship without a window menu, so this
// descriptor is what gives them a real Ctrl+Q through the in-app accelerator
// runner. That runner has no editable-target check by design, so this goes
// through the confirmed path rather than `quitApp` directly: a stray Ctrl+Q
// typed into a chat box or a bot script must not stop armed bots mid-position.
const quitCommand: MenuCommand = {
  kind: 'command',
  id: 'quit-app',
  text: () => t('menu.quit', 'Quit Pairlens'),
  keybindingId: 'general.quit',
  run: () => requestQuitApp(),
}

// Webview history navigation — the keyboard half of the titlebar arrows. ⌘[/⌘]
// is what every macOS browser binds; the Windows/Linux accelerator runner picks
// the same chord up from this descriptor as Ctrl+[/Ctrl+].
const backCommand: MenuCommand = {
  kind: 'command',
  id: 'nav-back',
  text: () => t('menu.back', 'Back'),
  keybindingId: 'general.back',
  run: () => goBack(),
  isEnabled: () => getCanGoBack(),
  subscribe: (onChange) => subscribeNavHistory(onChange),
}

const forwardCommand: MenuCommand = {
  kind: 'command',
  id: 'nav-forward',
  text: () => t('menu.forward', 'Forward'),
  keybindingId: 'general.forward',
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
  keybindingId: 'general.settings',
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

// Lock the terminal on demand. Ships unbound (every obvious chord is taken);
// the Keyboard settings section is where a user assigns one.
const lockTerminalCommand: MenuCommand = {
  kind: 'command',
  id: 'lock-terminal',
  text: () => t('menu.lockTerminal', 'Lock Terminal'),
  keybindingId: 'general.lockTerminal',
  run: () => lockNow('manual'),
  isEnabled: () => getLockConfig().enabled,
  subscribe: (onChange) => subscribeLockConfig(onChange),
}

const setRegionCommand: MenuCommand = {
  kind: 'command',
  id: 'set-region',
  text: () => t('menu.setRegion', 'Set Region…'),
  run: () => useSettingsDialogStore.getState().open('region'),
}

/**
 * Resolve every descriptor's `keybindingId` into the Tauri accelerator string
 * the native menu wants. Done once per model build so the menu, the in-app
 * Windows/Linux accelerator runner and the settings UI all read one source.
 */
function withAccelerators(nodes: Array<MenuNode>): Array<MenuNode> {
  return nodes.map((node) => {
    if (node.kind === 'command' && node.keybindingId) {
      return { ...node, accelerator: acceleratorFor(node.keybindingId) }
    }
    if (node.kind === 'submenu') {
      return { ...node, items: withAccelerators(node.items) }
    }
    return node
  })
}

/**
 * Disable every actionable entry while the terminal is locked.
 *
 * On macOS the menubar lives in AppKit, outside the webview — ⌘N and ⌘,
 * never reach a DOM listener, so the enabled flag is the only lever there.
 * The same descriptors drive the Windows/Linux accelerator runner, which has
 * its own `isTerminalLocked()` bail; this keeps the two honest together.
 *
 * Toggles and choices are gated too, not just commands: the View menu is built
 * almost entirely out of those, and leaving them live let someone sitting at a
 * locked terminal change the color mode, UI language, display currency and
 * performance mode and flip the marquee / inactivity toggles — against the
 * stated invariant that nothing global works on a locked terminal.
 */
function withLockGate(nodes: Array<MenuNode>): Array<MenuNode> {
  return nodes.map((node): MenuNode => {
    if (
      node.kind === 'command' ||
      node.kind === 'toggle' ||
      node.kind === 'choice'
    ) {
      const baseEnabled = node.isEnabled
      const baseSubscribe = node.subscribe
      return {
        ...node,
        isEnabled: () => !isTerminalLocked() && (baseEnabled?.() ?? true),
        subscribe: (onChange: () => void) => {
          const unsubscribes = [subscribeLock(onChange)]
          if (baseSubscribe) unsubscribes.push(baseSubscribe(onChange))
          return () => {
            for (const unsubscribe of unsubscribes) unsubscribe()
          }
        },
      }
    }
    if (node.kind === 'submenu') {
      return { ...node, items: withLockGate(node.items) }
    }
    return node
  })
}

/** The first chord bound to a command, as a Tauri accelerator. */
function acceleratorFor(keybindingId: string): string | undefined {
  const serialized = getCommandChords(keybindingId)[0]
  if (!serialized) return undefined
  const chord = parseChord(serialized)
  return (chord && chordToAccelerator(chord)) ?? undefined
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
    lockTerminalCommand,
    { kind: 'separator' },
  ]

  const file: Array<MenuNode> = [
    newWindowCommand,
    // macOS already has Quit in the app menu; adding a second one to File
    // would be wrong there and redundant everywhere it isn't.
    ...(isMacDesktop
      ? []
      : [{ kind: 'separator' } as MenuNode, quitCommand as MenuNode]),
  ]

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

  return {
    appMenu: withAccelerators(withLockGate(appMenu)),
    file: withAccelerators(withLockGate(file)),
    view: withAccelerators(withLockGate(view)),
    extraMenus: withAccelerators(withLockGate([trading])) as Array<MenuSubmenu>,
  }
}
