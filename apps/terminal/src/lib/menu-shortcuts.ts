// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { MenuCommand, MenuNode } from '@/lib/settings/menu-model'
import { isMacDesktop, isStandalone } from '@/lib/platform'
import { createMenuModel } from '@/lib/settings/menu-model'

/**
 * In-app keyboard accelerators for Windows/Linux desktop builds.
 *
 * On macOS the native menubar owns the accelerators (⌘N, ⌘, — see
 * `desktop-menu.ts`); the system consumes those key equivalents before the
 * webview sees them. Windows/Linux intentionally ship without a window menu,
 * so this runner walks the SAME menu-model descriptors and binds each
 * command's `accelerator` as a document-level keydown handler — one source
 * of truth, three renderers (dialog, macOS menu, keybindings).
 */

type Binding = {
  key: string
  primary: boolean // CmdOrCtrl → Ctrl on Windows/Linux
  shift: boolean
  alt: boolean
  command: MenuCommand
}

function collectCommands(nodes: Array<MenuNode>, out: Array<MenuCommand>) {
  for (const node of nodes) {
    if (node.kind === 'command' && node.accelerator) out.push(node)
    else if (node.kind === 'submenu') collectCommands(node.items, out)
  }
}

/** Parse a Tauri accelerator ('CmdOrCtrl+Shift+N') into a matchable binding. */
function parseAccelerator(command: MenuCommand): Binding | null {
  const parts = (command.accelerator ?? '').split('+')
  const key = parts.pop()?.toLowerCase()
  if (!key) return null

  const binding: Binding = {
    key,
    primary: false,
    shift: false,
    alt: false,
    command,
  }
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'cmdorctrl':
      case 'commandorcontrol':
      case 'ctrl':
      case 'control':
        binding.primary = true
        break
      case 'shift':
        binding.shift = true
        break
      case 'alt':
      case 'option':
        binding.alt = true
        break
      default:
        // Cmd/Super have no Windows/Linux equivalent worth binding.
        return null
    }
  }
  return binding
}

let initialized = false

export function initMenuShortcuts(): void {
  // macOS gets these accelerators from the native menubar instead.
  if (!isStandalone || isMacDesktop || initialized) return
  initialized = true

  const commands: Array<MenuCommand> = []
  const model = createMenuModel()
  collectCommands(model.appMenu, commands)
  collectCommands(model.file, commands)
  collectCommands(model.view, commands)
  collectCommands(model.extraMenus, commands)

  const bindings = commands
    .map(parseAccelerator)
    .filter((b): b is Binding => b !== null)

  document.addEventListener('keydown', (e) => {
    for (const binding of bindings) {
      if (
        e.key.toLowerCase() !== binding.key ||
        e.ctrlKey !== binding.primary ||
        e.shiftKey !== binding.shift ||
        e.altKey !== binding.alt ||
        e.metaKey
      ) {
        continue
      }
      if (binding.command.isEnabled && !binding.command.isEnabled()) return
      // Like a native menu accelerator: fires regardless of focus, and the
      // webview must not also handle the chord (e.g. Ctrl+N opening WebView2's
      // own window).
      e.preventDefault()
      binding.command.run()
      return
    }
  })
}
