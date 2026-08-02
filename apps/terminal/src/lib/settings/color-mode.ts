// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Color-mode (light / dark / system) is owned by `next-themes`, which persists
 * the user's choice under a plain localStorage key and applies the `class`
 * attribute to <html>. Both the settings dialog and the OS menu offer the same
 * three choices, so the option list lives here as the single source of truth.
 *
 * `next-themes` is configured with the default `storageKey`, `attribute="class"`
 * and `enableSystem` in `routes/__root.tsx`.
 */

export type ColorMode = 'light' | 'dark' | 'system'

/** next-themes' default localStorage key (no custom `storageKey` is set). */
export const COLOR_MODE_STORAGE_KEY = 'theme'
export const COLOR_MODE_DEFAULT: ColorMode = 'system'

/** Shared by the appearance settings section and the desktop View menu. */
export const COLOR_MODES: ReadonlyArray<{
  value: ColorMode
  labelKey: string
}> = [
  { value: 'light', labelKey: 'settings.appearance.light' },
  { value: 'dark', labelKey: 'settings.appearance.dark' },
  { value: 'system', labelKey: 'settings.appearance.system' },
]

/**
 * Read the persisted color mode straight from localStorage — a fallback for the
 * desktop menu when the React bridge hasn't mounted yet (the menu initializes in
 * the root document, before the terminal shell). next-themes stores the raw
 * string, not JSON.
 */
export function readStoredColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // Ignore storage errors, fall through to the default.
  }
  return COLOR_MODE_DEFAULT
}
