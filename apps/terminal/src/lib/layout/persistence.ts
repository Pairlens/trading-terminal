// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { isValidLayout } from './utils'
import type { TerminalLayout } from './types'
import { emitWrite } from '@/lib/sync/sync-channel'

const STORAGE_PREFIX = 'pairlens:'

/** Load layout from localStorage, falling back to the provided default. */
export function loadLayout(
  storageKey: string,
  defaultPreset: TerminalLayout,
): TerminalLayout {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (isValidLayout(parsed)) return parsed
    }
  } catch {
    // Ignore parse / storage errors
  }
  return structuredClone(defaultPreset)
}

/** Save layout to localStorage. */
export function saveLayout(layout: TerminalLayout, storageKey: string): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // Ignore storage errors (quota, private browsing)
  }
  // Notify sync coordinator (strip pairlens: prefix for key)
  const syncKey = storageKey.startsWith(STORAGE_PREFIX)
    ? storageKey.slice(STORAGE_PREFIX.length)
    : storageKey
  emitWrite(syncKey, layout)
}

/** Debounced save — avoids rapid writes during resize dragging. */
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function saveLayoutDebounced(
  layout: TerminalLayout,
  storageKey: string,
  delayMs = 300,
): void {
  const existing = saveTimers.get(storageKey)
  if (existing) clearTimeout(existing)
  saveTimers.set(
    storageKey,
    setTimeout(() => {
      saveLayout(layout, storageKey)
      saveTimers.delete(storageKey)
    }, delayMs),
  )
}
