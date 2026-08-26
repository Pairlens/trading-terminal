// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every bundled panel has to name a preview shape the picker can draw.
 *
 * The fallback by category means a missing `preview` never crashes — which is
 * exactly why it needs a test. A panel that forgot the field renders as a
 * generic table and nobody notices; a chart panel drawn as a table is a wrong
 * answer delivered confidently.
 */
import { describe, expect, test } from 'bun:test'

import {
  PANE_PREVIEW_ARCHETYPES,
  resolvePreviewArchetype,
} from '../pane-preview'
import { BOOTSTRAP_PLUGINS } from '@/lib/plugins/bootstrap-bundle'

const PANELS = BOOTSTRAP_PLUGINS.flatMap(({ manifest }) =>
  (manifest.contributes?.panels ?? []).map((panel) => ({
    plugin: manifest.id,
    panel,
  })),
)

describe('pane preview coverage', () => {
  test('the bundled catalogue is actually being walked', () => {
    expect(PANELS.length).toBeGreaterThan(80)
  })

  test('every bundled panel declares a preview shape', () => {
    const missing = PANELS.filter(({ panel }) => !panel.preview).map(
      ({ plugin, panel }) => `${plugin}:${panel.id}`,
    )
    expect(missing).toEqual([])
  })

  test('every declared shape is one the picker can draw', () => {
    const known = new Set<string>(PANE_PREVIEW_ARCHETYPES)
    const unknown = PANELS.filter(
      ({ panel }) => panel.preview && !known.has(panel.preview),
    ).map(({ plugin, panel }) => `${plugin}:${panel.id} → ${panel.preview}`)
    expect(unknown).toEqual([])
  })

  test('every shape earns its place — none is declared by no panel', () => {
    const used = new Set(PANELS.map(({ panel }) => panel.preview))
    const orphans = PANE_PREVIEW_ARCHETYPES.filter((id) => !used.has(id))
    expect(orphans).toEqual([])
  })

  test('a panel with no preview falls back on its category, not on nothing', () => {
    expect(resolvePreviewArchetype({ category: 'charting' })).toBe('chart')
    expect(resolvePreviewArchetype({ category: 'trading' })).toBe('ticket')
    expect(resolvePreviewArchetype({ category: 'discovery' })).toBe('table')
    expect(resolvePreviewArchetype({ category: 'ai-research' })).toBe('text')
    // A third-party category nobody declared still draws something.
    expect(resolvePreviewArchetype({ category: 'made-up' })).toBe('table')
    // A shape nobody implemented is ignored rather than rendered as undefined.
    expect(
      resolvePreviewArchetype({ preview: 'nope', category: 'charting' }),
    ).toBe('chart')
  })
})
