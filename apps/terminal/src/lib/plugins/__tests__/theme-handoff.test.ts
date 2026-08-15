// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

/**
 * A theme plugin does not own the tokens it painted: the injected style tag and
 * its localStorage cache outlive the plugin. Removing the theme that is
 * currently painting the terminal therefore has to hand the palette back first,
 * or the colors survive their own uninstall.
 *
 * The Plugin Store remembered to do that and the Installed tab did not, so the
 * handoff now sits on the uninstall path itself and is verified here.
 */

import { activeThemePluginId, releaseThemeIfActive } from '../theme-handoff'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

const ACTIVE_KEY = `${STORAGE_PREFIX}theme.activePluginId`
const CSS_CACHE_KEY = 'pairlens:theme.cachedCss'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

let storage: MemoryStorage
let styleTagRemoved: boolean

beforeEach(() => {
  storage = new MemoryStorage()
  styleTagRemoved = false
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
    storage
  ;(globalThis as unknown as { document: unknown }).document = {
    getElementById: () => ({
      remove: () => {
        styleTagRemoved = true
      },
    }),
  }
})

describe('releaseThemeIfActive', () => {
  it('drops back to the built-in palette when the theme is painting', () => {
    storage.setItem(ACTIVE_KEY, JSON.stringify('neon-theme'))
    storage.setItem(CSS_CACHE_KEY, ':root { --x: 1; }')

    expect(releaseThemeIfActive('neon-theme')).toBe(true)
    expect(activeThemePluginId()).toBeNull()
    expect(styleTagRemoved).toBe(true)
    // The cached CSS goes too, or the pre-hydration script repaints the ghost
    // on the next load.
    expect(storage.getItem(CSS_CACHE_KEY)).toBeNull()
  })

  it('leaves another theme alone', () => {
    storage.setItem(ACTIVE_KEY, JSON.stringify('neon-theme'))
    storage.setItem(CSS_CACHE_KEY, ':root { --x: 1; }')

    expect(releaseThemeIfActive('paper-theme')).toBe(false)
    expect(activeThemePluginId()).toBe('neon-theme')
    expect(styleTagRemoved).toBe(false)
    expect(storage.getItem(CSS_CACHE_KEY)).toBe(':root { --x: 1; }')
  })

  it('is a no-op when no theme is selected', () => {
    expect(releaseThemeIfActive('neon-theme')).toBe(false)
    expect(activeThemePluginId()).toBeNull()
  })
})
