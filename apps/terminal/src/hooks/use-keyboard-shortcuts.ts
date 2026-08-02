// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'

const isApplePlatform =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** `⌘` on Mac, `Ctrl+` on Windows/Linux */
export const metaKeySymbol = isApplePlatform ? '⌘' : 'Ctrl+'

/** `⌥` on Mac, `Alt+` on Windows/Linux */
export const altKeySymbol = isApplePlatform ? '⌥' : 'Alt+'

export type ShortcutDefinition = {
  key: string
  modifiers?: {
    meta?: boolean
    alt?: boolean
    shift?: boolean
  }
  action: () => void
  description: string
  label: string
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const keyToCode = (key: string): string | null => {
  const lower = key.toLowerCase()

  if (lower.length === 1) {
    if (lower >= 'a' && lower <= 'z') {
      return `Key${lower.toUpperCase()}`
    }
    if (lower >= '0' && lower <= '9') {
      return `Digit${lower}`
    }
  }

  switch (lower) {
    case 'esc':
    case 'escape':
      return 'Escape'
    case 'enter':
      return 'Enter'
    case 'delete':
      return 'Delete'
    case 'backspace':
      return 'Backspace'
    case 'tab':
      return 'Tab'
    case 'space':
    case ' ':
      return 'Space'
    case 'arrowup':
      return 'ArrowUp'
    case 'arrowdown':
      return 'ArrowDown'
    case 'arrowleft':
      return 'ArrowLeft'
    case 'arrowright':
      return 'ArrowRight'
    default:
      return null
  }
}

export function useKeyboardShortcuts(
  shortcuts: Array<ShortcutDefinition>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || shortcuts.length === 0) return

    const handler = (e: KeyboardEvent) => {
      const target = e.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (INPUT_TAGS.has(target.tagName) || target.isContentEditable) {
        return
      }

      for (const shortcut of shortcuts) {
        const mods = shortcut.modifiers ?? {}
        const metaMatch = mods.meta
          ? e.metaKey || e.ctrlKey
          : !e.metaKey && !e.ctrlKey
        const altMatch = mods.alt ? e.altKey : !e.altKey
        const shiftMatch = mods.shift ? e.shiftKey : !e.shiftKey
        const expectedCode = keyToCode(shortcut.key)
        const keyMatch =
          e.key.toLowerCase() === shortcut.key.toLowerCase() ||
          (expectedCode !== null && e.code === expectedCode)

        if (keyMatch && metaMatch && altMatch && shiftMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts, enabled])
}
