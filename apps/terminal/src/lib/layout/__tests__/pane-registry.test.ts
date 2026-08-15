// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { lazy } from 'react'

import { DynamicPaneRegistry } from '../pane-registry'
import type { ContributedPanel } from '@pairlens/plugin-system'

// Dummy lazy component for testing
const DummyComponent = lazy(() => Promise.resolve({ default: () => null }))

function makePanel(
  id: string,
  overrides?: Partial<ContributedPanel>,
): ContributedPanel {
  return {
    id,
    label: `${id} label`,
    icon: 'LayoutGrid',
    category: 'discovery',
    ...overrides,
  }
}

describe('DynamicPaneRegistry', () => {
  let registry: DynamicPaneRegistry

  beforeEach(() => {
    registry = new DynamicPaneRegistry()
  })

  // ── Builtin registration ────────────────────────────────────────

  describe('registerBuiltin', () => {
    it('registers a builtin pane with pluginId null', () => {
      registry.registerBuiltin('empty', {
        definition: { type: 'empty', labelKey: 'panes.empty', icon: 'Plus' },
        component: DummyComponent,
      })

      expect(registry.getDefinition('empty')).toBeTruthy()
      expect(registry.getDefinition('empty')!.type).toBe('empty')
      expect(registry.getComponent('empty')).toBe(DummyComponent)
      expect(registry.getPluginForPane('empty')).toBeNull()
    })
  })

  // ── Plugin pane registration ────────────────────────────────────

  describe('registerPluginPanes', () => {
    it('registers first-party plugin panes with unprefixed keys', () => {
      registry.registerPluginPanes(
        'pairlens-core',
        [makePanel('chart', { category: 'charting' }), makePanel('markets')],
        { chart: DummyComponent, markets: DummyComponent },
      )

      expect(registry.getDefinition('chart')).toBeTruthy()
      expect(registry.getDefinition('markets')).toBeTruthy()
      expect(registry.getPluginForPane('chart')).toBe('pairlens-core')
      expect(registry.getPluginForPane('markets')).toBe('pairlens-core')
    })

    it('registers third-party plugin panes with prefixed keys', () => {
      registry.registerPluginPanes(
        'bloomberg',
        [makePanel('terminal'), makePanel('news-wire')],
        { terminal: DummyComponent, 'news-wire': DummyComponent },
      )

      expect(registry.getDefinition('bloomberg:terminal')).toBeTruthy()
      expect(registry.getDefinition('bloomberg:news-wire')).toBeTruthy()
      expect(registry.getPluginForPane('bloomberg:terminal')).toBe('bloomberg')
      // Original unprefixed key should NOT exist
      expect(registry.getDefinition('terminal')).toBeNull()
    })

    it('skips panels without matching components', () => {
      registry.registerPluginPanes(
        'pairlens-core',
        [makePanel('chart'), makePanel('missing')],
        { chart: DummyComponent }, // 'missing' has no component
      )

      expect(registry.getDefinition('chart')).toBeTruthy()
      expect(registry.getDefinition('missing')).toBeNull()
    })

    it('converts ContributedPanel fields to PaneDefinition', () => {
      registry.registerPluginPanes(
        'pairlens-core',
        [
          makePanel('chart', {
            labelKey: 'panes.chart',
            descriptionKey: 'paneDescriptions.chart',
            category: 'charting',
            singleton: true,
            minHeight: 200,
            compact: false,
            fitContent: false,
            requires: ['workspace:active-pair'],
          }),
        ],
        { chart: DummyComponent },
      )

      const def = registry.getDefinition('chart')!
      expect(def.type).toBe('chart')
      expect(def.labelKey).toBe('panes.chart')
      expect(def.descriptionKey).toBe('paneDescriptions.chart')
      expect(def.category).toBe('charting')
      expect(def.singleton).toBe(true)
      expect(def.minHeight).toBe(200)
      expect(def.requires).toEqual(['workspace:active-pair'])
    })
  })

  // ── Unregister ──────────────────────────────────────────────────

  describe('unregisterPluginPanes', () => {
    it('removes all panes for a plugin', () => {
      registry.registerPluginPanes(
        'pairlens-intelligence',
        [makePanel('news'), makePanel('heatmap')],
        { news: DummyComponent, heatmap: DummyComponent },
      )

      expect(registry.getDefinition('news')).toBeTruthy()
      expect(registry.getDefinition('heatmap')).toBeTruthy()

      registry.unregisterPluginPanes('pairlens-intelligence')

      expect(registry.getDefinition('news')).toBeNull()
      expect(registry.getDefinition('heatmap')).toBeNull()
    })

    it('is a no-op for unknown plugin', () => {
      registry.unregisterPluginPanes('unknown-plugin')
      // Should not throw
    })

    it('does not affect other plugins', () => {
      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })
      registry.registerPluginPanes(
        'pairlens-intelligence',
        [makePanel('news')],
        {
          news: DummyComponent,
        },
      )

      registry.unregisterPluginPanes('pairlens-intelligence')

      expect(registry.getDefinition('chart')).toBeTruthy()
      expect(registry.getDefinition('news')).toBeNull()
    })
  })

  // ── Queries ─────────────────────────────────────────────────────

  describe('getDefinitions', () => {
    it('returns all definitions as a record', () => {
      registry.registerBuiltin('empty', {
        definition: { type: 'empty', labelKey: 'panes.empty', icon: 'Plus' },
        component: DummyComponent,
      })
      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })

      const defs = registry.getDefinitions()
      expect(Object.keys(defs)).toContain('empty')
      expect(Object.keys(defs)).toContain('chart')
    })
  })

  // ── Subscription / version tracking ─────────────────────────────

  describe('subscribe / getSnapshot', () => {
    it('increments version on registration', () => {
      const v0 = registry.getSnapshot()

      registry.registerBuiltin('empty', {
        definition: { type: 'empty', labelKey: 'panes.empty', icon: 'Plus' },
        component: DummyComponent,
      })

      expect(registry.getSnapshot()).toBe(v0 + 1)
    })

    it('increments version on plugin pane registration', () => {
      const v0 = registry.getSnapshot()

      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })

      expect(registry.getSnapshot()).toBeGreaterThan(v0)
    })

    it('notifies subscribers on changes', () => {
      const listener = mock(() => {})
      registry.subscribe(listener)

      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe stops notifications', () => {
      const listener = mock(() => {})
      const unsub = registry.subscribe(listener)
      unsub()

      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })

      expect(listener).toHaveBeenCalledTimes(0)
    })

    it('increments version on unregister', () => {
      registry.registerPluginPanes('pairlens-core', [makePanel('chart')], {
        chart: DummyComponent,
      })
      const v = registry.getSnapshot()

      registry.unregisterPluginPanes('pairlens-core')

      expect(registry.getSnapshot()).toBe(v + 1)
    })
  })
})
