// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { MenuCommand, MenuNode } from '@/lib/settings/menu-model'
import { isMacDesktop, isStandalone } from '@/lib/platform'
import { createMenuModel } from '@/lib/settings/menu-model'
import { eventMatchesCommand } from '@/lib/keybindings/store'

/**
 * In-app keyboard accelerators for Windows/Linux desktop builds.
 *
 * On macOS the native menubar owns the accelerators (⌘N, ⌘, — see
 * `desktop-menu.ts`); the system consumes those key equivalents before the
 * webview sees them. Windows/Linux intentionally ship without a window menu,
 * so this runner walks the SAME menu-model descriptors and resolves each
 * command's keybinding at keypress time — one source of truth, three renderers
 * (dialog, macOS menu, in-app accelerators), and a rebind takes effect with no
 * re-registration because the lookup is live.
 */

/** A menu command that actually carries a keybinding, so the id is present. */
type BoundCommand = MenuCommand & { keybindingId: string }

function collectCommands(nodes: Array<MenuNode>, out: Array<BoundCommand>) {
  for (const node of nodes) {
    if (node.kind === 'command' && node.keybindingId) {
      out.push(node as BoundCommand)
    } else if (node.kind === 'submenu') {
      collectCommands(node.items, out)
    }
  }
}

let initialized = false

export function initMenuShortcuts(): void {
  // macOS gets these accelerators from the native menubar instead.
  if (!isStandalone || isMacDesktop || initialized) return
  initialized = true

  const commands: Array<BoundCommand> = []
  const model = createMenuModel()
  collectCommands(model.appMenu, commands)
  collectCommands(model.file, commands)
  collectCommands(model.view, commands)
  collectCommands(model.extraMenus, commands)

  document.addEventListener('keydown', (e) => {
    for (const command of commands) {
      if (!eventMatchesCommand(e, command.keybindingId)) continue
      if (command.isEnabled && !command.isEnabled()) return
      // Like a native menu accelerator: fires regardless of focus, and the
      // webview must not also handle the chord (e.g. Ctrl+N opening WebView2's
      // own window).
      e.preventDefault()
      command.run()
      return
    }
  })
}
