// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useSyncExternalStore } from 'react'

import type { KeybindingsState } from '@/lib/keybindings/store'
import {
  getCommandChords,
  getCommandLabel,
  getKeybindingsState,
  keybindingsVersion,
  subscribeKeybindings,
} from '@/lib/keybindings/store'

/**
 * React bindings over the keybinding store. Everything subscribes to the same
 * version counter, so a rebind anywhere (settings dialog, another window, cloud
 * hydration) re-renders every label and re-arms every handler at once.
 */

const subscribe = subscribeKeybindings
const getVersion = () => keybindingsVersion()
// The server render has no localStorage; keep the snapshot stable there.
const getServerVersion = () => 0

/** Re-render this component whenever any keybinding changes. */
export function useKeybindingsVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getServerVersion)
}

export function useKeybindingsState(): KeybindingsState {
  useKeybindingsVersion()
  return getKeybindingsState()
}

/**
 * Display label for a command's primary chord (`⌘⇧P`, `⌥1`), or `''` when the
 * command is unbound — render it inside `<Kbd>` / `<ShortcutHint>`.
 */
export function useKeybindingLabel(commandId: string): string {
  useKeybindingsVersion()
  return getCommandLabel(commandId)
}

/** Serialized chords bound to a command, live. */
export function useCommandChords(commandId: string): Array<string> {
  useKeybindingsVersion()
  return getCommandChords(commandId)
}

/** Label lookup for components that need several at once. */
export function useKeybindingLabels(): (commandId: string) => string {
  useKeybindingsVersion()
  return useCallback((commandId: string) => getCommandLabel(commandId), [])
}
