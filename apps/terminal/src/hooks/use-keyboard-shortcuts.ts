// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'

import { eventMatchesCommand } from '@/lib/keybindings/store'
import { useKeybindingsVersion } from '@/hooks/use-keybindings'

/**
 * Bind global (non-chart) actions to keybinding commands.
 *
 * Handlers name a command id rather than a chord; the store resolves what that
 * command currently answers to, and the effect re-arms whenever the user
 * rebinds it. Chart-pane shortcuts go through `lib/chart-shortcuts.ts` instead,
 * which routes a single listener to the active pane.
 */

export type ShortcutDefinition = {
  /** Command id from the keybinding catalog (`lib/keybindings/commands.ts`). */
  commandId: string
  action: () => void
  /**
   * Fire even while focus sits in a text field. Reserved for chords no one
   * types by accident (⌘K), since it steals the key from the input.
   */
  allowInInput?: boolean
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return INPUT_TAGS.has(target.tagName) || target.isContentEditable
}

export function useKeyboardShortcuts(
  shortcuts: Array<ShortcutDefinition>,
  enabled = true,
) {
  // Re-run the effect when bindings change, without callers having to thread
  // the version through their own memoized shortcut arrays.
  const version = useKeybindingsVersion()

  // Actions are closures rebuilt on most renders; keeping them in a ref means
  // the window listener is attached once per binding change, not per render.
  // Synced in an effect rather than during render — a render that React throws
  // away must not leave a stale action wired to the live listener.
  const shortcutsRef = useRef(shortcuts)
  useEffect(() => {
    shortcutsRef.current = shortcuts
  })

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target)
      for (const shortcut of shortcutsRef.current) {
        if (editable && !shortcut.allowInInput) continue
        if (!eventMatchesCommand(e, shortcut.commandId)) continue
        e.preventDefault()
        shortcut.action()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, version])
}
