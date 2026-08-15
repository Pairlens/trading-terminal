// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import { orderForBulkToggle } from '../plugins/family-toggle-order'
import type { PluginInstance } from '@pairlens/plugin-system'

/**
 * The Themes family switch disables ~18 plugins one after another, and every
 * intermediate state is rendered. This walks that sequence against a copy of
 * the effect that reacts to it, because the bug it guards against is silent:
 * the user's theme reverts to stock and the persisted selection is gone, with
 * nothing on screen to say why or any way to undo it.
 */

function themes(ids: Array<string>): Array<PluginInstance> {
  return ids.map(
    (id) => ({ manifest: { id }, status: 'active' }) as PluginInstance,
  )
}

/**
 * Mirror of the clear-selection effect in hooks/use-theme-plugin.ts: the
 * selection is dropped when the ACTIVE theme plugins are non-empty and do not
 * include it. Keep the two in step — if that guard loses its
 * `availableThemes.length > 0` clause, ordering alone stops being enough.
 */
function selectionAfterStep(
  activeThemeIds: Array<string>,
  selected: string | null,
): string | null {
  if (
    selected &&
    activeThemeIds.length > 0 &&
    !activeThemeIds.includes(selected)
  ) {
    return null
  }
  return selected
}

/** Run a family bulk toggle the way the Store does, one rendered step at a time. */
function runBulkToggle(
  members: Array<PluginInstance>,
  enabledIds: Set<string>,
  selected: string | null,
  enabling: boolean,
): string | null {
  let current = selected
  for (const plugin of orderForBulkToggle(members, selected, enabling)) {
    if (enabling) enabledIds.add(plugin.manifest.id)
    else enabledIds.delete(plugin.manifest.id)
    current = selectionAfterStep([...enabledIds], current)
  }
  return current
}

const IDS = [
  'arctic-blue',
  'boomerg',
  'crypto-gold',
  'midnight-ember',
  'pairlens',
  'zen-trading',
]

describe('orderForBulkToggle', () => {
  test('the selected member goes last when disabling, first when enabling', () => {
    const members = themes(IDS)
    const disabling = orderForBulkToggle(members, 'crypto-gold', false)
    expect(disabling.at(-1)!.manifest.id).toBe('crypto-gold')
    const enabling = orderForBulkToggle(members, 'crypto-gold', true)
    expect(enabling[0].manifest.id).toBe('crypto-gold')
  })

  test('every member is kept exactly once, in either direction', () => {
    const members = themes(IDS)
    for (const enabling of [true, false]) {
      const ordered = orderForBulkToggle(members, 'pairlens', enabling)
      expect(ordered).toHaveLength(members.length)
      expect([...ordered.map((p) => p.manifest.id)].sort()).toEqual(
        [...IDS].sort(),
      )
    }
  })

  test('families with no selection pass through unchanged', () => {
    const members = themes(IDS)
    expect(
      orderForBulkToggle(members, null, false).map((p) => p.manifest.id),
    ).toEqual(IDS)
    // A selection that is not a member of THIS family (a theme id while the
    // Equities switch is flipped) must not reorder it either.
    expect(
      orderForBulkToggle(members, 'not-a-member', true).map(
        (p) => p.manifest.id,
      ),
    ).toEqual(IDS)
  })
})

describe('the themes switch round trip preserves the selection', () => {
  test('disable-all then enable-all keeps the chosen theme', () => {
    const members = themes(IDS)
    const enabled = new Set(IDS)
    const selected = 'crypto-gold'

    const afterDisable = runBulkToggle(members, enabled, selected, false)
    expect(enabled.size).toBe(0)
    expect(afterDisable).toBe(selected)

    const afterEnable = runBulkToggle(members, enabled, afterDisable, true)
    expect(enabled.size).toBe(IDS.length)
    expect(afterEnable).toBe(selected)
  })

  test('the naive ordering this replaces does lose it', () => {
    // Proof the simulation has teeth: unordered, the very first step leaves a
    // non-empty theme set without the selected one and the guard fires.
    const enabled = new Set(IDS)
    let selected: string | null = 'crypto-gold'
    for (const id of IDS) {
      enabled.delete(id)
      selected = selectionAfterStep([...enabled], selected)
    }
    expect(selected).toBeNull()
  })

  test('the selected theme being disabled alone still preserves it', () => {
    // The single-plugin row toggle, unchanged by any of this.
    const enabled = new Set(['crypto-gold'])
    enabled.delete('crypto-gold')
    expect(selectionAfterStep([...enabled], 'crypto-gold')).toBe('crypto-gold')
  })
})
